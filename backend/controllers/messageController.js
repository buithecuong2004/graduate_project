import fs from "fs"
import imagekit from "../configs/imageKit.js";
import Message from "../models/Message.js";

// Create an empty object to store event connection
const connections = {};

//Controller function for the SSE endpoint
export const sseController = (req, res) => {
    const { userId } = req.params
    console.log('New client connected:', userId)


    //Set SSE headerss
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')

    //Add the client's response object to the connections object
    connections[userId] = res

    //Send an inital event to the client
    res.write('log: Connected to SSE stream\n\n')

    //Handle client disconnection
    req.on('close', ()=>{
        //Remove the client's response object from the connections array
        delete connections[userId]
        console.log('Client disconnected')
    })
}

//Send Message
export const sendMessage = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { to_user_id } = req.body
        let { text } = req.body
        const images = req.files

        // Trim text
        text = (text || '').trim()

        // Validate inputs
        if(!text && (!images || images.length === 0)) {
            return res.json({ success: false, message: 'Message cannot be empty' })
        }

        let media_urls = []
        let message_type = 'text'

        try {
            if(images && images.length > 0) {
                if(images.length > 5) {
                    return res.json({ success: false, message: 'Maximum 5 images per message' })
                }

                message_type = 'images'

                media_urls = await Promise.all(
                    images.map(async (image) => {
                        try {
                            const fileBuffer = fs.readFileSync(image.path)
                            const response = await imagekit.upload({
                                file: fileBuffer,
                                fileName: image.originalname,
                                folder: 'messages'
                            })
                            return response.url || imagekit.url({
                                path: response.filePath,
                                transformation: [
                                    {quality: 'auto'},
                                    {format: 'webp'},
                                    {width: '800'}
                                ]
                            })
                        } catch (uploadError) {
                            console.error('ImageKit upload error:', uploadError)
                            throw uploadError
                        }
                    })
                )

                // Cleanup uploaded files
                images.forEach(img => {
                    fs.unlink(img.path, (err) => {
                        if(err) console.log('File cleanup error:', err)
                    })
                })
            }
        } catch(uploadError) {
            // Cleanup all files on error
            if(images && images.length > 0) {
                images.forEach(img => {
                    fs.unlink(img.path, (err) => {
                        if(err) console.log('File cleanup error:', err)
                    })
                })
            }
            throw uploadError
        }

        const message = await Message.create({
            from_user_id: userId,
            to_user_id,
            text: text || '',
            message_type,
            media_urls
        })

        const messageWithUserData = await Message.findById(message._id).populate('from_user_id')

        res.json({ success: true, message: messageWithUserData })

        if(connections[to_user_id]) {
            connections[to_user_id].write(`data: ${JSON.stringify(messageWithUserData)}\n\n`)
        }
    } catch (error) {
        console.log(error)
        res.json({success: false, message: error.message})
    }
}

export const getChatMessages = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { to_user_id } = req.body

        let messages = await Message.find({
            $or: [
                {from_user_id: userId, to_user_id},
                {from_user_id: to_user_id, to_user_id: userId}
            ]
        }).populate('from_user_id').sort({createdAt: 1 })

        // Convert old media_url to media_urls array for compatibility
        messages = messages.map(msg => {
            const msgObj = msg.toObject ? msg.toObject() : msg
            if(msgObj.media_url && (!msgObj.media_urls || msgObj.media_urls.length === 0)) {
                msgObj.media_urls = [msgObj.media_url]
                msgObj.message_type = 'images'
            }
            return msgObj
        })

        await Message.updateMany({from_user_id: to_user_id, to_user_id: userId}, {seen: true})
        res.json({ success: true, messages })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getUserRecentMessages = async (req, res) => {
    try {
        const {userId} = req.auth()
        const messages = await Message.find({to_user_id: userId}).populate('from_user_id to_user_id').sort({ createdAt: -1 })
        res.json({success: true, messages})
    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}
