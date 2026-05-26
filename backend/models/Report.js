import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
    target_type: { type: String, enum: ['post', 'comment', 'message', 'user'], required: true },
    target_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    details: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'resolved'], default: 'pending' },
    resolution_note: { type: String, default: '' },
    resolved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolved_at: { type: Date },
}, { timestamps: true, minimize: false });

reportSchema.index({ target_type: 1, target_id: 1, status: 1 });
reportSchema.index({ reporter: 1, target_type: 1, target_id: 1, status: 1 });

const Report = mongoose.model('Report', reportSchema);

export default Report;
