import Redis from 'ioredis';

let redisClient = null;
let redisSubscriber = null;

// Redis chỉ bắt buộc ở production. Ở local dev (không có Redis),
// mọi thứ fallback về in-memory hoặc bỏ qua cache.
const IS_REDIS_ENABLED =
    process.env.REDIS_ENABLED !== 'false' &&
    (process.env.NODE_ENV === 'production' || process.env.REDIS_HOST);

const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    // Kết nối lại tự động khi bị ngắt
    retryStrategy: (times) => {
        if (times > 10) {
            console.error('❌ Redis: quá nhiều lần thất bại, dừng thử lại');
            return null;
        }
        const delay = Math.min(times * 200, 3000);
        console.log(`🔄 Redis: thử kết nối lại lần ${times} sau ${delay}ms`);
        return delay;
    },
    // QUAN TRỌNG: enableOfflineQueue: false → không queue requests khi mất kết nối.
    // Điều này giúp các `try/catch` trong code bắt được lỗi ngay thay vì bị treo.
    enableOfflineQueue: false,
    // Không throw MaxRetriesPerRequestError khi mất kết nối
    maxRetriesPerRequest: null,
    lazyConnect: true, // Kết nối lazy — không kết nối ngay khi tạo instance
};

/**
 * Lấy Redis client chính (dùng để đọc/ghi cache, publish).
 * Trả về null nếu Redis không được bật (local dev không có Redis).
 */
export const getRedisClient = () => {
    if (!IS_REDIS_ENABLED) return null;

    if (!redisClient) {
        redisClient = new Redis(REDIS_CONFIG);

        redisClient.on('connect', () => console.log('✅ Redis client connected'));
        redisClient.on('ready', () => console.log('✅ Redis client ready'));
        redisClient.on('error', (err) => {
            // Log nhưng không crash — các nơi dùng Redis đều có try/catch
            if (!err.message?.includes('ECONNREFUSED')) {
                console.error('❌ Redis client error:', err.message);
            }
        });
        redisClient.on('close', () => {
            // Chỉ log ở production để tránh spam ở local
            if (process.env.NODE_ENV === 'production') {
                console.warn('⚠️  Redis client connection closed');
            }
        });

        // Kết nối ngay (lazy connect đã bật, connect() để trigger sớm)
        redisClient.connect().catch(() => {
            // Lỗi kết nối ban đầu — không crash, retryStrategy sẽ xử lý
        });
    }
    return redisClient;
};

/**
 * Lấy Redis subscriber riêng biệt cho Socket.IO adapter.
 * Trả về null nếu Redis không được bật.
 */
export const getRedisSubscriber = () => {
    if (!IS_REDIS_ENABLED) return null;

    if (!redisSubscriber) {
        redisSubscriber = new Redis(REDIS_CONFIG);

        redisSubscriber.on('connect', () => console.log('✅ Redis subscriber connected'));
        redisSubscriber.on('error', (err) => {
            if (!err.message?.includes('ECONNREFUSED')) {
                console.error('❌ Redis subscriber error:', err.message);
            }
        });

        redisSubscriber.connect().catch(() => {});
    }
    return redisSubscriber;
};

/**
 * Đóng tất cả kết nối Redis — gọi khi server shutdown
 */
export const closeRedisConnections = async () => {
    try {
        if (redisClient) { await redisClient.quit(); redisClient = null; }
        if (redisSubscriber) { await redisSubscriber.quit(); redisSubscriber = null; }
        console.log('✅ Redis connections closed');
    } catch (err) {
        console.error('❌ Error closing Redis:', err.message);
    }
};

/**
 * Kiểm tra Redis có sẵn sàng không
 */
export const isRedisAvailable = async () => {
    if (!IS_REDIS_ENABLED) return false;
    try {
        const client = getRedisClient();
        if (!client) return false;
        const result = await client.ping();
        return result === 'PONG';
    } catch {
        return false;
    }
};
