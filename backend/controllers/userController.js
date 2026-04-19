import imagekit from "../configs/imageKit.js"
import { inngest } from "../inngest/index.js"
import Connection from "../models/Connection.js"
import Post from "../models/Post.js"
import User from "../models/User.js"
import fs  from 'fs'
import { createClerkClient } from '@clerk/express'

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

export const getUserData = async (req,res) => {
    try {
        const { userId } = req.auth()
        let user = await User.findById(userId)

        if(!user) {
            // User exists in Clerk but not yet in MongoDB (e.g. Inngest webhook delay after re-registration)
            // Auto-create from Clerk data to prevent infinite loading
            try {
                const clerkUser = await clerkClient.users.getUser(userId)
                const email = clerkUser.emailAddresses[0]?.emailAddress || ''
                const fullName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim()

                // Generate a unique username
                let username = email.split('@')[0]
                const existingUser = await User.findOne({ username })
                if(existingUser) {
                    username = username + Math.floor(Math.random() * 10000)
                }

                user = await User.create({
                    _id: userId,
                    email,
                    full_name: fullName || email,
                    profile_picture: clerkUser.imageUrl || '',
                    username
                })
            } catch(clerkError) {
                console.error('Failed to auto-create user from Clerk:', clerkError.message)
                return res.json({success: false, message: "User not found"})
            }
        }

        // Clean up dangling references: remove IDs of deleted users from this user's arrays
        // This fixes crash when a connection/follower/following account was deleted
        const allRefs = [...(user.connections || []), ...(user.followers || []), ...(user.following || [])]
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
                            following: (user.following || []).filter(id => existingIds.has(id.toString()))
                        }
                    },
                    { new: true }
                )
                console.log(`🧹 Cleaned dangling refs for user ${userId}`)
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
        const { userId } = req.auth()
        let {username, bio, location, full_name} = req.body;

        const tempUser = await User.findById(userId)

        !username && (username = tempUser.username)

        if(tempUser.username !== username) {
            const existingUser = await User.findOne({username})
            if(existingUser ) {
                username = tempUser.username
            }
        }

        const updatedData = {
            username,
            bio,
            location,
            full_name
        }

        const profile = req.files.profile && req.files.profile[0]
        const cover = req.files.cover && req.files.cover[0]

        if(profile) {
            const buffer = fs.readFileSync(profile.path)
            const response = await imagekit.upload({
                file: buffer,
                fileName: profile.originalname,
            })

            const url = imagekit.url({
                path: response.filePath,
                transformation: [
                    {quality: 'auto'},
                    {format: 'webp'},
                    {width: '512'}
                ]
            })
            updatedData.profile_picture = url;
        }

        if(cover) {
            const buffer = fs.readFileSync(cover.path)
            const response = await imagekit.upload({
                file: buffer,
                fileName: cover.originalname,
            })

            const url = imagekit.url({
                path: response.filePath,
                transformation: [
                    {quality: 'auto'},
                    {format: 'webp'},
                    {width: '1280'}
                ]
            })
            updatedData.cover_photo = url;
        }

        const user = await User.findByIdAndUpdate(userId, updatedData, {new : true})

        res.json({success: true, user, message: 'Profile updated successfully'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const discoverUsers = async (req,res) => {
    try {
        const { userId } = req.auth()
        const { input } = req.body

        const currentUser = await User.findById(userId)
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
        const filteredUsers = allUsers.filter(user=> user._id != userId).map(user => ({
            ...user.toObject(),
            isFollowing: currentUser.following.includes(user._id),
            isConnected: currentUser.connections.includes(user._id)
        }))
        return res.json({success: true, users: filteredUsers})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const followUser = async (req,res) => {
    try {
        const { userId } = req.auth()
        const { id } = req.body

       const user = await User.findById(userId)

       if(user.following.includes(id)){
            return res.json({success: false, message: 'You are already following this user'})
       }

       user.following.push(id)
       await user.save()

       const toUser = await User.findById(id)
       toUser.followers.push(userId)
       await toUser.save()

       res.json({success: true, message: 'Now you are following this user'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const unfollowUser = async (req,res) => {
    try {
        const { userId } = req.auth()
        const { id } = req.body

       const user = await User.findById(userId)
       user.following = user.following.filter(user=> user !== id)
       await user.save()

       const toUser = await User.findById(id)
       toUser.followers = toUser.followers.filter(user=> user !== userId)
       await toUser.save()
       
       res.json({success: true, message: 'Now you are no longer follow this user'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const sendConnectionRequest = async (req, res) => {
    try {
        const {userId} = req.auth()
        const {id} = req.body

        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const connectionRequests = await Connection.find({from_user_id: userId, created_at: { $gt: last24Hours }})
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

            await inngest.send({ 
                name: 'app/connection-request',
                data: {connectionId: newConnection._id}
            })

            // Send friend request notification via socket
            const requesterUser = await User.findById(userId)
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
                console.log('🤝 Sending friend request notification to:', id, 'from:', requesterUser.full_name)
                io.to(`user-${id}`).emit('friend-request', friendRequestNotification)
            }

            return res.json({success: true, message: 'Connection request sent successfully'})
        }else if(connection && connection.status === 'accepted') {
            return res.json({success: false, message: 'You are already connected with this user'})
        }

        return res.json({success: false, message: 'Connection request pending'})
    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const getUserConnections = async (req, res) => {
    try {
        const {userId} = req.auth()
        const user = await User.findById(userId).populate('connections followers following')

        // If user not yet in DB (race condition on first login), return empty
        if(!user) return res.json({success: true, connections: [], followers: [], following: [], pendingConnections: []})

        // Filter out null values from arrays (can happen when a referenced user was deleted)
        const connections = (user.connections || []).filter(Boolean)
        const followers = (user.followers || []).filter(Boolean)
        const following = (user.following || []).filter(Boolean)

        const pendingConnections = (await Connection.find({to_user_id: userId, status: 'pending'}).populate('from_user_id'))
            .map(connection => connection.from_user_id)
            .filter(Boolean)

        res.json({success: true, connections, followers, following, pendingConnections})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const acceptConnectionRequest = async (req, res) => {
    try {
        const {userId} = req.auth()
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
            console.log('✅ Sending connection accepted notification to:', id, 'from:', acceptingUser.full_name)
            io.to(`user-${id}`).emit('connection-accepted', acceptanceNotification)
        }

        res.json({success: true, message: 'Connection accepted successfully'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const removeConnection = async (req, res) => {
    try {
        const {userId} = req.auth()
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

        res.json({success: true, message: 'Connection removed successfully'})

    } catch (error) {
        console.log(error)
        return res.json({success: false, message: error.message})
    }
}

export const declineConnectionRequest = async (req, res) => {
    try {
        const {userId} = req.auth()
        const {id} = req.body

        const connection = await Connection.findOne({from_user_id: id, to_user_id: userId, status: 'pending'})

        if (!connection) {
            return res.json({success: false, message: 'Connection request not found'})
        }

        await Connection.findByIdAndDelete(connection._id)

        res.json({success: true, message: 'Connection request declined'})

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