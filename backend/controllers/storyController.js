import fs from "fs"
import imagekit from "../configs/imageKit.js"
import Story from "../models/Story.js"
import User from "../models/User.js"
import { inngest } from "../inngest/index.js"
import axios from "axios"

// Helper to delete file from ImageKit using file path
const deleteImageKitFile = async (url) => {
    try {
        if(!url) return true

        // Extract file path from URL
        const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT
        const startIndex = url.indexOf(urlEndpoint) + urlEndpoint.length
        const filePath = url.substring(startIndex)

        if(!filePath) return true

        const response = await axios.delete(`https://api.imagekit.io/v1/files`, {
            params: { filePath },
            auth: {
                username: process.env.IMAGEKIT_PRIVATE_KEY
            }
        })
        return response.status === 204 || response.data?.success
    } catch (error) {
        console.log('ImageKit delete error:', error.message)
        return false
    }
}

export const addUserStory = async (req, res) => {
    try {
        const { userId } = req.auth()
        const {content, media_type, background_color} = req.body
        const media = req.file
        let media_url = ''

        // Validate input
        if(media_type === 'text' && !content) {
            return res.json({ success: false, message: 'Please enter some text' })
        }

        if((media_type === 'image' || media_type === 'video') && !media) {
            return res.json({ success: false, message: 'Please select an image or video' })
        }

        // Process media if it exists
        if(media && (media_type === 'image' || media_type === 'video')) {
            try {
                const fileBuffer = fs.readFileSync(media.path)
                const response = await imagekit.upload({
                    file: fileBuffer,
                    fileName: media.originalname
                })
                media_url = response.url || ''

                // Cleanup file
                fs.unlink(media.path, (err) => {
                    if(err) console.log('File cleanup error:', err)
                })
            } catch(uploadError) {
                // Cleanup on error
                if(media.path) {
                    fs.unlink(media.path, (err) => {
                        if(err) console.log('File cleanup error:', err)
                    })
                }
                throw uploadError
            }
        }

        const story = await Story.create({
            user: userId,
            content: content || '',
            media_url,
            media_type,
            background_color
        })

        await inngest.send({
            name: 'app/story.delete',
            data: {storyId: story._id}
        })

        res.json({success: true, message: 'Story created successfully'})
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getStories = async (req, res) => {
    try {
        const { userId } = req.auth()
        const user = await User.findById(userId)

        const userIds = [userId, ...user.connections, ...user.following]

        const stories = await Story.find({
            user: {$in: userIds}
        }).populate('user').sort({ createdAt: -1 })

        res.json({success: true, stories})
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const deleteStory = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { storyId } = req.body

        const story = await Story.findById(storyId)

        if (!story) {
            return res.json({ success: false, message: 'Story not found' })
        }

        if (story.user !== userId) {
            return res.json({ success: false, message: 'You can only delete your own stories' })
        }

        // Delete media file from ImageKit if it exists
        if(story.media_url && story.media_url.length > 0) {
            const mediaUrl = Array.isArray(story.media_url) ? story.media_url[0] : story.media_url
            if(mediaUrl) {
                await deleteImageKitFile(mediaUrl)
            }
        }

        // Delete the story
        await Story.findByIdAndDelete(storyId)

        res.json({ success: true, message: 'Story deleted successfully' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}