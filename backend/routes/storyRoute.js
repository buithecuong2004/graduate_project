import express from 'express'
import { upload } from '../configs/multer.js'
import { protect } from '../middlewares/auth.js'
import { addUserStory, getStories, getStoryById, deleteStory, reactStory, replyStory } from '../controllers/storyController.js'

const storyRouter = express.Router()

storyRouter.post('/create', upload.single('media'), protect, addUserStory)
storyRouter.post('/get', protect, getStories)
storyRouter.get('/:storyId', protect, getStoryById)
storyRouter.post('/delete', protect, deleteStory)
storyRouter.post('/react', protect, reactStory)
storyRouter.post('/reply', protect, replyStory)

export default storyRouter
