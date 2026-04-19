import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    from_user_id: { type: String, ref: 'User', required: true },
    to_user_id: { type: String, ref: 'User', required: true },
    text: { type: String, trim: true},
    message_type: {type: String, enum: ['text','image','images','video','videos','voice']},
    media_urls: [{type: String}],
    shared_post_id: {type: String, ref: 'Post'}, // Reference to shared post
    isRead: {type: Boolean, default: false}
}, { timestamps: true, minimize: false})

const Message = mongoose.model('Message', messageSchema)

export default Message