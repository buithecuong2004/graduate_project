import LiveStream from "../models/LiveStream.js";
import LiveComment from "../models/LiveComment.js";
import User from "../models/User.js";
import { getUniqueNotificationRecipientIds } from "../utils/notificationRecipients.js";

const REACTION_TYPES = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry']);

const userSelect = 'full_name username profile_picture _id';

const populateLiveStream = (query) => query
    .populate('user', userSelect)
    .populate('reactions.user', userSelect);

const getReactionCounts = (reactions = []) => reactions.reduce((counts, reaction) => {
    counts[reaction.type] = (counts[reaction.type] || 0) + 1;
    return counts;
}, {});

const getViewerNetworkIds = async (userId) => {
    const user = await User.findById(userId).select('connections following');
    if (!user) return [userId.toString()];

    return [...new Set([
        userId.toString(),
        ...(user.connections || []).map((id) => id.toString()),
        ...(user.following || []).map((id) => id.toString())
    ])];
};

const buildLiveNotification = (stream, user) => {
    const streamId = stream._id.toString();
    const userData = {
        _id: user._id,
        full_name: user.full_name,
        username: user.username,
        profile_picture: user.profile_picture
    };

    return {
        id: `new_live:${streamId}`,
        type: 'new_live',
        data: {
            live_id: streamId,
            user: userData,
            stream: {
                _id: stream._id,
                title: stream.title,
                status: stream.status,
                viewers_count: stream.viewers_count || 0,
                started_at: stream.started_at,
                createdAt: stream.createdAt,
                user: userData
            }
        }
    };
};

