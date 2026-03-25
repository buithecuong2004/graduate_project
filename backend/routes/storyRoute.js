import express from 'express'
import { upload } from '../configs/multer.js'
import { protect } from '../middlewares/auth.js'
import { addUserStory, getStories } from '../controllers/storyController'

const storyRouter = express.Router()

storyRouter.post('/create', upload.single('media'), protect, addUserStory)
storyRouter.post('/get', protect, getStories)

export default storyRouter
