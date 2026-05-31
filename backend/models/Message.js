import mongoose from "mongoose";

export const normalizeMessageSearchText = (value = '') => (
    value
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
)

export const buildMessageSearchIndex = (value = '') => {
    const searchText = normalizeMessageSearchText(value)
    const tokenSet = new Set()

    if (searchText) {
        for (let size = 1; size <= 3; size += 1) {
            if (searchText.length < size) continue
            for (let index = 0; index <= searchText.length - size; index += 1) {
                tokenSet.add(searchText.slice(index, index + size))
            }
        }
    }

    return {
        searchText,
        searchTokens: Array.from(tokenSet)
    }
}

const messageSchema = new mongoose.Schema({
    from_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    group_id: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupChat' },
    text: { type: String, trim: true},
    searchText: { type: String, default: '' },
    searchTokens: { type: [String], default: [] },
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
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true, minimize: false})

messageSchema.index({ text: 'text' }, { default_language: 'none', name: 'message_text_index' })
messageSchema.index({ searchTokens: 1, createdAt: -1 }, { name: 'message_search_tokens_index' })
messageSchema.index({ from_user_id: 1, searchTokens: 1, createdAt: -1 }, { name: 'message_from_search_index' })
messageSchema.index({ to_user_id: 1, searchTokens: 1, createdAt: -1 }, { name: 'message_to_search_index' })
messageSchema.index({ from_user_id: 1, to_user_id: 1, searchTokens: 1, createdAt: -1 }, { name: 'message_conversation_search_index' })
messageSchema.index({ client_message_id: 1, from_user_id: 1 }, { sparse: true })
messageSchema.index({ from_user_id: 1, to_user_id: 1, createdAt: -1 })
messageSchema.index({ group_id: 1, createdAt: -1 })
messageSchema.index({ to_user_id: 1, isRead: 1, createdAt: -1 })
messageSchema.index({ deletedFor: 1 })

messageSchema.pre('validate', function updateSearchIndex() {
    if (this.isModified('text')) {
        const { searchText, searchTokens } = buildMessageSearchIndex(this.text)
        this.searchText = searchText
        this.searchTokens = searchTokens
    }
})

const Message = mongoose.model('Message', messageSchema)

export default Message
