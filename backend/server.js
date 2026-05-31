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

const app = express();
const server = createServer(app);
const { io, connectedUsers } = setupSocket(server);

try {
    await connectDB();
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
    }
} catch (error) {
    console.error('Failed to connect to database. Server will not start.')
    process.exit(1)
}

// Make io and connectedUsers available globally
app.locals.io = io;
app.locals.connectedUsers = connectedUsers;

app.use(express.json());
app.use(cors());
app.use(cookieParser());
app.use(passport.initialize());

app.get('/', (req, res) => {
    res.send('Server is running')
})
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

const PORT = process.env.PORT || 4000

server.listen(PORT, ()=>console.log(`🚀 Server is running on port ${PORT}`))

export default app; 
