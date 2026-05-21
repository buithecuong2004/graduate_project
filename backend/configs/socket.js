import { Server } from 'socket.io';

export const setupSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // Store connected users with their socket IDs
    const connectedUsers = new Map();

    io.on('connection', (socket) => {

        // Join user notification room
        socket.on('user-connect', (userId) => {
            connectedUsers.set(userId, socket.id);
            socket.join(`user-${userId}`);
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
        socket.on('call-user', (data) => {
            // data: { to, from, callType, callerName, callerAvatar, offer }
            io.to(`user-${data.to}`).emit('incoming-call', data);
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
        socket.on('disconnect', () => {
            // Find and remove user from connectedUsers map
            for (let [userId, socketId] of connectedUsers) {
                if (socketId === socket.id) {
                    connectedUsers.delete(userId);
                    break;
                }
            }
        });
    });

    return { io, connectedUsers };
};
