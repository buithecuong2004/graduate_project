import mongoose from "mongoose";

const liveCommentSchema = new mongoose.Schema({
    stream: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true }
}, { timestamps: true, minimize: false });

liveCommentSchema.index({ stream: 1, createdAt: -1 });

const LiveComment = mongoose.model('LiveComment', liveCommentSchema);

export default LiveComment;
