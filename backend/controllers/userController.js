import imagekit from "../configs/imageKit.js"
import { inngest } from "../inngest/index.js"
import Connection from "../models/Connection.js"
import Post from "../models/Post.js"
import User from "../models/User.js"
import fs  from 'fs'
import crypto from 'crypto'
import { promisify } from 'util'
import { getConversationBlockStatus } from "../utils/blocking.js"

const scryptAsync = promisify(crypto.scrypt)

const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString('hex')
    const derivedKey = await scryptAsync(password, salt, 64)
    return `${salt}:${derivedKey.toString('hex')}`
}

const verifyPassword = async (password, passwordHash = '') => {
    const [salt, storedHash] = passwordHash.split(':')
    if (!salt || !storedHash) return false

    const derivedKey = await scryptAsync(password, salt, 64)
    const storedBuffer = Buffer.from(storedHash, 'hex')
    if (storedBuffer.length !== derivedKey.length) return false

    return crypto.timingSafeEqual(storedBuffer, derivedKey)
}

export const getUserData = async (req,res) => {
    try {
        const userId = req.userId
        let user = await User.findById(userId)

        if(!user) {
            return res.json({success: false, message: "User not found"})
        }

        // Clean up dangling references: remove IDs of deleted users from this user's arrays
        // This fixes crash when a connection/follower/following account was deleted
        const allRefs = [...(user.connections || []), ...(user.followers || []), ...(user.following || []), ...(user.blockedUsers || [])]
        if(allRefs.length > 0) {
            const existingUsers = await User.find({ _id: { $in: allRefs } }).select('_id')
            const existingIds = new Set(existingUsers.map(u => u._id.toString()))

            const hasStale = allRefs.some(id => !existingIds.has(id.toString()))
            if(hasStale) {
                user = await User.findByIdAndUpdate(
                    userId,
                    {
                        $set: {
                            connections: (user.connections || []).filter(id => existingIds.has(id.toString())),
                            followers: (user.followers || []).filter(id => existingIds.has(id.toString())),
                            following: (user.following || []).filter(id => existingIds.has(id.toString())),
                            blockedUsers: (user.blockedUsers || []).filter(id => existingIds.has(id.toString()))
                        }
                    },
                    { new: true }
                )
                console.log(`ðŸ§¹ Cleaned dangling refs for user ${userId}`)
            }
        }

        res.json({success: true, user})
    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const updateUserData = async (req,res) => {
    try {
        const userId = req.userId
        let {username, bio, location, full_name} = req.body;

        const tempUser = await User.findById(userId)
        if(!tempUser) {
            return res.json({success: false, message: "User not found"})
        }

        username = typeof username === 'string' ? username.trim() : tempUser.username
        full_name = typeof full_name === 'string' ? full_name.trim() : tempUser.full_name
        bio = typeof bio === 'string' ? bio.trim() : tempUser.bio
        location = typeof location === 'string' ? location.trim() : tempUser.location

        !username && (username = tempUser.username)
        !full_name && (full_name = tempUser.full_name)

        if(tempUser.username !== username) {
            const existingUser = await User.findOne({username, _id: {$ne: userId}})
            if(existingUser ) {
                return res.json({success: false, message: 'Username already exists'})
            }
        }

        const updatedData = {
            username,
            bio,
            location,
            full_name
        }

        const files = req.files || {}
        const profile = files.profile && files.profile[0]
        const cover = files.cover && files.cover[0]

        const uploadImage = async (file, folder, width) => {
            const fileBuffer = fs.readFileSync(file.path)
            const response = await imagekit.upload({
                file: fileBuffer,
                fileName: file.originalname,
                folder
            })

            return response.filePath
                ? imagekit.url({
                    path: response.filePath,
                    transformation: [
                        {quality: 'auto'},
                        {format: 'webp'},
                        {width}
                    ]
                })
                : response.url
        }

        try {
            const [profileUrl, coverUrl] = await Promise.all([
                profile ? uploadImage(profile, 'users/profile', '400') : Promise.resolve(null),
                cover ? uploadImage(cover, 'users/cover', '1280') : Promise.resolve(null)
            ])

            if(profileUrl) updatedData.profile_picture = profileUrl
            if(coverUrl) updatedData.cover_photo = coverUrl
        } finally {
            [profile, cover].forEach(file => {
                if(file?.path) {
                    fs.unlink(file.path, (err) => {
                        if(err) console.log('File cleanup error:', err)
                    })
                }
            })
        }

        const user = await User.findByIdAndUpdate(userId, updatedData, {new : true, runValidators: true})

        res.json({success: true, user, message: 'Cập nhật hồ sơ thành công'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const changePassword = async (req, res) => {
    try {
        const userId = req.userId
        const currentPassword = req.body.currentPassword || ''
        const newPassword = req.body.newPassword || ''
        const confirmPassword = req.body.confirmPassword || ''

        if (!currentPassword) {
            return res.json({success: false, message: 'Vui lòng nhập mật khẩu hiện tại'})
        }

        if (newPassword.length < 6) {
            return res.json({success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự'})
        }

        if (newPassword !== confirmPassword) {
            return res.json({success: false, message: 'Xác thực mật khẩu mới không khớp'})
        }

        if (currentPassword === newPassword) {
            return res.json({success: false, message: 'Mật khẩu mới phải khác mật khẩu hiện tại'})
        }

        const user = await User.findById(userId).select('+password_hash')
        if (!user) {
            return res.json({success: false, message: 'User not found'})
        }

        if (!user.password_hash) {
            return res.json({success: false, message: 'Tài khoản này chưa có mật khẩu để đổi'})
        }

        const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password_hash)
        if (!isCurrentPasswordValid) {
            return res.json({success: false, message: 'Mật khẩu hiện tại không đúng'})
        }

        user.password_hash = await hashPassword(newPassword)
        user.password_reset_otp_hash = undefined
        user.password_reset_otp_expires_at = undefined
        user.password_reset_otp_attempts = 0
        await user.save()

        return res.json({success: true, message: 'Đổi mật khẩu thành công'})
    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const discoverUsers = async (req,res) => {
    try {
        const userId = req.userId
        const { input } = req.body

        const currentUser = await User.findById(userId)
        if(!currentUser) {
            return res.json({success: false, message: "User not found"})
        }
        const query = input
            ? {
                $or: [
                    {username: new RegExp(input, 'i')},
                    {email: new RegExp(input, 'i')},
                    {full_name: new RegExp(input, 'i')},
                    {location: new RegExp(input, 'i')},
                ]
            }
            : {}
        const allUsers = await User.find(query)
        const targetUsers = allUsers.filter(user => user._id.toString() !== userId)
        const targetUserIds = targetUsers.map(user => user._id)
        const followingIds = new Set(currentUser.following.map(id => id.toString()))
        const connectedIds = new Set(currentUser.connections.map(id => id.toString()))
        const relationships = new Map()

        if(targetUserIds.length > 0) {
            const connections = await Connection.find({
                $or: [
                    {from_user_id: userId, to_user_id: {$in: targetUserIds}},
                    {from_user_id: {$in: targetUserIds}, to_user_id: userId},
                ]
            }).select('from_user_id to_user_id status')

            connections.forEach(connection => {
                const fromId = connection.from_user_id.toString()
                const toId = connection.to_user_id.toString()
                const otherUserId = fromId === userId ? toId : fromId
                let connectionStatus = 'none'

                if(connection.status === 'accepted') {
                    connectionStatus = 'connected'
                } else if(connection.status === 'pending') {
                    connectionStatus = fromId === userId ? 'pending_sent' : 'pending_received'
                }

                relationships.set(otherUserId, {
                    connectionStatus,
                    connectionId: connection._id.toString()
                })
            })
        }

        const filteredUsers = targetUsers.map(user => {
            const userObject = user.toObject()
            const relationship = relationships.get(user._id.toString())
            const isConnected = connectedIds.has(user._id.toString()) || relationship?.connectionStatus === 'connected'

            return {
                ...userObject,
                isFollowing: followingIds.has(user._id.toString()),
                isConnected,
                connectionStatus: relationship?.connectionStatus || (isConnected ? 'connected' : 'none'),
                connectionId: relationship?.connectionId || null
            }
        })
        return res.json({success: true, users: filteredUsers})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const followUser = async (req,res) => {
    try {
        const userId = req.userId
        const { id } = req.body

       const user = await User.findById(userId)

       if(user.following.map(fid => fid.toString()).includes(id)){
            return res.json({success: false, message: 'You are already following this user'})
       }

       user.following.push(id)
       await user.save()

       const toUser = await User.findById(id)
       toUser.followers.push(userId)
       await toUser.save()

       res.json({success: true, message: 'Báº¡n Ä‘ang theo dÃµi ngÆ°á»i nÃ y'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const unfollowUser = async (req,res) => {
    try {
        const userId = req.userId
        const { id } = req.body

       const user = await User.findById(userId)
       user.following = user.following.filter(fid => fid.toString() !== id)
       await user.save()

       const toUser = await User.findById(id)
       toUser.followers = toUser.followers.filter(fid => fid.toString() !== userId)
       await toUser.save()
       
       res.json({success: true, message: 'Đã bỏ theo dõi người này'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const sendConnectionRequest = async (req, res) => {
    try {
        const userId = req.userId
        const {id} = req.body

        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const connectionRequests = await Connection.find({from_user_id: userId, createdAt: { $gt: last24Hours }})
        if(connectionRequests.length >= 20) {
            return res.json({success: false, message: 'You have sent more 20 connection requests in the last 24 hours'})
        }

        const connection = await Connection.findOne({
            $or: [
                {from_user_id: userId, to_user_id: id},
                {from_user_id: id, to_user_id: userId},
            ]
        })

        if(!connection) {
            const newConnection = await Connection.create({
                from_user_id: userId,
                to_user_id: id
            })

            const [, , requesterUser] = await Promise.all([
                User.findByIdAndUpdate(userId, { $addToSet: { following: id } }),
                User.findByIdAndUpdate(id, { $addToSet: { followers: userId } }),
                User.findById(userId)
            ])

            // Send friend request notification via socket
            const io = req.app.locals.io
            if(io && requesterUser) {
                const requesterData = {
                    _id: requesterUser._id,
                    full_name: requesterUser.full_name,
                    username: requesterUser.username,
                    profile_picture: requesterUser.profile_picture
                }
                const friendRequestNotification = {
                    type: 'friend_request',
                    data: {
                        from_user: requesterData,
                        connection_id: newConnection._id
                    }
                }
                io.to(`user-${id}`).emit('friend-request', friendRequestNotification)
            }

            res.json({success: true, message: 'Đã gửi lời mời kết bạn'})

            inngest.send({
                name: 'app/connection-request',
                data: {connectionId: newConnection._id}
            }).catch(error => {
                console.log('Connection request reminder enqueue error:', error.message)
            })
            return
        }else if(connection && connection.status === 'accepted') {
            return res.json({success: false, message: 'Bạn đã kết bạn với người dùng này'})
        }

        return res.json({success: false, message: 'Đang chờ phản hồi'})
    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const cancelConnectionRequest = async (req, res) => {
    try {
        const userId = req.userId
        const {id} = req.body

        const connection = await Connection.findOne({
            from_user_id: userId,
            to_user_id: id,
            status: 'pending'
        })

        if(!connection) {
            return res.json({success: false, message: 'Connection request not found'})
        }

        await Connection.findByIdAndDelete(connection._id)

        return res.json({success: true, message: 'Đã hủy lời mời kết bạn'})
    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const getUserConnections = async (req, res) => {
    try {
        const userId = req.userId
        const user = await User.findById(userId).populate('connections followers following')

        // If user not yet in DB (race condition on first login), return empty
        if(!user) return res.json({success: true, connections: [], followers: [], following: [], pendingConnections: []})

        // Filter out null values from arrays (can happen when a referenced user was deleted)
        const isNotCurrentUser = (item) => item && item._id?.toString?.() !== userId
        const connections = (user.connections || []).filter(isNotCurrentUser)
        const followers = (user.followers || []).filter(isNotCurrentUser)
        const following = (user.following || []).filter(isNotCurrentUser)

        const pendingConnections = (await Connection.find({to_user_id: userId, status: 'pending'}).populate('from_user_id'))
            .map(connection => connection.from_user_id)
            .filter(isNotCurrentUser)

        res.json({success: true, connections, followers, following, pendingConnections})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const getUserBlockStatus = async (req, res) => {
    try {
        const userId = req.userId
        const { id } = req.body

        if(!id) return res.json({success: false, message: 'Missing user id'})

        const status = await getConversationBlockStatus(userId, id)
        res.json({success: true, ...status})
    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const blockUser = async (req, res) => {
    try {
        const userId = req.userId
        const { id } = req.body

        if(!id) return res.json({success: false, message: 'Missing user id'})
        if(id.toString() === userId.toString()) {
            return res.json({success: false, message: 'Không thể chặn chính bạn'})
        }

        const [user, blockedUser] = await Promise.all([
            User.findByIdAndUpdate(userId, { $addToSet: { blockedUsers: id } }, { new: true }),
            User.findById(id).select('_id')
        ])

        if(!user || !blockedUser) return res.json({success: false, message: 'User not found'})

        const io = req.app.locals.io
        if(io) {
            io.to(`user-${userId}`).emit('user-block-status-changed', {
                blockerId: userId,
                blockedUserId: id,
                isBlocked: true
            })
            io.to(`user-${id}`).emit('user-block-status-changed', {
                blockerId: userId,
                blockedUserId: id,
                isBlocked: true
            })
        }

        res.json({success: true, user, message: 'Đã chặn người dùng'})
    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const unblockUser = async (req, res) => {
    try {
        const userId = req.userId
        const { id } = req.body

        if(!id) return res.json({success: false, message: 'Missing user id'})

        const user = await User.findByIdAndUpdate(userId, { $pull: { blockedUsers: id } }, { new: true })
        if(!user) return res.json({success: false, message: 'User not found'})

        const io = req.app.locals.io
        if(io) {
            io.to(`user-${userId}`).emit('user-block-status-changed', {
                blockerId: userId,
                blockedUserId: id,
                isBlocked: false
            })
            io.to(`user-${id}`).emit('user-block-status-changed', {
                blockerId: userId,
                blockedUserId: id,
                isBlocked: false
            })
        }

        res.json({success: true, user, message: 'Đã bỏ chặn người dùng'})
    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const acceptConnectionRequest = async (req, res) => {
    try {
        const userId = req.userId
        const {id} = req.body
        
        const connection = await Connection.findOne({from_user_id: id, to_user_id: userId})

        if(!connection) {
            return res.json({success: false, message: 'Connection not found'})
        }

        const user = await User.findById(userId);
        user.connections.push(id)
        await user.save()

        const toUser = await User.findById(id);
        toUser.connections.push(userId)
        await toUser.save()

        connection.status = 'accepted'
        await connection.save()

        // Send acceptance notification via socket
        const acceptingUser = await User.findById(userId)
        const io = req.app.locals.io
        if (io && acceptingUser) {
            const acceptingUserData = {
                _id: acceptingUser._id,
                full_name: acceptingUser.full_name,
                username: acceptingUser.username,
                profile_picture: acceptingUser.profile_picture
            }
            const acceptanceNotification = {
                type: 'connection_accepted',
                data: {
                    from_user: acceptingUserData,
                    connection_id: connection._id
                }
            }
            console.log('âœ… Sending connection accepted notification to:', id, 'from:', acceptingUser.full_name)
            io.to(`user-${id}`).emit('connection-accepted', acceptanceNotification)
        }

        res.json({success: true, message: 'Đã chấp nhận lời mời kết bạn'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const removeConnection = async (req, res) => {
    try {
        const userId = req.userId
        const {id} = req.body
        
        const user = await User.findById(userId)
        user.connections = user.connections.filter(connection=> connection.toString() !== id)
        await user.save()

        const toUser = await User.findById(id)
        toUser.connections = toUser.connections.filter(connection=> connection.toString() !== userId)
        await toUser.save()

        const connection = await Connection.findOne({
            $or: [
                {from_user_id: userId, to_user_id: id},
                {from_user_id: id, to_user_id: userId},
            ]
        })

        if(connection) {
            await Connection.findByIdAndDelete(connection._id)
        }

        res.json({success: true, message: 'Đã huỷ kết bạn'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const declineConnectionRequest = async (req, res) => {
    try {
        const userId = req.userId
        const {id} = req.body

        const connection = await Connection.findOne({from_user_id: id, to_user_id: userId, status: 'pending'})

        if (!connection) {
            return res.json({success: false, message: 'Connection request not found'})
        }

        await Connection.findByIdAndDelete(connection._id)

        res.json({success: true, message: 'Đã từ chối lời mời kết bạn'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const getUserProfiles = async (req, res) =>{
    try {
        const { profileId } = req.body
        const profile = await User.findById(profileId)
        if(!profile) {
            return res.json({ success: false, message: "Profile not found" })
        }
        const posts = await Post.find({user: profileId}).populate('user')
        res.json({success: true, profile, posts})

    } catch (error) {
        res.json({success: false, message: error.message })
    }
}
