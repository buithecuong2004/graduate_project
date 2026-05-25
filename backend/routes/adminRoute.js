import express from 'express';
import {
    deleteAdminPost,
    getAdminDashboard,
    getAdminPosts,
    getAdminReports,
    getAdminUsers,
    updateAdminPostVisibility,
    updateAdminReport,
    updateAdminUser
} from '../controllers/adminController.js';
import { requireAdmin } from '../middlewares/admin.js';
import { protect } from '../middlewares/auth.js';

const adminRouter = express.Router();

adminRouter.use(protect, requireAdmin);

adminRouter.get('/dashboard', getAdminDashboard);
adminRouter.get('/users', getAdminUsers);
adminRouter.patch('/users/:userId', updateAdminUser);
adminRouter.get('/posts', getAdminPosts);
adminRouter.patch('/posts/:postId/visibility', updateAdminPostVisibility);
adminRouter.delete('/posts/:postId', deleteAdminPost);
adminRouter.get('/reports', getAdminReports);
adminRouter.patch('/reports/:reportId', updateAdminReport);

export default adminRouter;
