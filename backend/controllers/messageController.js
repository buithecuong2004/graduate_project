import fs from "fs"
import imagekit from "../configs/imageKit.js";
import Message, { buildMessageSearchIndex, normalizeMessageSearchText } from "../models/Message.js";
import User from "../models/User.js";
import GroupChat from "../models/GroupChat.js";
import { isConversationBlocked } from "../utils/blocking.js";

const REACTION_ICONS = {
    like: '👍',
    love: '❤️',
    haha: '😂',
    wow: '😮',
    sad: '😢',
    angry: '😡'
};

const getVoiceFileExtension = (file) => {
    const mimeType = file.mimetype?.split(';')[0]?.toLowerCase()
    const extensionByMime = {
        'audio/webm': 'webm',
        'audio/ogg': 'ogg',
        'audio/wav': 'wav',
        'audio/wave': 'wav',
        'audio/x-wav': 'wav',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a',
        'audio/aac': 'aac',
        'audio/x-m4a': 'm4a'
    }
    const originalExt = file.originalname?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()

    return extensionByMime[mimeType] || originalExt || 'webm'
}

const cleanupUploadedFiles = (files = {}) => {
    Object.values(files).flat().forEach(file => {
        if(file?.path) {
            fs.unlink(file.path, (err) => {
                if (err) console.log('File cleanup error:', err)
            })
        }
    })
}

const getMessageUserId = (value) => value?._id?.toString?.() || value?.toString?.() || ''

const userSelect = 'full_name username profile_picture _id isOnline lastSeen'

const getGroupId = (value) => value?._id?.toString?.() || value?.toString?.() || ''

const getOtherParticipant = (message, currentUserId) => (
    getMessageUserId(message.from_user_id) === currentUserId ? message.to_user_id : message.from_user_id
)

const isGroupMember = (group, userId) => (
    group?.members?.some((member) => getMessageUserId(member.user) === userId.toString())
)

const getGroupMemberIds = (group) => (
    (group?.members || []).map((member) => getMessageUserId(member.user)).filter(Boolean)
)

const populateGroupChat = (query) => query
    .populate('creator', userSelect)
    .populate('members.user', userSelect)

const emitToMessageRecipients = async (io, message, event, payload) => {
    if (!io || !message) return

    if (message.group_id) {
        const group = await GroupChat.findById(message.group_id).select('members.user')
        getGroupMemberIds(group).forEach((recipientId) => {
            io.to(`user-${recipientId}`).emit(event, payload)
        })
        return
    }

    const recipientIds = new Set([
        getMessageUserId(message.to_user_id),
        getMessageUserId(message.from_user_id)
    ].filter(Boolean))
    recipientIds.forEach((recipientId) => io.to(`user-${recipientId}`).emit(event, payload))
}

// Helper to delete file from ImageKit using file ID
const deleteImageKitFile = async (fileId) => {
    try {
        if (!fileId) return true

        // Use ImageKit SDK to delete file by ID
        await imagekit.deleteFile(fileId)
        return true
    } catch (error) {
        console.log('ImageKit delete error:', error.message)
        return false
    }
}

