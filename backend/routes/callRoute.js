import express from 'express'
import { protect } from '../middlewares/auth.js'
import { getIceConfig } from '../configs/iceServers.js'

const callRouter = express.Router()

callRouter.get('/ice-config', protect, (req, res) => {
    res.json({ success: true, iceConfig: getIceConfig() })
})

export default callRouter
