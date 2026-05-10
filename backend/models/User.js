import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email: {type: String, required: true},
    full_name: {type: String, required: true},
    username: {type: String, unique: true},
    role: {type: String,  default: 'user'},
    bio: {type: String, default: 'Hey there! I am using Tarous'},
    profile_picture: {type: String, default: ''},
    cover_photo: {type: String, default: ''},
    location: {type: String, default: ''},
    provider: {type: String, enum: ['google', 'facebook'], required: true},
    providerId: {type: String, required: true},
    followers: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
    following: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
    connections: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}]
}, {timestamps: true, minimize: false})

// Compound unique index: same provider + providerId combo must be unique
userSchema.index({ provider: 1, providerId: 1 }, { unique: true })

const User = mongoose.model('User', userSchema)

export default User