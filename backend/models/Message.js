import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    from_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, trim: true},
    message_type: {type: String, enum: ['text','image','images','video','videos','voice','reaction','call']},
    // Call history fields
    call_type:     { type: String, enum: ['voice', 'video'] },
    call_status:   { type: String, enum: ['missed', 'rejected', 'completed'] },
    call_duration: { type: Number, default: 0 }, // seconds
    media_urls: [{type: String}],
    media_ids: [{type: String}],
    shared_post_id: {type: mongoose.Schema.Types.ObjectId, ref: 'Post'},
    shared_story_id: {type: mongoose.Schema.Types.ObjectId, ref: 'Story'},
    isRead: {type: Boolean, default: false},
    reactions: [{
        user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
        type: {type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry']}
    }],

    // New action fields
    is_deleted: { type: Boolean, default: false },
    is_edited: { type: Boolean, default: false },
    reply_to: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },     // ID of message being replied to
    is_forwarded: { type: Boolean, default: false },
    forwarded_type: { type: String, enum: ['message', 'link', 'story'], default: null }, // for recipient display
}, { timestamps: true, minimize: false})

const Message = mongoose.model('Message', messageSchema)

export default Message