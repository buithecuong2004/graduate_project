import mongoose from "mongoose";

const liveStreamSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: '' },
    status: { type: String, enum: ['live', 'ended'], default: 'live' },
    started_at: { type: Date, default: Date.now },
    ended_at: { type: Date },
    viewers_count: { type: Number, default: 0 },
    reactions: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        type: { type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry'] }
    }]
}, { timestamps: true, minimize: false });

liveStreamSchema.index({ status: 1, createdAt: -1 });
liveStreamSchema.index({ user: 1, status: 1 });

const LiveStream = mongoose.model('LiveStream', liveStreamSchema);

export default LiveStream;
