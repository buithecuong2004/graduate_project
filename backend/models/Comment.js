import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
    post: {type: String, ref: 'Post', required: true},
    user: {type: String, ref: 'User', required: true},
    content: {type: String, required: true},
    likes_count: [{type: String, ref: 'User'}],
}, {timestamps: true, minimize: false})

const Comment = mongoose.model('Comment', commentSchema)

export default Comment;
