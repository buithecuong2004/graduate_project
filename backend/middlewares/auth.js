import jwt from 'jsonwebtoken'

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

        // Attach userId to request for controllers to use
        req.userId = decoded.userId
        next()
    } catch (error) {
        return res.json({ success: false, message: "Invalid or expired token" })
    }
}