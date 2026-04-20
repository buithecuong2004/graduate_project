import fs from "fs"
import imagekit from "../configs/imageKit.js"
import Story from "../models/Story.js"
import User from "../models/User.js"
import Message from "../models/Message.js"
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
        }).populate('user').populate('reactions.user', 'full_name username profile_picture _id').sort({ createdAt: -1 })

        // Filter out stories whose user account no longer exists in DB
        const validStories = stories.filter(story => story.user !== null)

        res.json({success: true, stories: validStories})
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getStoryById = async (req, res) => {
    try {
        const { storyId } = req.params

        const story = await Story.findById(storyId)
            .populate('user', 'full_name username profile_picture _id')
            .populate('reactions.user', 'full_name username profile_picture _id')

        if (!story) {
            return res.json({ success: false, message: 'Story not found' })
        }

        res.json({ success: true, story })
    } catch (error) {
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

// ─────────────────────────────────────────────────────────────────
// React to Story
// ─────────────────────────────────────────────────────────────────
export const reactStory = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { storyId, reactionType } = req.body

        const story = await Story.findById(storyId)
        if (!story) {
            return res.json({ success: false, message: 'Story not found' })
        }

        if (!story.reactions) story.reactions = []

        const existingReactionIndex = story.reactions.findIndex(r => r.user.toString() === userId)
        let isNewReaction = false;

        if (existingReactionIndex !== -1) {
            if (story.reactions[existingReactionIndex].type === reactionType) {
                story.reactions.splice(existingReactionIndex, 1)
            } else {
                story.reactions[existingReactionIndex].type = reactionType
                isNewReaction = true;
            }
        } else {
            story.reactions.push({ user: userId, type: reactionType })
            isNewReaction = true;
        }

        await story.save()
        
        await story.populate({
            path: 'reactions.user',
            select: 'full_name username profile_picture _id'
        })

        res.json({ success: true, message: 'Reaction updated', reactions: story.reactions })

        const io = req.app.locals.io
        if (io) {
            const storyOwner = story.user.toString()
            if (isNewReaction && userId !== storyOwner) {
                const reactor = await User.findById(userId)
                if (reactor) {
                    const reactionNotification = {
                        type: 'new_story_reaction',
                        data: {
                            story_id: storyId,
                            reaction: reactionType,
                            text: `Reacted ${reactionType} to your story`,
                            user: {
                                _id: reactor._id,
                                full_name: reactor.full_name,
                                username: reactor.username,
                                profile_picture: reactor.profile_picture
                            }
                        }
                    }
                    io.to(`user-${storyOwner}`).emit('new-story-reaction-notification', reactionNotification)
                }
            }
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// Reply to Story
// ─────────────────────────────────────────────────────────────────
export const replyStory = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { storyId, text } = req.body

        if (!text || !text.trim()) {
            return res.json({ success: false, message: 'Reply text cannot be empty' })
        }

        const story = await Story.findById(storyId)
        if (!story) {
            return res.json({ success: false, message: 'Story not found' })
        }

        const storyOwner = story.user.toString()
        if (storyOwner === userId) {
            return res.json({ success: false, message: 'Cannot reply to your own story' })
        }

        let media_urls = []
        let message_type = 'text'

        if (story.media_url) {
            media_urls = Array.isArray(story.media_url) ? story.media_url : [story.media_url]
            message_type = story.media_type === 'video' ? 'video' : 'image'
        }

        const message = await Message.create({
            from_user_id: userId,
            to_user_id: storyOwner,
            text: text.trim(),
            message_type,
            media_urls,
            is_forwarded: true,
            forwarded_type: 'story',
            shared_story_id: storyId
        })

        const senderUser = await User.findById(userId)
        const msgObj = message.toObject()
        msgObj.from_user_id = senderUser

        res.json({ success: true, message: 'Reply sent' })

        const io = req.app.locals.io
        if (io) {
            io.to(`user-${storyOwner}`).emit('new-message', msgObj)
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}