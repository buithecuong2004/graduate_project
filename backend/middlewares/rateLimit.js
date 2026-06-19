import rateLimit from 'express-rate-limit';

/**
 * Tạo handler trả về lỗi 429 chuẩn JSON (thay vì HTML mặc định của express-rate-limit)
 */
const jsonHandler = (req, res) => {
    res.status(429).json({
        success: false,
        message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
        retryAfter: res.getHeader('Retry-After'),
    });
};

/**
 * Rate limit chung: 200 requests / 1 phút / IP
 * Áp dụng cho tất cả /api/* routes
 */
export const generalLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 phút
    max: 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: jsonHandler,
    skip: (req) => {
        // Bỏ qua health check
        return req.path === '/' || req.path === '/health';
    },
});

/**
 * Rate limit nghiêm ngặt cho Auth: 15 requests / 15 phút / IP
 * Mục đích: chống brute-force đăng nhập
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 phút
    max: 15,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.',
            retryAfter: res.getHeader('Retry-After'),
        });
    },
});

/**
 * Rate limit cho upload media: 10 requests / 5 phút / IP
 * Mục đích: chống spam upload gây tốn băng thông / ImageKit quota
 */
export const uploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,    // 5 phút
    max: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Quá nhiều lần upload. Vui lòng thử lại sau 5 phút.',
            retryAfter: res.getHeader('Retry-After'),
        });
    },
});

/**
 * Rate limit cho Socket.IO connections: 5 kết nối mới / giây / IP
 * Không dùng trực tiếp làm Express middleware — dùng trong socket.js handshake
 */
export const socketConnectionLimiter = rateLimit({
    windowMs: 10 * 1000,        // 10 giây
    max: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: jsonHandler,
});

/**
 * Rate limit cho AI features (Gemini summary): 5 requests / phút / user
 */
export const aiLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 phút
    max: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.userId || req.ip, // Dùng userId nếu đã auth
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Giới hạn tính năng AI. Vui lòng thử lại sau 1 phút.',
            retryAfter: res.getHeader('Retry-After'),
        });
    },
});
