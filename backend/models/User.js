import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email: {type: String, required: true},
    full_name: {type: String, required: true},
    username: {type: String, unique: true},
    role: {type: String, enum: ['user', 'admin'], default: 'user'},
    account_status: {type: String, enum: ['active', 'locked'], default: 'active'},
    locked_at: {type: Date},
    locked_reason: {type: String, default: ''},
    bio: {type: String, default: 'Chào mọi người. Tôi đang dùng Tarous!!'},
    profile_picture: {type: String, default: ''},
    cover_photo: {type: String, default: ''},
    location: {type: String, default: ''},
    provider: {type: String, enum: ['google', 'facebook', 'local'], required: true},
    providerId: {type: String, required: true},
    password_hash: {type: String, select: false},
    password_reset_otp_hash: {type: String, select: false},
    password_reset_otp_expires_at: {type: Date, select: false},
    password_reset_otp_attempts: {type: Number, default: 0, select: false},
    isOnline: {type: Boolean, default: false},
    lastSeen: {type: Date},
    followers: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
    following: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
    connections: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
    blockedUsers: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}]
}, {timestamps: true, minimize: false})

// Compound unique index: same provider + providerId combo must be unique
userSchema.index({ provider: 1, providerId: 1 }, { unique: true })
userSchema.index({ email: 1 }, { unique: true })

const User = mongoose.model('User', userSchema)

export default User