// ─────────────────────────────────────────────────────────────────
// Helper: populate a single message object with user & reply_to data
// ─────────────────────────────────────────────────────────────────
const populateMessage = async (msgObj) => {
    // Optimize population by batching user lookups instead of many individual queries.
    const userIdsToFetch = new Set()

    // from_user_id may be an id or already populated object
    const fromId = msgObj.from_user_id && msgObj.from_user_id._id ? msgObj.from_user_id._id : msgObj.from_user_id
    const toId = msgObj.to_user_id && msgObj.to_user_id._id ? msgObj.to_user_id._id : msgObj.to_user_id
    if (fromId) userIdsToFetch.add(String(fromId))
    if (toId) userIdsToFetch.add(String(toId))

    if (msgObj.reply_to) {
        // reply_to may be an id — fetch the reply message to find its sender
        const replyMsg = await Message.findById(msgObj.reply_to).lean()
        if (replyMsg) {
            const replyFromId = replyMsg.from_user_id
            if (replyFromId) userIdsToFetch.add(String(replyFromId))
            // attach reply message (we will populate its from_user_id below)
            msgObj.reply_to = replyMsg
        }
    }

    if (msgObj.reactions && msgObj.reactions.length > 0) {
        msgObj.reactions.forEach(r => {
            const uid = r.user && r.user._id ? r.user._id : r.user
            if (uid && !(typeof uid === 'object' && uid.full_name)) userIdsToFetch.add(String(uid))
        })
    }

    // If there are users to fetch, perform a single query
    let usersMap = {}
    if (userIdsToFetch.size > 0) {
        const users = await User.find({ _id: { $in: Array.from(userIdsToFetch) } }).select('full_name username profile_picture _id').lean()
        usersMap = users.reduce((acc, u) => { acc[String(u._id)] = u; return acc }, {})
    }

    // Assign populated from_user_id
    if (fromId) {
        msgObj.from_user_id = usersMap[String(fromId)] || (await User.findById(fromId))
    }

    if (toId) {
        msgObj.to_user_id = usersMap[String(toId)] || (await User.findById(toId))
    }

    const groupId = getGroupId(msgObj.group_id)
    if (groupId) {
        msgObj.group_id = await populateGroupChat(GroupChat.findById(groupId).lean())
    }

    // Ensure media_urls/message_type compatibility
    if (msgObj.media_url && (!msgObj.media_urls || msgObj.media_urls.length === 0)) {
        msgObj.media_urls = [msgObj.media_url]
        msgObj.message_type = 'images'
    }

    // Populate reply_to sender if present
    if (msgObj.reply_to) {
        const replyFromId = msgObj.reply_to.from_user_id
        msgObj.reply_to.from_user_id = usersMap[String(replyFromId)] || (replyFromId ? await User.findById(replyFromId) : replyFromId)
    }

    // Populate reaction users using map where possible
    if (msgObj.reactions && msgObj.reactions.length > 0) {
        msgObj.reactions = msgObj.reactions.map(r => {
            const uid = r.user && r.user._id ? r.user._id : r.user
            if (uid && usersMap[String(uid)]) {
                return { ...r, user: usersMap[String(uid)] }
            }
            return r
        })
    }

    return msgObj
}

