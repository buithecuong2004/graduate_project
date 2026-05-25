import express from 'express';
import { createPostReport } from '../controllers/reportController.js';
import { protect } from '../middlewares/auth.js';

const reportRouter = express.Router();

reportRouter.post('/post/:postId', protect, createPostReport);

export default reportRouter;
