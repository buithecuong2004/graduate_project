import express from 'express';
import { protect } from '../middlewares/auth.js';
import { upload } from '../configs/multer.js';
import {
    addGroupMembers,
    createGroupChat,
    getGroupChatById,
    getMyGroupChats,
    kickGroupMember,
    leaveGroupChat,
    updateGroupChat
} from '../controllers/groupController.js';

const groupRouter = express.Router();

groupRouter.get('/', protect, getMyGroupChats);
groupRouter.post('/', protect, createGroupChat);
groupRouter.get('/:groupId', protect, getGroupChatById);
groupRouter.post('/:groupId', protect, upload.fields([{ name: 'avatar', maxCount: 1 }]), updateGroupChat);
groupRouter.post('/:groupId/members', protect, addGroupMembers);
groupRouter.post('/:groupId/kick', protect, kickGroupMember);
groupRouter.post('/:groupId/leave', protect, leaveGroupChat);

export default groupRouter;
