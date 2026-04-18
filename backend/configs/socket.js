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
        console.log('🔌 New user connected:', socket.id);

        // Join user notification room
        socket.on('user-connect', (userId) => {
            connectedUsers.set(userId, socket.id);
            socket.join(`user-${userId}`);
            console.log(`✅ User ${userId} connected with socket ${socket.id}`);
            console.log('📍 Connected users:', Array.from(connectedUsers.keys()));
        });

        // Join a post room for real-time comments
        socket.on('join-post', (postId) => {
            socket.join(`post-${postId}`);
            console.log(`👥 User ${socket.id} joined post room: post-${postId}`);
        });

        // Leave a post room
        socket.on('leave-post', (postId) => {
            socket.leave(`post-${postId}`);
            console.log(`👋 User ${socket.id} left post room: post-${postId}`);
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            // Find and remove user from connectedUsers map
            for (let [userId, socketId] of connectedUsers) {
                if (socketId === socket.id) {
                    connectedUsers.delete(userId);
                    console.log(`❌ User ${userId} disconnected`);
                    break;
                }
            }
        });
    });

    return { io, connectedUsers };
};
