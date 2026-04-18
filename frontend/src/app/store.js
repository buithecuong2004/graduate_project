import { configureStore } from '@reduxjs/toolkit'
import userReducer from '../features/user/userSlice.js'
import connectionsReducer from '../features/connections/connectionsSlice.js'
import messagesReducer from '../features/messages/messagesSlice.js'
import postsReducer from '../features/posts/postSlice.js'
import notificationsReducer from '../features/notifications/notificationsSlice.js'

export const store = configureStore({
    reducer: {
        user: userReducer,
        connections: connectionsReducer,
        messages: messagesReducer,
        posts: postsReducer,
        notifications: notificationsReducer,
    }
})