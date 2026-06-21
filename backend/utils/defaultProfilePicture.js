import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { uploadFile, getPublicUrl } from '../configs/storage.js'
import { getFrontendUrl } from './appUrl.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_AVATAR_PATHS = [
    path.resolve(__dirname, '../assets/default.jpg'),
    path.resolve(__dirname, '../../frontend/public/assets/default.jpg')
]

// S3 key where the default avatar lives (uploaded once, reused)
const DEFAULT_AVATAR_S3_KEY = 'users/default/default.jpg'

let defaultProfilePicturePromise = null

const isS3Configured = () => (
    Boolean(process.env.AWS_ACCESS_KEY_ID) &&
    Boolean(process.env.AWS_SECRET_ACCESS_KEY) &&
    Boolean(process.env.AWS_S3_BUCKET) &&
    Boolean(process.env.AWS_S3_REGION)
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

const getS3DefaultProfilePictureUrl = () => {
    if (!isS3Configured()) return ''
    return getPublicUrl(DEFAULT_AVATAR_S3_KEY)
}

const getFallbackDefaultProfilePictureUrl = () => (
    process.env.DEFAULT_PROFILE_PICTURE_URL ||
    getS3DefaultProfilePictureUrl() ||
    getFrontendUrl('/assets/default.jpg')
)

const uploadDefaultProfilePicture = async () => {
    if (process.env.DEFAULT_PROFILE_PICTURE_URL) return process.env.DEFAULT_PROFILE_PICTURE_URL
    if (!isS3Configured()) return getFallbackDefaultProfilePictureUrl()

    const avatarPath = await findDefaultAvatarFile()
    if (!avatarPath) return getFallbackDefaultProfilePictureUrl()

    const fileBuffer = await fs.readFile(avatarPath)
    const response = await uploadFile({
        fileBuffer,
        fileName: 'default.jpg',
        fixedKey: DEFAULT_AVATAR_S3_KEY,  // always stored at the same S3 path
        mimeType: 'image/jpeg',
    })

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
