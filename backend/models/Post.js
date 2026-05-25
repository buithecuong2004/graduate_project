import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    content: {type: String},
    image_urls: [{type: String}],
    image_ids: [{type: String}], // ImageKit file IDs for deletion
    video_url: {type: String},
    video_id: {type: String}, // ImageKit file ID for deletion
    post_type: {type: String, enum: ['text','image','text_with_image','video','text_with_video'], required: true},
    likes_count: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
    reactions: [{
        user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
        type: {type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry']}
    }],
    shares_count: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
    comments: [{type: mongoose.Schema.Types.ObjectId, ref: 'Comment'}],
    shared_from: {type: mongoose.Schema.Types.ObjectId, ref: 'Post'}, // Reference to original post if this is a repost
    is_hidden: {type: Boolean, default: false},
    hidden_at: {type: Date},
    hidden_by: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    hidden_reason: {type: String, default: ''},
}, {timestamps: true, minimize: false})

const Post = mongoose.model('Post', postSchema)

export default Post;
