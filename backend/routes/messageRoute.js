import express from 'express'
import {
    getChatMessages,
    getMessagesAround,
    searchMessages,
    sendMessage,
    getUserRecentMessages,
    markMessagesAsRead,
    deleteMessage,
    deleteConversation,
    editMessage,
    reactMessage,
    saveCall
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
messageRouter.post('/get-around', protect, getMessagesAround)
messageRouter.post('/search', protect, searchMessages)
messageRouter.post('/get-recent', protect, getUserRecentMessages)
messageRouter.post('/mark-as-read', protect, markMessagesAsRead)
messageRouter.post('/delete', protect, deleteMessage)
messageRouter.post('/delete-conversation', protect, deleteConversation)
messageRouter.post('/edit', protect, editMessage)
messageRouter.post('/react', protect, reactMessage)
messageRouter.post('/save-call', protect, saveCall)

export default messageRouter
