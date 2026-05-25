import { Server } from 'socket.io';
import User from '../models/User.js';
import { isConversationBlocked } from '../utils/blocking.js';

export const setupSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // Store connected users with all active socket IDs so multiple tabs stay online.
    const connectedUsers = new Map();

    const emitUserPresence = async (userId, isOnline) => {
        const lastSeen = new Date();

        await User.findByIdAndUpdate(userId, { isOnline, lastSeen });

        io.emit('user-status-changed', {
            userId,
            isOnline,
            lastSeen: lastSeen.toISOString()
        });
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

        // ─── Call Signaling ───────────────────────────────────────────────
        // A initiates a call → forward to B
        socket.on('call-user', async (data) => {
            // data: { to, from, callType, callerName, callerAvatar, offer }
            const from = socket.data.userId || data.from;
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
            io.to(`user-${data.to}`).emit('call-rejected', data);
        });

        // Either party ends call
        socket.on('call-ended', (data) => {
            // data: { to, from }
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
