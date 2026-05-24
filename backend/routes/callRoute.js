import express from 'express'
import { protect } from '../middlewares/auth.js'
import { getIceConfig, hasTurnServer } from '../configs/iceServers.js'

const callRouter = express.Router()

callRouter.get('/ice-config', protect, (req, res) => {
    const iceConfig = getIceConfig()
    res.json({
        success: true,
        iceConfig,
        hasTurn: hasTurnServer(iceConfig),
    })
})

export default callRouter
