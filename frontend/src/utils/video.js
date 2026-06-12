/**
 * Lấy poster thumbnail từ URL video ImageKit.
 * ImageKit hỗ trợ lấy frame từ video bằng transformation:
 * - so-1  (start_offset=1s) lấy frame ở giây thứ 1
 * - f-jpg chuyển sang JPG
 *
 * Ví dụ:
 *   Input:  https://ik.imagekit.io/xxx/video.mp4
 *   Output: https://ik.imagekit.io/xxx/tr:so-1,f-jpg/video.mp4
 *
 * @param {string} videoUrl - URL video gốc
 * @returns {string|undefined}
 */
export const getVideoPoster = (videoUrl) => {
    if (!videoUrl || typeof videoUrl !== 'string') return undefined

    // ImageKit URL
    if (videoUrl.includes('ik.imagekit.io') || videoUrl.includes('imagekit.io')) {
        try {
            // Chèn transformation tr:so-1,f-jpg sau endpoint, trước file path
            // https://ik.imagekit.io/[id]/tr:so-1,f-jpg/[folder/file.mp4]
            const url = new URL(videoUrl)
            const pathParts = url.pathname.split('/')
            // pathParts: ['', 'imagekit_id', 'folder', 'file.mp4']
            // Chèn transformation sau phần index 1 (imagekit_id)
            pathParts.splice(2, 0, 'tr:so-1,f-jpg')
            url.pathname = pathParts.join('/')
            return url.toString()
        } catch {
            return undefined
        }
    }

    // Cloudinary URL (dự phòng)
    if (videoUrl.includes('res.cloudinary.com')) {
        try {
            const withTransform = videoUrl.replace('/upload/', '/upload/so_2,q_80/')
            return withTransform.replace(/\.(mp4|webm|ogg|mov|avi|mkv)(\?.*)?$/i, '.jpg')
        } catch {
            return undefined
        }
    }

    return undefined
}
