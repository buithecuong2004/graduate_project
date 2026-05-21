export const getUniqueNotificationRecipientIds = (user, excludeUserId, fields = ['followers', 'connections']) => {
    const excludeId = excludeUserId?.toString()
    const recipientIds = fields.flatMap((field) => user?.[field] || [])

    return [...new Set(recipientIds.map((id) => id?.toString()).filter(Boolean))]
        .filter((id) => id !== excludeId)
}
