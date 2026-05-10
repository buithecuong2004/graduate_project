import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as FacebookStrategy } from 'passport-facebook'
import User from '../models/User.js'

// ─── Google OAuth Strategy ──────────────────────────────────────────────────
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/auth/google/callback`,
    scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails?.[0]?.value || ''
        const fullName = profile.displayName || ''
        const profilePicture = profile.photos?.[0]?.value || ''

        // Find existing user by provider + providerId
        let user = await User.findOne({ provider: 'google', providerId: profile.id })

        // If not found by provider, try finding by email (in case they registered with another method)
        if (!user && email) {
            user = await User.findOne({ email })
            if (user) {
                // Link existing account with Google
                user.provider = 'google'
                user.providerId = profile.id
                if (!user.profile_picture) user.profile_picture = profilePicture
                await user.save()
            }
        }

        // If still not found, create new user
        if (!user) {
            let username = email.split('@')[0]
            const existingUsername = await User.findOne({ username })
            if (existingUsername) {
                username = username + Math.floor(Math.random() * 10000)
            }

            user = await User.create({
                email,
                full_name: fullName || email,
                profile_picture: profilePicture,
                username,
                provider: 'google',
                providerId: profile.id
            })
        }

        return done(null, user)
    } catch (error) {
        return done(error, null)
    }
}))

// ─── Facebook OAuth Strategy ────────────────────────────────────────────────
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/auth/facebook/callback`,
    profileFields: ['id', 'displayName', 'emails', 'photos']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails?.[0]?.value || ''
        const fullName = profile.displayName || ''
        const profilePicture = profile.photos?.[0]?.value || ''

        // Find existing user by provider + providerId
        let user = await User.findOne({ provider: 'facebook', providerId: profile.id })

        // If not found by provider, try finding by email
        if (!user && email) {
            user = await User.findOne({ email })
            if (user) {
                user.provider = 'facebook'
                user.providerId = profile.id
                if (!user.profile_picture) user.profile_picture = profilePicture
                await user.save()
            }
        }

        // If still not found, create new user
        if (!user) {
            let username = email ? email.split('@')[0] : `user${Date.now()}`
            const existingUsername = await User.findOne({ username })
            if (existingUsername) {
                username = username + Math.floor(Math.random() * 10000)
            }

            user = await User.create({
                email: email || `fb_${profile.id}@placeholder.com`,
                full_name: fullName || `User ${profile.id}`,
                profile_picture: profilePicture,
                username,
                provider: 'facebook',
                providerId: profile.id
            })
        }

        return done(null, user)
    } catch (error) {
        return done(error, null)
    }
}))

// ─── Serialize / Deserialize ────────────────────────────────────────────────
passport.serializeUser((user, done) => {
    done(null, user._id)
})

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id)
        done(null, user)
    } catch (error) {
        done(error, null)
    }
})

export default passport
