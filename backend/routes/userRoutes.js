import express from 'express'
import { acceptConnectionRequest, discoverUsers, followUser, getUserConnections, getUserData, getUserProfiles, removeConnection, sendConnectionRequest, unfollowUser, updateUserData } from '../controllers/userController.js'
import { protect } from '../middlewares/auth.js'
import { upload } from '../configs/multer.js'
import { getUserRecentMessages, markMessagesAsRead } from '../controllers/messageController.js'

const userRouter = express.Router()

userRouter.get('/data', protect, getUserData)
userRouter.post('/update',upload.fields([{name: 'profile', maxCount: 1}, {name: 'cover', maxCount: 1}]),protect, updateUserData)
userRouter.post('/discover', protect, discoverUsers)
userRouter.post('/follow', protect, followUser)
userRouter.post('/unfollow', protect, unfollowUser)
userRouter.post('/send-connection-request', protect, sendConnectionRequest)
userRouter.post('/accept', protect, acceptConnectionRequest)
userRouter.post('/remove-connection', protect, removeConnection)
userRouter.get('/connections', protect, getUserConnections)
userRouter.post('/profiles',getUserProfiles)
userRouter.get('/recent-messages', protect, getUserRecentMessages)
userRouter.post('/mark-messages-read', protect, markMessagesAsRead)

export default userRouter



