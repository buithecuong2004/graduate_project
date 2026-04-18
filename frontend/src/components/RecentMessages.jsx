import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import moment from 'moment'
import { useAuth } from '@clerk/clerk-react'
import { useSelector } from 'react-redux'
import api from '../api/axios'
import toast from 'react-hot-toast'

const RecentMessages = () => {

    const [conversations, setConversations] = useState([])
    const currentUser = useSelector((state) => state.user.value)
    const {getToken} = useAuth()
    const { pathname } = useLocation()

    // Lấy userId đang được mở trong ChatBox (nếu có)
    const activeChatUserId = pathname.startsWith('/messages/')
        ? pathname.split('/messages/')[1]
        : null

    const fetchRecentMessages = async () => {
        try {
            const token = await getToken()
            const {data} = await api.get('/api/user/recent-messages', {
                headers: { Authorization: `Bearer ${token}` }
            })
            if(data.success) {
                const groupedConversations = {}
                
                data.messages.forEach(message => {
                    const isFromMe = message.from_user_id._id === currentUser._id // ✅ so sánh đúng
                    const otherPerson = isFromMe ? message.to_user_id : message.from_user_id
                    const otherPersonId = otherPerson._id
                    
                    if (!groupedConversations[otherPersonId]) {
                        groupedConversations[otherPersonId] = {
                            unreadCount: 0,
                            lastMessage: message,
                            sender: otherPerson
                        }
                    }
                    
                    if (new Date(message.createdAt) > new Date(groupedConversations[otherPersonId].lastMessage.createdAt)) {
                        groupedConversations[otherPersonId].lastMessage = message
                    }
                    
                    if (!message.isRead && message.to_user_id._id === currentUser._id) {
                        groupedConversations[otherPersonId].unreadCount++
                    }
                })

                const sortedConversations = Object.values(groupedConversations)
                    .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt))
                    .slice(0, 10)

                setConversations(sortedConversations)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)     
        }
    }

    const handleMarkAsRead = async (otherUserId) => {
        try {
            const token = await getToken()
            const {data} = await api.post('/api/user/mark-messages-read', 
                { from_user_id: otherUserId },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if(data.success) {
                setConversations(conversations.map(conv => 
                    conv.sender._id === otherUserId 
                        ? { ...conv, unreadCount: 0 }
                        : conv
                ))
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

        // RecentMessages.jsx
    const newMessageTrigger = useSelector(state => state.messages.newMessageTrigger)

    useEffect(()=>{
        if(currentUser?._id) {
            fetchRecentMessages()
        }
    }, [pathname, currentUser?._id, newMessageTrigger]) // ← thêm trigger

  return (
    <div className='bg-white max-w-xs mt-4 p-4 min-h-20 rounded-md shadow text-xs text-slate-800'>
        <h3 className='font-semibold text-slate-8 mb-4'>Recent Messages</h3>
        <div className='flex flex-col max-h-56 overflow-y-scroll no-scrollbar'>
            {
                conversations.map((conversation, index)=>{
                    const isFromMe = conversation.lastMessage.from_user_id._id === currentUser._id // ✅
                    const messageText = conversation.lastMessage.text
                    const mediaUrls = conversation.lastMessage.media_urls || []
                    const type = conversation.lastMessage.message_type

                    let content = ''
                    if(messageText) {
                        content = messageText.length > 30 ? messageText.slice(0, 30) + '...' : messageText
                    } else if(type?.includes('image')) {
                        content = `Sent ${mediaUrls.length} image${mediaUrls.length > 1 ? 's' : ''}`
                    } else if(type?.includes('video')) {
                        content = `Sent ${mediaUrls.length} video${mediaUrls.length > 1 ? 's' : ''}`
                    } else {
                        content = 'Media'
                    }

                    // ✅ "You: ..." nếu mình gửi, giữ nguyên nội dung nếu họ gửi
                    const displayText = isFromMe ? `You: ${content}` : content

                    // ✅ Nếu đang mở ChatBox của người này thì coi như đã đọc hết
                    const isActiveChat = activeChatUserId === conversation.sender._id
                    const effectiveUnreadCount = isActiveChat ? 0 : conversation.unreadCount

                    return (
                        <Link 
                            to={`/messages/${conversation.sender._id}`} 
                            key={index} 
                            className='flex items-start gap-2 py-2 hover:bg-slate-100 cursor-pointer'
                            onClick={() => conversation.unreadCount > 0 && handleMarkAsRead(conversation.sender._id)}
                        >
                            <img src={conversation.sender.profile_picture} alt="" className='w-8 h-8 rounded-full'/>
                            <div className='w-full'>
                                <div className='flex justify-between'>
                                    <p className={effectiveUnreadCount > 0 ? 'font-bold' : 'font-medium'}>{conversation.sender.full_name}</p>
                                    <p className='text-[10px] text-slate-400'>{moment(conversation.lastMessage.createdAt).fromNow()}</p>
                                </div>
                                <div className='flex justify-between items-center'>
                                    <p className={effectiveUnreadCount > 0 ? 'text-gray-900 font-semibold' : 'text-gray-500'}>
                                        {displayText}
                                    </p>
                                    {effectiveUnreadCount > 0 && (
                                        <p className='bg-indigo-500 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold min-w-5'>
                                            {effectiveUnreadCount}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </Link>
                    )
                })
            }
        </div>
    </div>
  )
}

export default RecentMessages