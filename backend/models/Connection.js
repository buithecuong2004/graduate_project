import mongoose from "mongoose";

const connetionSchema = new mongoose.Schema({
    from_user_id: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    to_user_id: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    status: {type: String, enum: ['pending', 'accepted'], default: 'pending'}

},{timestamps: true})

const Connection = mongoose.model('Connection', connetionSchema)

export default Connection