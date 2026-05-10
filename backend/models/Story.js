import mongoose from "mongoose";

const storySchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    content: {type: String},
    media_url: [{type: String}],
    media_id: {type: String}, // ImageKit file ID for deletion
    media_type: {type: String, enum: ['text','image','video']},
    views_count: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
    reactions: [{
        user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
        type: {type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry']}
    }],
    background_color: {type: String}
}, {timestamps: true, minimize: false})

const Story = mongoose.model('Story', storySchema)

export default Story;