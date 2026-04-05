import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import User from "../models/User.js";
import axios from "axios";

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

        await Post.create({
            user: userId,
            content,
            image_urls,
            video_url,
            post_type
        })
        res.json({ success: true, message: 'Post created successfully'})
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

        res.json({ success: true, posts })
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

        if(post.likes_count.includes(userId)) {
            post.likes_count = post.likes_count.filter(user => user !== userId)
            await post.save()
            res.json({ success: true, message: 'Post unliked' })
        } else {
            post.likes_count.push(userId)
            await post.save()
            res.json({ success: true, message: 'Post liked' })
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

        const post = await Post.findById(postId)
        post.comments.push(comment._id)
        await post.save()

        const populatedComment = await comment.populate('user')

        res.json({ success: true, message: 'Comment added', comment: populatedComment })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getComments = async (req, res) => {
    try {
        const { postId } = req.params

        const comments = await Comment.find({post: postId})
            .populate('user')
            .sort({createdAt: -1})

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

        if (comment.user !== userId) {
            return res.json({ success: false, message: 'You can only delete your own comments' })
        }

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