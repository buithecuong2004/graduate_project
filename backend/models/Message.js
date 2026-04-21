import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    from_user_id: { type: String, ref: 'User', required: true },
    to_user_id: { type: String, ref: 'User', required: true },
    text: { type: String, trim: true},
    message_type: {type: String, enum: ['text','image','images','video','videos','voice','reaction']},
    media_urls: [{type: String}],
    media_ids: [{type: String}],
    shared_post_id: {type: String, ref: 'Post'},
    shared_story_id: {type: String, ref: 'Story'},
    isRead: {type: Boolean, default: false},
    reactions: [{
        user: {type: String, ref: 'User'},
        type: {type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry']}
    }],

    // New action fields
    is_deleted: { type: Boolean, default: false },
    is_edited: { type: Boolean, default: false },
    reply_to: { type: String, ref: 'Message', default: null },     // ID of message being replied to
    is_forwarded: { type: Boolean, default: false },
    forwarded_type: { type: String, enum: ['message', 'link', 'story'], default: null }, // for recipient display
}, { timestamps: true, minimize: false})

const Message = mongoose.model('Message', messageSchema)

export default Message