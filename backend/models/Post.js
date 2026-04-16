import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
    user: {type: String, ref: 'User', required: true},
    content: {type: String},
    image_urls: [{type: String}],
    image_ids: [{type: String}], // ImageKit file IDs for deletion
    video_url: {type: String},
    video_id: {type: String}, // ImageKit file ID for deletion
    post_type: {type: String, enum: ['text','image','text_with_image','video','text_with_video'], required: true},
    likes_count: [{type: String, ref: 'User'}],
    shares_count: [{type: String, ref: 'User'}],
    comments: [{type: String, ref: 'Comment'}],
    shared_from: {type: String, ref: 'Post'}, // Reference to original post if this is a repost
}, {timestamps: true, minimize: false})

const Post = mongoose.model('Post', postSchema)

export default Post;