export const startLiveStream = async (req, res) => {
    try {
        const userId = req.userId;
        const title = (req.body.title || '').trim().slice(0, 140);

        const currentUser = await User.findById(userId);
        if (!currentUser) return res.json({ success: false, message: 'User not found' });

        const previousStreams = await LiveStream.find({ user: userId, status: 'live' }).select('_id').lean();

        await LiveStream.updateMany(
            { user: userId, status: 'live' },
            { $set: { status: 'ended', ended_at: new Date(), viewers_count: 0 } }
        );

        const stream = await LiveStream.create({
            user: userId,
            title,
            status: 'live',
            started_at: new Date()
        });

        const populatedStream = await populateLiveStream(LiveStream.findById(stream._id));
        const notification = buildLiveNotification(populatedStream, currentUser);
        const recipientIds = getUniqueNotificationRecipientIds(currentUser, userId);
        const io = req.app.locals.io;

        if (io) {
            previousStreams.forEach((previousStream) => {
                const payload = {
                    streamId: previousStream._id.toString(),
                    endedAt: new Date()
                };

                io.to(`live-${previousStream._id}`).emit('live-stream-ended', payload);
                [...new Set([userId, ...recipientIds])].forEach((recipientId) => {
                    io.to(`user-${recipientId}`).emit('live-stream-ended', payload);
                });
            });

            recipientIds.forEach((recipientId) => {
                io.to(`user-${recipientId}`).emit('live-stream-started', notification.data.stream);
                io.to(`user-${recipientId}`).emit('new-live-notification', notification);
            });
        }

        res.json({ success: true, message: 'Live stream started', stream: populatedStream });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const endLiveStream = async (req, res) => {
    try {
        const userId = req.userId;
        const { streamId } = req.params;

        const stream = await LiveStream.findById(streamId);
        if (!stream) return res.json({ success: false, message: 'Live stream not found' });
        if (stream.user.toString() !== userId) {
            return res.json({ success: false, message: 'You can only end your own live stream' });
        }

        if (stream.status !== 'ended') {
            stream.status = 'ended';
            stream.ended_at = new Date();
            stream.viewers_count = 0;
            await stream.save();
        }

        const currentUser = await User.findById(userId);
        const recipientIds = currentUser
            ? getUniqueNotificationRecipientIds(currentUser, userId)
            : [];
        const io = req.app.locals.io;
        const payload = {
            streamId: stream._id.toString(),
            endedAt: stream.ended_at
        };

        if (io) {
            io.to(`live-${stream._id}`).emit('live-stream-ended', payload);
            [...new Set([userId, ...recipientIds])].forEach((recipientId) => {
                io.to(`user-${recipientId}`).emit('live-stream-ended', payload);
            });
        }

        res.json({ success: true, message: 'Live stream ended', streamId: stream._id });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const getActiveLiveStreams = async (req, res) => {
    try {
        const networkIds = await getViewerNetworkIds(req.userId);
        const streams = await populateLiveStream(
            LiveStream.find({ status: 'live', user: { $in: networkIds } })
                .sort({ createdAt: -1 })
                .limit(30)
        );

        res.json({ success: true, streams });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const getLiveStreamById = async (req, res) => {
    try {
        const { streamId } = req.params;
        const stream = await populateLiveStream(LiveStream.findById(streamId));
        if (!stream) return res.json({ success: false, message: 'Live stream not found' });

        const totalCommentsCount = await LiveComment.countDocuments({ stream: streamId });
        const streamObj = {
            ...stream.toObject(),
            total_comments_count: totalCommentsCount,
            reaction_counts: getReactionCounts(stream.reactions || [])
        };

        res.json({ success: true, stream: streamObj });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const getLiveComments = async (req, res) => {
    try {
        const { streamId } = req.params;
        const { limit = 50, before } = req.query;
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
        const query = { stream: streamId };

        if (before) query._id = { $lt: before };

        let comments = await LiveComment.find(query)
            .populate('user', userSelect)
            .sort({ createdAt: -1 })
            .limit(limitNum + 1)
            .lean();

        const hasMore = comments.length > limitNum;
        if (hasMore) comments = comments.slice(0, limitNum);
        comments.reverse();

        res.json({ success: true, comments, hasMore });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const addLiveComment = async (req, res) => {
    try {
        const userId = req.userId;
        const { streamId } = req.params;
        const content = (req.body.content || '').trim();

        if (!content) return res.json({ success: false, message: 'Comment cannot be empty' });
        if (content.length > 1000) {
            return res.json({ success: false, message: 'Comment is too long' });
        }

        const stream = await LiveStream.findById(streamId).select('status');
        if (!stream) return res.json({ success: false, message: 'Live stream not found' });
        if (stream.status !== 'live') {
            return res.json({ success: false, message: 'Live stream has ended' });
        }

        const comment = await LiveComment.create({
            stream: streamId,
            user: userId,
            content
        });

        const commentWithUser = await LiveComment.findById(comment._id)
            .populate('user', userSelect)
            .lean();
        const totalCommentsCount = await LiveComment.countDocuments({ stream: streamId });
        const io = req.app.locals.io;

        if (io) {
            io.to(`live-${streamId}`).emit('live-comment-created', {
                streamId,
                comment: commentWithUser,
                totalCommentsCount
            });
        }

        res.json({ success: true, message: 'Comment added', comment: commentWithUser, totalCommentsCount });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const reactToLiveStream = async (req, res) => {
    try {
        const userId = req.userId;
        const { streamId } = req.params;
        const { reactionType } = req.body;

        if (!REACTION_TYPES.has(reactionType)) {
            return res.json({ success: false, message: 'Invalid reaction' });
        }

        const stream = await LiveStream.findById(streamId);
        if (!stream) return res.json({ success: false, message: 'Live stream not found' });
        if (stream.status !== 'live') {
            return res.json({ success: false, message: 'Live stream has ended' });
        }

        if (!stream.reactions) stream.reactions = [];

        const existingReactionIndex = stream.reactions.findIndex((reaction) => reaction.user.toString() === userId);
        let shouldBurst = false;

        if (existingReactionIndex !== -1) {
            if (stream.reactions[existingReactionIndex].type === reactionType) {
                stream.reactions.splice(existingReactionIndex, 1);
            } else {
                stream.reactions[existingReactionIndex].type = reactionType;
                shouldBurst = true;
            }
        } else {
            stream.reactions.push({ user: userId, type: reactionType });
            shouldBurst = true;
        }

        await stream.save();
        await stream.populate('reactions.user', userSelect);

        const actor = await User.findById(userId).select(userSelect).lean();
        const reactionCounts = getReactionCounts(stream.reactions || []);
        const io = req.app.locals.io;

        if (io) {
            io.to(`live-${streamId}`).emit('live-reaction-updated', {
                streamId,
                reactions: stream.reactions,
                reactionCounts
            });

            if (shouldBurst && actor) {
                io.to(`live-${streamId}`).emit('live-reaction-burst', {
                    streamId,
                    reaction: reactionType,
                    user: actor
                });
            }
        }

        res.json({
            success: true,
            message: 'Reaction updated',
            reactions: stream.reactions,
            reactionCounts
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};
