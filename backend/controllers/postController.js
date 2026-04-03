import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import User from "../models/User.js";

export const addPost = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { content, post_type} = req.body;
        const images = req.files

        let image_urls = []

        if(images.length) {
            image_urls = await Promise.all(
                images.map(async (image) => {
                    const fileBuffer = fs.readFileSync(image.path)
                    const response = await imagekit.upload({
                        file: fileBuffer,
                        fileName: image.originalname,
                        folder: "posts",
                    })

                    const url = imagekit.url({
                        path: response.filePath,
                        transformation: [
                            {quality: 'auto'},
                            {format: 'webp'},
                            {width: '1280'}
                        ]
                    })
                    return url
                })
            )
        }

        await Post.create({
            user: userId,
            content,
            image_urls,
            post_type
        })
        res.json({ success: true, message: 'Post created successfull'})
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