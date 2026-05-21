import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    notifications: [],
    unreadCount: 0,
    dummyData: null,
};

const getNotificationId = (notification = {}) => {
    const { type, data = {}, id } = notification;
    if (id) return id;

    switch (type) {
        case 'friend_request':
            return `friend_request:${data.connection_id || data.from_user?._id || Date.now()}`;
        case 'connection_accepted':
            return `connection_accepted:${data.connection_id || data.from_user?._id || Date.now()}`;
        case 'new_story':
            return `new_story:${data.story_id || data.story?._id || Date.now()}`;
        case 'new_post':
            return `new_post:${data.post_id || data.post?._id || Date.now()}`;
        case 'new_comment':
            return `new_comment:${data.comment?._id || `${data.post_id}:${data.comment?.user?._id}` || Date.now()}`;
        case 'new_reply':
            return `new_reply:${data.reply?._id || `${data.post_id}:${data.comment_id}:${data.reply?.user?._id}` || Date.now()}`;
        case 'new_like':
            return `new_like:${data.liked_type}:${data.post_id}:${data.comment_id || ''}:${data.user?._id || Date.now()}`;
        case 'new_reaction':
            return `new_reaction:${data.liked_type}:${data.post_id}:${data.comment_id || ''}:${data.user?._id || Date.now()}`;
        case 'new_message_reaction':
            return `new_message_reaction:${data.message_id || data.message?._id || ''}:${data.user?._id || Date.now()}`;
        case 'new_story_reaction':
            return `new_story_reaction:${data.story_id || data.story?._id || ''}:${data.user?._id || Date.now()}`;
        default:
            return `${type || 'notification'}:${Date.now()}`;
    }
};

export const notificationsSlice = createSlice({
    name: 'notifications',
    initialState,
    reducers: {
        // Add new notification
        addNotification: (state, action) => {
            const id = getNotificationId(action.payload);
            const exists = state.notifications.some(notif => notif.id === id);
            if (exists) return;

            const notification = {
                id,
                ...action.payload,
                read: false,
                createdAt: new Date().toISOString(),
            };
            state.notifications.unshift(notification);
            state.unreadCount += 1;
        },

        // Mark all notifications as read
        markAllAsRead: (state) => {
            state.notifications.forEach(notif => {
                if(!notif.read) {
                    notif.read = true;
                }
            });
            state.unreadCount = 0;
        },

        // Mark specific notification as read
        markAsRead: (state, action) => {
            const notification = state.notifications.find(n => n.id === action.payload);
            if(notification && !notification.read) {
                notification.read = true;
                state.unreadCount -= 1;
            }
        },

        // Clear all notifications
        clearNotifications: (state) => {
            state.notifications = [];
            state.unreadCount = 0;
        },

        // Remove specific notification
        removeNotification: (state, action) => {
            const index = state.notifications.findIndex(n => n.id === action.payload);
            if(index > -1) {
                if(!state.notifications[index].read) {
                    state.unreadCount -= 1;
                }
                state.notifications.splice(index, 1);
            }
        },

        // Set notifications (for loading existing ones)
        setNotifications: (state, action) => {
            state.notifications = action.payload;
            state.unreadCount = action.payload.filter(n => !n.read).length;
        },
    },
});

export const {
    addNotification,
    markAllAsRead,
    markAsRead,
    clearNotifications,
    removeNotification,
    setNotifications,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
