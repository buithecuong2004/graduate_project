import express from 'express';
import { createCommentReport, createMessageReport, createPostReport, createUserReport } from '../controllers/reportController.js';
import { protect } from '../middlewares/auth.js';

const reportRouter = express.Router();

reportRouter.post('/post/:postId', protect, createPostReport);
reportRouter.post('/comment/:commentId', protect, createCommentReport);
reportRouter.post('/message/:messageId', protect, createMessageReport);
reportRouter.post('/user/:userId', protect, createUserReport);

export default reportRouter;
