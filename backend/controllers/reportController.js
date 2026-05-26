import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Message from '../models/Message.js';
import Post from '../models/Post.js';
import Report from '../models/Report.js';
import User from '../models/User.js';

const allowedReasons = new Set([
    'spam',
    'harassment',
    'hate',
    'violence',
    'nudity',
    'scam',
    'other'
]);

const reportTargetConfig = {
    post: {
        idParam: 'postId',
        model: Post,
        notFoundMessage: 'Post not found',
        select: 'user',
        ownerField: 'user',
        preventSelfReport: true
    },
    comment: {
        idParam: 'commentId',
        model: Comment,
        notFoundMessage: 'Comment not found',
        select: 'user',
        ownerField: 'user',
        preventSelfReport: false
    },
    message: {
        idParam: 'messageId',
        model: Message,
        notFoundMessage: 'Message not found',
        preventSelfReport: false,
        canReport: (target, userId) => (
            target.from_user_id?.toString() === userId || target.to_user_id?.toString() === userId
        )
    },
    user: {
        idParam: 'userId',
        model: User,
        notFoundMessage: 'User not found',
        select: '_id',
        preventSelfReport: true
    }
};

const createReport = (targetType) => async (req, res) => {
    try {
        const config = reportTargetConfig[targetType];
        const targetId = req.params[config.idParam];
        const reason = (req.body.reason || 'other').trim();
        const details = (req.body.details || '').trim().slice(0, 1000);

        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ success: false, message: `Invalid ${targetType} id` });
        }

        if (!allowedReasons.has(reason)) {
            return res.status(400).json({ success: false, message: 'Invalid report reason' });
        }

        const targetQuery = config.model.findById(targetId);
        if (config.select) targetQuery.select(config.select);
        const target = await targetQuery;
        if (!target) return res.status(404).json({ success: false, message: config.notFoundMessage });

        if (config.preventSelfReport) {
            const ownerId = config.ownerField ? target[config.ownerField]?.toString() : target._id?.toString();
            if (ownerId === req.userId) {
                return res.status(400).json({ success: false, message: 'You cannot report yourself or your own content' });
            }
        }

        if (config.canReport && !config.canReport(target, req.userId)) {
            return res.status(403).json({ success: false, message: 'You cannot report this content' });
        }

        const existingReport = await Report.findOne({
            target_type: targetType,
            target_id: targetId,
            reporter: req.userId,
            status: 'pending'
        });

        if (existingReport) {
            return res.json({ success: true, report: existingReport, message: 'Report already pending' });
        }

        const report = await Report.create({
            target_type: targetType,
            target_id: targetId,
            reporter: req.userId,
            reason,
            details
        });

        res.json({ success: true, report, message: 'Report submitted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createPostReport = createReport('post');
export const createCommentReport = createReport('comment');
export const createMessageReport = createReport('message');
export const createUserReport = createReport('user');
