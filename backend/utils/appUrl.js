const LOCAL_FRONTEND_URL = 'http://localhost:5173'
const DEFAULT_DEPLOYED_FRONTEND_URL = 'https://tarouss.io.vn'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

const normalizeBaseUrl = (value) => {
    if (!value || typeof value !== 'string') return ''

    const trimmed = value.trim().replace(/\/+$/, '')
    if (!trimmed) return ''

    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const isLocalUrl = (value) => {
    try {
        return LOCAL_HOSTS.has(new URL(value).hostname)
    } catch {
        return false
    }
}

const isDeployedEnvironment = () => {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase()
    const appEnv = process.env.APP_ENV?.toLowerCase()

    return (
        nodeEnv === 'production' ||
        appEnv === 'production' ||
        Boolean(process.env.VERCEL) ||
        Boolean(process.env.VERCEL_ENV)
    )
}

const getVercelFrontendUrl = () => {
    const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
    return normalizeBaseUrl(vercelUrl)
}

export const getFrontendBaseUrl = () => {
    const configuredUrl = normalizeBaseUrl(process.env.FRONTEND_URL)

    if (configuredUrl && (!isLocalUrl(configuredUrl) || !isDeployedEnvironment())) {
        return configuredUrl
    }

    const deployedUrl = [
        process.env.PUBLIC_FRONTEND_URL,
        process.env.SITE_URL,
        process.env.APP_URL,
        getVercelFrontendUrl(),
        process.env.BACKEND_URL,
        DEFAULT_DEPLOYED_FRONTEND_URL
    ]
        .map(normalizeBaseUrl)
        .find((url) => url && !isLocalUrl(url))

    if (isDeployedEnvironment() && deployedUrl) {
        return deployedUrl
    }

    return configuredUrl || LOCAL_FRONTEND_URL
}

export const getFrontendUrl = (path = '') => {
    const baseUrl = getFrontendBaseUrl()
    if (!path) return baseUrl

    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}
