import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import User from "../models/User.js";
import axios from "axios";

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

export const addPost = async (req, res) => {
    try {
        const { userId } = req.auth();
        let { content, post_type, shared_from } = req.body;
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
        let image_ids = [];
        let video_url = '';
        let video_id = '';

        try {
            // Process images (max 4)
            if(images.length) {
                if(images.length > 4) {
                    return res.json({ success: false, message: 'Maximum 4 images allowed per post' })
                }

                const uploadedImages = await Promise.all(
                    images.map(async (image) => {
                        const fileBuffer = fs.readFileSync(image.path)
                        const response = await imagekit.upload({
                            file: fileBuffer,
                            fileName: image.originalname,
                            folder: "posts",
                        })

                        return {
                            url: response.url || imagekit.url({
                                path: response.filePath,
                                transformation: [
                                    {quality: 'auto'},
                                    {format: 'webp'},
                                    {width: '1280'}
                                ]
                            }),
                            id: response.fileId
                        }
                    })
                )

                image_urls = uploadedImages.map(img => img.url)
                image_ids = uploadedImages.map(img => img.id)

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
                video_id = response.fileId

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
            image_ids,
            video_url,
            video_id,
            post_type,
            shared_from: shared_from || null
        })

        // Fetch post with user data and shared_from details
        const populatedPost = await Post.findById(newPost._id)
            .populate('user')
            .populate({
                path: 'shared_from',
                populate: { path: 'user' }
            })

        res.json({ success: true, message: 'Post created successfully', post: populatedPost})

        // Broadcast new post to all connections (followers/connected users) via socket
        const currentUser = await User.findById(userId)
       // ✅ postController.js — trong addPost
        const followersFollowing = [...new Set([
            ...(currentUser.followers || []),
            ...(currentUser.following || []),
            ...(currentUser.connections || [])
        ])]
        
        const postUser = await User.findById(userId)
        const postUserData = {
            _id: postUser._id,
            full_name: postUser.full_name,
            username: postUser.username,
            profile_picture: postUser.profile_picture
        }

        const newPostNotification = {
            type: 'new_post',
            data: {
                post_id: newPost._id,
                user: postUserData,
                post: {
                    _id: newPost._id,
                    content: newPost.content,
                    image_urls: newPost.image_urls,
                    video_url: newPost.video_url
                }
            }
        }

        const io = req.app.locals.io
        if(io && postUser) {
            followersFollowing.forEach(followerId => {
                if(followerId !== userId) {
                    console.log('📖 Broadcasting new post to:', followerId, 'from:', postUser.full_name)
                    io.to(`user-${followerId}`).emit('new-post-notification', newPostNotification)
                }
            })
        }
    } catch(error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getFeedPosts = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { page = 1, limit = 10 } = req.query
        const skip = (page - 1) * limit

        const user = await User.findById(userId)

        const userIds = [userId, ...user.connections, ...user.following]
        
        // Get total count for pagination
        const totalPosts = await Post.countDocuments({user: {$in: userIds}})

        const posts = await Post.find({user: {$in: userIds}})
            .populate('user')
            .populate({
                path: 'shared_from',
                populate: { path: 'user' }
            })
            .sort({createdAt: -1})
            .skip(skip)
            .limit(parseInt(limit))

        // Dếm tổng comment (top-level + replies) vì replies cũng có field post: postId
        const postsWithCount = await Promise.all(posts.map(async (post) => {
            const totalComments = await Comment.countDocuments({ post: post._id })
            return { ...post.toObject(), total_comments_count: totalComments }
        }))

        const hasMore = skip + parseInt(limit) < totalPosts

        res.json({ success: true, posts: postsWithCount, hasMore, page: parseInt(page) })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getPostById = async (req, res) => {
    try {
        const { postId } = req.params
        
        const post = await Post.findById(postId).populate('user').populate({
            path: 'shared_from',
            populate: { path: 'user' }
        })
        
        if (!post) {
            return res.json({ success: false, message: 'Post not found' })
        }

        const totalComments = await Comment.countDocuments({ post: postId })
        const postWithCount = { ...post.toObject(), total_comments_count: totalComments }

        res.json({ success: true, post: postWithCount })
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

            // Send like notification via socket to post owner (only if not self-like)
            const postOwner = post.user
            const liker = await User.findById(userId)
            
            // Only send notification if the liker is not the post owner
            if(userId !== postOwner && liker) {
                const io = req.app.locals.io
                if(io) {
                    const likerData = {
                        _id: liker._id,
                        full_name: liker.full_name,
                        username: liker.username,
                        profile_picture: liker.profile_picture
                    }
                    const likeNotification = {
                        type: 'new_like',
                        data: {
                            post_id: postId,
                            liked_type: 'post',
                            user: likerData
                        }
                    }
                    console.log('👍 Sending like notification to:', postOwner, 'from:', liker.full_name)
                    io.to(`user-${postOwner}`).emit('new-like-notification', likeNotification)
                }
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
            user: commentUser ? {
                _id: commentUser._id,
                full_name: commentUser.full_name,
                username: commentUser.username,
                profile_picture: commentUser.profile_picture
            } : null
        }

        const post = await Post.findById(postId)
        post.comments.push(comment._id)
        await post.save()

        res.json({ success: true, message: 'Comment added', comment: commentWithUser })

        // Send comment notification via socket to post owner (only if not self-comment)
        const io = req.app.locals.io
        if(io && userId !== post.user && commentUser) {
            const commentNotification = {
                type: 'new_comment',
                data: {
                    post_id: postId,
                    comment: commentWithUser
                }
            }
            console.log('💬 Sending comment notification to:', post.user, 'from:', commentUser.full_name)
            io.to(`user-${post.user}`).emit('new-comment-notification', commentNotification)
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getComments = async (req, res) => {
    try {
        const { postId } = req.params
        const { page = 1, limit = 10 } = req.query
        const skip = (page - 1) * limit

        // Get total count of top-level comments
        const totalComments = await Comment.countDocuments({
            post: postId,
            parent_comment_id: { $in: [null, undefined] }
        })

        // Only fetch top-level comments (not replies) with pagination
        let comments = await Comment.find({
            post: postId,
            parent_comment_id: { $in: [null, undefined] }
        })
            .sort({createdAt: -1})
            .skip(skip)
            .limit(parseInt(limit))

        // Manually fetch user data since we're using String IDs, not ObjectId
        comments = await Promise.all(
            comments.map(async (comment) => {
                const commentObj = comment.toObject ? comment.toObject() : comment
                const commentUser = await User.findById(commentObj.user)
                commentObj.user = commentUser
                return commentObj
            })
        )

        const hasMore = skip + parseInt(limit) < totalComments

        res.json({ success: true, comments, hasMore, page: parseInt(page) })
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
        const isLiking = !comment.likes_count.includes(userId)

        if (isLiking) {
            comment.likes_count.push(userId)
            await comment.save()
            res.json({ success: true, message: 'Comment liked' })

            // Send like notification via socket to comment author (only if not self-like)
            const commentAuthor = comment.user
            if(userId !== commentAuthor) {
                const liker = await User.findById(userId)
                const io = req.app.locals.io
                if(io && liker) {
                    const likerData = {
                        _id: liker._id,
                        full_name: liker.full_name,
                        username: liker.username,
                        profile_picture: liker.profile_picture
                    }
                    const likeNotification = {
                        type: 'new_like',
                        data: {
                            post_id: comment.post.toString(),
                            liked_type: 'comment',
                            user: likerData
                        }
                    }
                    console.log('👍 Sending like comment notification to:', commentAuthor, 'from:', liker.full_name)
                    io.to(`user-${commentAuthor}`).emit('new-like-notification', likeNotification)
                }
            }
        } else {
            comment.likes_count = comment.likes_count.filter(user => user !== userId)
            await comment.save()
            res.json({ success: true, message: 'Comment unliked' })
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
        if(post.image_ids && post.image_ids.length > 0) {
            for(let fileId of post.image_ids) {
                await deleteImageKitFile(fileId)
            }
        }

        if(post.video_id) {
            await deleteImageKitFile(post.video_id)
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
            user: replyUser ? {
                _id: replyUser._id,
                full_name: replyUser.full_name,
                username: replyUser.username,
                profile_picture: replyUser.profile_picture
            } : null
        }

        res.json({ success: true, message: 'Reply added', reply: replyWithUser })

        // Send reply notification via socket to post owner and comment author
        const post = await Post.findById(parentComment.post)
        const postOwner = post.user
        const commentAuthor = parentComment.user
        const io = req.app.locals.io

        if(io && replyUser) {
            const replyNotification = {
                type: 'new_reply',
                data: {
                    post_id: parentComment.post.toString(),
                    comment_id: commentId,
                    reply: replyWithUser
                }
            }

            // Send to comment author only if not replying to own comment
            if(commentAuthor !== userId) {
                console.log('💬 Sending reply notification to comment author:', commentAuthor, 'from:', replyUser.full_name)
                io.to(`user-${commentAuthor}`).emit('new-reply-notification', replyNotification)
            }

            // Send to post owner only if different from comment author and not replying to own post comment
            if(postOwner !== commentAuthor && postOwner !== userId) {
                console.log('💬 Sending reply notification to post owner:', postOwner, 'from:', replyUser.full_name)
                io.to(`user-${postOwner}`).emit('new-reply-notification', replyNotification)
            }
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

// Share post
export const sharePost = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { postId } = req.body

        const post = await Post.findById(postId)
        if (!post.shares_count) {
            post.shares_count = []
        }

        const isSharing = !post.shares_count.includes(userId)

        if(isSharing) {
            post.shares_count.push(userId)
            await post.save()
            res.json({ success: true, message: 'Post shared', shares_count: post.shares_count })
        } else {
            post.shares_count = post.shares_count.filter(user => user !== userId)
            await post.save()
            res.json({ success: true, message: 'Share removed', shares_count: post.shares_count })
        }

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