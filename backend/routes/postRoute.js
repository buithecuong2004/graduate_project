import express from 'express';
import { addPost, getFeedPosts, likePost, reactPost, addComment, getComments, deleteComment, likeComment, reactComment, deletePost, addReply, getReplies, deleteReply, getPostById, sharePost } from '../controllers/postController.js';
import { upload } from '../configs/multer.js';
import { protect } from '../middlewares/auth.js';

const postRouter = express.Router()

postRouter.post('/add', upload.fields([
  { name: 'images', maxCount: 4 },
  { name: 'video', maxCount: 1 }
]), protect, addPost)
postRouter.get('/feed', protect, getFeedPosts)
postRouter.get('/:postId', protect, getPostById)
postRouter.post('/like', protect, likePost)
postRouter.post('/react', protect, reactPost)
postRouter.post('/share', protect, sharePost)
postRouter.post('/delete', protect, deletePost)
postRouter.post('/comment/add', protect, addComment)
postRouter.get('/comment/:postId', protect, getComments)
postRouter.post('/comment/delete', protect, deleteComment)
postRouter.post('/comment/like', protect, likeComment)
postRouter.post('/comment/react', protect, reactComment)
postRouter.post('/reply/add', protect, addReply)
postRouter.get('/reply/:commentId', protect, getReplies)
postRouter.post('/reply/delete', protect, deleteReply)

export default postRouter
