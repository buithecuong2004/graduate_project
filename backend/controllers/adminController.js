import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import Report from '../models/Report.js';
import User from '../models/User.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_PUBLIC_FIELDS = 'full_name username email profile_picture role account_status isOnline lastSeen createdAt locked_at locked_reason';
const GROWTH_DAY_OPTIONS = new Set([1, 7, 30, 90, 180, 365]);

const startOfDay = (date = new Date()) => {
    const nextDate = new Date(date);
    nextDate.setHours(0, 0, 0, 0);
    return nextDate;
};

const parsePage = (value) => Math.max(parseInt(value, 10) || 1, 1);
const parseLimit = (value, fallback = 20, max = 100) => Math.min(Math.max(parseInt(value, 10) || fallback, 1), max);
const parseGrowthDays = (value) => {
    const days = parseInt(value, 10);
    return GROWTH_DAY_OPTIONS.has(days) ? days : 7;
};

const arraySize = (value) => Array.isArray(value) ? value.length : 0;
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getPostStats = async (postIds = []) => {
    if (!postIds.length) return new Map();

    const [commentCounts, reportCounts] = await Promise.all([
        Comment.aggregate([
            { $match: { post: { $in: postIds } } },
            { $group: { _id: '$post', count: { $sum: 1 } } }
        ]),
        Report.aggregate([
            { $match: { target_type: 'post', target_id: { $in: postIds } } },
            { $group: { _id: '$target_id', total: { $sum: 1 }, pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } } } }
        ])
    ]);

    const stats = new Map();

    postIds.forEach((postId) => {
        stats.set(postId.toString(), { commentsCount: 0, reportsCount: 0, pendingReportsCount: 0 });
    });

    commentCounts.forEach((item) => {
        const current = stats.get(item._id.toString()) || {};
        stats.set(item._id.toString(), { ...current, commentsCount: item.count });
    });

    reportCounts.forEach((item) => {
        const current = stats.get(item._id.toString()) || {};
        stats.set(item._id.toString(), {
            ...current,
            reportsCount: item.total,
            pendingReportsCount: item.pending
        });
    });

    return stats;
};

const buildPostAdminPayload = (post, stats = {}) => {
    const postObject = post.toObject ? post.toObject() : post;
    const oldLikesCount = arraySize(postObject.likes_count);
    const reactionsCount = arraySize(postObject.reactions);
    const sharesCount = arraySize(postObject.shares_count);
    const commentsCount = stats.commentsCount || 0;

    return {
        ...postObject,
        old_likes_count: oldLikesCount,
        reactions_count: reactionsCount,
        shares_count: sharesCount,
        comments_count: commentsCount,
        total_interactions: oldLikesCount + reactionsCount + sharesCount + commentsCount,
        reports_count: stats.reportsCount || 0,
        pending_reports_count: stats.pendingReportsCount || 0
    };
};

const getGrowthStart = (days = 14) => startOfDay(new Date(Date.now() - (days - 1) * DAY_MS));

const buildDailySeries = (rows = [], start = getGrowthStart(), days = 14) => {
    const countByDay = new Map();

    rows.forEach((row) => {
        const key = row._id;
        countByDay.set(key, (countByDay.get(key) || 0) + (row.count || 0));
    });

    return Array.from({ length: days }, (_, index) => {
        const date = new Date(start.getTime() + index * DAY_MS);
        const key = date.toISOString().slice(0, 10);
        return {
            date: key,
            count: countByDay.get(key) || 0
        };
    });
};

const getGrowth = async (Model, days = 14) => {
    const start = getGrowthStart(days);
    const rows = await Model.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return buildDailySeries(rows, start, days);
};

