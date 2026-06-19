import { getRedisClient } from '../configs/redis.js';

// TTL mặc định (giây)
const DEFAULT_TTL = 30;

/**
 * Tạo cache key từ request
 */
const buildCacheKey = (req, prefix = 'cache') => {
    const userId = req.userId || 'anon';
    const queryStr = JSON.stringify(req.query || {});
    return `${prefix}:${userId}:${req.path}:${queryStr}`;
};

/**
 * Middleware cache response bằng Redis.
 *
 * @param {number} ttl - Thời gian cache tính bằng giây (mặc định 30s)
 * @param {string} prefix - Prefix cho cache key (mặc định 'cache')
 * @param {function} keyFn - Hàm tùy chỉnh tạo cache key: (req) => string
 *
 * @example
 * // Cache 60s cho tất cả người dùng
 * router.get('/feed', protect, cacheResponse(60), getFeed)
 *
 * // Cache theo page + limit
 * router.get('/posts', protect, cacheResponse(30, 'posts', (req) => `posts:${req.userId}:${req.query.page}`), getPosts)
 */
export const cacheResponse = (ttl = DEFAULT_TTL, prefix = 'cache', keyFn = null) => {
    return async (req, res, next) => {
        // Chỉ cache GET requests
        if (req.method !== 'GET') return next();

        let redis;
        try {
            redis = getRedisClient();
        } catch {
            // Redis không khả dụng → bỏ qua cache, tiếp tục bình thường
            return next();
        }

        const cacheKey = keyFn ? keyFn(req) : buildCacheKey(req, prefix);

        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                const data = JSON.parse(cached);
                res.setHeader('X-Cache', 'HIT');
                return res.json(data);
            }
        } catch (err) {
            console.warn('⚠️  Cache read error:', err.message);
            return next();
        }

        // Ghi đè res.json để bắt response và lưu vào cache
        const originalJson = res.json.bind(res);
        res.json = async (data) => {
            res.setHeader('X-Cache', 'MISS');
            // Chỉ cache response thành công
            if (res.statusCode < 400 && data?.success !== false) {
                try {
                    await redis.setex(cacheKey, ttl, JSON.stringify(data));
                } catch (err) {
                    console.warn('⚠️  Cache write error:', err.message);
                }
            }
            return originalJson(data);
        };

        next();
    };
};

/**
 * Xóa cache theo pattern — gọi sau khi có mutation (create/update/delete)
 *
 * @param {string[]} patterns - Danh sách pattern key cần xóa (dùng wildcard *)
 * @example
 * await invalidateCache(['cache:*:/api/post*', `cache:${userId}:*`])
 */
export const invalidateCache = async (patterns = []) => {
    let redis;
    try {
        redis = getRedisClient();
    } catch {
        return;
    }

    for (const pattern of patterns) {
        try {
            // Dùng SCAN thay vì KEYS để không block Redis
            let cursor = '0';
            do {
                const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = newCursor;
                if (keys.length > 0) {
                    await redis.del(...keys);
                }
            } while (cursor !== '0');
        } catch (err) {
            console.warn(`⚠️  Cache invalidation error for pattern "${pattern}":`, err.message);
        }
    }
};

/**
 * Lấy/set giá trị từ cache với callback fallback (Cache-Aside pattern)
 *
 * @param {string} key - Cache key
 * @param {function} fetchFn - Async function trả về data nếu cache miss
 * @param {number} ttl - TTL tính bằng giây
 */
export const withCache = async (key, fetchFn, ttl = DEFAULT_TTL) => {
    let redis;
    try {
        redis = getRedisClient();
        const cached = await redis.get(key);
        if (cached) return JSON.parse(cached);
    } catch {
        // Redis lỗi → fallback về fetchFn
        return fetchFn();
    }

    const data = await fetchFn();

    try {
        if (data !== null && data !== undefined) {
            await redis.setex(key, ttl, JSON.stringify(data));
        }
    } catch (err) {
        console.warn('⚠️  Cache set error:', err.message);
    }

    return data;
};
