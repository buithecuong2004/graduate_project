import mongoose from "mongoose";

const connectDB = async () => {
    try {
        const workerIndex = process.env.NODE_APP_INSTANCE ?? 'main';
        console.log(`🔄 [Worker ${workerIndex}] Connecting to MongoDB...`)
        
        const connection = await mongoose.connect(`${process.env.MONGODB_URL}/Tarous`, {
            // ─── Connection Pool ─────────────────────────────────────────────
            // 2 PM2 workers × 20 = 40 tổng connections — an toàn cho Atlas M10+
            maxPoolSize: 20,
            minPoolSize: 5,

            // ─── Timeouts ────────────────────────────────────────────────────
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,

            // ─── Reliability ─────────────────────────────────────────────────
            retryWrites: true,
            heartbeatFrequencyMS: 10000,   // Kiểm tra kết nối mỗi 10 giây

            // ─── Performance ─────────────────────────────────────────────────
            // Tắt autoIndex trong production — indexes phải được tạo thủ công
            // để tránh tốn tài nguyên khi khởi động
            autoIndex: process.env.NODE_ENV !== 'production',
        })
        
        console.log(`✅ [Worker ${workerIndex}] Database connected (pool: 5–20)`)
        return connection
    } catch (error) {
        console.error('❌ Database connection failed:', error.message)
        console.error('Make sure:')
        console.error('1. MongoDB URL is correct in .env')
        console.error('2. Your EC2 IP is whitelisted in MongoDB Atlas')
        console.error('3. Your security group allows outbound port 27017')
        
        throw error
    }
}

// Xử lý graceful shutdown — đóng pool trước khi process exit
const gracefulShutdown = async (signal) => {
    console.log(`\n🔄 Received ${signal}. Closing MongoDB connection...`)
    await mongoose.connection.close(false)
    console.log('✅ MongoDB connection closed.')
}

process.on('SIGINT', () => gracefulShutdown('SIGINT').then(() => process.exit(0)))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM').then(() => process.exit(0)))

export default connectDB