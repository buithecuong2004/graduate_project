import express from 'express'
import passport from 'passport'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../models/User.js'
import { getFrontendUrl } from '../utils/appUrl.js'

const authRouter = express.Router()

// Helper: generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { userId: user._id.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    )
}

// ─── Google OAuth ───────────────────────────────────────────────────────────
authRouter.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}))

authRouter.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: getFrontendUrl('/?error=google_auth_failed') }),
    (req, res) => {
        const token = generateToken(req.user)
        res.redirect(getFrontendUrl(`/auth/callback?token=${token}`))
    }
)

// ─── Facebook OAuth ─────────────────────────────────────────────────────────
authRouter.get('/facebook', passport.authenticate('facebook', {
    scope: ['email']
}))

authRouter.get('/facebook/callback',
    passport.authenticate('facebook', { session: false, failureRedirect: getFrontendUrl('/?error=facebook_auth_failed') }),
    (req, res) => {
        const token = generateToken(req.user)
        res.redirect(getFrontendUrl(`/auth/callback?token=${token}`))
    }
)

// ─── Verify current token ──────────────────────────────────────────────────
authRouter.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.json({ success: false, message: 'No token provided' })
        }

        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        res.json({ success: true, userId: decoded.userId })
    } catch (error) {
        res.json({ success: false, message: 'Invalid or expired token' })
    }
})

// ─── Logout ─────────────────────────────────────────────────────────────────
authRouter.post('/logout', (req, res) => {
    // Token-based auth: client-side handles token deletion
    // This endpoint exists for any server-side cleanup if needed
    res.json({ success: true, message: 'Logged out successfully' })
})

export default authRouter
