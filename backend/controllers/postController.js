import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import User from "../models/User.js";
import axios from "axios";
import { connections } from "./messageController.js";

// Helper to delete file from ImageKit using file path
const deleteImageKitFile = async (url) => {
    try {
        if(!url) return true

        // Extract file path from URL: https://ik.imagekit.io/xxxx/path/to/file -> /path/to/file
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

export const addPost = async (req, res) => {
    try {
        const { userId } = req.auth();
        let { content, post_type } = req.body;
        const files = req.files || {};

        const images = files.images || [];
        const video = files.video ? files.video[0] : null;

        // Trim content
        content = (content || '').trim()

        // Validate post_type and content
        if(!images.length && !video && !content) {
            return res.json({ success: false, message: 'Please add content, images, or a video' })
        }

        if(video && images.length > 0) {
            return res.json({ success: false, message: 'Cannot have both video and images in the same post' })
        }

        let image_urls = [];
        let video_url = '';

        try {
            // Process images (max 4)
            if(images.length) {
                if(images.length > 4) {
                    return res.json({ success: false, message: 'Maximum 4 images allowed per post' })
                }

                image_urls = await Promise.all(
                    images.map(async (image) => {
                        const fileBuffer = fs.readFileSync(image.path)
                        const response = await imagekit.upload({
                            file: fileBuffer,
                            fileName: image.originalname,
                            folder: "posts",
                        })

                        return response.url || imagekit.url({
                            path: response.filePath,
                            transformation: [
                                {quality: 'auto'},
                                {format: 'webp'},
                                {width: '1280'}
                            ]
                        })
                    })
                )

                // Cleanup uploaded files
                images.forEach(img => {
                    fs.unlink(img.path, (err) => {
                        if(err) console.log('File cleanup error:', err)
                    })
                })
            }

            // Process video (max 500MB, max 30 minutes)
            if(video) {
                const maxVideoSize = 500 * 1024 * 1024; // 500MB
                const maxDuration = 30 * 60; // 30 minutes in seconds

                if(video.size > maxVideoSize) {
                    return res.json({ success: false, message: 'Video size must be less than 500MB' })
                }

                const fileBuffer = fs.readFileSync(video.path)
                const response = await imagekit.upload({
                    file: fileBuffer,
                    fileName: video.originalname,
                    folder: "posts/videos",
                })

                video_url = response.url || imagekit.url({
                    path: response.filePath
                })

                // Cleanup uploaded video
                fs.unlink(video.path, (err) => {
                    if(err) console.log('File cleanup error:', err)
                })
            }
        } catch(uploadError) {
            // Cleanup all files on error
            [...images, video].forEach(file => {
                if(file) {
                    fs.unlink(file.path, (err) => {
                        if(err) console.log('File cleanup error:', err)
                    })
                }
            })
            throw uploadError
        }

        const newPost = await Post.create({
            user: userId,
            content,
            image_urls,
            video_url,
            post_type
        })

        // Fetch post with user data
        const postUser = await User.findById(userId)
        const postWithUser = {
            ...newPost.toObject(),
            user: postUser
        }

        res.json({ success: true, message: 'Post created successfully'})

        // Broadcast new post to all connections (followers/connected users)
        const currentUser = await User.findById(userId)
        const followersFollowing = [...(currentUser.followers || []), ...(currentUser.following || []), ...(currentUser.connections || [])]
        
        const newPostEvent = {
            type: 'new-post',
            post: postWithUser,
            message: `${postUser.full_name} just posted something new!`
        }

        followersFollowing.forEach(userId => {
            if(connections[userId]) {
                console.log('📢 Broadcasting new post to:', userId)
                connections[userId].write(`data: ${JSON.stringify(newPostEvent)}\n\n`)
            }
        })
    } catch(error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getFeedPosts = async (req, res) => {
    try {
        const { userId } = req.auth()
        const user = await User.findById(userId)

        const userIds = [userId, ...user.connections, ...user.following]
        const posts = await Post.find({user: {$in: userIds}}).populate('user').sort({createdAt: -1})

        // Dếm tổng comment (top-level + replies) vì replies cũng có field post: postId
        const postsWithCount = await Promise.all(posts.map(async (post) => {
            const totalComments = await Comment.countDocuments({ post: post._id })
            return { ...post.toObject(), total_comments_count: totalComments }
        }))

        res.json({ success: true, posts: postsWithCount })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const likePost = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { postId } = req.body

        const post = await Post.findById(postId)
        const isLiking = !post.likes_count.includes(userId)

        if(isLiking) {
            post.likes_count.push(userId)
            await post.save()
            res.json({ success: true, message: 'Post liked' })

            // Broadcast like event to post owner
            const postOwner = post.user
            const liker = await User.findById(userId)
            
            if(connections[postOwner]) {
                const likeEvent = {
                    type: 'new-like',
                    postId,
                    liker,
                    message: `${liker.full_name} liked your post!`
                }
                console.log('👍 Broadcasting like to:', postOwner)
                connections[postOwner].write(`data: ${JSON.stringify(likeEvent)}\n\n`)
            }
        } else {
            post.likes_count = post.likes_count.filter(user => user !== userId)
            await post.save()
            res.json({ success: true, message: 'Post unliked' })
        }

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const addComment = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { postId, content } = req.body

        const comment = await Comment.create({
            post: postId,
            user: userId,
            content
        })

        // Manually fetch user data since we're using String IDs, not ObjectId
        const commentUser = await User.findById(userId)
        const commentWithUser = {
            ...comment.toObject(),
            user: commentUser
        }

        const post = await Post.findById(postId)
        post.comments.push(comment._id)
        await post.save()

        res.json({ success: true, message: 'Comment added', comment: commentWithUser })

        // Broadcast comment event to post owner via SSE
        if(connections[post.user]) {
            const commentEvent = {
                type: 'new-comment',
                postId,
                comment: commentWithUser,
                commenterId: userId
            }
            console.log('📝 Broadcasting comment SSE event to:', post.user)
            connections[post.user].write(`data: ${JSON.stringify(commentEvent)}\n\n`)
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getComments = async (req, res) => {
    try {
        const { postId } = req.params

        // Only fetch top-level comments (not replies)
        let comments = await Comment.find({
            post: postId,
            parent_comment_id: { $in: [null, undefined] }
        })
            .sort({createdAt: -1})

        // Manually fetch user data since we're using String IDs, not ObjectId
        comments = await Promise.all(
            comments.map(async (comment) => {
                const commentObj = comment.toObject ? comment.toObject() : comment
                const commentUser = await User.findById(commentObj.user)
                commentObj.user = commentUser
                return commentObj
            })
        )

        res.json({ success: true, comments })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const deleteComment = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { commentId } = req.body

        const comment = await Comment.findById(commentId)

        // Compare String IDs directly (not using toString())
        if (comment.user.toString() !== userId) {
            return res.json({ success: false, message: 'You can only delete your own comments' })
        }

        // Xoa comment va tat ca reply con cua no
        await Comment.deleteMany({ parent_comment_id: commentId })
        await Comment.findByIdAndDelete(commentId)

        const post = await Post.findById(comment.post)
        post.comments = post.comments.filter(c => c.toString() !== commentId)
        await post.save()

        res.json({ success: true, message: 'Comment deleted' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const likeComment = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { commentId } = req.body

        const comment = await Comment.findById(commentId)

        if (comment.likes_count.includes(userId)) {
            comment.likes_count = comment.likes_count.filter(user => user !== userId)
            await comment.save()
            res.json({ success: true, message: 'Comment unliked' })
        } else {
            comment.likes_count.push(userId)
            await comment.save()
            res.json({ success: true, message: 'Comment liked' })
        }

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const deletePost = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { postId } = req.body

        const post = await Post.findById(postId)

        if (!post) {
            return res.json({ success: false, message: 'Post not found' })
        }

        if (post.user !== userId) {
            return res.json({ success: false, message: 'You can only delete your own posts' })
        }

        // Delete files from ImageKit
        if(post.image_urls && post.image_urls.length > 0) {
            for(let url of post.image_urls) {
                await deleteImageKitFile(url)
            }
        }

        if(post.video_url) {
            await deleteImageKitFile(post.video_url)
        }

        // Delete all comments associated with the post
        await Comment.deleteMany({post: postId})

        // Delete the post
        await Post.findByIdAndDelete(postId)

        res.json({ success: true, message: 'Post deleted successfully' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Add reply to a comment
export const addReply = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { commentId, content } = req.body

        const parentComment = await Comment.findById(commentId)
        if (!parentComment) {
            return res.json({ success: false, message: 'Comment not found' })
        }

        // Create reply comment
        const reply = await Comment.create({
            post: parentComment.post,
            user: userId,
            content,
            parent_comment_id: commentId
        })

        // Add reply to parent comment's replies array
        parentComment.replies.push(reply._id)
        await parentComment.save()

        // Manually fetch user data
        const replyUser = await User.findById(userId)
        const replyWithUser = {
            ...reply.toObject(),
            user: replyUser
        }

        res.json({ success: true, message: 'Reply added', reply: replyWithUser })

        // Broadcast to post owner and parent comment author
        const post = await Post.findById(parentComment.post)
        const postOwner = post.user
        const commentAuthor = parentComment.user

        const replyEvent = {
            type: 'new-reply',
            postId: parentComment.post,
            commentId,
            reply: replyWithUser,
            replyAuthor: replyUser
        }

        // Send to post owner
        if(connections[postOwner]) {
            console.log('📮 Broadcasting reply to post owner:', postOwner)
            connections[postOwner].write(`data: ${JSON.stringify(replyEvent)}\n\n`)
        }

        // Send to comment author (if different from post owner)
        if(commentAuthor !== postOwner && connections[commentAuthor]) {
            console.log('📮 Broadcasting reply to comment author:', commentAuthor)
            connections[commentAuthor].write(`data: ${JSON.stringify(replyEvent)}\n\n`)
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Get all replies for a comment
export const getReplies = async (req, res) => {
    try {
        const { commentId } = req.params

        const parentComment = await Comment.findById(commentId)
        if (!parentComment || !parentComment.replies) {
            return res.json({ success: true, replies: [] })
        }

        let replies = await Comment.find({ _id: { $in: parentComment.replies } })
            .sort({createdAt: 1})

        // Manually fetch user data
        replies = await Promise.all(
            replies.map(async (reply) => {
                const replyObj = reply.toObject ? reply.toObject() : reply
                const replyUser = await User.findById(replyObj.user)
                replyObj.user = replyUser
                return replyObj
            })
        )

        res.json({ success: true, replies })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Delete reply
export const deleteReply = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { replyId } = req.body

        const reply = await Comment.findById(replyId)

        if (reply.user.toString() !== userId) {
            return res.json({ success: false, message: 'You can only delete your own replies' })
        }

        // Remove from parent comment's replies array
        if (reply.parent_comment_id) {
            await Comment.findByIdAndUpdate(
                reply.parent_comment_id,
                { $pull: { replies: replyId } }
            )
        }

        await Comment.findByIdAndDelete(replyId)

        res.json({ success: true, message: 'Reply deleted' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}