const getLikeGrowth = async (days = 14) => {
    const start = getGrowthStart(days);
    const [postRows, commentRows] = await Promise.all([
        Post.aggregate([
            { $match: { createdAt: { $gte: start } } },
            {
                $project: {
                    day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: {
                        $add: [
                            { $size: { $ifNull: ['$likes_count', []] } },
                            { $size: { $ifNull: ['$reactions', []] } }
                        ]
                    }
                }
            },
            { $group: { _id: '$day', count: { $sum: '$count' } } },
            { $sort: { _id: 1 } }
        ]),
        Comment.aggregate([
            { $match: { createdAt: { $gte: start } } },
            {
                $project: {
                    day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: {
                        $add: [
                            { $size: { $ifNull: ['$likes_count', []] } },
                            { $size: { $ifNull: ['$reactions', []] } }
                        ]
                    }
                }
            },
            { $group: { _id: '$day', count: { $sum: '$count' } } },
            { $sort: { _id: 1 } }
        ])
    ]);

    return buildDailySeries([...postRows, ...commentRows], start, days);
};

const getShareGrowth = async (days = 14) => {
    const start = getGrowthStart(days);
    const rows = await Post.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
            $project: {
                day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $size: { $ifNull: ['$shares_count', []] } }
            }
        },
        { $group: { _id: '$day', count: { $sum: '$count' } } },
        { $sort: { _id: 1 } }
    ]);

    return buildDailySeries(rows, start, days);
};

