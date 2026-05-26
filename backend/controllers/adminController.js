import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Message from '../models/Message.js';
import Post from '../models/Post.js';
import Report from '../models/Report.js';
import User from '../models/User.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_PUBLIC_FIELDS = 'full_name username email profile_picture role account_status isOnline lastSeen createdAt locked_at locked_reason';
const GROWTH_DAY_OPTIONS = new Set([1, 7, 30, 90, 180, 365]);
const POST_SHARED_POPULATE = {
    path: 'shared_from',
    populate: { path: 'user', select: USER_PUBLIC_FIELDS }
};

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

const getPercentChange = (current = 0, previous = 0) => {
    const currentValue = Number(current) || 0;
    const previousValue = Number(previous) || 0;

    if (currentValue === previousValue) return 0;
    if (previousValue <= 0) return currentValue > 0 ? 100 : 0;

    const percent = Math.round(((currentValue - previousValue) / previousValue) * 100);
    return Math.max(-100, Math.min(100, percent));
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

const hydrateReports = async (reports = []) => {
    const idsByType = reports.reduce((acc, report) => {
        const type = report.target_type;
        if (!acc[type]) acc[type] = [];
        if (report.target_id) acc[type].push(report.target_id);
        return acc;
    }, {});

    const [posts, comments, messages, users] = await Promise.all([
        idsByType.post?.length
            ? Post.find({ _id: { $in: idsByType.post } })
                .populate('user', USER_PUBLIC_FIELDS)
                .populate(POST_SHARED_POPULATE)
                .lean()
            : [],
        idsByType.comment?.length
            ? Comment.find({ _id: { $in: idsByType.comment } })
                .populate('user', USER_PUBLIC_FIELDS)
                .populate({
                    path: 'post',
                    populate: [
                        { path: 'user', select: USER_PUBLIC_FIELDS },
                        POST_SHARED_POPULATE
                    ]
                })
                .lean()
            : [],
        idsByType.message?.length
            ? Message.find({ _id: { $in: idsByType.message } })
                .populate('from_user_id', USER_PUBLIC_FIELDS)
                .populate('to_user_id', USER_PUBLIC_FIELDS)
                .populate({
                    path: 'shared_post_id',
                    populate: [
                        { path: 'user', select: USER_PUBLIC_FIELDS },
                        POST_SHARED_POPULATE
                    ]
                })
                .lean()
            : [],
        idsByType.user?.length
            ? User.find({ _id: { $in: idsByType.user } }).select(USER_PUBLIC_FIELDS).lean()
            : []
    ]);

    const targetMaps = {
        post: new Map(posts.map((post) => [post._id.toString(), post])),
        comment: new Map(comments.map((comment) => [comment._id.toString(), comment])),
        message: new Map(messages.map((message) => [message._id.toString(), message])),
        user: new Map(users.map((user) => [user._id.toString(), user]))
    };

    return reports.map((report) => {
        const reportObject = report.toObject ? report.toObject() : report;
        const target = targetMaps[reportObject.target_type]?.get(reportObject.target_id?.toString()) || null;
        return {
            ...reportObject,
            target,
            target_id: target || reportObject.target_id
        };
    });
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
        const yesterday = new Date(today.getTime() - DAY_MS);
        const weekStart = new Date(today.getTime() - 6 * DAY_MS);
        const beforeTodayFilter = { createdAt: { $lt: today } };
        const yesterdayFilter = { createdAt: { $gte: yesterday, $lt: today } };
        const growthDays = parseGrowthDays(req.query.growthDays || req.query.days);

        const [
            totalUsers,
            totalPosts,
            totalComments,
            totalReports,
            pendingReports,
            newUsersToday,
            newUsersThisWeek,
            newPostsToday,
            newPostsThisWeek,
            newCommentsToday,
            newCommentsThisWeek,
            newReportsToday,
            newReportsThisWeek,
            usersBeforeToday,
            postsBeforeToday,
            commentsBeforeToday,
            reportsBeforeToday,
            newUsersYesterday,
            postReactionTotals,
            commentReactionTotals,
            postReactionBeforeTodayTotals,
            commentReactionBeforeTodayTotals,
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
            Post.countDocuments({ createdAt: { $gte: today } }),
            Post.countDocuments({ createdAt: { $gte: weekStart } }),
            Comment.countDocuments({ createdAt: { $gte: today } }),
            Comment.countDocuments({ createdAt: { $gte: weekStart } }),
            Report.countDocuments({ createdAt: { $gte: today } }),
            Report.countDocuments({ createdAt: { $gte: weekStart } }),
            User.countDocuments(beforeTodayFilter),
            Post.countDocuments(beforeTodayFilter),
            Comment.countDocuments(beforeTodayFilter),
            Report.countDocuments(beforeTodayFilter),
            User.countDocuments(yesterdayFilter),
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
            Post.aggregate([
                { $match: beforeTodayFilter },
                {
                    $group: {
                        _id: null,
                        oldLikes: { $sum: { $size: { $ifNull: ['$likes_count', []] } } },
                        reactions: { $sum: { $size: { $ifNull: ['$reactions', []] } } }
                    }
                }
            ]),
            Comment.aggregate([
                { $match: beforeTodayFilter },
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
                .populate(POST_SHARED_POPULATE)
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
        const postBeforeTodayTotals = postReactionBeforeTodayTotals[0] || { oldLikes: 0, reactions: 0 };
        const commentBeforeTodayTotals = commentReactionBeforeTodayTotals[0] || { oldLikes: 0, reactions: 0 };
        const likesReactions = postTotals.oldLikes + postTotals.reactions + commentTotals.oldLikes + commentTotals.reactions;
        const likesReactionsBeforeToday = postBeforeTodayTotals.oldLikes + postBeforeTodayTotals.reactions + commentBeforeTodayTotals.oldLikes + commentBeforeTodayTotals.reactions;
        const likesReactionsToday = Math.max(likesReactions - likesReactionsBeforeToday, 0);

        res.json({
            success: true,
            dashboard: {
                totals: {
                    users: totalUsers,
                    posts: totalPosts,
                    comments: totalComments,
                    reports: totalReports,
                    pendingReports,
                    likesReactions,
                    postLikes: postTotals.oldLikes,
                    postReactions: postTotals.reactions,
                    commentLikes: commentTotals.oldLikes,
                    commentReactions: commentTotals.reactions,
                    shares: postTotals.shares,
                    newUsersToday,
                    newUsersThisWeek,
                    newPostsToday,
                    newPostsThisWeek,
                    newCommentsToday,
                    newCommentsThisWeek,
                    newReportsToday,
                    newReportsThisWeek,
                    likesReactionsToday,
                    growthPercent: {
                        users: getPercentChange(totalUsers, usersBeforeToday),
                        posts: getPercentChange(totalPosts, postsBeforeToday),
                        comments: getPercentChange(totalComments, commentsBeforeToday),
                        reports: getPercentChange(totalReports, reportsBeforeToday),
                        likesReactions: getPercentChange(likesReactions, likesReactionsBeforeToday),
                        newUsersToday: getPercentChange(newUsersToday, newUsersYesterday),
                        newUsersThisWeek: getPercentChange(newUsersToday, newUsersYesterday)
                    }
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
                .populate(POST_SHARED_POPULATE)
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

        const post = await Post.findByIdAndUpdate(postId, update, { new: true })
            .populate('user', USER_PUBLIC_FIELDS)
            .populate(POST_SHARED_POPULATE);
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
        const targetType = (req.query.target_type || req.query.type || 'all').trim();
        const filter = {};

        if (status !== 'all') filter.status = status;
        if (targetType !== 'all') {
            if (!['post', 'comment', 'message', 'user'].includes(targetType)) {
                return res.status(400).json({ success: false, message: 'Invalid report category' });
            }
            filter.target_type = targetType;
        }

        const [reports, total] = await Promise.all([
            Report.find(filter)
                .populate('reporter', USER_PUBLIC_FIELDS)
                .populate('resolved_by', USER_PUBLIC_FIELDS)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Report.countDocuments(filter)
        ]);

        res.json({ success: true, reports: await hydrateReports(reports), total, page, hasMore: page * limit < total });
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

        if (action === 'approve') {
            const moderationUpdate = {
                post: () => Post.findByIdAndUpdate(report.target_id, {
                    is_hidden: true,
                    hidden_at: new Date(),
                    hidden_by: req.userId,
                    hidden_reason: resolution_note || 'Report approved'
                }),
                comment: () => Comment.findByIdAndUpdate(report.target_id, {
                    is_hidden: true,
                    hidden_at: new Date(),
                    hidden_by: req.userId,
                    hidden_reason: resolution_note || 'Report approved'
                }),
                message: () => Message.findByIdAndUpdate(report.target_id, {
                    is_deleted: true,
                    text: '',
                    searchText: '',
                    searchTokens: [],
                    media_urls: [],
                    media_ids: []
                }),
                user: () => User.findByIdAndUpdate(report.target_id, {
                    account_status: 'locked',
                    locked_at: new Date(),
                    locked_reason: resolution_note || 'Report approved',
                    isOnline: false
                })
            }[report.target_type];

            await Promise.all([
                moderationUpdate ? moderationUpdate() : Promise.resolve(),
                Report.updateMany(
                    {
                        _id: { $ne: report._id },
                        target_type: report.target_type,
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

        const [populatedReport] = await hydrateReports([await Report.findById(reportId)
            .populate('reporter', USER_PUBLIC_FIELDS)
            .populate('resolved_by', USER_PUBLIC_FIELDS)
            .lean()]);

        res.json({ success: true, report: populatedReport });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
