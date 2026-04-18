import express from 'express'
import { getChatMessages, sendMessage, getUserRecentMessages, markMessagesAsRead } from '../controllers/messageController.js'
import { upload } from '../configs/multer.js'
import { protect } from '../middlewares/auth.js'

const messageRouter = express.Router()

messageRouter.post('/send', upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'videos', maxCount: 3 }
]), protect, sendMessage)
messageRouter.post('/get', protect, getChatMessages)
messageRouter.post('/get-recent', protect, getUserRecentMessages)
messageRouter.post('/mark-as-read', protect, markMessagesAsRead)

export default messageRouter