import express from 'express'
import { upload } from '../configs/multer.js'
import { protect } from '../middlewares/auth.js'
import { addUserStory, getStories, deleteStory } from '../controllers/storyController.js'

const storyRouter = express.Router()

storyRouter.post('/create', upload.single('media'), protect, addUserStory)
storyRouter.post('/get', protect, getStories)
storyRouter.post('/delete', protect, deleteStory)

export default storyRouter
