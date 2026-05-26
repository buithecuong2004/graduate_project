import express from 'express'
import passport from 'passport'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { promisify } from 'util'
import User from '../models/User.js'
import sendEmail from '../configs/nodeMailer.js'
import { getFrontendUrl } from '../utils/appUrl.js'
import { ACCOUNT_LOCKED_CODE, ACCOUNT_LOCKED_MESSAGE, sendAccountLocked } from '../utils/authMessages.js'
import { getDefaultProfilePictureUrl } from '../utils/defaultProfilePicture.js'

const authRouter = express.Router()
const scryptAsync = promisify(crypto.scrypt)
const RESET_OTP_EXPIRY_MS = 10 * 60 * 1000
const MAX_RESET_OTP_ATTEMPTS = 5

// Helper: generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { userId: user._id.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    )
}

const buildAuthUser = (user) => ({
    _id: user._id,
    email: user.email,
    full_name: user.full_name,
    username: user.username,
    role: user.role,
    account_status: user.account_status,
    profile_picture: user.profile_picture
})

// ─── Google OAuth ───────────────────────────────────────────────────────────
const normalizeEmail = (email = '') => email.trim().toLowerCase()

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[char])

const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString('hex')
    const derivedKey = await scryptAsync(password, salt, 64)
    return `${salt}:${derivedKey.toString('hex')}`
}

const verifyPassword = async (password, passwordHash = '') => {
    const [salt, storedHash] = passwordHash.split(':')
    if (!salt || !storedHash) return false

    const derivedKey = await scryptAsync(password, salt, 64)
    const storedBuffer = Buffer.from(storedHash, 'hex')
    if (storedBuffer.length !== derivedKey.length) return false

    return crypto.timingSafeEqual(storedBuffer, derivedKey)
}

const generateOtp = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0')

