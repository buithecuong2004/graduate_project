import express from 'express';
import { addPost, getFeedPosts, likePost, addComment, getComments, deleteComment, likeComment, deletePost } from '../controllers/postController.js';
import { upload } from '../configs/multer.js';
import { protect } from '../middlewares/auth.js';

const postRouter = express.Router()

postRouter.post('/add', upload.fields([
  { name: 'images', maxCount: 4 },
  { name: 'video', maxCount: 1 }
]), protect, addPost)
postRouter.get('/feed', protect, getFeedPosts)
postRouter.post('/like', protect, likePost)
postRouter.post('/delete', protect, deletePost)
postRouter.post('/comment/add', protect, addComment)
postRouter.get('/comment/:postId', protect, getComments)
postRouter.post('/comment/delete', protect, deleteComment)
postRouter.post('/comment/like', protect, likeComment)

export default postRouter
