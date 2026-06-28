import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import User from '../models/User.js';
import LiveStream from '../models/LiveStream.js';
import GroupChat from '../models/GroupChat.js';
import { isConversationBlocked } from '../utils/blocking.js';
import { getUniqueNotificationRecipientIds } from '../utils/notificationRecipients.js';
import { getRedisClient, getRedisSubscriber } from './redis.js';

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
            // Chấp nhận tất cả origin có trong FRONTEND_URLS (comma-separated)
            // hoặc fallback về domain production
            origin: (origin, callback) => {
                // Không có origin (mobile app, server-to-server) → cho phép
                if (!origin) return callback(null, true);

                const allowed = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'https://tarouss.io.vn')
                    .split(',')
                    .map(u => u.trim())
                    .filter(Boolean);

                // Thêm localhost vào allowed khi development
                if (process.env.NODE_ENV !== 'production') {
                    allowed.push('http://localhost:5173', 'http://localhost:3000');
                }

                if (allowed.includes(origin)) return callback(null, true);
                // Nếu không match → vẫn cho phép (log warning thay vì block)
                // để tránh false-positive trên mobile / subdomain
                console.warn(`⚠️  Socket.IO: unrecognized origin "${origin}" — allowed`);
                callback(null, true);
            },
            methods: ['GET', 'POST'],
            credentials: true,
        },
        // Chỉ dùng WebSocket — không dùng polling.
        // Polling với PM2 cluster gây lỗi 400 do sticky session:
        // mỗi polling request có thể vào worker khác không có session.
        transports: ['websocket'],
        // Tối ưu cho 500–1000 users đồng thời
        pingTimeout: 60000,
        pingInterval: 25000,
        // Tăng buffer size cho group calls và livestream
        maxHttpBufferSize: 2e6, // 2MB
    });

    // ─── Redis Adapter ────────────────────────────────────────────────────────
    // Cho phép nhiều PM2 workers chia sẻ cùng Socket.IO event bus.
    // Khi worker A gọi io.to('user-X').emit(...), Redis sẽ broadcast
    // đến tất cả workers khác để đảm bảo user-X nhận được event dù
    // kết nối vào worker nào.
    try {
        const pubClient = getRedisClient();
        const subClient = getRedisSubscriber();
        if (pubClient && subClient) {
            io.adapter(createAdapter(pubClient, subClient));
            console.log('✅ Socket.IO Redis adapter attached');
        } else {
            console.log('ℹ️  Redis not available — Socket.IO using in-memory adapter (local dev mode)');
        }
    } catch (err) {
        console.warn('⚠️  Socket.IO Redis adapter failed, falling back to in-memory:', err.message);
    }

    // Store connected users with all active socket IDs so multiple tabs stay online.
    const connectedUsers = new Map();
    const liveViewersByStream = new Map();
    const liveHostsByStream = new Map();
    const hostedLiveStreamsBySocket = new Map();
    const activeGroupCalls = new Map();
    // Index phụ: groupId → callId, để tra cứu active call theo groupId
    const activeGroupCallsByGroupId = new Map();

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

    const unregisterLiveHost = (streamId, socketId) => {
        const normalizedStreamId = streamId?.toString?.() || streamId;
        const normalizedSocketId = socketId?.toString?.() || socketId;
        if (!normalizedStreamId || !normalizedSocketId) return;

        const host = liveHostsByStream.get(normalizedStreamId);
        if (host?.socketId === normalizedSocketId) {
            liveHostsByStream.delete(normalizedStreamId);
        }

        const hostedStreams = hostedLiveStreamsBySocket.get(normalizedSocketId);
        if (!hostedStreams) return;

        hostedStreams.delete(normalizedStreamId);
        if (hostedStreams.size === 0) hostedLiveStreamsBySocket.delete(normalizedSocketId);
    };

    const registerLiveHost = (streamId, socket, userId) => {
        const normalizedStreamId = streamId?.toString?.() || streamId;
        const normalizedUserId = userId?.toString?.() || userId;
        if (!normalizedStreamId || !normalizedUserId) return;

        const previousHost = liveHostsByStream.get(normalizedStreamId);
        if (previousHost?.socketId && previousHost.socketId !== socket.id) {
            unregisterLiveHost(normalizedStreamId, previousHost.socketId);
        }

        liveHostsByStream.set(normalizedStreamId, {
            socketId: socket.id,
            userId: normalizedUserId
        });

        const hostedStreams = hostedLiveStreamsBySocket.get(socket.id) || new Set();
        hostedStreams.add(normalizedStreamId);
        hostedLiveStreamsBySocket.set(socket.id, hostedStreams);
    };

    const endLiveStreamForHost = async (streamId, hostUserId) => {
        const normalizedStreamId = streamId?.toString?.() || streamId;
        const normalizedHostUserId = hostUserId?.toString?.() || hostUserId;
        if (!normalizedStreamId || !normalizedHostUserId) return false;

        const stream = await LiveStream.findById(normalizedStreamId);
        if (!stream || stream.user.toString() !== normalizedHostUserId) return false;

        const host = liveHostsByStream.get(normalizedStreamId);
        if (host) unregisterLiveHost(normalizedStreamId, host.socketId);
        liveViewersByStream.delete(normalizedStreamId);

        const wasLive = stream.status === 'live';
        if (stream.status === 'ended') return true;

        stream.status = 'ended';
        stream.ended_at = new Date();
        stream.viewers_count = 0;
        await stream.save();

        const currentUser = await User.findById(normalizedHostUserId);
        const recipientIds = currentUser
            ? getUniqueNotificationRecipientIds(currentUser, normalizedHostUserId)
            : [];
        const payload = {
            streamId: normalizedStreamId,
            endedAt: stream.ended_at
        };

        io.to(`live-${normalizedStreamId}`).emit('live-stream-ended', payload);
        if (wasLive) {
            [...new Set([normalizedHostUserId, ...recipientIds])].forEach((recipientId) => {
                io.to(`user-${recipientId}`).emit('live-stream-ended', payload);
            });
        }

        return true;
    };

    const endLiveStreamHostedBySocket = async (socket, streamId) => {
        const normalizedStreamId = streamId?.toString?.() || streamId;
        const host = liveHostsByStream.get(normalizedStreamId);
        if (!host || host.socketId !== socket.id) return false;

        return endLiveStreamForHost(normalizedStreamId, host.userId);
    };

    const endLiveStreamsHostedBySocket = async (socket) => {
        const hostedStreamIds = Array.from(hostedLiveStreamsBySocket.get(socket.id) || []);
        await Promise.all(hostedStreamIds.map((streamId) => endLiveStreamHostedBySocket(socket, streamId)));
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

            // Push các cuộc gọi nhóm đang diễn ra mà user này là thành viên
            // Để banner hiển thị ngay khi user login hoặc reconnect
            activeGroupCalls.forEach((call, callId) => {
                const isRecipient = call.recipientIds.has(normalizedUserId);
                const isParticipant = call.participantIds.has(normalizedUserId);
                const isCaller = call.callerId === normalizedUserId;
                if ((isRecipient || isParticipant) && !isCaller) {
                    socket.emit('group-call-active', {
                        callId,
                        groupId: call.groupId,
                        groupName: call.groupName,
                        groupAvatar: call.groupAvatar,
                        groupMembers: call.groupMembers,
                        callType: call.callType,
                        callerName: call.callerName,
                        callerAvatar: call.callerAvatar,
                        from: call.callerId,
                        participantCount: call.participantIds.size,
                    });
                }
            });
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
                if (!stream) {
                    socket.emit('live-stream-ended', { streamId });
                    return;
                }

                const normalizedStreamId = streamId.toString();
                const normalizedUserId = socket.data.userId?.toString?.() || '';
                const isHost = role === 'host' && normalizedUserId === stream.user.toString();

                if (stream.status !== 'live' && !(isHost && stream.status === 'preparing')) {
                    socket.emit('live-stream-ended', { streamId });
                    return;
                }

                socket.join(`live-${normalizedStreamId}`);

                if (isHost) {
                    registerLiveHost(normalizedStreamId, socket, normalizedUserId);

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
                const endedByHost = await endLiveStreamHostedBySocket(socket, streamId.toString());
                if (!endedByHost) await removeLiveViewer(socket, streamId.toString());
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
                    const normalizedGroupId = data.groupId.toString();
                    activeGroupCalls.set(callId, {
                        groupId: normalizedGroupId,
                        callerId: from.toString(),
                        participantIds: new Set([from.toString()]),
                        recipientIds: new Set(recipientIds),
                        callType: data.callType || 'voice',
                        callerName: data.callerName || '',
                        callerAvatar: data.callerAvatar || '',
                        groupName: data.groupName || group.name,
                        groupAvatar: data.groupAvatar || group.avatar_url || '',
                        groupMembers: group.members?.map((member) => member.user).filter(Boolean) || [],
                    });
                    // Lưu index ngược groupId → callId để tra cứu khi người join muộn
                    activeGroupCallsByGroupId.set(normalizedGroupId, callId);

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

                    // Push banner "đang có cuộc gọi nhóm" đến TẤT CẢ thành viên nhóm đang online
                    // (kể cả những người không được gọi trực tiếp, giống Messenger)
                    const callActiveBanner = {
                        callId,
                        groupId: normalizedGroupId,
                        groupName: data.groupName || group.name,
                        groupAvatar: data.groupAvatar || group.avatar_url || '',
                        groupMembers: group.members?.map((member) => member.user).filter(Boolean) || [],
                        callType: data.callType || 'voice',
                        callerName: data.callerName || '',
                        callerAvatar: data.callerAvatar || '',
                        from: from.toString(),
                        participantCount: 1,
                    };
                    const allGroupMemberIds = getGroupMemberIds(group);
                    allGroupMemberIds.forEach((memberId) => {
                        if (memberId === from.toString()) return; // caller không cần nhận banner
                        io.to(`user-${memberId}`).emit('group-call-active', callActiveBanner);
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

                // Cập nhật banner cho những thành viên chưa tham gia cuộc gọi
                const nonParticipants = Array.from(call.recipientIds)
                    .filter((id) => !call.participantIds.has(id));
                if (nonParticipants.length > 0) {
                    const updatedBanner = {
                        callId: data.callId,
                        groupId: call.groupId,
                        groupName: call.groupName,
                        groupAvatar: call.groupAvatar,
                        groupMembers: call.groupMembers,
                        callType: call.callType,
                        callerName: call.callerName,
                        callerAvatar: call.callerAvatar,
                        from: call.callerId,
                        participantCount: call.participantIds.size,
                    };
                    nonParticipants.forEach((id) => {
                        io.to(`user-${id}`).emit('group-call-active', updatedBanner);
                    });
                }
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
                    // Xóa index ngược khi cuộc gọi kết thúc hoàn toàn
                    activeGroupCallsByGroupId.delete(call.groupId);
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

        // Kiểm tra xem nhóm có đang có cuộc gọi active không
        // Client emit khi mở group chat, server trả về thông tin cuộc gọi nếu có
        socket.on('check-group-call', ({ groupId } = {}) => {
            if (!groupId) return;
            const normalizedGroupId = groupId.toString();
            const callId = activeGroupCallsByGroupId.get(normalizedGroupId);
            if (!callId) return;
            const call = activeGroupCalls.get(callId);
            if (!call) {
                activeGroupCallsByGroupId.delete(normalizedGroupId);
                return;
            }
            socket.emit('group-call-active', {
                callId,
                groupId: normalizedGroupId,
                groupName: call.groupName,
                groupAvatar: call.groupAvatar,
                groupMembers: call.groupMembers,
                callType: call.callType,
                callerName: call.callerName,
                callerAvatar: call.callerAvatar,
                from: call.callerId,
                participantCount: call.participantIds.size,
            });
        });
        // ─────────────────────────────────────────────────────────────────

        // Handle disconnect
        socket.on('disconnect', async () => {
            const userId = socket.data.userId;

            try {
                await endLiveStreamsHostedBySocket(socket);
            } catch (error) {
                console.log('Hosted live stream disconnect cleanup error:', error.message);
            }

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
