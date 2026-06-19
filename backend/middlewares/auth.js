import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { sendAccountLocked } from '../utils/authMessages.js'

// Cache user auth status trong Redis để tránh DB query mỗi request
// TTL 5 phút — đủ ngắn để phản ánh thay đổi trạng thái account kịp thời
const AUTH_CACHE_TTL = 300; // giây
const AUTH_CACHE_PREFIX = 'auth:user:';

let redisClient = null;
const getRedis = async () => {
    if (redisClient) return redisClient;
    try {
        const { getRedisClient } = await import('../configs/redis.js');
        redisClient = getRedisClient();
        return redisClient;
    } catch {
        return null;
    }
};

export const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.json({ success: false, message: "Not authenticated" })
        }

        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        if (!decoded.userId) {
            return res.json({ success: false, message: "Invalid token" })
        }

        const cacheKey = `${AUTH_CACHE_PREFIX}${decoded.userId}`;
        let accountStatus = null;

        // Thử lấy từ Redis cache trước
        try {
            const redis = await getRedis();
            if (redis) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    accountStatus = cached; // 'active' | 'locked' | 'not_found'
                }
            }
        } catch { /* Redis lỗi → fallback về DB */ }

        // Cache miss → query DB
        if (!accountStatus) {
            const user = await User.findById(decoded.userId).select('account_status')
            if (!user) {
                // Cache kết quả 'not found' ngắn hơn (30s) để tránh lặp query
                try {
                    const redis = await getRedis();
                    if (redis) await redis.setex(cacheKey, 30, 'not_found');
                } catch { /* ignore */ }
                return res.json({ success: false, message: "User not found" })
            }

            accountStatus = user.account_status || 'active';

            // Lưu vào cache
            try {
                const redis = await getRedis();
                if (redis) await redis.setex(cacheKey, AUTH_CACHE_TTL, accountStatus);
            } catch { /* ignore */ }
        }

        if (accountStatus === 'not_found') {
            return res.json({ success: false, message: "User not found" })
        }

        if (accountStatus === 'locked') {
            return sendAccountLocked(res)
        }

        req.userId = decoded.userId
        next()
    } catch (error) {
        return res.json({ success: false, message: "Invalid or expired token" })
    }
}

/**
 * Xóa cache auth khi admin thay đổi trạng thái account
 * Gọi hàm này sau khi lock/unlock user
 */
export const invalidateAuthCache = async (userId) => {
    try {
        const { getRedisClient } = await import('../configs/redis.js');
        const redis = getRedisClient();
        await redis.del(`${AUTH_CACHE_PREFIX}${userId}`);
    } catch { /* ignore */ }
}
