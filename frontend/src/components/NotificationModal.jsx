import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { markAsRead, removeNotification, markAllAsRead } from '../features/notifications/notificationsSlice'
import { X, Trash2, CheckCheck } from 'lucide-react'
import toast from 'react-hot-toast'

const NotificationModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null

    const navigate = useNavigate()
    const dispatch = useDispatch()
    const notifications = useSelector(state => state.notifications.notifications)
    const unreadCount = useSelector(state => state.notifications.unreadCount)

    const getNotificationIcon = (type) => {
        switch(type) {
            case 'friend_request':
                return '🤝'
            case 'new_story':
                return '📖'
            case 'new_post':
                return '📝'
            case 'new_comment':
                return '💬'
            case 'new_reply':
                return '💬'
            case 'new_like':
                return '👍'
            default:
                return '🔔'
        }
    }

    const getNotificationText = (notification) => {
        const { type, data } = notification
        switch(type) {
            case 'friend_request':
                return `${data.from_user?.full_name || data.from_user?.username} sent you a friend request`
            case 'new_story':
                return `${data.user?.full_name || data.user?.username} posted a new story`
            case 'new_post':
                return `${data.user?.full_name || data.user?.username} posted something new`
            case 'new_comment':
                return `${data.comment?.user?.full_name || data.comment?.user?.username} commented on your post`
            case 'new_reply':
                return `${data.reply?.user?.full_name || data.reply?.user?.username} replied to your comment`
            case 'new_like':
                return `${data.user?.full_name || data.user?.username} liked your ${data.liked_type === 'post' ? 'post' : 'comment'}`
            default:
                return notification.message || 'New notification'
        }
    }

    const handleNotificationClick = (notification) => {
        if (!notification.read) {
            dispatch(markAsRead(notification.id))
        }

        const { type, data } = notification
        
        // Navigate based on notification type
        switch(type) {
            case 'friend_request':
                navigate('/connections')
                break
            case 'new_story':
                 navigate('/feed', { state: { refresh: Date.now() } })
                break
            case 'new_post':
                 navigate('/feed', { state: { refresh: Date.now() } })
                break
            case 'new_comment':
                navigate(`/post/${data.post_id}`)
                break
            case 'new_reply':
                navigate(`/post/${data.post_id}`)
                break
            case 'new_like':
                if(data.liked_type === 'post') {
                    navigate(`/post/${data.post_id}`)
                } else if(data.post_id) {
                    navigate(`/post/${data.post_id}`)
                }
                break
        }
        onClose()
    }

    // Thêm helper này vào trong component, trước phần return
    const getNotificationUser = (notification) => {
        const { type, data } = notification
        switch(type) {
            case 'friend_request':  return data?.from_user
            case 'new_comment':     return data?.comment?.user
            case 'new_reply':       return data?.reply?.user
            default:                return data?.user  // new_like, new_post, new_story
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
            <div className="bg-white w-full sm:w-96 sm:rounded-lg rounded-t-2xl shadow-xl max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 bg-white">
                    <div>
                        <h2 className="text-lg font-bold">Notifications</h2>
                        {unreadCount > 0 && (
                            <p className="text-sm text-gray-500">{unreadCount} new</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-full transition"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Actions */}
                {notifications.length > 0 && unreadCount > 0 && (
                    <div className="border-b border-gray-200 p-3 flex gap-2 bg-gray-50">
                        <button
                            onClick={() => dispatch(markAllAsRead())}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition text-sm font-medium"
                        >
                            <CheckCheck className="w-4 h-4" />
                            Mark all as read
                        </button>
                    </div>
                )}

                {/* Notifications List */}
                <div className="overflow-y-auto flex-1">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                            <div className="text-4xl mb-2">🔔</div>
                            <p>No notifications yet</p>
                        </div>
                    ) : (
                        notifications.map(notification => (
                            <div
                                key={notification.id}
                                className={`border-b border-gray-100 p-3 sm:p-4 cursor-pointer transition hover:bg-gray-50 ${
                                    !notification.read ? 'bg-indigo-50' : ''
                                }`}
                                onClick={() => handleNotificationClick(notification)}
                            >
                                <div className="flex gap-2 sm:gap-3 items-start">
                                    {/* Avatar & Icon */}
                                    {/* Avatar & Icon */}
                                    <div className="flex-shrink-0 relative">
                                        {(() => {
                                            const notifUser = getNotificationUser(notification)
                                            return notifUser?.profile_picture ? (
                                                <img
                                                    src={notifUser.profile_picture}
                                                    alt=""
                                                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm">
                                                    {getNotificationIcon(notification.type)}
                                                </div>
                                            )
                                        })()}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs sm:text-sm font-medium text-gray-900 line-clamp-2 break-words">
                                            {getNotificationText(notification)}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {new Date(notification.createdAt).toLocaleString()}
                                        </p>
                                    </div>

                                    {/* Status & Delete */}
                                    <div className="flex-shrink-0 flex items-center gap-1 sm:gap-2">
                                        {!notification.read && (
                                            <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                dispatch(removeNotification(notification.id))
                                            }}
                                            className="p-1 hover:bg-gray-200 rounded transition"
                                        >
                                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 hover:text-red-500" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

export default NotificationModal