export const getAdminDashboard = async (req, res) => {
    try {
        const today = startOfDay();
        const weekStart = new Date(today.getTime() - 6 * DAY_MS);
        const growthDays = parseGrowthDays(req.query.growthDays || req.query.days);

        const [
            totalUsers,
            totalPosts,
            totalComments,
            totalReports,
            pendingReports,
            newUsersToday,
            newUsersThisWeek,
            postReactionTotals,
            commentReactionTotals,
            usersGrowth,
            postsGrowth,
            commentsGrowth,
            likesGrowth,
            sharesGrowth,
            recentPosts
        ] = await Promise.all([
            User.countDocuments(),
            Post.countDocuments(),
            Comment.countDocuments(),
            Report.countDocuments(),
            Report.countDocuments({ status: 'pending' }),
            User.countDocuments({ createdAt: { $gte: today } }),
            User.countDocuments({ createdAt: { $gte: weekStart } }),
            Post.aggregate([
                {
                    $group: {
                        _id: null,
                        oldLikes: { $sum: { $size: { $ifNull: ['$likes_count', []] } } },
                        reactions: { $sum: { $size: { $ifNull: ['$reactions', []] } } },
                        shares: { $sum: { $size: { $ifNull: ['$shares_count', []] } } }
                    }
                }
            ]),
            Comment.aggregate([
                {
                    $group: {
                        _id: null,
                        oldLikes: { $sum: { $size: { $ifNull: ['$likes_count', []] } } },
                        reactions: { $sum: { $size: { $ifNull: ['$reactions', []] } } }
                    }
                }
            ]),
            getGrowth(User, growthDays),
            getGrowth(Post, growthDays),
            getGrowth(Comment, growthDays),
            getLikeGrowth(growthDays),
            getShareGrowth(growthDays),
            Post.find({})
                .populate('user', USER_PUBLIC_FIELDS)
                .sort({ createdAt: -1 })
                .limit(100)
        ]);

        const recentPostIds = recentPosts.map((post) => post._id);
        const statsByPost = await getPostStats(recentPostIds);
        const topPosts = recentPosts
            .map((post) => buildPostAdminPayload(post, statsByPost.get(post._id.toString())))
            .sort((left, right) => right.total_interactions - left.total_interactions)
            .slice(0, 8);

        const postTotals = postReactionTotals[0] || { oldLikes: 0, reactions: 0, shares: 0 };
        const commentTotals = commentReactionTotals[0] || { oldLikes: 0, reactions: 0 };

        res.json({
            success: true,
            dashboard: {
                totals: {
                    users: totalUsers,
                    posts: totalPosts,
                    comments: totalComments,
                    reports: totalReports,
                    pendingReports,
                    likesReactions: postTotals.oldLikes + postTotals.reactions + commentTotals.oldLikes + commentTotals.reactions,
                    postLikes: postTotals.oldLikes,
                    postReactions: postTotals.reactions,
                    commentLikes: commentTotals.oldLikes,
                    commentReactions: commentTotals.reactions,
                    shares: postTotals.shares,
                    newUsersToday,
                    newUsersThisWeek
                },
                topPosts,
                growthDays,
                growth: {
                    users: usersGrowth,
                    posts: postsGrowth,
                    comments: commentsGrowth,
                    likes: likesGrowth,
                    shares: sharesGrowth
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAdminUsers = async (req, res) => {
    try {
        const page = parsePage(req.query.page);
        const limit = parseLimit(req.query.limit);
        const search = (req.query.search || '').trim();
        const filter = {};

        if (search) {
            const regex = new RegExp(escapeRegex(search), 'i');
            filter.$or = [
                { full_name: regex },
                { username: regex },
                { email: regex }
            ];
        }

        const [users, total] = await Promise.all([
            User.find(filter)
                .select(USER_PUBLIC_FIELDS)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            User.countDocuments(filter)
        ]);

        res.json({ success: true, users, total, page, hasMore: page * limit < total });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAdminUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { role, account_status, locked_reason } = req.body;
        const update = {};

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid user id' });
        }

        if (role) {
            if (!['user', 'admin'].includes(role)) {
                return res.status(400).json({ success: false, message: 'Invalid role' });
            }
            update.role = role;
        }

        if (account_status) {
            if (!['active', 'locked'].includes(account_status)) {
                return res.status(400).json({ success: false, message: 'Invalid account status' });
            }
            if (userId === req.userId && account_status === 'locked') {
                return res.status(400).json({ success: false, message: 'You cannot lock your own account' });
            }

            update.account_status = account_status;
            update.locked_at = account_status === 'locked' ? new Date() : null;
            update.locked_reason = account_status === 'locked' ? (locked_reason || '') : '';
            if (account_status === 'locked') update.isOnline = false;
        }

        const user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true }).select(USER_PUBLIC_FIELDS);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAdminPosts = async (req, res) => {
    try {
        const page = parsePage(req.query.page);
        const limit = parseLimit(req.query.limit);
        const search = (req.query.search || '').trim();
        const userSearch = (req.query.user || '').trim();
        const status = (req.query.status || 'all').trim();
        const filter = {};

        if (search) filter.content = new RegExp(escapeRegex(search), 'i');
        if (req.query.from || req.query.to) {
            filter.createdAt = {};
            if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
            if (req.query.to) {
                const toDate = new Date(req.query.to);
                toDate.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = toDate;
            }
        }

        if (status === 'hidden') filter.is_hidden = true;
        if (status === 'visible') filter.is_hidden = { $ne: true };
        if (status === 'reported') {
            const reportedPostIds = await Report.distinct('target_id', { target_type: 'post', status: 'pending' });
            filter._id = { $in: reportedPostIds };
        }

        if (userSearch) {
            if (mongoose.Types.ObjectId.isValid(userSearch)) {
                filter.user = userSearch;
            } else {
                const regex = new RegExp(escapeRegex(userSearch), 'i');
                const users = await User.find({
                    $or: [{ full_name: regex }, { username: regex }, { email: regex }]
                }).select('_id');
                filter.user = { $in: users.map((user) => user._id) };
            }
        }

        const [posts, total] = await Promise.all([
            Post.find(filter)
                .populate('user', USER_PUBLIC_FIELDS)
                .populate('hidden_by', USER_PUBLIC_FIELDS)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Post.countDocuments(filter)
        ]);

        const statsByPost = await getPostStats(posts.map((post) => post._id));
        const postsWithStats = posts.map((post) => buildPostAdminPayload(post, statsByPost.get(post._id.toString())));

        res.json({ success: true, posts: postsWithStats, total, page, hasMore: page * limit < total });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAdminPostVisibility = async (req, res) => {
    try {
        const { postId } = req.params;
        const { is_hidden, reason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ success: false, message: 'Invalid post id' });
        }

        const update = is_hidden
            ? { is_hidden: true, hidden_at: new Date(), hidden_by: req.userId, hidden_reason: reason || '' }
            : { is_hidden: false, hidden_at: null, hidden_by: null, hidden_reason: '' };

        const post = await Post.findByIdAndUpdate(postId, update, { new: true }).populate('user', USER_PUBLIC_FIELDS);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        if (is_hidden) {
            await Report.updateMany(
                { target_type: 'post', target_id: postId, status: 'pending' },
                {
                    $set: {
                        status: 'approved',
                        resolution_note: reason || 'Post hidden by admin',
                        resolved_by: req.userId,
                        resolved_at: new Date()
                    }
                }
            );
        }

        const io = req.app.locals.io;
        if (io) io.to(`post-${postId}`).emit('post-visibility-updated', { postId, is_hidden: !!is_hidden });

        const statsByPost = await getPostStats([post._id]);
        res.json({ success: true, post: buildPostAdminPayload(post, statsByPost.get(post._id.toString())) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteAdminPost = async (req, res) => {
    try {
        const { postId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ success: false, message: 'Invalid post id' });
        }

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        await Promise.all([
            Comment.deleteMany({ post: postId }),
            Report.updateMany(
                { target_type: 'post', target_id: postId, status: 'pending' },
                {
                    $set: {
                        status: 'approved',
                        resolution_note: 'Post deleted by admin',
                        resolved_by: req.userId,
                        resolved_at: new Date()
                    }
                }
            ),
            Post.findByIdAndDelete(postId)
        ]);

        const io = req.app.locals.io;
        if (io) io.to(`post-${postId}`).emit('post-deleted', { postId, actorId: req.userId });

        res.json({ success: true, message: 'Post deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAdminReports = async (req, res) => {
    try {
        const page = parsePage(req.query.page);
        const limit = parseLimit(req.query.limit);
        const status = (req.query.status || 'all').trim();
        const filter = {};

        if (status !== 'all') filter.status = status;

        const [reports, total] = await Promise.all([
            Report.find(filter)
                .populate('reporter', USER_PUBLIC_FIELDS)
                .populate({
                    path: 'target_id',
                    populate: { path: 'user', select: USER_PUBLIC_FIELDS }
                })
                .populate('resolved_by', USER_PUBLIC_FIELDS)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Report.countDocuments(filter)
        ]);

        res.json({ success: true, reports, total, page, hasMore: page * limit < total });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAdminReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { action, resolution_note } = req.body;

        if (!mongoose.Types.ObjectId.isValid(reportId)) {
            return res.status(400).json({ success: false, message: 'Invalid report id' });
        }

        const report = await Report.findById(reportId);
        if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

        if (!['approve', 'reject', 'resolve'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid report action' });
        }

        report.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'resolved';
        report.resolution_note = resolution_note || '';
        report.resolved_by = req.userId;
        report.resolved_at = new Date();
        await report.save();

        if (action === 'approve' && report.target_type === 'post') {
            await Promise.all([
                Post.findByIdAndUpdate(report.target_id, {
                    is_hidden: true,
                    hidden_at: new Date(),
                    hidden_by: req.userId,
                    hidden_reason: resolution_note || 'Report approved'
                }),
                Report.updateMany(
                    {
                        _id: { $ne: report._id },
                        target_type: 'post',
                        target_id: report.target_id,
                        status: 'pending'
                    },
                    {
                        $set: {
                            status: 'approved',
                            resolution_note: resolution_note || 'Resolved with approved report',
                            resolved_by: req.userId,
                            resolved_at: new Date()
                        }
                    }
                )
            ]);
        }

        const populatedReport = await Report.findById(reportId)
            .populate('reporter', USER_PUBLIC_FIELDS)
            .populate({
                path: 'target_id',
                populate: { path: 'user', select: USER_PUBLIC_FIELDS }
            })
            .populate('resolved_by', USER_PUBLIC_FIELDS);

        res.json({ success: true, report: populatedReport });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
