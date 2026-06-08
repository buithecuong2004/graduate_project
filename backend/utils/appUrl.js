const LOCAL_FRONTEND_URL = 'http://localhost:5173'
const PRODUCTION_FRONTEND_URL = 'https://tarouss.io.vn'

const normalizeBaseUrl = (value) => {
    if (!value || typeof value !== 'string') return ''
    const trimmed = value.trim().replace(/\/+$/, '')
    if (!trimmed) return ''
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/**
 * Trả về base URL của frontend.
 * - Khi local dev: đọc FRONTEND_URL từ .env.local (= http://localhost:5173)
 * - Khi production/deploy: đọc FRONTEND_URL từ .env (= https://tarouss.io.vn)
 * Luôn đặt FRONTEND_URL đúng trong file .env tương ứng.
 */
export const getFrontendBaseUrl = () => {
    const configured = normalizeBaseUrl(process.env.FRONTEND_URL)
    if (configured) return configured
    return LOCAL_FRONTEND_URL
}

export const getBackendBaseUrl = () => {
    const configured = normalizeBaseUrl(process.env.BACKEND_URL)
    if (configured) return configured
    return 'http://localhost:4000'
}

export const getFrontendUrl = (path = '') => {
    const baseUrl = getFrontendBaseUrl()
    if (!path) return baseUrl
    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export const getBackendUrl = (path = '') => {
    const baseUrl = getBackendBaseUrl()
    if (!path) return baseUrl
    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}
