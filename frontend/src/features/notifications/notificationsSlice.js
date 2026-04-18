import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    notifications: [],
    unreadCount: 0,
    dummyData: null,
};

export const notificationsSlice = createSlice({
    name: 'notifications',
    initialState,
    reducers: {
        // Add new notification
        addNotification: (state, action) => {
            const notification = {
                id: Date.now(),
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
