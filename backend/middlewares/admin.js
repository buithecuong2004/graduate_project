import User from '../models/User.js';
import { sendAccountLocked } from '../utils/authMessages.js';

export const requireAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId).select('role account_status');

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        if (user.account_status === 'locked') {
            return sendAccountLocked(res);
        }

        if (user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin permission required' });
        }

        req.adminUser = user;
        next();
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
