import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import User from "../models/User.js";
import axios from "axios";
import { getUniqueNotificationRecipientIds } from "../utils/notificationRecipients.js";

const visibleForUserFilter = (userId) => ({
    is_hidden: { $ne: true },
    hidden_for: { $ne: userId }
})

const getPostCommentCount = (postId, userId = null) => Comment.countDocuments({
    post: postId,
    ...(userId ? visibleForUserFilter(userId) : {})
})

const emitPostRoomEvent = (req, postId, event, payload = {}) => {
    const io = req.app.locals.io
    if (!io || !postId) return

    io.to(`post-${postId}`).emit(event, {
        postId: postId.toString(),
        ...payload
    })
}

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
        const userId = req.userId;
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

        // Broadcast new post to all connections (followers/connected users) via socket
        const currentUser = await User.findById(userId)
        const recipientIds = getUniqueNotificationRecipientIds(currentUser, userId)
        const postUser = currentUser
        const postUserData = {
            _id: postUser._id,
            full_name: postUser.full_name,
            username: postUser.username,
            profile_picture: postUser.profile_picture
        }

        const newPostNotification = {
            id: `new_post:${newPost._id}`,
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
            recipientIds.forEach(recipientId => {
                console.log('📖 Broadcasting new post to:', recipientId, 'from:', postUser.full_name)
                io.to(`user-${recipientId}`).emit('post-created', populatedPost)
                io.to(`user-${recipientId}`).emit('new-post-notification', newPostNotification)
            })
        }
        res.json({ success: true, message: 'Post created successfully', post: populatedPost})
    } catch(error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getFeedPosts = async (req, res) => {
    try {
        const userId = req.userId
        const { page = 1, limit = 10 } = req.query
        const pageNum = Math.max(parseInt(page, 10) || 1, 1)
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50)
        const skip = (pageNum - 1) * limitNum

        const user = await User.findById(userId)
        if (!user) {
            return res.json({ success: false, message: 'User not found' })
        }

        const connectionIds = (user.connections || []).map(id => id.toString())
        const followingIds = (user.following || []).map(id => id.toString())
        const networkIdSet = new Set([userId.toString(), ...connectionIds, ...followingIds])

        const scorePost = (post, commentCount) => {
            const reactions = (post.reactions || []).length
            const comments = commentCount || 0
            const shares = (post.shares_count || []).length
            const engagementScore = reactions * 3 + comments * 2 + shares * 1.5

            const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60)
            let recencyBonus = 0
            if (ageHours < 1) recencyBonus = 50
            else if (ageHours < 6) recencyBonus = 30
            else if (ageHours < 24) recencyBonus = 15
            else if (ageHours < 72) recencyBonus = 5

            const postUserId = (post.user?._id || post.user)?.toString()
            let relationshipBonus = 0
            if (postUserId === userId.toString()) relationshipBonus = 25
            else if (connectionIds.includes(postUserId)) relationshipBonus = 20
            else if (followingIds.includes(postUserId)) relationshipBonus = 10

            return engagementScore + recencyBonus + relationshipBonus
        }

        const candidatePoolSize = Math.max(skip + limitNum * 5, 100)
        const candidatePosts = await Post.find(visibleForUserFilter(userId))
            .populate('user')
            .populate({
                path: 'shared_from',
                populate: { path: 'user' }
            })
            .populate('reactions.user', 'full_name username profile_picture _id')
            .sort({ createdAt: -1 })
            .limit(candidatePoolSize)

        const scoredPosts = await Promise.all(candidatePosts
            .filter(post => post.user)
            .map(async (post) => {
                const totalComments = await getPostCommentCount(post._id, userId)
                const postObj = { ...post.toObject(), total_comments_count: totalComments }
                const postUserId = (postObj.user?._id || postObj.user)?.toString()
                const isNetworkPost = networkIdSet.has(postUserId)

                postObj.is_suggested = !isNetworkPost
                postObj._rankGroup = isNetworkPost ? 0 : 1
                postObj._score = isNetworkPost
                    ? new Date(postObj.createdAt).getTime()
                    : scorePost(postObj, totalComments)
                return postObj
            }))

        const rankedPosts = scoredPosts
            .sort((a, b) => a._rankGroup - b._rankGroup || b._score - a._score || new Date(b.createdAt) - new Date(a.createdAt))

        const posts = rankedPosts
            .slice(skip, skip + limitNum)
            .map(p => { const { _score, _rankGroup, ...rest } = p; return rest })

        const suggestedPosts = pageNum === 1
            ? rankedPosts
                .filter(post => post.is_suggested)
                .slice(0, Math.max(3, Math.min(limitNum, 10)))
                .map(p => { const { _score, _rankGroup, ...rest } = p; return rest })
            : []

        const hasMore = skip + posts.length < rankedPosts.length

        res.json({ success: true, posts, hasMore, page: pageNum, suggestedPosts })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getPostById = async (req, res) => {
    try {
        const { postId } = req.params
        
        const [viewer, post] = await Promise.all([
            User.findById(req.userId).select('role'),
            Post.findById(postId).populate('user').populate({
            path: 'shared_from',
            populate: { path: 'user' }
        }).populate('reactions.user', 'full_name username profile_picture _id')
        ])
        
        if (!post) {
            return res.json({ success: false, message: 'Post not found' })
        }

        const isHiddenForViewer = (post.hidden_for || []).some((id) => id.toString() === req.userId)
        if ((post.is_hidden || isHiddenForViewer) && viewer?.role !== 'admin') {
            return res.json({ success: false, message: 'Post not found' })
        }

        const totalComments = await getPostCommentCount(postId, viewer?.role === 'admin' ? null : req.userId)
        const postWithCount = { ...post.toObject(), total_comments_count: totalComments }

        res.json({ success: true, post: postWithCount })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const likePost = async (req, res) => {
    try {
        const userId = req.userId
        const { postId } = req.body

        const post = await Post.findById(postId)
        const isLiking = !post.likes_count.includes(userId)

        if(isLiking) {
            post.likes_count.push(userId)
            await post.save()
            res.json({ success: true, message: 'Post liked' })
            emitPostRoomEvent(req, postId, 'post-reaction-updated', {
                reactions: post.reactions || [],
                likes_count: post.likes_count || []
            })

            // Send like notification via socket to post owner (only if not self-like)
            const postOwner = post.user
            const liker = await User.findById(userId)
            
            // Only send notification if the liker is not the post owner
            if(postOwner.toString() !== userId && liker) {
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
            post.likes_count = post.likes_count.filter(user => user.toString() !== userId)
            await post.save()
            res.json({ success: true, message: 'Post unliked' })
            emitPostRoomEvent(req, postId, 'post-reaction-updated', {
                reactions: post.reactions || [],
                likes_count: post.likes_count || []
            })
        }

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const addComment = async (req, res) => {
    try {
        const userId = req.userId
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
        const totalCommentsCount = await getPostCommentCount(postId)

        res.json({ success: true, message: 'Comment added', comment: commentWithUser, totalCommentsCount })
        emitPostRoomEvent(req, postId, 'post-comment-created', {
            comment: commentWithUser,
            totalCommentsCount,
            actorId: userId
        })

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
            parent_comment_id: { $in: [null, undefined] },
            ...visibleForUserFilter(req.userId)
        })

        // Only fetch top-level comments (not replies) with pagination
        let comments = await Comment.find({
            post: postId,
            parent_comment_id: { $in: [null, undefined] },
            ...visibleForUserFilter(req.userId)
        })
            .populate('reactions.user', 'username profile_picture full_name _id')
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
        const totalCommentsCount = await getPostCommentCount(postId, req.userId)

        res.json({ success: true, comments, hasMore, page: parseInt(page), totalCommentsCount })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const deleteComment = async (req, res) => {
    try {
        const userId = req.userId
        const { commentId } = req.body

        const comment = await Comment.findById(commentId)

        // Compare String IDs directly (not using toString())
        if (comment.user.toString() !== userId) {
            return res.json({ success: false, message: 'You can only delete your own comments' })
        }

        // Xoa comment va tat ca reply con cua no
        const replyIds = await Comment.find({ parent_comment_id: commentId }).select('_id').lean()
        await Comment.deleteMany({ parent_comment_id: commentId })
        await Comment.findByIdAndDelete(commentId)

        const post = await Post.findById(comment.post)
        post.comments = post.comments.filter(c => c.toString() !== commentId)
        await post.save()
        const totalCommentsCount = await getPostCommentCount(comment.post)

        res.json({ success: true, message: 'Comment deleted' })
        emitPostRoomEvent(req, comment.post, 'post-comment-deleted', {
            commentId,
            replyIds: replyIds.map((reply) => reply._id.toString()),
            totalCommentsCount,
            actorId: userId
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const likeComment = async (req, res) => {
    try {
        const userId = req.userId
        const { commentId } = req.body

        const comment = await Comment.findById(commentId)
        const isLiking = !comment.likes_count.includes(userId)

        if (isLiking) {
            comment.likes_count.push(userId)
            await comment.save()
            res.json({ success: true, message: 'Comment liked' })
            emitPostRoomEvent(req, comment.post, 'comment-reaction-updated', {
                commentId: comment._id.toString(),
                parentCommentId: comment.parent_comment_id?.toString?.() || null,
                reactions: comment.reactions || [],
                likes_count: comment.likes_count || []
            })

            // Send like notification via socket to comment author (only if not self-like)
            const commentAuthor = comment.user
            if(commentAuthor.toString() !== userId) {
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
            comment.likes_count = comment.likes_count.filter(user => user.toString() !== userId)
            await comment.save()
            res.json({ success: true, message: 'Comment unliked' })
            emitPostRoomEvent(req, comment.post, 'comment-reaction-updated', {
                commentId: comment._id.toString(),
                parentCommentId: comment.parent_comment_id?.toString?.() || null,
                reactions: comment.reactions || [],
                likes_count: comment.likes_count || []
            })
        }

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const reactComment = async (req, res) => {
    try {
        const userId = req.userId
        const { commentId, reactionType } = req.body

        const comment = await Comment.findById(commentId)
        if (!comment) return res.json({ success: false, message: 'Comment not found' })

        if (!comment.reactions) comment.reactions = []

        const existingReactionIndex = comment.reactions.findIndex(r => r.user.toString() === userId)
        let isNewReaction = false;

        if (existingReactionIndex !== -1) {
            if (comment.reactions[existingReactionIndex].type === reactionType) {
                comment.reactions.splice(existingReactionIndex, 1)
            } else {
                comment.reactions[existingReactionIndex].type = reactionType
                isNewReaction = true;
            }
        } else {
            comment.reactions.push({ user: userId, type: reactionType })
            isNewReaction = true;
        }

        // Migrate legacy like if exists
        if (comment.likes_count && comment.likes_count.includes(userId)) {
            comment.likes_count = comment.likes_count.filter(id => id !== userId);
        }

        await comment.save()

        await comment.populate({
            path: 'reactions.user',
            select: 'full_name username profile_picture _id'
        })

        res.json({ success: true, message: 'Reaction updated', reactions: comment.reactions })
        emitPostRoomEvent(req, comment.post, 'comment-reaction-updated', {
            commentId,
            parentCommentId: comment.parent_comment_id?.toString?.() || null,
            reactions: comment.reactions,
            likes_count: comment.likes_count || []
        })

        const commentAuthor = comment.user
        if(isNewReaction && userId !== commentAuthor.toString()) {
            const reactor = await User.findById(userId)
            const io = req.app.locals.io
            if(io && reactor) {
                const reactionNotification = {
                    type: 'new_reaction',
                    data: {
                        post_id: comment.post.toString(),
                        comment_id: commentId, // Added this
                        liked_type: 'comment',
                        reaction: reactionType,
                        user: {
                            _id: reactor._id,
                            full_name: reactor.full_name,
                            username: reactor.username,
                            profile_picture: reactor.profile_picture
                        }
                    }
                }
                io.to(`user-${commentAuthor}`).emit('new-reaction-notification', reactionNotification)
            }
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const deletePost = async (req, res) => {
    try {
        const userId = req.userId
        const { postId } = req.body

        const post = await Post.findById(postId)

        if (!post) {
            return res.json({ success: false, message: 'Post not found' })
        }

        if (post.user.toString() !== userId) {
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
        emitPostRoomEvent(req, postId, 'post-deleted', { actorId: userId })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const hidePostForUser = async (req, res) => {
    try {
        const userId = req.userId
        const { postId } = req.body

        const post = await Post.findByIdAndUpdate(
            postId,
            { $addToSet: { hidden_for: userId } },
            { new: true }
        ).select('_id')

        if (!post) return res.json({ success: false, message: 'Post not found' })

        res.json({ success: true, message: 'Post hidden', postId })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const hideCommentForUser = async (req, res) => {
    try {
        const userId = req.userId
        const { commentId } = req.body

        const comment = await Comment.findById(commentId).select('post parent_comment_id')

        if (!comment) return res.json({ success: false, message: 'Comment not found' })

        const hideFilter = comment.parent_comment_id
            ? { _id: comment._id }
            : { $or: [{ _id: comment._id }, { parent_comment_id: comment._id }] }

        await Comment.updateMany(hideFilter, { $addToSet: { hidden_for: userId } })

        const totalCommentsCount = await getPostCommentCount(comment.post, userId)
        res.json({ success: true, message: 'Comment hidden', commentId, totalCommentsCount })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Add reply to a comment
export const addReply = async (req, res) => {
    try {
        const userId = req.userId
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
        const totalCommentsCount = await getPostCommentCount(parentComment.post)

        res.json({ success: true, message: 'Reply added', reply: replyWithUser, totalCommentsCount })
        emitPostRoomEvent(req, parentComment.post, 'post-reply-created', {
            parentCommentId: commentId,
            reply: replyWithUser,
            totalCommentsCount,
            actorId: userId
        })

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

        let replies = await Comment.find({ _id: { $in: parentComment.replies }, ...visibleForUserFilter(req.userId) })
            .populate('reactions.user', 'username profile_picture full_name _id')
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
        const userId = req.userId
        const { postId } = req.body

        const post = await Post.findById(postId)
        if (!post.shares_count) {
            post.shares_count = []
        }

        const isSharing = !post.shares_count.some(user => user.toString() === userId)

        if(isSharing) {
            post.shares_count.push(userId)
            await post.save()
            res.json({ success: true, message: 'Post shared', shares_count: post.shares_count })
            emitPostRoomEvent(req, postId, 'post-share-updated', { shares_count: post.shares_count })
        } else {
            post.shares_count = post.shares_count.filter(user => user.toString() !== userId)
            await post.save()
            res.json({ success: true, message: 'Share removed', shares_count: post.shares_count })
            emitPostRoomEvent(req, postId, 'post-share-updated', { shares_count: post.shares_count })
        }

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Delete reply
export const deleteReply = async (req, res) => {
    try {
        const userId = req.userId
        const { replyId } = req.body

        const reply = await Comment.findById(replyId)

        if (reply.user.toString() !== userId) {
            return res.json({ success: false, message: 'You can only delete your own replies' })
        }

        // Remove from parent comment's replies array
        const parentCommentId = reply.parent_comment_id
        const postId = reply.post
        if (reply.parent_comment_id) {
            await Comment.findByIdAndUpdate(
                reply.parent_comment_id,
                { $pull: { replies: replyId } }
            )
        }

        await Comment.findByIdAndDelete(replyId)
        const totalCommentsCount = await getPostCommentCount(postId)

        res.json({ success: true, message: 'Reply deleted' })
        emitPostRoomEvent(req, postId, 'post-reply-deleted', {
            replyId,
            parentCommentId: parentCommentId?.toString?.() || null,
            totalCommentsCount,
            actorId: userId
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// React to post
export const reactPost = async (req, res) => {
    try {
        const userId = req.userId
        const { postId, reactionType } = req.body

        const post = await Post.findById(postId)
        if (!post) {
            return res.json({ success: false, message: 'Post not found' })
        }

        if (!post.reactions) post.reactions = []

        const existingReactionIndex = post.reactions.findIndex(r => r.user.toString() === userId)
        let isNewReaction = false;

        if (existingReactionIndex !== -1) {
            if (post.reactions[existingReactionIndex].type === reactionType) {
                // Remove reaction if clicking the same one
                post.reactions.splice(existingReactionIndex, 1)
            } else {
                // Update reaction type
                post.reactions[existingReactionIndex].type = reactionType
                isNewReaction = true;
            }
        } else {
            // Add new reaction
            post.reactions.push({ user: userId, type: reactionType })
            isNewReaction = true;
        }

        // Migrate legacy like if exists
        if (post.likes_count && post.likes_count.includes(userId)) {
            post.likes_count = post.likes_count.filter(id => id !== userId);
        }

        await post.save()
        
        // Populate user data for frontend
        await post.populate({
            path: 'reactions.user',
            select: 'full_name username profile_picture _id'
        })

        res.json({ success: true, message: 'Reaction updated', reactions: post.reactions })
        emitPostRoomEvent(req, postId, 'post-reaction-updated', {
            reactions: post.reactions,
            likes_count: post.likes_count || []
        })

        // Notification
        const postOwner = post.user.toString()
        if (isNewReaction && userId !== postOwner) {
            const reactor = await User.findById(userId)
            const io = req.app.locals.io
            if (io && reactor) {
                const reactionNotification = {
                    type: 'new_reaction',
                    data: {
                        post_id: postId,
                        liked_type: 'post',
                        reaction: reactionType,
                        user: {
                            _id: reactor._id,
                            full_name: reactor.full_name,
                            username: reactor.username,
                            profile_picture: reactor.profile_picture
                        }
                    }
                }
                io.to(`user-${postOwner}`).emit('new-reaction-notification', reactionNotification)
            }
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}
