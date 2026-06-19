import dotenv from 'dotenv'
import fs from 'fs'

// Load env vars before dynamic imports; .env.local is only for local dev.
dotenv.config()

const shouldLoadLocalEnv =
    !process.env.VERCEL &&
    !process.env.VERCEL_ENV &&
    (
        process.env.NODE_ENV === 'development' ||
        process.env.APP_ENV === 'local' ||
        process.env.npm_lifecycle_event === 'server'
    )

if (shouldLoadLocalEnv && fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local', override: true })
}

// Dynamic imports run after env vars are ready.
const { default: express } = await import('express')
const { default: cors } = await import('cors')
const { default: compression } = await import('compression')
const { default: connectDB } = await import('./configs/db.js')
const { default: User } = await import('./models/User.js')
const { default: Message, buildMessageSearchIndex } = await import('./models/Message.js')
const { getDefaultProfilePictureUrl } = await import('./utils/defaultProfilePicture.js')
const { inngest, functions } = await import('./inngest/index.js')
const { serve } = await import('inngest/express')
const { default: passport } = await import('./configs/passport.js')
const { default: cookieParser } = await import('cookie-parser')
const { default: authRouter } = await import('./routes/authRoute.js')
const { default: userRouter } = await import('./routes/userRoutes.js')
const { default: postRouter } = await import('./routes/postRoute.js')
const { default: storyRouter } = await import('./routes/storyRoute.js')
const { default: messageRouter } = await import('./routes/messageRoute.js')
const { default: callRouter } = await import('./routes/callRoute.js')
const { default: liveRouter } = await import('./routes/liveRoute.js')
const { default: groupRouter } = await import('./routes/groupRoute.js')
const { default: adminRouter } = await import('./routes/adminRoute.js')
const { default: reportRouter } = await import('./routes/reportRoute.js')
const { createServer } = await import('http')
const { setupSocket } = await import('./configs/socket.js')
const { generalLimiter, authLimiter } = await import('./middlewares/rateLimit.js')

const app = express();
const server = createServer(app);
const { io, connectedUsers } = setupSocket(server);

// ─── PM2 Cluster: chỉ worker 0 mới chạy startup migrations ──────────────────
// Điều này tránh race condition khi nhiều workers cùng update DB lúc khởi động.
const isMainWorker =
    process.env.NODE_APP_INSTANCE === undefined ||  // Single process mode
    process.env.NODE_APP_INSTANCE === '0';           // PM2 cluster: worker 0

try {
    await connectDB();

    if (isMainWorker) {
        console.log('🔧 [Worker 0] Running startup migrations...')

        await User.updateMany({ isOnline: true }, { $set: { isOnline: false, lastSeen: new Date() } });

        const defaultProfilePictureUrl = await getDefaultProfilePictureUrl();
        await User.updateMany(
            {
                $or: [
                    { profile_picture: '' },
                    { profile_picture: { $exists: false } },
                    { profile_picture: { $regex: '/assets/default\\.jpg(?:$|\\?)', $options: 'i' } }
                ]
            },
            { $set: { profile_picture: defaultProfilePictureUrl } }
        );

        // Chạy message search index migration theo batches
        let migrated = 0;
        while (true) {
            const messages = await Message.find({
                text: { $type: 'string', $ne: '' },
                $or: [
                    { searchText: { $exists: false } },
                    { searchTokens: { $exists: false } }
                ]
            }).select('text').limit(500).lean();

            if (messages.length === 0) break;

            await Message.bulkWrite(messages.map((message) => ({
                updateOne: {
                    filter: { _id: message._id },
                    update: { $set: buildMessageSearchIndex(message.text) }
                }
            })));
            migrated += messages.length;
        }

        if (migrated > 0) {
            console.log(`✅ [Worker 0] Migrated ${migrated} messages search index`)
        }
        console.log('✅ [Worker 0] Startup migrations complete')
    } else {
        console.log(`ℹ️  [Worker ${process.env.NODE_APP_INSTANCE}] Skipping startup migrations`)
    }
} catch (error) {
    console.error('❌ Failed to initialize. Server will not start:', error.message)
    process.exit(1)
}

// ─── CORS Config ─────────────────────────────────────────────────────────────
const getAllowedOrigins = () => {
    const origins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'https://tarouss.io.vn')
        .split(',')
        .map(u => u.trim())
        .filter(Boolean);

    if (process.env.NODE_ENV !== 'production') {
        origins.push('http://localhost:5173', 'http://localhost:3000');
    }
    return origins;
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // mobile / curl / server-to-server
        const allowed = getAllowedOrigins();
        if (allowed.includes(origin)) return callback(null, true);
        // Log nhưng không block — tránh false positive
        console.warn(`⚠️  CORS: unrecognized origin "${origin}" — allowed`);
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}))

// ─── Core Middlewares ─────────────────────────────────────────────────────────
// Nén responses (giảm bandwidth ~70% cho JSON responses)
app.use(compression({
    level: 6,           // Cân bằng giữa tốc độ và compression ratio
    threshold: 1024,    // Chỉ nén responses > 1KB
    filter: (req, res) => {
        // Không nén nếu client không hỗ trợ
        if (req.headers['x-no-compression']) return false
        return compression.filter(req, res)
    }
}))

app.use(express.json({ limit: '10mb' }))
app.use(cookieParser())
app.use(passport.initialize())

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Áp dụng rate limit cho toàn bộ API (200 req/phút/IP)
app.use('/api/', generalLimiter)
// Rate limit chặt hơn cho auth routes (15 req/15phút/IP)
app.use('/api/auth/', authLimiter)

// ─── Trust Proxy ─────────────────────────────────────────────────────────────
// Cần thiết khi chạy sau Nginx để rate limiter dùng IP thực của client
// thay vì IP của Nginx (127.0.0.1)
app.set('trust proxy', 1)

// Make io and connectedUsers available globally
app.locals.io = io;
app.locals.connectedUsers = connectedUsers;

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
    const { isRedisAvailable } = await import('./configs/redis.js')
    const redisOk = await isRedisAvailable().catch(() => false)
    
    res.json({
        status: 'ok',
        worker: process.env.NODE_APP_INSTANCE ?? 'single',
        uptime: Math.floor(process.uptime()),
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        redis: redisOk ? 'connected' : 'unavailable',
        timestamp: new Date().toISOString(),
    })
})

app.get('/', (req, res) => {
    res.send('Server is running')
})

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/inngest', serve({ client: inngest, functions }))
app.use('/api/auth', authRouter)
app.use('/api/user', userRouter)
app.use('/api/post', postRouter)
app.use('/api/story', storyRouter)
app.use('/api/message', messageRouter)
app.use('/api/call', callRouter)
app.use('/api/live', liveRouter)
app.use('/api/group', groupRouter)
app.use('/api/admin', adminRouter)
app.use('/api/report', reportRouter)

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    if (err.message?.startsWith('CORS:')) {
        return res.status(403).json({ success: false, message: err.message })
    }
    console.error('Unhandled error:', err.message)
    res.status(500).json({ success: false, message: 'Internal server error' })
})

const PORT = process.env.PORT || 4000

server.listen(PORT, () => console.log(`🚀 [Worker ${process.env.NODE_APP_INSTANCE ?? 'single'}] Server running on port ${PORT}`))

export default app;
