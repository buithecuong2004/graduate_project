const splitList = (value) => {
    if (!value) return []
    return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
}

const parseIceServersJson = (value) => {
    if (!value) return []
    try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed.filter(server => server?.urls) : []
    } catch (error) {
        console.error('Invalid ICE_SERVERS_JSON:', error.message)
        return []
    }
}

const makeIceServer = (urls, username, credential) => {
    if (urls.length === 0) return null
    const server = { urls: urls.length === 1 ? urls[0] : urls }
    if (username && credential) {
        server.username = username
        server.credential = credential
    }
    return server
}

const defaultStunUrls = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
    'stun:stun3.l.google.com:19302',
]

export const hasTurnServer = (iceConfig = {}) => (
    (iceConfig.iceServers || []).some((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
        return urls.some((url) => typeof url === 'string' && url.startsWith('turn'))
    })
)

export const getIceConfig = () => {
    const envIceServers = parseIceServersJson(process.env.ICE_SERVERS_JSON)
    const stunUrls = splitList(process.env.STUN_URLS).length > 0
        ? splitList(process.env.STUN_URLS)
        : defaultStunUrls

    const turnUrls = splitList(process.env.TURN_URLS || process.env.TURN_URL)
    const turnServer = makeIceServer(
        turnUrls,
        process.env.TURN_USERNAME,
        process.env.TURN_CREDENTIAL || process.env.TURN_PASSWORD,
    )

    const iceServers = [
        ...envIceServers,
        makeIceServer(stunUrls),
        turnServer,
    ].filter(Boolean)

    const iceConfig = { iceServers }
    const policy = process.env.ICE_TRANSPORT_POLICY
    if (policy === 'all' || policy === 'relay') {
        iceConfig.iceTransportPolicy = policy
    }

    return iceConfig
}
