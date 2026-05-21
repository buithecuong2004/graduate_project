import React from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { CheckCheck, Trash2, X } from 'lucide-react'
import { markAllAsRead, markAsRead, removeNotification } from '../features/notifications/notificationsSlice'
import { setViewStory } from '../features/stories/storiesSlice'
import { REACTION_ICONS } from '../utils/reactions'

const getNotificationIcon = (type) => {
    switch (type) {
        case 'friend_request':
            return '🤝'
        case 'connection_accepted':
            return '✅'
        case 'new_story':
            return '📖'
        case 'new_post':
            return '📝'
        case 'new_comment':
        case 'new_reply':
            return '💬'
        case 'new_like':
            return '👍'
        case 'new_reaction':
        case 'new_message_reaction':
        case 'new_story_reaction':
            return '😮'
        default:
            return '🔔'
    }
}

const getNotificationUser = (notification) => {
    const { type, data } = notification
    switch (type) {
        case 'friend_request':
        case 'connection_accepted':
            return data?.from_user
        case 'new_comment':
            return data?.comment?.user
        case 'new_reply':
            return data?.reply?.user
        default:
            return data?.user
    }
}

const getNotificationText = (notification) => {
    const { type, data } = notification
    const actor = data?.user?.full_name || data?.user?.username
    const requester = data?.from_user?.full_name || data?.from_user?.username

    switch (type) {
        case 'friend_request':
            return `${requester || 'Ai đó'} đã gửi cho bạn lời mời kết bạn`
        case 'connection_accepted':
            return `${requester || 'Ai đó'} đã chấp nhận lời mời kết bạn của bạn`
        case 'new_story':
            return `${actor || 'Ai đó'} đã đăng một tin mới`
        case 'new_post':
            return `${actor || 'Ai đó'} đã đăng bài viết mới`
        case 'new_comment':
            return `${data?.comment?.user?.full_name || data?.comment?.user?.username || 'Ai đó'} đã bình luận về bài viết của bạn`
        case 'new_reply':
            return `${data?.reply?.user?.full_name || data?.reply?.user?.username || 'Ai đó'} đã trả lời bình luận của bạn`
        case 'new_like':
            return `${actor || 'Ai đó'} thích ${data?.liked_type === 'post' ? 'bài viết' : 'bình luận'} của bạn`
        case 'new_reaction':
            return <span>{actor || 'Ai đó'} đã bày tỏ cảm xúc <span className='mx-0.5 inline-block align-middle text-lg leading-none'>{REACTION_ICONS[data?.reaction] || data?.reaction}</span> với {data?.liked_type === 'post' ? 'bài viết' : 'bình luận'} của bạn</span>
        case 'new_message_reaction':
            return <span>{actor || 'Ai đó'} đã bày tỏ cảm xúc <span className='mx-0.5 inline-block align-middle text-lg leading-none'>{REACTION_ICONS[data?.reaction] || data?.reaction}</span> với tin nhắn của bạn</span>
        case 'new_story_reaction':
            return <span>{actor || 'Ai đó'} đã bày tỏ cảm xúc <span className='mx-0.5 inline-block align-middle text-lg leading-none'>{REACTION_ICONS[data?.reaction] || data?.reaction}</span> với tin của bạn</span>
        default:
            return notification.message || 'Thông báo mới'
    }
}

const NotificationModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate()
    const dispatch = useDispatch()
    const notifications = useSelector(state => state.notifications.notifications)
    const unreadCount = useSelector(state => state.notifications.unreadCount)

    if (!isOpen) return null

    const handleNotificationClick = (notification) => {
        if (!notification.read) {
            dispatch(markAsRead(notification.id))
        }

        const { type, data } = notification
        const refresh = notification.id || notification.createdAt

        switch (type) {
            case 'friend_request':
            case 'connection_accepted':
                navigate('/connections', { state: { refresh } })
                break
            case 'new_story':
            case 'new_post':
                navigate('/feed', { state: { refresh } })
                break
            case 'new_comment':
                navigate(`/post/${data.post_id}`, { state: { refresh, autoOpenComments: true } })
                break
            case 'new_reply':
                navigate(`/post/${data.post_id}`, { state: { refresh, autoOpenComments: true, commentId: data.comment_id } })
                break
            case 'new_like':
                if (data.liked_type === 'post') {
                    navigate(`/post/${data.post_id}`, { state: { refresh } })
                } else if (data.liked_type === 'comment') {
                    navigate(`/post/${data.post_id}`, { state: { refresh, autoOpenComments: true } })
                }
                break
            case 'new_reaction':
                if (data.liked_type === 'post') {
                    navigate(`/post/${data.post_id}`, { state: { refresh } })
                } else if (data.liked_type === 'comment') {
                    navigate(`/post/${data.post_id}`, { state: { refresh, autoOpenComments: true, commentId: data.comment_id } })
                }
                break
            case 'new_message_reaction':
                navigate(`/messages/${data.user?._id}`)
                break
            case 'new_story_reaction':
                if (data.story) dispatch(setViewStory(data.story))
                else navigate('/feed', { state: { refresh } })
                break
        }

        onClose()
    }

    return createPortal(
        <div className='fixed inset-0 z-[190] flex items-end justify-center bg-slate-950/70 px-3 backdrop-blur-sm sm:items-center'>
            <div className='surface flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] sm:rounded-[2rem]'>
                <div className='sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur'>
                    <div>
                        <p className='page-kicker'>Hoạt động</p>
                        <h2 className='mt-1 text-xl font-black text-slate-950'>Thông báo</h2>
                        {unreadCount > 0 && (
                            <p className='text-sm font-bold text-cyan-700'>{unreadCount} thông báo mới</p>
                        )}
                    </div>
                    <button
                        type='button'
                        onClick={onClose}
                        className='rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 cursor-pointer'
                    >
                        <X className='size-5' />
                    </button>
                </div>

                {notifications.length > 0 && unreadCount > 0 && (
                    <div className='flex gap-2 border-b border-slate-200 bg-cyan-50/60 p-3'>
                        <button
                            type='button'
                            onClick={() => dispatch(markAllAsRead())}
                            className='flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-black text-cyan-700 shadow-sm transition hover:bg-cyan-100 cursor-pointer'
                        >
                            <CheckCheck className='size-4' />
                            Đánh dấu tất cả là đã đọc
                        </button>
                    </div>
                )}

                <div className='flex-1 overflow-y-auto'>
                    {notifications.length === 0 ? (
                        <div className='flex flex-col items-center justify-center px-6 py-14 text-center text-slate-500'>
                            <div className='mb-3 flex size-14 items-center justify-center rounded-full bg-cyan-50 text-3xl text-cyan-700'>🔔</div>
                            <p className='font-bold'>Chưa có thông báo nào</p>
                        </div>
                    ) : (
                        notifications.map(notification => {
                            const notifUser = getNotificationUser(notification)

                            return (
                                <div
                                    key={notification.id}
                                    className={`border-b border-slate-100 p-3 transition hover:bg-cyan-50/50 sm:p-4 cursor-pointer ${!notification.read ? 'bg-cyan-50/70' : 'bg-white/80'}`}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    <div className='flex items-start gap-3'>
                                        <div className='relative shrink-0'>
                                            {notifUser?.profile_picture ? (
                                                <img
                                                    src={notifUser.profile_picture}
                                                    alt=''
                                                    className='size-10 rounded-full object-cover avatar-ring'
                                                />
                                            ) : (
                                                <div className='flex size-10 items-center justify-center rounded-full bg-cyan-50 text-sm text-cyan-700 ring-2 ring-cyan-100'>
                                                    {getNotificationIcon(notification.type)}
                                                </div>
                                            )}
                                        </div>

                                        <div className='min-w-0 flex-1'>
                                            <div className='line-clamp-2 break-words text-sm font-bold text-slate-900'>
                                                {getNotificationText(notification)}
                                            </div>
                                            <p className='mt-1 text-xs text-slate-500'>
                                                {new Date(notification.createdAt).toLocaleString()}
                                            </p>
                                        </div>

                                        <div className='flex shrink-0 items-center gap-2'>
                                            {!notification.read && (
                                                <div className='size-2 rounded-full bg-cyan-600' />
                                            )}
                                            <button
                                                type='button'
                                                onClick={(event) => {
                                                    event.stopPropagation()
                                                    dispatch(removeNotification(notification.id))
                                                }}
                                                className='rounded-full p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 cursor-pointer'
                                            >
                                                <Trash2 className='size-4' />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}

export default NotificationModal
