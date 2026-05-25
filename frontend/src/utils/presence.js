const ONE_MINUTE = 60 * 1000
const ONE_HOUR = 60 * ONE_MINUTE
const ONE_DAY = 24 * ONE_HOUR

export const getPresenceStatus = (user, now = Date.now()) => {
    if (user?.isOnline) return { isOnline: true, label: '' }

    const lastSeenTime = new Date(user?.lastSeen || '').getTime()
    if (!Number.isFinite(lastSeenTime)) return { isOnline: false, label: '' }

    const offlineFor = now - lastSeenTime
    if (offlineFor < 0 || offlineFor >= ONE_DAY) return { isOnline: false, label: '' }

    if (offlineFor < ONE_HOUR) {
        const minutes = Math.max(1, Math.floor(offlineFor / ONE_MINUTE))
        return { isOnline: false, label: `${minutes} phút` }
    }

    const hours = Math.floor(offlineFor / ONE_HOUR)
    return { isOnline: false, label: `${hours} giờ` }
}
