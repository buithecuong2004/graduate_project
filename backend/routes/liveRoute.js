import express from 'express';
import { protect } from '../middlewares/auth.js';
import {
    addLiveComment,
    endLiveStream,
    getActiveLiveStreams,
    getLiveComments,
    getLiveStreamById,
    reactToLiveStream,
    startLiveStream
} from '../controllers/liveController.js';

const liveRouter = express.Router();

liveRouter.get('/active', protect, getActiveLiveStreams);
liveRouter.post('/start', protect, startLiveStream);
liveRouter.get('/:streamId', protect, getLiveStreamById);
liveRouter.post('/:streamId/end', protect, endLiveStream);
liveRouter.get('/:streamId/comments', protect, getLiveComments);
liveRouter.post('/:streamId/comment', protect, addLiveComment);
liveRouter.post('/:streamId/react', protect, reactToLiveStream);

export default liveRouter;