const hashOtp = (email, otp) => crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${normalizeEmail(email)}:${otp}`)
    .digest('hex')

const safeCompareHex = (left = '', right = '') => {
    if (!left || !right || left.length !== right.length) return false

    const leftBuffer = Buffer.from(left, 'hex')
    const rightBuffer = Buffer.from(right, 'hex')
    if (leftBuffer.length !== rightBuffer.length) return false

    return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

const clearPasswordResetOtp = (user) => {
    user.password_reset_otp_hash = undefined
    user.password_reset_otp_expires_at = undefined
    user.password_reset_otp_attempts = 0
}

const buildPasswordResetEmail = (user, otp) => {
    const displayName = escapeHtml(user.full_name || user.username || 'bạn')

    return `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #0f172a;">
            <h2>Xin chào ${displayName},</h2>
            <p>Bạn vừa yêu cầu đặt lại mật khẩu Tarous.</p>
            <p>Mã OTP của bạn là:</p>
            <div style="display: inline-block; padding: 14px 22px; margin: 10px 0; background: #ecfeff; color: #0e7490; font-size: 28px; font-weight: 800; letter-spacing: 8px; border-radius: 12px;">
                ${otp}
            </div>
            <p>Mã này có hiệu lực trong 10 phút. Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này.</p>
            <br/>
            <p>Trân trọng,<br/>Tarous</p>
        </div>
    `
}

const getUsernameBase = (fullName, email) => {
    const source = fullName || email.split('@')[0] || 'user'
    const base = source
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 24)

    return base || `user${Date.now()}`
}

const generateUniqueUsername = async (fullName, email) => {
    const base = getUsernameBase(fullName, email)
    let username = base
    let suffix = 0

    while (await User.exists({ username })) {
        suffix += 1
        username = `${base}${suffix}`
    }

    return username
}

authRouter.post('/register', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email)
        const fullName = (req.body.full_name || req.body.fullName || req.body.name || '').trim()
        const password = req.body.password || ''
        const confirmPassword = req.body.confirmPassword || req.body.confirm_password || ''

        if (!isValidEmail(email)) {
            return res.json({ success: false, message: 'Email không hợp lệ' })
        }

        if (fullName.length < 2) {
            return res.json({ success: false, message: 'Tên phải có ít nhất 2 ký tự' })
        }

        if (password.length < 6) {
            return res.json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' })
        }

        if (password !== confirmPassword) {
            return res.json({ success: false, message: 'Xác thực mật khẩu không khớp' })
        }

        const existingUser = await User.findOne({ email })
        if (existingUser) {
            return res.json({ success: false, message: 'Email đã được sử dụng' })
        }

        const passwordHash = await hashPassword(password)
        const username = await generateUniqueUsername(fullName, email)
        const profilePicture = await getDefaultProfilePictureUrl()
        const user = await User.create({
            email,
            full_name: fullName,
            username,
            provider: 'local',
            providerId: `local:${email}`,
            profile_picture: profilePicture,
            password_hash: passwordHash,
        })

        const token = generateToken(user)
        res.json({ success: true, message: 'Đăng ký thành công', token, user: buildAuthUser(user) })
    } catch (error) {
        console.error('Register error:', error)
        res.json({ success: false, message: error.message })
    }
})

authRouter.post('/login', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email)
        const password = req.body.password || ''

        if (!isValidEmail(email) || !password) {
            return res.json({ success: false, message: 'Email hoặc mật khẩu không hợp lệ' })
        }

        const user = await User.findOne({ email }).select('+password_hash')
        if (!user || !user.password_hash) {
            return res.json({ success: false, message: 'Email hoặc mật khẩu không đúng' })
        }

        const isPasswordValid = await verifyPassword(password, user.password_hash)
        if (!isPasswordValid) {
            return res.json({ success: false, message: 'Email hoặc mật khẩu không đúng' })
        }

        if (user.account_status === 'locked') {
            return res.json({ success: false, code: ACCOUNT_LOCKED_CODE, message: ACCOUNT_LOCKED_MESSAGE })
        }

        const token = generateToken(user)
        res.json({ success: true, message: 'Đăng nhập thành công', token, user: buildAuthUser(user) })
    } catch (error) {
        console.error('Login error:', error)
        res.json({ success: false, message: error.message })
    }
})

authRouter.post('/forgot-password', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email)

        if (!isValidEmail(email)) {
            return res.json({ success: false, message: 'Email không hợp lệ' })
        }

        const user = await User.findOne({ email })
        if (!user) {
            return res.json({ success: false, message: 'Email chưa được đăng ký' })
        }

        const otp = generateOtp()
        user.password_reset_otp_hash = hashOtp(email, otp)
        user.password_reset_otp_expires_at = new Date(Date.now() + RESET_OTP_EXPIRY_MS)
        user.password_reset_otp_attempts = 0
        await user.save()

        try {
            await sendEmail({
                to: email,
                subject: 'Mã OTP đặt lại mật khẩu Tarous',
                body: buildPasswordResetEmail(user, otp)
            })
        } catch (emailError) {
            console.error('Password reset email error:', emailError)
            clearPasswordResetOtp(user)
            await user.save()
            return res.json({ success: false, message: 'Không thể gửi mã OTP, vui lòng thử lại' })
        }

        res.json({ success: true, message: 'Mã OTP đã được gửi tới email của bạn' })
    } catch (error) {
        console.error('Forgot password error:', error)
        res.json({ success: false, message: error.message })
    }
})

authRouter.post('/reset-password', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email)
        const otp = String(req.body.otp || '').trim()
        const password = req.body.password || ''
        const confirmPassword = req.body.confirmPassword || req.body.confirm_password || ''

        if (!isValidEmail(email)) {
            return res.json({ success: false, message: 'Email không hợp lệ' })
        }

        if (!/^\d{6}$/.test(otp)) {
            return res.json({ success: false, message: 'Mã OTP phải gồm 6 chữ số' })
        }

        if (password.length < 6) {
            return res.json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' })
        }

        if (password !== confirmPassword) {
            return res.json({ success: false, message: 'Xác thực mật khẩu không khớp' })
        }

        const user = await User.findOne({ email }).select(
            '+password_hash +password_reset_otp_hash +password_reset_otp_expires_at +password_reset_otp_attempts'
        )

        if (!user || !user.password_reset_otp_hash || !user.password_reset_otp_expires_at) {
            return res.json({ success: false, message: 'Mã OTP không hợp lệ hoặc đã hết hạn' })
        }

        user.password_reset_otp_attempts = user.password_reset_otp_attempts || 0

        if (user.password_reset_otp_expires_at.getTime() < Date.now()) {
            clearPasswordResetOtp(user)
            await user.save()
            return res.json({ success: false, message: 'Mã OTP đã hết hạn, vui lòng gửi lại mã mới' })
        }

        if (user.password_reset_otp_attempts >= MAX_RESET_OTP_ATTEMPTS) {
            clearPasswordResetOtp(user)
            await user.save()
            return res.json({ success: false, message: 'Mã OTP đã bị khóa, vui lòng gửi lại mã mới' })
        }

        const isOtpValid = safeCompareHex(user.password_reset_otp_hash, hashOtp(email, otp))
        if (!isOtpValid) {
            user.password_reset_otp_attempts += 1
            await user.save()
            return res.json({ success: false, message: 'Mã OTP không đúng' })
        }

        user.password_hash = await hashPassword(password)
        clearPasswordResetOtp(user)
        await user.save()

        res.json({ success: true, message: 'Đổi mật khẩu thành công, vui lòng đăng nhập lại' })
    } catch (error) {
        console.error('Reset password error:', error)
        res.json({ success: false, message: error.message })
    }
})

authRouter.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}))

authRouter.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: getFrontendUrl('/?error=google_auth_failed') }),
    (req, res) => {
        if (req.user?.account_status === 'locked') {
            return res.redirect(getFrontendUrl('/?error=account_locked'))
        }
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
        if (req.user?.account_status === 'locked') {
            return res.redirect(getFrontendUrl('/?error=account_locked'))
        }
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

        const user = await User.findById(decoded.userId)
        if (user?.account_status === 'locked') {
            return sendAccountLocked(res)
        }
        res.json({ success: true, userId: decoded.userId, user: user ? buildAuthUser(user) : null })
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
