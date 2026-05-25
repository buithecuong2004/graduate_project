import mongoose from 'mongoose';
import Post from '../models/Post.js';
import Report from '../models/Report.js';

const allowedReasons = new Set([
    'spam',
    'harassment',
    'hate',
    'violence',
    'nudity',
    'scam',
    'other'
]);

export const createPostReport = async (req, res) => {
    try {
        const { postId } = req.params;
        const reason = (req.body.reason || 'other').trim();
        const details = (req.body.details || '').trim().slice(0, 1000);

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ success: false, message: 'Invalid post id' });
        }

        if (!allowedReasons.has(reason)) {
            return res.status(400).json({ success: false, message: 'Invalid report reason' });
        }

        const post = await Post.findById(postId).select('user');
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
        if (post.user.toString() === req.userId) {
            return res.status(400).json({ success: false, message: 'You cannot report your own post' });
        }

        const existingReport = await Report.findOne({
            target_type: 'post',
            target_id: postId,
            reporter: req.userId,
            status: 'pending'
        });

        if (existingReport) {
            return res.json({ success: true, report: existingReport, message: 'Report already pending' });
        }

        const report = await Report.create({
            target_type: 'post',
            target_id: postId,
            reporter: req.userId,
            reason,
            details
        });

        res.json({ success: true, report, message: 'Report submitted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