// ─────────────────────────────────────────────────────────────────
// Send Message
// ─────────────────────────────────────────────────────────────────
export const sendMessage = async (req, res) => {
    try {
        const startTime = Date.now()
        const userId = req.userId
        const { to_user_id, group_id, shared_post_id, reply_to, is_forwarded, forwarded_type, client_message_id } = req.body
        let { text } = req.body

        const images = req.files?.images || []
        const videos = req.files?.videos || []
        const voiceFiles = req.files?.voice || []

        // ✅ Pre-existing media URLs passed from the frontend when forwarding media messages.
        // FormData serialises arrays as either 'media_urls[]' or 'media_urls' depending on the client.
        const rawBodyUrls = req.body['media_urls[]'] ?? req.body.media_urls
        const bodyMediaUrls = rawBodyUrls
            ? (Array.isArray(rawBodyUrls) ? rawBodyUrls : [rawBodyUrls])
            : []

        text = (text || '').trim()

        // Allow an empty text when media URLs are being forwarded
        if (!text && images.length === 0 && videos.length === 0 && voiceFiles.length === 0 && bodyMediaUrls.length === 0) {
            return res.json({ success: false, message: 'Message cannot be empty' })
        }

        if (!group_id && !to_user_id) {
            cleanupUploadedFiles(req.files)
            return res.json({ success: false, message: 'Missing message target' })
        }

        let targetGroup = null
        if (group_id) {
            targetGroup = await GroupChat.findById(group_id).select('members creator name')
            if (!targetGroup) {
                cleanupUploadedFiles(req.files)
                return res.json({ success: false, message: 'Group chat not found' })
            }
            if (!isGroupMember(targetGroup, userId)) {
                cleanupUploadedFiles(req.files)
                return res.json({ success: false, message: 'You are not a member of this group' })
            }
        }

        if (!group_id && to_user_id?.toString?.() === userId.toString()) {
            cleanupUploadedFiles(req.files)
            return res.json({ success: false, message: 'Không thể nhắn tin với chính bạn' })
        }

        if (!group_id && await isConversationBlocked(userId, to_user_id)) {
            cleanupUploadedFiles(req.files)
            return res.json({ success: false, message: 'Không thể gửi tin nhắn vì một trong hai người đã chặn người còn lại' })
        }

        let media_urls = []
        let media_ids = []
        let message_type = 'text'

        try {
            if (images.length > 5) {
                return res.json({ success: false, message: 'Maximum 5 images per message' })
            }
            if (videos.length > 3) {
                return res.json({ success: false, message: 'Maximum 3 videos per message' })
            }

            // Upload voice
            if (voiceFiles.length > 0) {
                message_type = 'voice'
                const voiceFile = voiceFiles[0]
                try {
                    const fileBuffer = fs.readFileSync(voiceFile.path)
                    const extension = getVoiceFileExtension(voiceFile)
                    const response = await imagekit.upload({
                        file: fileBuffer,
                        fileName: `voice_${Date.now()}.${extension}`,
                        folder: 'messages/voice'
                    })
                    const voiceUrl = response.url || (response.filePath ? imagekit.url({ path: response.filePath }) : '')
                    if (!voiceUrl) throw new Error('Voice upload did not return a URL')
                    media_urls.push(voiceUrl)
                    media_ids.push(response.fileId)
                } catch (uploadError) {
                    console.error('ImageKit voice upload error:', uploadError)
                    throw uploadError
                } finally {
                    fs.unlink(voiceFile.path, (err) => {
                        if (err) console.log('Voice file cleanup error:', err)
                    })
                }
            }

            // Upload images
            if (images.length > 0) {
                message_type = images.length === 1 && videos.length === 0 ? 'image' : 'images'
                const uploadedImages = await Promise.all(
                    images.map(async (image) => {
                        try {
                            const fileBuffer = fs.readFileSync(image.path)
                            const response = await imagekit.upload({
                                file: fileBuffer,
                                fileName: image.originalname,
                                folder: 'messages/images'
                            })
                            return {
                                url: response.url || imagekit.url({
                                    path: response.filePath,
                                    transformation: [
                                        { quality: 'auto' },
                                        { format: 'webp' },
                                        { width: '800' }
                                    ]
                                }),
                                id: response.fileId
                            }
                        } catch (uploadError) {
                            console.error('ImageKit upload error:', uploadError)
                            throw uploadError
                        }
                    })
                )
                media_urls.push(...uploadedImages.map(img => img.url))
                media_ids.push(...uploadedImages.map(img => img.id))
            }

            // Upload videos
            if (videos.length > 0) {
                message_type = videos.length === 1 && images.length === 0 ? 'video' : 'videos'
                const uploadedVideos = await Promise.all(
                    videos.map(async (video) => {
                        try {
                            const fileBuffer = fs.readFileSync(video.path)
                            const response = await imagekit.upload({
                                file: fileBuffer,
                                fileName: video.originalname,
                                folder: 'messages/videos'
                            })
                            return {
                                url: response.url || imagekit.url({ path: response.filePath }),
                                id: response.fileId
                            }
                        } catch (uploadError) {
                            console.error('ImageKit video upload error:', uploadError)
                            throw uploadError
                        }
                    })
                )
                media_urls.push(...uploadedVideos.map(vid => vid.url))
                media_ids.push(...uploadedVideos.map(vid => vid.id))
            }

            if (images.length > 0 && videos.length > 0) {
                message_type = 'images'
            }

            const allFiles = [...images, ...videos]
            allFiles.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.log('File cleanup error:', err)
                })
            })

            // ✅ No new files uploaded → use pre-existing URLs (forwarded media)
            if (media_urls.length === 0 && bodyMediaUrls.length > 0) {
                media_urls = bodyMediaUrls
                // Honour the message_type sent by the client (voice / image / images / video / videos)
                if (req.body.message_type && req.body.message_type !== 'text') {
                    message_type = req.body.message_type
                }
            }

        } catch (uploadError) {
            const allFiles = [...images, ...videos, ...voiceFiles]
            allFiles.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.log('File cleanup error:', err)
                })
            })
            throw uploadError
        }

        const message = await Message.create({
            from_user_id: userId,
            to_user_id: group_id ? undefined : to_user_id,
            group_id: group_id || undefined,
            client_message_id: client_message_id || undefined,
            text: text || '',
            message_type,
            media_urls,
            media_ids,
            shared_post_id: shared_post_id || null,
            reply_to: reply_to || null,
            is_forwarded: is_forwarded === true || is_forwarded === 'true',
            forwarded_type: forwarded_type || null,
        })

        const msgObj = message.toObject()
        const populatedMsg = await populateMessage(msgObj)

        res.json({ success: true, message: populatedMsg })
        console.log(`sendMessage: user=${userId} to=${group_id ? `group:${group_id}` : to_user_id} saved in ${Date.now()-startTime}ms`)

        if (group_id) {
            await GroupChat.findByIdAndUpdate(group_id, { updatedAt: new Date() })
        }

        const io = req.app.locals.io
        if (io) {
            const recipientIds = group_id
                ? new Set(getGroupMemberIds(targetGroup))
                : new Set([to_user_id.toString(), userId.toString()])
            recipientIds.forEach(recipientId => {
                io.to(`user-${recipientId}`).emit('new-message', populatedMsg)
            })

        }
    } catch (error) {
        console.error('❌ Error in sendMessage:', error)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// Get Chat Messages (with reply_to populated)
// ─────────────────────────────────────────────────────────────────
export const getChatMessages = async (req, res) => {
    try {
        const startTime = Date.now()
        const userId = req.userId
        const { to_user_id, group_id, limit = 30, before, mark_read = true } = req.body

        let query

        if (group_id) {
            const group = await GroupChat.findById(group_id).select('members.user')
            if (!group) return res.json({ success: false, message: 'Group chat not found' })
            if (!isGroupMember(group, userId)) {
                return res.json({ success: false, message: 'You are not a member of this group' })
            }

            query = {
                group_id,
                deletedFor: { $ne: userId }
            }
        }

        if (!group_id && to_user_id?.toString?.() === userId.toString()) {
            return res.json({ success: true, messages: [], hasMore: false })
        }

        if (!query) {
            query = {
                $or: [
                    { from_user_id: userId, to_user_id },
                    { from_user_id: to_user_id, to_user_id: userId }
                ],
                deletedFor: { $ne: userId }
            }
        }

        // Cursor-based pagination: fetch messages older than `before`
        if (before) {
            query._id = { $lt: before }
        }

        const limitNum = Math.min(parseInt(limit) || 30, 50)

        // Fetch one extra to determine if there are more messages
        let messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limitNum + 1)
            .lean()

        const hasMore = messages.length > limitNum
        if (hasMore) messages = messages.slice(0, limitNum)

        // Reverse to return in chronological order (oldest → newest)
        messages.reverse()

        messages = await Promise.all(messages.map(populateMessage))

        if (!group_id && mark_read !== false && mark_read !== 'false') {
            await Message.updateMany(
                { from_user_id: to_user_id, to_user_id: userId, deletedFor: { $ne: userId } },
                { isRead: true }
            )
        }

        res.json({ success: true, messages, hasMore })
        console.log(`getChatMessages: user=${userId} with=${to_user_id} returned ${messages.length} messages in ${Date.now()-startTime}ms`)
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const getMessagesAround = async (req, res) => {
    try {
        const userId = req.userId
        const { to_user_id, group_id, messageId, limit = 30 } = req.body

        if ((!to_user_id && !group_id) || !messageId) {
            return res.json({ success: false, message: 'Missing message target' })
        }

        if (!group_id && to_user_id?.toString?.() === userId.toString()) {
            return res.json({ success: true, messages: [], hasMore: false })
        }

        let conversationQuery
        if (group_id) {
            const group = await GroupChat.findById(group_id).select('members.user')
            if (!group) return res.json({ success: false, message: 'Group chat not found' })
            if (!isGroupMember(group, userId)) {
                return res.json({ success: false, message: 'You are not a member of this group' })
            }
            conversationQuery = {
                group_id,
                deletedFor: { $ne: userId },
                message_type: { $ne: 'reaction' }
            }
        } else {
            conversationQuery = {
                $or: [
                    { from_user_id: userId, to_user_id },
                    { from_user_id: to_user_id, to_user_id: userId }
                ],
                deletedFor: { $ne: userId },
                message_type: { $ne: 'reaction' }
            }
        }

        const targetMessage = await Message.findOne({ _id: messageId, ...conversationQuery }).lean()
        if (!targetMessage) {
            return res.json({ success: false, message: 'Message not found' })
        }

        const limitNum = Math.min(parseInt(limit) || 30, 60)
        const sideLimit = Math.max(1, Math.floor((limitNum - 1) / 2))

        const [olderMessages, newerMessages, olderCount] = await Promise.all([
            Message.find({ ...conversationQuery, createdAt: { $lt: targetMessage.createdAt } })
                .sort({ createdAt: -1 })
                .limit(sideLimit)
                .lean(),
            Message.find({ ...conversationQuery, createdAt: { $gt: targetMessage.createdAt } })
                .sort({ createdAt: 1 })
                .limit(sideLimit)
                .lean(),
            Message.countDocuments({ ...conversationQuery, createdAt: { $lt: targetMessage.createdAt } })
        ])

        let messages = [...olderMessages.reverse(), targetMessage, ...newerMessages]
        messages = await Promise.all(messages.map(populateMessage))

        res.json({ success: true, messages, hasMore: olderCount > olderMessages.length })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const searchMessages = async (req, res) => {
    try {
        const userId = req.userId
        const { query = '', to_user_id, group_id, limit = 200 } = req.body
        const keyword = query.trim()

        if (!keyword || (!group_id && to_user_id?.toString?.() === userId.toString())) {
            return res.json({ success: true, groups: [], messages: [] })
        }

        let participantQuery
        if (group_id) {
            const group = await GroupChat.findById(group_id).select('members.user')
            if (!group) return res.json({ success: false, message: 'Group chat not found' })
            if (!isGroupMember(group, userId)) {
                return res.json({ success: false, message: 'You are not a member of this group' })
            }

            participantQuery = { group_id }
        } else {
            participantQuery = to_user_id
                ? {
                    $or: [
                        { from_user_id: userId, to_user_id },
                        { from_user_id: to_user_id, to_user_id: userId }
                    ]
                }
                : {
                    $or: [
                        { from_user_id: userId },
                        { to_user_id: userId }
                    ],
                    $expr: { $ne: ['$from_user_id', '$to_user_id'] }
                }
        }

        const limitNum = Math.min(parseInt(limit) || 200, 300)
        const { searchText, searchTokens } = buildMessageSearchIndex(keyword)
        if (!searchText || searchTokens.length === 0) {
            return res.json({ success: true, groups: [], messages: [] })
        }

        const searchQuery = {
            ...participantQuery,
            searchTokens: { $all: searchTokens },
            is_deleted: { $ne: true },
            message_type: { $nin: ['reaction', 'call'] },
            deletedFor: { $ne: userId }
        }

        let messages = await Message.find(searchQuery)
            .sort({ createdAt: -1 })
            .limit(limitNum)
            .populate('from_user_id', 'full_name username profile_picture')
            .populate('to_user_id', 'full_name username profile_picture')
            .lean()

        messages = messages.filter((message) => normalizeMessageSearchText(message.text).includes(searchText))

        const groupMap = new Map()
        if (!group_id) {
            messages.forEach((message) => {
                const otherUser = getOtherParticipant(message, userId)
                const otherUserId = getMessageUserId(otherUser)
                if (!otherUserId || otherUserId === userId) return

                const current = groupMap.get(otherUserId)
                groupMap.set(otherUserId, {
                    user: current?.user || otherUser,
                    count: (current?.count || 0) + 1,
                    latestMessage: current?.latestMessage || message
                })
            })
        }

        res.json({
            success: true,
            groups: Array.from(groupMap.values()),
            messages
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// Get Recent Messages
// ─────────────────────────────────────────────────────────────────
export const getUserRecentMessages = async (req, res) => {
    try {
        const userId = req.userId

        let messages = await Message.find({
            $or: [
                { from_user_id: userId },
                { to_user_id: userId }
            ],
            group_id: { $exists: false },
            deletedFor: { $ne: userId },
            $expr: { $ne: ['$from_user_id', '$to_user_id'] }
        }).sort({ createdAt: -1 }).lean()

        messages = await Promise.all(
            messages.map(async (msgObj) => {
                const senderUser = await User.findById(msgObj.from_user_id)
                const recipientUser = await User.findById(msgObj.to_user_id)
                msgObj.from_user_id = senderUser
                msgObj.to_user_id = recipientUser
                return msgObj
            })
        )

        res.json({ success: true, messages })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// Mark Messages As Read
// ─────────────────────────────────────────────────────────────────
export const markMessagesAsRead = async (req, res) => {
    try {
        const userId = req.userId
        const { from_user_id } = req.body

        await Message.updateMany(
            { from_user_id, to_user_id: userId, isRead: false, deletedFor: { $ne: userId } },
            { isRead: true }
        )

        res.json({ success: true, message: 'Messages marked as read' })
    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// Delete (Recall) Message — set is_deleted = true, clear text/media
// ─────────────────────────────────────────────────────────────────
export const deleteMessage = async (req, res) => {
    try {
        const userId = req.userId
        const { messageId } = req.body

        const message = await Message.findById(messageId)
        if (!message) return res.json({ success: false, message: 'Message not found' })
        if (message.from_user_id.toString() !== userId) {
            return res.json({ success: false, message: 'Unauthorized: not your message' })
        }

        if (message.group_id) {
            const group = await GroupChat.findById(message.group_id).select('members.user')
            if (!isGroupMember(group, userId)) {
                return res.json({ success: false, message: 'You are not a member of this group' })
            }
        }

        // Delete files from ImageKit
        if (message.media_ids && message.media_ids.length > 0) {
            for (let fileId of message.media_ids) {
                await deleteImageKitFile(fileId)
            }
        }

        message.is_deleted = true
        message.text = ''
        message.media_urls = []
        message.media_ids = []
        await message.save()

        res.json({ success: true, messageId })

        const io = req.app.locals.io
        await emitToMessageRecipients(io, message, 'message-deleted', { messageId, groupId: getGroupId(message.group_id) || null })
    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}

export const deleteConversation = async (req, res) => {
    try {
        const userId = req.userId
        const { to_user_id, group_id } = req.body

        if (!to_user_id && !group_id) {
            return res.json({ success: false, message: 'Missing conversation user id' })
        }

        if (group_id) {
            const group = await GroupChat.findById(group_id).select('members.user')
            if (!group) return res.json({ success: false, message: 'Group chat not found' })
            if (!isGroupMember(group, userId)) {
                return res.json({ success: false, message: 'You are not a member of this group' })
            }

            await Message.updateMany(
                { group_id, deletedFor: { $ne: userId } },
                { $addToSet: { deletedFor: userId } }
            )

            res.json({ success: true, group_id })

            const io = req.app.locals.io
            if (io) io.to(`user-${userId}`).emit('conversation-deleted', { groupId: group_id })
            return
        }

        await Message.updateMany(
            {
                $or: [
                    { from_user_id: userId, to_user_id },
                    { from_user_id: to_user_id, to_user_id: userId }
                ],
                deletedFor: { $ne: userId }
            },
            { $addToSet: { deletedFor: userId } }
        )

        res.json({ success: true, to_user_id })

        const io = req.app.locals.io
        if (io) {
            io.to(`user-${userId}`).emit('conversation-deleted', { userId: to_user_id })
        }
    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// Edit Message — only within 30 minutes
// ─────────────────────────────────────────────────────────────────
export const editMessage = async (req, res) => {
    try {
        const userId = req.userId
        const { messageId, text } = req.body

        if (!text || !text.trim()) {
            return res.json({ success: false, message: 'Text cannot be empty' })
        }

        const message = await Message.findById(messageId)
        if (!message) return res.json({ success: false, message: 'Message not found' })
        if (message.from_user_id.toString() !== userId) {
            return res.json({ success: false, message: 'Unauthorized: not your message' })
        }

        const minutesSinceSent = (Date.now() - new Date(message.createdAt).getTime()) / (1000 * 60)
        if (minutesSinceSent > 30) {
            return res.json({ success: false, message: 'Cannot edit message older than 30 minutes' })
        }

        message.text = text.trim()
        message.is_edited = true
        await message.save()

        res.json({ success: true, messageId, text: message.text })

        const io = req.app.locals.io
        await emitToMessageRecipients(io, message, 'message-edited', { messageId, text: message.text, groupId: getGroupId(message.group_id) || null })
    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// React to Message
// ─────────────────────────────────────────────────────────────────
export const reactMessage = async (req, res) => {
    try {
        const startTime = Date.now()
        const userId = req.userId
        const { messageId, reactionType } = req.body

        const message = await Message.findById(messageId)
        if (!message) {
            return res.json({ success: false, message: 'Message not found' })
        }

        let group = null
        if (message.group_id) {
            group = await GroupChat.findById(message.group_id).select('members.user')
            if (!group) return res.json({ success: false, message: 'Group chat not found' })
            if (!isGroupMember(group, userId)) {
                return res.json({ success: false, message: 'You are not a member of this group' })
            }
        }

        const otherParticipantId = message.from_user_id.toString() === userId
            ? message.to_user_id?.toString()
            : message.from_user_id.toString()
        if (!message.group_id && await isConversationBlocked(userId, otherParticipantId)) {
            return res.json({ success: false, message: 'Không thể bày tỏ cảm xúc vì một trong hai người đã chặn người còn lại' })
        }

        if (!message.reactions) message.reactions = []

        const existingReactionIndex = message.reactions.findIndex(r => r.user.toString() === userId)
        let isNewReaction = false;

        if (existingReactionIndex !== -1) {
            if (message.reactions[existingReactionIndex].type === reactionType) {
                message.reactions.splice(existingReactionIndex, 1)

                // Remove the automated reaction message
                if (!message.group_id) {
                    await Message.deleteMany({
                        from_user_id: userId,
                        to_user_id: message.from_user_id.toString(),
                        message_type: 'reaction',
                        $or: [{ reply_to: messageId }, { reply_to: null }]
                    })
                }
            } else {
                message.reactions[existingReactionIndex].type = reactionType
                isNewReaction = true;

                // If changing reaction, also delete old automated message so we can recreate
                if (!message.group_id) {
                    await Message.deleteMany({
                        from_user_id: userId,
                        to_user_id: message.from_user_id.toString(),
                        message_type: 'reaction',
                        $or: [{ reply_to: messageId }, { reply_to: null }]
                    })
                }
            }
        } else {
            message.reactions.push({ user: userId, type: reactionType })
            isNewReaction = true;
        }

        await message.save()

        await message.populate({
            path: 'reactions.user',
            select: 'full_name username profile_picture _id'
        })

        const msgObj = message.toObject()
        const populatedMsg = await populateMessage(msgObj)

        res.json({ success: true, message: 'Reaction updated', messageData: populatedMsg })
        console.log(`reactMessage: user=${userId} message=${messageId} processed in ${Date.now()-startTime}ms`)

        const io = req.app.locals.io
        if (io) {
            if (message.group_id) {
                getGroupMemberIds(group).forEach((recipientId) => {
                    io.to(`user-${recipientId}`).emit('message-reaction-updated', {
                        messageId,
                        reactions: populatedMsg.reactions,
                        groupId: getGroupId(message.group_id)
                    })
                })
                return
            }

            const messageOwner = message.from_user_id.toString()
            const otherUser = messageOwner === userId ? message.to_user_id.toString() : messageOwner

            // Emit reaction update to both participants so UI updates instantly
            // for the message owner and the user who reacted.
            io.to(`user-${otherUser}`).emit('message-reaction-updated', { messageId, reactions: populatedMsg.reactions })
            io.to(`user-${userId}`).emit('message-reaction-updated', { messageId, reactions: populatedMsg.reactions })

            if (isNewReaction && userId !== messageOwner) {
                const reactor = await User.findById(userId)
                if (reactor) {
                    const reactionIcon = REACTION_ICONS[reactionType] || reactionType
                    
                    const automatedMessage = await Message.create({
                        from_user_id: userId,
                        to_user_id: messageOwner,
                        text: `Bày tỏ cảm xúc ${reactionIcon} về tin nhắn của bạn`,
                        message_type: 'reaction',
                        isRead: false,
                        reply_to: messageId
                    })

                    const msgObjAuto = automatedMessage.toObject()
                    const populatedMsgAuto = await populateMessage(msgObjAuto)

                    io.to(`user-${messageOwner}`).emit('new-message', populatedMsgAuto)
                    // Also notify the reacting user so their UI (mini chat / recent list)
                    // updates immediately with the automated reaction message.
                    io.to(`user-${userId}`).emit('new-message', populatedMsgAuto)
                }
            }
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────
// Save Call Record
// ─────────────────────────────────────────────────────────────────
export const saveCall = async (req, res) => {
    try {
        const userId = req.userId
        const { to_user_id, group_id, call_type, call_status, call_duration } = req.body

        if ((!to_user_id && !group_id) || !call_type || !call_status) {
            return res.json({ success: false, message: 'Missing required call fields' })
        }

        if (!group_id && to_user_id?.toString?.() === userId.toString()) {
            return res.json({ success: false, message: 'Không thể gọi cho chính bạn' })
        }

        let targetGroup = null
        if (group_id) {
            targetGroup = await GroupChat.findById(group_id).select('members.user')
            if (!targetGroup) {
                return res.json({ success: false, message: 'Group chat not found' })
            }
            if (!isGroupMember(targetGroup, userId)) {
                return res.json({ success: false, message: 'You are not a member of this group' })
            }
        }

        if (!group_id && await isConversationBlocked(userId, to_user_id)) {
            return res.json({ success: false, message: 'Không thể gọi vì một trong hai người đã chặn người còn lại' })
        }

        const callTexts = {
            missed: call_type === 'video' ? '📵 Đã bỏ lỡ cuộc gọi video' : '📵 Đã bỏ lỡ cuộc gọi thoại',
            rejected: call_type === 'video' ? '❌ Đã từ chối cuộc gọi video' : '❌ Đã từ chối cuộc gọi thoại',
            completed: call_type === 'video' ? '📹 Gọi video' : '📞 Gọi thoại',
        }

        const message = await Message.create({
            from_user_id: userId,
            to_user_id: group_id ? undefined : to_user_id,
            group_id: group_id || undefined,
            text: callTexts[call_status] || '📞 Cuộc gọi',
            message_type: 'call',
            call_type,
            call_status,
            call_duration: call_duration || 0,
            isRead: false,
        })

        const msgObj = message.toObject()
        const populatedMsg = await populateMessage(msgObj)

        res.json({ success: true, message: populatedMsg })

        // Emit to both parties so their ChatBox + RecentMessages update live
        const io = req.app.locals.io
        if (io) {
            if (group_id) {
                getGroupMemberIds(targetGroup).forEach((memberId) => {
                    io.to(`user-${memberId}`).emit('new-message', populatedMsg)
                })
            } else {
                io.to(`user-${to_user_id}`).emit('new-message', populatedMsg)
                io.to(`user-${userId}`).emit('new-message', populatedMsg)
            }
        }
    } catch (error) {
        console.error('❌ Error in saveCall:', error)
        res.json({ success: false, message: error.message })
    }
}

