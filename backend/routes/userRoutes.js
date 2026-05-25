import express from 'express'
import { acceptConnectionRequest, blockUser, cancelConnectionRequest, changePassword, declineConnectionRequest, discoverUsers, followUser, getUserBlockStatus, getUserConnections, getUserData, getUserProfiles, removeConnection, sendConnectionRequest, unblockUser, unfollowUser, updateUserData } from '../controllers/userController.js'
import { protect } from '../middlewares/auth.js'
import { upload } from '../configs/multer.js'
import { getUserRecentMessages, markMessagesAsRead } from '../controllers/messageController.js'

const userRouter = express.Router()

userRouter.get('/data', protect, getUserData)
userRouter.post('/update', protect, upload.fields([{name: 'profile', maxCount: 1}, {name: 'cover', maxCount: 1}]), updateUserData)
userRouter.post('/change-password', protect, changePassword)
userRouter.post('/discover', protect, discoverUsers)
userRouter.post('/follow', protect, followUser)
userRouter.post('/unfollow', protect, unfollowUser)
userRouter.post('/send-connection-request', protect, sendConnectionRequest)
userRouter.post('/cancel-connection-request', protect, cancelConnectionRequest)
userRouter.post('/accept', protect, acceptConnectionRequest)
userRouter.post('/decline', protect, declineConnectionRequest)
userRouter.post('/remove-connection', protect, removeConnection)
userRouter.post('/block-status', protect, getUserBlockStatus)
userRouter.post('/block', protect, blockUser)
userRouter.post('/unblock', protect, unblockUser)
userRouter.get('/connections', protect, getUserConnections)
userRouter.post('/profiles', protect, getUserProfiles)
userRouter.get('/recent-messages', protect, getUserRecentMessages)
userRouter.post('/mark-messages-read', protect, markMessagesAsRead)

export default userRouter
