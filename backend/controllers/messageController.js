import fs from "fs"
import imagekit from "../configs/imageKit.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

// Helper to delete file from ImageKit using file ID
const deleteImageKitFile = async (fileId) => {
    try {
        if(!fileId) return true

        // Use ImageKit SDK to delete file by ID
        await imagekit.deleteFile(fileId)
        return true
    } catch (error) {
        console.log('ImageKit delete error:', error.message)
        return false
    }
}

// ─────────────────────────────────────────────────────────────────
// Helper: populate a single message object with user & reply_to data
// ─────────────────────────────────────────────────────────────────
const populateMessage = async (msgObj) => {
    const senderUser = await User.findById(msgObj.from_user_id)
    msgObj.from_user_id = senderUser

    if (msgObj.media_url && (!msgObj.media_urls || msgObj.media_urls.length === 0)) {
        msgObj.media_urls = [msgObj.media_url]
        msgObj.message_type = 'images'
    }

    if (msgObj.reply_to) {
        const replyMsg = await Message.findById(msgObj.reply_to).lean()
        if (replyMsg) {
            const replySender = await User.findById(replyMsg.from_user_id)
            replyMsg.from_user_id = replySender
            msgObj.reply_to = replyMsg
        }
    }

    if (msgObj.reactions && msgObj.reactions.length > 0) {
        msgObj.reactions = await Promise.all(msgObj.reactions.map(async r => {
            if (r.user && !r.user.full_name) {
                const reactor = await User.findById(r.user).select('full_name username profile_picture _id').lean()
                r.user = reactor || r.user
            }
            return r
        }))
    }

    return msgObj
}

