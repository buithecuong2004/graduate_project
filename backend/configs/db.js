import mongoose from "mongoose";

const connectDB = async () => {
    try {
        console.log('🔄 Connecting to MongoDB...')
        
        // Configure mongoose connection with timeouts
        const connection = await mongoose.connect(`${process.env.MONGODB_URL}/Tarous`, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 30000,
            retryWrites: true,
        })
        
        console.log('✅ Database connected successfully')
        return connection
    } catch (error) {
        console.error('❌ Database connection failed:', error.message)
        console.error('Make sure:')
        console.error('1. MongoDB URL is correct in .env')
        console.error('2. Your IP is whitelisted in MongoDB Atlas')
        console.error('3. Your network/firewall allows connections')
        
        // Re-throw the error so server.js knows the connection failed
        throw error
    }
}

export default connectDB