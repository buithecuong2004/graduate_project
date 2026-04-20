import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    from_user_id: { type: String, ref: 'User', required: true },
    to_user_id: { type: String, ref: 'User', required: true },
    text: { type: String, trim: true},
    message_type: {type: String, enum: ['text','image','images','video','videos','voice']},
    media_urls: [{type: String}],
    shared_post_id: {type: String, ref: 'Post'},
    isRead: {type: Boolean, default: false},

    // New action fields
    is_deleted: { type: Boolean, default: false },
    is_edited: { type: Boolean, default: false },
    reply_to: { type: String, ref: 'Message', default: null },     // ID of message being replied to
    is_forwarded: { type: Boolean, default: false },
    forwarded_type: { type: String, enum: ['message', 'link'], default: null }, // for recipient display
}, { timestamps: true, minimize: false})

const Message = mongoose.model('Message', messageSchema)

export default Message