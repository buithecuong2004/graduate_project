import User from '../models/User.js'

const idToString = (value) => value?._id?.toString?.() || value?.toString?.() || ''

const hasBlocked = (user, otherUserId) => (
    (user?.blockedUsers || []).some((blockedUserId) => idToString(blockedUserId) === otherUserId)
)

export const getConversationBlockStatus = async (userId, otherUserId) => {
    const currentId = idToString(userId)
    const otherId = idToString(otherUserId)
    if (!currentId || !otherId) {
        return { isBlockedByMe: false, hasBlockedMe: false }
    }

    const [currentUser, otherUser] = await Promise.all([
        User.findById(currentId).select('blockedUsers').lean(),
        User.findById(otherId).select('blockedUsers').lean()
    ])

    return {
        isBlockedByMe: hasBlocked(currentUser, otherId),
        hasBlockedMe: hasBlocked(otherUser, currentId)
    }
}

export const isConversationBlocked = async (userId, otherUserId) => {
    const status = await getConversationBlockStatus(userId, otherUserId)
    return status.isBlockedByMe || status.hasBlockedMe
}