// ─────────────────────────────────────────────────────────────────
// Send Message
// ─────────────────────────────────────────────────────────────────
export const sendMessage = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { to_user_id, shared_post_id, reply_to, is_forwarded, forwarded_type } = req.body
        let { text } = req.body

        const images = req.files?.images || []
        const videos = req.files?.videos || []
        const voiceFiles = req.files?.voice || []

        // ✅ Pre-existing media URLs passed from the frontend when forwarding media messages.
        // FormData serialises arrays as either 'media_urls[]' or 'media_urls' depending on the client.
        const rawBodyUrls = req.body['media_urls[]'] ?? req.body.media_urls
        const bodyMediaUrls = rawBodyUrls
            ? (Array.isArray(rawBodyUrls) ? rawBodyUrls : [rawBodyUrls])
            : []

        text = (text || '').trim()

        // Allow an empty text when media URLs are being forwarded
        if (!text && images.length === 0 && videos.length === 0 && voiceFiles.length === 0 && bodyMediaUrls.length === 0) {
            return res.json({ success: false, message: 'Message cannot be empty' })
        }

        let media_urls = []
        let media_ids = []
        let message_type = 'text'

        try {
            if (images.length > 5) {
                return res.json({ success: false, message: 'Maximum 5 images per message' })
            }
            if (videos.length > 3) {
                return res.json({ success: false, message: 'Maximum 3 videos per message' })
            }

            // Upload voice
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
                    media_ids.push(response.fileId)
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
                const uploadedImages = await Promise.all(
                    images.map(async (image) => {
                        try {
                            const fileBuffer = fs.readFileSync(image.path)
                            const response = await imagekit.upload({
                                file: fileBuffer,
                                fileName: image.originalname,
                                folder: 'messages/images'
                            })
                            return {
                                url: response.url || imagekit.url({
                                    path: response.filePath,
                                    transformation: [
                                        { quality: 'auto' },
                                        { format: 'webp' },
                                        { width: '800' }
                                    ]
                                }),
                                id: response.fileId
                            }
                        } catch (uploadError) {
                            console.error('ImageKit upload error:', uploadError)
                            throw uploadError
                        }
                    })
                )
                media_urls.push(...uploadedImages.map(img => img.url))
                media_ids.push(...uploadedImages.map(img => img.id))
            }

            // Upload videos
            if (videos.length > 0) {
                message_type = videos.length === 1 && images.length === 0 ? 'video' : 'videos'
                const uploadedVideos = await Promise.all(
                    videos.map(async (video) => {
                        try {
                            const fileBuffer = fs.readFileSync(video.path)
                            const response = await imagekit.upload({
                                file: fileBuffer,
                                fileName: video.originalname,
                                folder: 'messages/videos'
                            })
                            return {
                                url: response.url || imagekit.url({ path: response.filePath }),
                                id: response.fileId
                            }
                        } catch (uploadError) {
                            console.error('ImageKit video upload error:', uploadError)
                            throw uploadError
                        }
                    })
                )
                media_urls.push(...uploadedVideos.map(vid => vid.url))
                media_ids.push(...uploadedVideos.map(vid => vid.id))
            }

            if (images.length > 0 && videos.length > 0) {
                message_type = 'images'
            }

            const allFiles = [...images, ...videos]
            allFiles.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.log('File cleanup error:', err)
                })
            })

            // ✅ No new files uploaded → use pre-existing URLs (forwarded media)
            if (media_urls.length === 0 && bodyMediaUrls.length > 0) {
                media_urls = bodyMediaUrls
                // Honour the message_type sent by the client (voice / image / images / video / videos)
                if (req.body.message_type && req.body.message_type !== 'text') {
                    message_type = req.body.message_type
                }
            }

        } catch (uploadError) {
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
            media_ids,
            shared_post_id: shared_post_id || null,
            reply_to: reply_to || null,
            is_forwarded: is_forwarded === true || is_forwarded === 'true',
            forwarded_type: forwarded_type || null,
        })

        const msgObj = message.toObject()
        const populatedMsg = await populateMessage(msgObj)

        res.json({ success: true, message: populatedMsg })

        const io = req.app.locals.io
        if (io) {
            io.to(`user-${to_user_id}`).emit('new-message', populatedMsg)
        }
    } catch (error) {
        console.error('❌ Error in sendMessage:', error)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// Get Chat Messages (with reply_to populated)
// ─────────────────────────────────────────────────────────────────
export const getChatMessages = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { to_user_id } = req.body

        let messages = await Message.find({
            $or: [
                { from_user_id: userId, to_user_id },
                { from_user_id: to_user_id, to_user_id: userId }
            ]
        }).sort({ createdAt: 1 }).lean()

        messages = await Promise.all(messages.map(populateMessage))

        await Message.updateMany(
            { from_user_id: to_user_id, to_user_id: userId },
            { isRead: true }
        )

        res.json({ success: true, messages })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// Get Recent Messages
// ─────────────────────────────────────────────────────────────────
export const getUserRecentMessages = async (req, res) => {
    try {
        const { userId } = req.auth()

        let messages = await Message.find({
            $or: [
                { from_user_id: userId },
                { to_user_id: userId }
            ]
        }).sort({ createdAt: -1 }).lean()

        messages = await Promise.all(
            messages.map(async (msgObj) => {
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

// ─────────────────────────────────────────────────────────────────
// Mark Messages As Read
// ─────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────
// Delete (Recall) Message — set is_deleted = true, clear text/media
// ─────────────────────────────────────────────────────────────────
export const deleteMessage = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { messageId } = req.body

        const message = await Message.findById(messageId)
        if (!message) return res.json({ success: false, message: 'Message not found' })
        if (message.from_user_id !== userId) {
            return res.json({ success: false, message: 'Unauthorized: not your message' })
        }

        // Delete files from ImageKit
        if (message.media_ids && message.media_ids.length > 0) {
            for (let fileId of message.media_ids) {
                await deleteImageKitFile(fileId)
            }
        }

        message.is_deleted = true
        message.text = ''
        message.media_urls = []
        message.media_ids = []
        await message.save()

        res.json({ success: true, messageId })

        const io = req.app.locals.io
        if (io) {
            io.to(`user-${message.to_user_id}`).emit('message-deleted', { messageId })
        }
    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// Edit Message — only within 30 minutes
// ─────────────────────────────────────────────────────────────────
export const editMessage = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { messageId, text } = req.body

        if (!text || !text.trim()) {
            return res.json({ success: false, message: 'Text cannot be empty' })
        }

        const message = await Message.findById(messageId)
        if (!message) return res.json({ success: false, message: 'Message not found' })
        if (message.from_user_id !== userId) {
            return res.json({ success: false, message: 'Unauthorized: not your message' })
        }

        const minutesSinceSent = (Date.now() - new Date(message.createdAt).getTime()) / (1000 * 60)
        if (minutesSinceSent > 30) {
            return res.json({ success: false, message: 'Cannot edit message older than 30 minutes' })
        }

        message.text = text.trim()
        message.is_edited = true
        await message.save()

        res.json({ success: true, messageId, text: message.text })

        const io = req.app.locals.io
        if (io) {
            io.to(`user-${message.to_user_id}`).emit('message-edited', { messageId, text: message.text })
        }
    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// React to Message
// ─────────────────────────────────────────────────────────────────
export const reactMessage = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { messageId, reactionType } = req.body

        const message = await Message.findById(messageId)
        if (!message) {
            return res.json({ success: false, message: 'Message not found' })
        }

        if (!message.reactions) message.reactions = []

        const existingReactionIndex = message.reactions.findIndex(r => r.user.toString() === userId)
        let isNewReaction = false;

        if (existingReactionIndex !== -1) {
            if (message.reactions[existingReactionIndex].type === reactionType) {
                message.reactions.splice(existingReactionIndex, 1)
            } else {
                message.reactions[existingReactionIndex].type = reactionType
                isNewReaction = true;
            }
        } else {
            message.reactions.push({ user: userId, type: reactionType })
            isNewReaction = true;
        }

        await message.save()
        
        await message.populate({
            path: 'reactions.user',
            select: 'full_name username profile_picture _id'
        })

        const msgObj = message.toObject()
        const populatedMsg = await populateMessage(msgObj)

        res.json({ success: true, message: 'Reaction updated', messageData: populatedMsg })

        const io = req.app.locals.io
        if (io) {
            const messageOwner = message.from_user_id.toString()
            const otherUser = messageOwner === userId ? message.to_user_id.toString() : messageOwner
            
            io.to(`user-${otherUser}`).emit('message-reaction-updated', { messageId, reactions: populatedMsg.reactions })

            if (isNewReaction && userId !== messageOwner) {
                const latestMsgFromOther = await Message.findOne({ from_user_id: messageOwner, to_user_id: userId }).sort({ createdAt: -1 })
                
                if (latestMsgFromOther && latestMsgFromOther._id.toString() === messageId.toString()) {
                    const reactor = await User.findById(userId)
                    if (reactor) {
                        const reactionNotification = {
                            type: 'new_message_reaction',
                            data: {
                                message_id: messageId,
                                reaction: reactionType,
                                text: `Reacted ${reactionType} to your message`,
                                user: {
                                    _id: reactor._id,
                                    full_name: reactor.full_name,
                                    username: reactor.username,
                                    profile_picture: reactor.profile_picture
                                }
                            }
                        }
                        io.to(`user-${messageOwner}`).emit('new-message-reaction-notification', reactionNotification)
                    }
                }
            }
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}