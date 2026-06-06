import mongoose from 'mongoose'

/**
 * Tracks per-user interaction signals for personalized feed ranking.
 *
 * interactions[] holds one entry per target author the viewer has engaged with.
 * score accumulates: react=+3, comment=+2, reply=+1, share=+1.5, view=+0.5
 * Decays naturally because new interactions of other authors raise competition.
 */
const userInterestSchema = new mongoose.Schema({
    viewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    // Map of author interactions
    interactions: [
        {
            author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            score: { type: Number, default: 0 },
            reactionCount: { type: Number, default: 0 },
            commentCount: { type: Number, default: 0 },
            shareCount: { type: Number, default: 0 },
            viewCount: { type: Number, default: 0 },
            lastInteracted: { type: Date, default: Date.now },
        }
    ],
    // Content-type preference (accumulated engage counts)
    contentTypePreference: {
        text: { type: Number, default: 0 },
        image: { type: Number, default: 0 },
        video: { type: Number, default: 0 },
    },
    updatedAt: { type: Date, default: Date.now },
}, { timestamps: false })

userInterestSchema.index({ viewer: 1 })
userInterestSchema.index({ 'interactions.author': 1 })

const UserInterest = mongoose.model('UserInterest', userInterestSchema)

export default UserInterest
