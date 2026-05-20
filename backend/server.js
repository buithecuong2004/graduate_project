import dotenv from 'dotenv'
import fs from 'fs'

// Load env vars TRƯỚC KHI bất kỳ module nào khác được import
if (fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local' })
}
dotenv.config()

// Dynamic imports — chạy SAU KHI env vars đã sẵn sàng
const { default: express } = await import('express')
const { default: cors } = await import('cors')
const { default: connectDB } = await import('./configs/db.js')
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
const { createServer } = await import('http')
const { setupSocket } = await import('./configs/socket.js')

const app = express();
const server = createServer(app);
const { io, connectedUsers } = setupSocket(server);

try {
    await connectDB();
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

const PORT = process.env.PORT || 4000

server.listen(PORT, ()=>console.log(`🚀 Server is running on port ${PORT}`))

export default app; 
