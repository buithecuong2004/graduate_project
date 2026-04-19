import fs from "fs"
import imagekit from "../configs/imageKit.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

//Send Message
export const sendMessage = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { to_user_id, shared_post_id } = req.body
        let { text } = req.body

        // Get images, videos and voice from req.files
        const images = req.files?.images || []
        const videos = req.files?.videos || []
        const voiceFiles = req.files?.voice || []

        // Trim text
        text = (text || '').trim()

        // Validate inputs
        if (!text && images.length === 0 && videos.length === 0 && voiceFiles.length === 0) {
            return res.json({ success: false, message: 'Message cannot be empty' })
        }

        let media_urls = []
        let message_type = 'text'

        try {
            // Validate image count
            if (images.length > 5) {
                return res.json({ success: false, message: 'Maximum 5 images per message' })
            }

            // Validate video count
            if (videos.length > 3) {
                return res.json({ success: false, message: 'Maximum 3 videos per message' })
            }

            // Upload voice message
            if (voiceFiles.length > 0) {
                message_type = 'voice'
                const voiceFile = voiceFiles[0]
                try {
                    const fileBuffer = fs.readFileSync(voiceFile.path)
                    const response = await imagekit.upload({
                        file: fileBuffer,
                        fileName: `voice_${Date.now()}.webm`,
                        folder: 'messages/voice'
                    })
                    media_urls.push(response.url)
                } catch (uploadError) {
                    console.error('ImageKit voice upload error:', uploadError)
                    throw uploadError
                } finally {
                    fs.unlink(voiceFile.path, (err) => {
                        if (err) console.log('Voice file cleanup error:', err)
                    })
                }
            }

            // Upload images
            if (images.length > 0) {
                message_type = images.length === 1 && videos.length === 0 ? 'image' : 'images'

                const imageUrls = await Promise.all(
                    images.map(async (image) => {
                        try {
                            const fileBuffer = fs.readFileSync(image.path)
                            const response = await imagekit.upload({
                                file: fileBuffer,
                                fileName: image.originalname,
                                folder: 'messages/images'
                            })
                            return response.url || imagekit.url({
                                path: response.filePath,
                                transformation: [
                                    { quality: 'auto' },
                                    { format: 'webp' },
                                    { width: '800' }
                                ]
                            })
                        } catch (uploadError) {
                            console.error('ImageKit upload error:', uploadError)
                            throw uploadError
                        }
                    })
                )
                media_urls.push(...imageUrls)
            }

            // Upload videos
            if (videos.length > 0) {
                message_type = videos.length === 1 && images.length === 0 ? 'video' : 'videos'

                const videoUrls = await Promise.all(
                    videos.map(async (video) => {
                        try {
                            const fileBuffer = fs.readFileSync(video.path)
                            const response = await imagekit.upload({
                                file: fileBuffer,
                                fileName: video.originalname,
                                folder: 'messages/videos'
                            })
                            return response.url || imagekit.url({
                                path: response.filePath
                            })
                        } catch (uploadError) {
                            console.error('ImageKit video upload error:', uploadError)
                            throw uploadError
                        }
                    })
                )
                media_urls.push(...videoUrls)
            }

            // If we have both images and videos, update message_type
            if (images.length > 0 && videos.length > 0) {
                message_type = 'images'
            }

            // Cleanup uploaded files
            const allFiles = [...images, ...videos]
            allFiles.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.log('File cleanup error:', err)
                })
            })
        } catch (uploadError) {
            // Cleanup all files on error
            const allFiles = [...images, ...videos, ...voiceFiles]
            allFiles.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.log('File cleanup error:', err)
                })
            })
            throw uploadError
        }

        const message = await Message.create({
            from_user_id: userId,
            to_user_id,
            text: text || '',
            message_type,
            media_urls,
            shared_post_id: shared_post_id || null
        })

        // Manually fetch user data since we're using String IDs, not ObjectId
        const senderUser = await User.findById(userId)
        const messageWithUserData = {
            ...message.toObject(),
            from_user_id: senderUser
        }

        res.json({ success: true, message: messageWithUserData })

        // Send message via socket to recipient
        const io = req.app.locals.io;
        if (io) {
            console.log('💬 Sending message via socket to:', to_user_id)
            io.to(`user-${to_user_id}`).emit('new-message', messageWithUserData)
        }
    } catch (error) {
        console.error('❌ Error in sendMessage:', error)
        res.json({ success: false, message: error.message })
    }
}

export const getChatMessages = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { to_user_id } = req.body

        let messages = await Message.find({
            $or: [
                { from_user_id: userId, to_user_id },
                { from_user_id: to_user_id, to_user_id: userId }
            ]
        }).sort({ createdAt: 1 })

        // Manually populate user data since we're using String IDs, not ObjectId
        messages = await Promise.all(
            messages.map(async (msg) => {
                const msgObj = msg.toObject ? msg.toObject() : msg
                // Fetch sender user data
                const senderUser = await User.findById(msgObj.from_user_id)
                msgObj.from_user_id = senderUser

                if (msgObj.media_url && (!msgObj.media_urls || msgObj.media_urls.length === 0)) {
                    msgObj.media_urls = [msgObj.media_url]
                    msgObj.message_type = 'images'
                }
                return msgObj
            })
        )

        await Message.updateMany({ from_user_id: to_user_id, to_user_id: userId }, { isRead: true })
        res.json({ success: true, messages })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getUserRecentMessages = async (req, res) => {
    try {
        const { userId } = req.auth()

        // Get all messages where user is sender or receiver
        let messages = await Message.find({
            $or: [
                { from_user_id: userId },
                { to_user_id: userId }
            ]
        }).sort({ createdAt: -1 })

        // Manually populate user data since we're using String IDs, not ObjectId
        messages = await Promise.all(
            messages.map(async (msg) => {
                const msgObj = msg.toObject ? msg.toObject() : msg
                const senderUser = await User.findById(msgObj.from_user_id)
                const recipientUser = await User.findById(msgObj.to_user_id)
                msgObj.from_user_id = senderUser
                msgObj.to_user_id = recipientUser
                return msgObj
            })
        )

        res.json({ success: true, messages })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Mark messages from a specific user as read
export const markMessagesAsRead = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { from_user_id } = req.body

        await Message.updateMany(
            { from_user_id, to_user_id: userId, isRead: false },
            { isRead: true }
        )

        res.json({ success: true, message: 'Messages marked as read' })
    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}
