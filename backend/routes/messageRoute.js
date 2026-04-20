import express from 'express'
import {
    getChatMessages,
    sendMessage,
    getUserRecentMessages,
    markMessagesAsRead,
    deleteMessage,
    editMessage,
    reactMessage
} from '../controllers/messageController.js'
import { upload } from '../configs/multer.js'
import { protect } from '../middlewares/auth.js'

const messageRouter = express.Router()

messageRouter.post('/send', upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'videos', maxCount: 3 },
  { name: 'voice', maxCount: 1 }
]), protect, sendMessage)
messageRouter.post('/get', protect, getChatMessages)
messageRouter.post('/get-recent', protect, getUserRecentMessages)
messageRouter.post('/mark-as-read', protect, markMessagesAsRead)
messageRouter.post('/delete', protect, deleteMessage)
messageRouter.post('/edit', protect, editMessage)
messageRouter.post('/react', protect, reactMessage)

export default messageRouter