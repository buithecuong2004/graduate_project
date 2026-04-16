import fs from "fs"
import imagekit from "../configs/imageKit.js"
import Story from "../models/Story.js"
import User from "../models/User.js"
import { inngest } from "../inngest/index.js"
import axios from "axios"
import { connections } from "./messageController.js"

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
        let media_id = '';
        if(media && (media_type === 'image' || media_type === 'video')) {
            try {
                const fileBuffer = fs.readFileSync(media.path)
                const response = await imagekit.upload({
                    file: fileBuffer,
                    fileName: media.originalname
                })
                media_url = response.url || ''
                media_id = response.fileId || ''

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
            media_id,
            media_type,
            background_color
        })

        await inngest.send({
            name: 'app/story.delete',
            data: {storyId: story._id}
        })

        res.json({success: true, message: 'Story created successfully'})

        // Broadcast new story to all connections
        const storyUser = await User.findById(userId)
        const followersFollowing = [...(storyUser.followers || []), ...(storyUser.following || []), ...(storyUser.connections || [])]
        
        const storyWithUser = {
            ...story.toObject(),
            user: storyUser
        }

        const newStoryEvent = {
            type: 'new-story',
            story: storyWithUser,
            message: `${storyUser.full_name} posted a new story!`
        }

        followersFollowing.forEach(userId => {
            if(connections[userId]) {
                console.log('📖 Broadcasting new story to:', userId)
                connections[userId].write(`data: ${JSON.stringify(newStoryEvent)}\n\n`)
            }
        })
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
        if(story.media_id) {
            await deleteImageKitFile(story.media_id)
        }

        // Delete the story
        await Story.findByIdAndDelete(storyId)

        res.json({ success: true, message: 'Story deleted successfully' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}