import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import imagekit from '../configs/imageKit.js'
import { getFrontendUrl } from './appUrl.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_AVATAR_PATHS = [
    path.resolve(__dirname, '../assets/default.jpg'),
    path.resolve(__dirname, '../../frontend/public/assets/default.jpg')
]

let defaultProfilePicturePromise = null

const isImageKitConfigured = () => (
    Boolean(process.env.IMAGEKIT_PUBLIC_KEY) &&
    Boolean(process.env.IMAGEKIT_PRIVATE_KEY) &&
    Boolean(process.env.IMAGEKIT_URL_ENDPOINT)
)

const findDefaultAvatarFile = async () => {
    for (const avatarPath of DEFAULT_AVATAR_PATHS) {
        try {
            await fs.access(avatarPath)
            return avatarPath
        } catch {
            // Try the next known asset location.
        }
    }

    return null
}

const getImageKitDefaultProfilePictureUrl = () => {
    if (!isImageKitConfigured()) return ''

    return imagekit.url({
        path: '/users/default/default.jpg',
        transformation: [
            { quality: 'auto' },
            { format: 'webp' },
            { width: '400' }
        ]
    })
}

const getFallbackDefaultProfilePictureUrl = () => (
    process.env.DEFAULT_PROFILE_PICTURE_URL ||
    getImageKitDefaultProfilePictureUrl() ||
    getFrontendUrl('/assets/default.jpg')
)

const uploadDefaultProfilePicture = async () => {
    if (process.env.DEFAULT_PROFILE_PICTURE_URL) return process.env.DEFAULT_PROFILE_PICTURE_URL
    if (!isImageKitConfigured()) return getFallbackDefaultProfilePictureUrl()

    const avatarPath = await findDefaultAvatarFile()
    if (!avatarPath) return getFallbackDefaultProfilePictureUrl()

    const fileBuffer = await fs.readFile(avatarPath)
    const response = await imagekit.upload({
        file: fileBuffer,
        fileName: 'default.jpg',
        folder: '/users/default',
        useUniqueFileName: false
    })

    if (response.filePath) {
        return imagekit.url({
            path: response.filePath,
            transformation: [
                { quality: 'auto' },
                { format: 'webp' },
                { width: '400' }
            ]
        })
    }

    return response.url || getFallbackDefaultProfilePictureUrl()
}

export const getDefaultProfilePictureUrl = async () => {
    if (!defaultProfilePicturePromise) {
        defaultProfilePicturePromise = uploadDefaultProfilePicture().catch((error) => {
            defaultProfilePicturePromise = null
            console.error('Default avatar upload error:', error.message)
            return getFallbackDefaultProfilePictureUrl()
        })
    }

    return defaultProfilePicturePromise
}

export const isMissingOrFrontendDefaultAvatar = (profilePicture = '') => {
    const value = String(profilePicture || '').trim()
    return !value || /\/assets\/default\.jpg(?:$|\?)/i.test(value)
}
