import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import connectDB from './configs/db.js';
import {inngest, functions} from './inngest/index.js'
import {serve} from 'inngest/express'
import { clerkMiddleware } from '@clerk/express'
import userRouter from './routes/userRoutes.js';
import postRouter from './routes/postRoute.js';
import storyRouter from './routes/storyRoute.js';
import messageRouter from './routes/messageRoute.js';
import { createServer } from 'http'
import { setupSocket } from './configs/socket.js'

const app = express();
const server = createServer(app);
const { io, connectedUsers } = setupSocket(server);

await connectDB();

// Make io and connectedUsers available globally
app.locals.io = io;
app.locals.connectedUsers = connectedUsers;

app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());

app.get('/', (req, res) => {
    res.send('Server is running')
})
app.use('/api/inngest', serve({ client: inngest, functions }))
app.use('/api/user', userRouter)
app.use('/api/post', postRouter)
app.use('/api/story', storyRouter)
app.use('/api/message', messageRouter)

const PORT = process.env.PORT || 4000

server.listen(PORT, ()=>console.log(`🚀 Server is running on port ${PORT}`))

export default app; 