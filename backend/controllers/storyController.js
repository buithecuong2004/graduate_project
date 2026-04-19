import fs from "fs"
import imagekit from "../configs/imageKit.js"
import Story from "../models/Story.js"
import User from "../models/User.js"
import { inngest } from "../inngest/index.js"
import axios from "axios"

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

        // Send new story notification to all followers/connections via socket
        const storyUser = await User.findById(userId)
        const followersFollowing = [...new Set([
            ...(storyUser.followers || []),
            ...(storyUser.following || []),
            ...(storyUser.connections || [])
        ])]
        const storyWithUser = {
            ...story.toObject(),
            user: storyUser
        }

        const io = req.app.locals.io
        if(io && storyUser) {
            const storyUserData = {
                _id: storyUser._id,
                full_name: storyUser.full_name,
                username: storyUser.username,
                profile_picture: storyUser.profile_picture
            }
            const storyData = {
                _id: story._id,
                content: story.content,
                media_url: story.media_url,
                media_type: story.media_type,
                background_color: story.background_color,
                createdAt: story.createdAt
            }
            const newStoryNotification = {
                type: 'new_story',
                data: {
                    story_id: story._id,
                    user: storyUserData,
                    story: storyData
                }
            }

            // Only send notification to followers/connections, not to the story creator
            followersFollowing.forEach(followerId => {
                if(followerId !== userId) {
                    console.log('📖 Sending new story notification to:', followerId, 'from:', storyUser.full_name)
                    io.to(`user-${followerId}`).emit('new-story', newStoryNotification)
                }
            })
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getStories = async (req, res) => {
    try {
        const { userId } = req.auth()
        const user = await User.findById(userId)

        // If user not yet in DB, return empty stories (race condition on first login)
        if(!user) return res.json({success: true, stories: []})

        const userIds = [userId, ...user.connections, ...user.following]

        const stories = await Story.find({
            user: {$in: userIds}
        }).populate('user').sort({ createdAt: -1 })

        // Filter out stories whose user account no longer exists in DB
        const validStories = stories.filter(story => story.user !== null)

        res.json({success: true, stories: validStories})
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