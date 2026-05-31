import { Server } from 'socket.io';
import User from '../models/User.js';
import LiveStream from '../models/LiveStream.js';
import GroupChat from '../models/GroupChat.js';
import { isConversationBlocked } from '../utils/blocking.js';

const getUserId = (value) => value?._id?.toString?.() || value?.toString?.() || '';

const getGroupMemberIds = (group) => (
    (group?.members || []).map((member) => getUserId(member.user)).filter(Boolean)
);

const isGroupMember = (group, userId) => (
    getGroupMemberIds(group).includes(userId?.toString?.() || userId)
);

const isGroupCallPayload = (data = {}) => (
    data.groupCall === true ||
    data.groupCall === 'true' ||
    data.isGroupCall === true ||
    data.isGroupCall === 'true' ||
    data.callScope === 'group' ||
    data.conversationType === 'group' ||
    !!data.groupId
);

export const setupSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // Store connected users with all active socket IDs so multiple tabs stay online.
    const connectedUsers = new Map();
    const liveViewersByStream = new Map();
    const activeGroupCalls = new Map();

    const emitUserPresence = async (userId, isOnline) => {
        const lastSeen = new Date();

        await User.findByIdAndUpdate(userId, { isOnline, lastSeen });

        io.emit('user-status-changed', {
            userId,
            isOnline,
            lastSeen: lastSeen.toISOString()
        });
    };

    const getLiveViewerCount = (streamId) => liveViewersByStream.get(streamId)?.size || 0;

    const emitLiveViewerCount = async (streamId) => {
        const viewers_count = getLiveViewerCount(streamId);

        await LiveStream.findByIdAndUpdate(streamId, { viewers_count });
        io.to(`live-${streamId}`).emit('live-viewer-count-updated', {
            streamId,
            viewers_count
        });

        return viewers_count;
    };

    const removeLiveViewer = async (socket, streamId) => {
        const viewers = liveViewersByStream.get(streamId);
        if (!viewers?.has(socket.id)) return;

        const viewerId = viewers.get(socket.id);
        viewers.delete(socket.id);
        if (viewers.size === 0) liveViewersByStream.delete(streamId);

        const stream = await LiveStream.findById(streamId).select('user');
        const viewers_count = await emitLiveViewerCount(streamId);

        if (stream?.user) {
            io.to(`user-${stream.user}`).emit('live-viewer-left', {
                streamId,
                viewerSocketId: socket.id,
                viewerId,
                viewers_count
            });
        }
    };

    const removeSocketFromLiveStreams = async (socket) => {
        const streamIds = Array.from(liveViewersByStream.keys());
        await Promise.all(streamIds.map((streamId) => removeLiveViewer(socket, streamId)));
    };

    io.on('connection', (socket) => {

        // Join user notification room
        socket.on('user-connect', async (userId) => {
            if (!userId) return;

            const normalizedUserId = userId.toString();
            const existingSockets = connectedUsers.get(normalizedUserId) || new Set();
            const wasOffline = existingSockets.size === 0;

            existingSockets.add(socket.id);
            connectedUsers.set(normalizedUserId, existingSockets);
            socket.data.userId = normalizedUserId;
            socket.join(`user-${normalizedUserId}`);

            if (wasOffline) {
                try {
                    await emitUserPresence(normalizedUserId, true);
                } catch (error) {
                    console.log('Presence update error:', error.message);
                }
            }
        });

        // Join a post room for real-time comments
        socket.on('join-post', (postId) => {
            socket.join(`post-${postId}`);
        });

        // Leave a post room
        socket.on('leave-post', (postId) => {
            socket.leave(`post-${postId}`);
        });

        socket.on('join-live-stream', async ({ streamId, role = 'viewer' } = {}) => {
            if (!streamId) return;

            try {
                const stream = await LiveStream.findById(streamId).select('user status');
                if (!stream || stream.status !== 'live') {
                    socket.emit('live-stream-ended', { streamId });
                    return;
                }

                const normalizedStreamId = streamId.toString();
                const normalizedUserId = socket.data.userId?.toString?.() || '';

                socket.join(`live-${normalizedStreamId}`);

                if (role === 'host' && normalizedUserId === stream.user.toString()) {
                    const currentViewers = liveViewersByStream.get(normalizedStreamId);
                    if (currentViewers) {
                        currentViewers.forEach((viewerId, viewerSocketId) => {
                            socket.emit('live-viewer-joined', {
                                streamId: normalizedStreamId,
                                viewerSocketId,
                                viewerId
                            });
                        });
                    }
                    await emitLiveViewerCount(normalizedStreamId);
                    return;
                }

                const viewers = liveViewersByStream.get(normalizedStreamId) || new Map();
                viewers.set(socket.id, normalizedUserId);
                liveViewersByStream.set(normalizedStreamId, viewers);

                io.to(`user-${stream.user}`).emit('live-viewer-joined', {
                    streamId: normalizedStreamId,
                    viewerSocketId: socket.id,
                    viewerId: normalizedUserId
                });

                await emitLiveViewerCount(normalizedStreamId);
            } catch (error) {
                console.log('Join live stream error:', error.message);
            }
        });

        socket.on('leave-live-stream', async ({ streamId } = {}) => {
            if (!streamId) return;

            try {
                await removeLiveViewer(socket, streamId.toString());
                socket.leave(`live-${streamId}`);
            } catch (error) {
                console.log('Leave live stream error:', error.message);
            }
        });

        socket.on('live-webrtc-signal', (data = {}) => {
            if (!data.streamId || !data.targetSocketId || !data.signal) return;

            io.to(data.targetSocketId).emit('live-webrtc-signal', {
                streamId: data.streamId,
                signal: data.signal,
                fromSocketId: socket.id,
                fromUserId: socket.data.userId
            });
        });

        // ─── Call Signaling ───────────────────────────────────────────────
        // A initiates a call → forward to B
        socket.on('call-user', async (data) => {
            // data: { to, from, callType, callerName, callerAvatar, offer }
            const from = socket.data.userId || data.from;
            if (isGroupCallPayload(data)) {
                if (!from || !data?.groupId) return;

                try {
                    const group = await GroupChat.findById(data.groupId)
                        .populate('members.user', 'full_name username profile_picture _id')
                        .lean();

                    if (!group || !isGroupMember(group, from)) {
                        socket.emit('call-blocked', { groupId: data.groupId });
                        return;
                    }

                    const recipientIds = getGroupMemberIds(group)
                        .filter((memberId) => memberId !== from.toString());
                    if (recipientIds.length === 0) {
                        socket.emit('call-blocked', { groupId: data.groupId });
                        return;
                    }

                    const callId = data.callId || `${data.groupId}-${Date.now()}-${from}`;
                    activeGroupCalls.set(callId, {
                        groupId: data.groupId.toString(),
                        callerId: from.toString(),
                        participantIds: new Set([from.toString()]),
                        recipientIds: new Set(recipientIds),
                    });

                    const incomingCall = {
                        ...data,
                        groupCall: true,
                        isGroupCall: true,
                        callScope: 'group',
                        conversationType: 'group',
                        groupId: data.groupId.toString(),
                        callId,
                        from,
                        groupName: data.groupName || group.name,
                        groupAvatar: data.groupAvatar || group.avatar_url || '',
                        groupMembers: group.members?.map((member) => member.user).filter(Boolean) || [],
                        recipientIds,
                    };

                    recipientIds.forEach((recipientId) => {
                        io.to(`user-${recipientId}`).emit('incoming-call', {
                            ...incomingCall,
                            to: recipientId,
                        });
                    });
                } catch (error) {
                    console.log('Group call error:', error.message);
                    socket.emit('call-blocked', { groupId: data.groupId });
                }
                return;
            }

            if (!from || !data?.to) return;
            if (from.toString() === data.to.toString()) {
                socket.emit('call-blocked', { to: data.to });
                return;
            }

            try {
                if (await isConversationBlocked(from, data.to)) {
                    socket.emit('call-blocked', { to: data.to });
                    return;
                }
            } catch (error) {
                console.log('Call block check error:', error.message);
                socket.emit('call-blocked', { to: data.to });
                return;
            }

            io.to(`user-${data.to}`).emit('incoming-call', { ...data, from });
        });

        // B accepts → send answer back to A (legacy)
        socket.on('call-accepted', (data) => {
            if (isGroupCallPayload(data) && data?.callId) {
                const from = (socket.data.userId || data.from)?.toString?.() || data.from;
                const call = activeGroupCalls.get(data.callId);
                if (!from || !call) return;

                const existingParticipantIds = Array.from(call.participantIds)
                    .filter((participantId) => participantId !== from);
                call.participantIds.add(from);

                io.to(`user-${call.callerId}`).emit('call-accepted', {
                    ...data,
                    from,
                    to: call.callerId,
                    groupId: call.groupId,
                });

                existingParticipantIds.forEach((participantId) => {
                    io.to(`user-${participantId}`).emit('group-call-participant-joined', {
                        callId: data.callId,
                        groupId: call.groupId,
                        userId: from,
                        participantIds: Array.from(call.participantIds),
                    });
                });

                io.to(`user-${from}`).emit('group-call-existing-participants', {
                    callId: data.callId,
                    groupId: call.groupId,
                    participantIds: existingParticipantIds,
                });
                return;
            }

            io.to(`user-${data.to}`).emit('call-accepted', data);
        });

        // A sends WebRTC offer → relay to B (after B accepted)
        socket.on('call-offer', (data) => {
            // data: { to, from, offer }
            io.to(`user-${data.to}`).emit('call-offer', data);
        });

        // B sends WebRTC answer → relay to A
        socket.on('call-answered', (data) => {
            // data: { to, from, answer }
            io.to(`user-${data.to}`).emit('call-answered', data);
        });

        // B rejects → notify A
        socket.on('call-rejected', (data) => {
            // data: { to, from }
            if (isGroupCallPayload(data) && data?.callId) {
                const from = (socket.data.userId || data.from)?.toString?.() || data.from;
                const call = activeGroupCalls.get(data.callId);
                if (!from || !call) return;
                io.to(`user-${call.callerId}`).emit('call-rejected', {
                    ...data,
                    from,
                    to: call.callerId,
                    groupId: call.groupId,
                });
                return;
            }

            io.to(`user-${data.to}`).emit('call-rejected', data);
        });

        // Either party ends call
        socket.on('call-ended', (data) => {
            // data: { to, from }
            if (isGroupCallPayload(data) && data?.callId) {
                const from = (socket.data.userId || data.from)?.toString?.() || data.from;
                const call = activeGroupCalls.get(data.callId);
                if (!from || !call) return;

                const participantIds = Array.from(call.participantIds);
                const shouldEndForAll = data.endForAll || from === call.callerId;

                if (shouldEndForAll) {
                    const targetIds = new Set([...participantIds, ...Array.from(call.recipientIds)]);
                    targetIds.delete(from);
                    targetIds.forEach((targetId) => {
                        io.to(`user-${targetId}`).emit('call-ended', {
                            ...data,
                            from,
                            groupId: call.groupId,
                            endForAll: true,
                        });
                    });
                    activeGroupCalls.delete(data.callId);
                    return;
                }

                call.participantIds.delete(from);
                participantIds
                    .filter((participantId) => participantId !== from)
                    .forEach((participantId) => {
                        io.to(`user-${participantId}`).emit('group-call-participant-left', {
                            callId: data.callId,
                            groupId: call.groupId,
                            userId: from,
                            participantIds: Array.from(call.participantIds),
                        });
                    });
                return;
            }

            io.to(`user-${data.to}`).emit('call-ended', data);
        });

        // ICE candidates relay
        socket.on('ice-candidate', (data) => {
            // data: { to, from, candidate }
            io.to(`user-${data.to}`).emit('ice-candidate', data);
        });

        // Generic WebRTC signal relay (for robust SimplePeer signaling)
        socket.on('webrtc-signal', (data) => {
            io.to(`user-${data.to}`).emit('webrtc-signal', data);
        });
        // ─────────────────────────────────────────────────────────────────

        // Handle disconnect
        socket.on('disconnect', async () => {
            const userId = socket.data.userId;

            try {
                await removeSocketFromLiveStreams(socket);
            } catch (error) {
                console.log('Live stream disconnect cleanup error:', error.message);
            }

            if (!userId) return;

            const userSockets = connectedUsers.get(userId);
            if (!userSockets) return;

            userSockets.delete(socket.id);

            if (userSockets.size > 0) {
                connectedUsers.set(userId, userSockets);
                return;
            }

            connectedUsers.delete(userId);

            try {
                await emitUserPresence(userId, false);
            } catch (error) {
                console.log('Presence update error:', error.message);
            }
        });
    });

    return { io, connectedUsers };
};
