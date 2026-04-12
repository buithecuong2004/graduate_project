import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
    post: {type: String, ref: 'Post', required: true},
    user: {type: String, ref: 'User', required: true},
    content: {type: String, required: true},
    likes_count: [{type: String, ref: 'User'}],
    parent_comment_id: {type: String, ref: 'Comment'}, // For nested replies
    replies: [{type: String, ref: 'Comment'}], // Array of reply IDs
}, {timestamps: true, minimize: false})

const Comment = mongoose.model('Comment', commentSchema)

export default Comment;
