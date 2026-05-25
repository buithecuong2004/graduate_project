import dotenv from 'dotenv';
import crypto from 'crypto';
import { promisify } from 'util';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const scryptAsync = promisify(crypto.scrypt);

const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scryptAsync(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
};

const getUsername = async (baseUsername, email) => {
    let username = baseUsername;
    let suffix = 0;

    while (await User.exists({ username, email: { $ne: email } })) {
        suffix += 1;
        username = `${baseUsername}${suffix}`;
    }

    return username;
};

const main = async () => {
    const email = (process.env.ADMIN_EMAIL || 'admin@tarous.local').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const fullName = process.env.ADMIN_FULL_NAME || 'Tarous Admin';
    const profilePicture = process.env.ADMIN_PROFILE_PICTURE ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0891b2&color=fff`;

    if (!process.env.MONGODB_URL) {
        throw new Error('Missing MONGODB_URL');
    }

    await mongoose.connect(`${process.env.MONGODB_URL}/Tarous`, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 30000,
        retryWrites: true,
    });

    const existingUser = await User.findOne({ email }).select('+password_hash');
    const passwordHash = await hashPassword(password);
    if (existingUser) {
        existingUser.role = 'admin';
        existingUser.account_status = 'active';
        existingUser.locked_at = null;
        existingUser.locked_reason = '';
        existingUser.password_hash = passwordHash;
        existingUser.provider = existingUser.provider || 'local';
        existingUser.providerId = existingUser.providerId || `local:${email}`;
        if (!existingUser.profile_picture) existingUser.profile_picture = profilePicture;
        await existingUser.save();
        console.log(`Admin account updated: ${email}`);
        return;
    }

    const usernameBase = email.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'admin';
    const username = await getUsername(usernameBase, email);

    await User.create({
        email,
        full_name: fullName,
        username,
        role: 'admin',
        account_status: 'active',
        provider: 'local',
        providerId: `local:${email}`,
        password_hash: passwordHash,
        profile_picture: profilePicture,
    });

    console.log(`Admin account created: ${email}`);
};

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
