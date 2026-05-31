import mongoose from "mongoose";

const groupMemberSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joined_at: { type: Date, default: Date.now },
}, { _id: false });

const groupChatSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    avatar_url: { type: String, default: '' },
    avatar_id: { type: String, default: '' },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [groupMemberSchema],
}, { timestamps: true, minimize: false });

groupChatSchema.index({ 'members.user': 1, updatedAt: -1 });
groupChatSchema.index({ creator: 1, updatedAt: -1 });

const GroupChat = mongoose.model('GroupChat', groupChatSchema);

export default GroupChat;
