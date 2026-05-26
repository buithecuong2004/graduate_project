import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
    post: {type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true},
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    content: {type: String, required: true},
    likes_count: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
    parent_comment_id: {type: mongoose.Schema.Types.ObjectId, ref: 'Comment'}, // For nested replies
    replies: [{type: mongoose.Schema.Types.ObjectId, ref: 'Comment'}], // Array of reply IDs
    reactions: [{
        user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
        type: {type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry']}
    }],
    is_hidden: {type: Boolean, default: false},
    hidden_at: {type: Date},
    hidden_by: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    hidden_reason: {type: String, default: ''},
    hidden_for: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
}, {timestamps: true, minimize: false})

const Comment = mongoose.model('Comment', commentSchema)

export default Comment;
