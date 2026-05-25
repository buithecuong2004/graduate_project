import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Ellipsis, MessageCircle, MessageSquare, PenLine, Search, UsersRound } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import api from '../api/axios'
import moment from '../utils/moment'
import ChatBox from './ChatBox'

const getUserId = (userOrId) => userOrId?._id?.toString?.() || userOrId?.toString?.() || ''

const getDisplayName = (user) => user?.full_name || user?.username || 'Người dùng Tarous'
const isUserRecord = (user) => Boolean(user && typeof user === 'object')
const hasUserIdentity = (user) => Boolean(isUserRecord(user) && (user.full_name || user.username || user.profile_picture))

const getAvatarUrl = (user) => (
  user?.profile_picture ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName(user))}&background=0891b2&color=fff`
)

const getOtherParticipant = (message, currentUserId) => (
  getUserId(message.from_user_id) === currentUserId ? message.to_user_id : message.from_user_id
)

const getPreferredUser = (currentUser, nextUser) => (
  hasUserIdentity(currentUser) ? currentUser : (hasUserIdentity(nextUser) ? nextUser : currentUser || nextUser)
)

const resolveKnownUser = (userOrId, currentUser, messages, knownUsersById) => {
  if (hasUserIdentity(userOrId)) return userOrId

  const userId = getUserId(userOrId)
  if (!userId) return userOrId
  if (userId === getUserId(currentUser)) return currentUser

  const knownUser = knownUsersById.get(userId)
  if (knownUser) return knownUser

  for (const message of messages) {
    if (getUserId(message.from_user_id) === userId && hasUserIdentity(message.from_user_id)) return message.from_user_id
    if (getUserId(message.to_user_id) === userId && hasUserIdentity(message.to_user_id)) return message.to_user_id
  }

  return userOrId
}

const hydrateMessageUsers = (message, currentUser, messages, knownUsersById) => ({
  ...message,
  from_user_id: resolveKnownUser(message.from_user_id, currentUser, messages, knownUsersById),
  to_user_id: resolveKnownUser(message.to_user_id, currentUser, messages, knownUsersById)
})

const isSelfMessage = (message, currentUserId) => (
  currentUserId &&
  getUserId(message.from_user_id) === currentUserId &&
  getUserId(message.to_user_id) === currentUserId
)

const formatSidebarTime = (value) => {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''
  if (timestamp > Date.now()) return 'vừa xong'
  return moment(value).fromNow()
}

const getSearchResultContact = (message, currentUserId) => getOtherParticipant(message, currentUserId)

const getSearchResultSenderLabel = (message, currentUserId) => (
  getUserId(message.from_user_id) === currentUserId ? 'Bạn' : getDisplayName(message.from_user_id)
)

const getSearchResultText = (message) => message?.text || 'Tin nhắn'

const getMessagePreview = (message, currentUserId) => {
  if (!message) return 'Bắt đầu cuộc trò chuyện'

  const isFromMe = getUserId(message.from_user_id) === currentUserId
  const text = message.text || ''
  const mediaUrls = message.media_urls || []
  const type = message.message_type
  let content = ''

  if (type === 'reaction') content = text
  else if (type === 'call') {
    if (message.call_status === 'missed') content = message.call_type === 'video' ? 'Cuộc gọi video nhỡ' : 'Cuộc gọi thoại nhỡ'
    else if (message.call_status === 'rejected') content = message.call_type === 'video' ? 'Cuộc gọi video bị từ chối' : 'Cuộc gọi thoại bị từ chối'
    else content = message.call_type === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'
  } else if (message.is_deleted) content = 'Tin nhắn đã thu hồi'
  else if (message.is_forwarded) content = message.forwarded_type === 'link' ? 'Đã chuyển tiếp 1 liên kết' : 'Đã chuyển tiếp 1 tin nhắn'
  else if (message.reply_to) content = 'Đã trả lời 1 tin nhắn'
  else if (text) content = text
  else if (type === 'voice') content = 'Đã gửi 1 file âm thanh'
  else if (type?.includes('image')) content = `Đã gửi ${mediaUrls.length || 1} hình ảnh`
  else if (type?.includes('video')) content = `Đã gửi ${mediaUrls.length || 1} video`
  else content = 'File phương tiện'

  const preview = isFromMe && !message.is_deleted ? `Bạn: ${content}` : content
  return preview.length > 54 ? `${preview.slice(0, 54)}...` : preview
}

const buildRecentConversations = (messages, currentUserId) => {
  const conversations = new Map()

  messages.forEach((message) => {
    const isFromMe = getUserId(message.from_user_id) === currentUserId
    if (message.message_type === 'reaction' && isFromMe) return

    const otherUser = getOtherParticipant(message, currentUserId)
    const otherUserId = getUserId(otherUser)
    if (!otherUserId || otherUserId === currentUserId) return

    const current = conversations.get(otherUserId)
    const isNewer = !current || new Date(message.createdAt) > new Date(current.lastMessage.createdAt)
    const isUnread = !message.isRead && getUserId(message.to_user_id) === currentUserId

    conversations.set(otherUserId, {
      user: getPreferredUser(current?.user, otherUser),
      lastMessage: isNewer ? message : current.lastMessage,
      unreadCount: (current?.unreadCount || 0) + (isUnread ? 1 : 0)
    })
  })

  return Array.from(conversations.values())
    .filter((conversation) => hasUserIdentity(conversation.user))
    .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt))
}

const mergeUniqueUsers = (excludedUserId, ...groups) => {
  const userMap = new Map()

  groups.flat().forEach((user) => {
    const id = getUserId(user)
    if (!id || id === excludedUserId || !hasUserIdentity(user)) return

    const current = userMap.get(id)
    userMap.set(id, getPreferredUser(current, user))
  })

  return Array.from(userMap.values())
    .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), 'vi'))
}

const Message = ({ onStartCall }) => {
  const { userId: selectedUserId } = useParams()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { socketRef, socket } = useSocket()
  const currentUser = useSelector((state) => state.user.value)
  const currentUserId = getUserId(currentUser)
  const { connections, followers, following } = useSelector((state) => state.connections)
  const newMessageTrigger = useSelector((state) => state.messages.newMessageTrigger)
  const [recentMessages, setRecentMessages] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationFilter, setConversationFilter] = useState('all')
  const [messageSearch, setMessageSearch] = useState({ groups: [], messages: [], loading: false })
  const [selectedSearchUserId, setSelectedSearchUserId] = useState('')
  const [highlightTarget, setHighlightTarget] = useState(null)
  const knownUsersByIdRef = useRef(new Map())

  const knownUsersById = useMemo(() => {
    const userMap = new Map()
    const addUser = (user) => {
      const userId = getUserId(user)
      if (userId && hasUserIdentity(user)) userMap.set(userId, user)
    }

    addUser(currentUser)
    ;[connections, followers, following].flat().forEach(addUser)
    recentMessages.forEach((message) => {
      addUser(message.from_user_id)
      addUser(message.to_user_id)
    })

    return userMap
  }, [connections, currentUser, followers, following, recentMessages])

  useEffect(() => {
    knownUsersByIdRef.current = knownUsersById
  }, [knownUsersById])

  useEffect(() => {
    const keyword = searchTerm.trim()
    if (!selectedUserId || !keyword) {
      setMessageSearch({ groups: [], messages: [], loading: false })
      setSelectedSearchUserId('')
      return undefined
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      try {
        setMessageSearch((current) => ({ ...current, loading: true }))
        const token = await getToken()
        const { data } = await api.post('/api/message/search', { query: keyword }, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (cancelled) return
        if (!data.success) throw new Error(data.message)
        setMessageSearch({
          groups: data.groups || [],
          messages: data.messages || [],
          loading: false
        })
      } catch (error) {
        if (!cancelled) {
          setMessageSearch({ groups: [], messages: [], loading: false })
          toast.error(error.message)
        }
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [getToken, searchTerm, selectedUserId])

  useEffect(() => {
    if (selectedUserId && currentUserId && selectedUserId === currentUserId) {
      navigate('/messages', { replace: true })
    }
  }, [currentUserId, navigate, selectedUserId])

  useEffect(() => {
    if (!currentUser?._id) return undefined

    let cancelled = false
    const fetchRecentMessages = async () => {
      try {
        setLoading(true)
        const token = await getToken()
        const { data } = await api.get('/api/user/recent-messages', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (cancelled) return
        data.success
          ? setRecentMessages((data.messages || [])
            .filter((message) => !isSelfMessage(message, currentUserId))
            .map((message) => hydrateMessageUsers(message, currentUser, [], knownUsersByIdRef.current)))
          : toast.error(data.message)
      } catch (error) {
        if (!cancelled) toast.error(error.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchRecentMessages()
    return () => { cancelled = true }
  }, [currentUser, currentUserId, getToken, newMessageTrigger])

  useEffect(() => {
    const activeSocket = socket || socketRef?.current
    if (!activeSocket || !currentUserId) return undefined

    const handleNewMessage = (message) => {
      const fromId = getUserId(message.from_user_id)
      const toId = getUserId(message.to_user_id)
      if (fromId !== currentUserId && toId !== currentUserId) return
      if (isSelfMessage(message, currentUserId)) return

      setRecentMessages((messages) => {
        const hydratedMessage = hydrateMessageUsers(message, currentUser, messages, knownUsersByIdRef.current)
        const shouldStayUnread = toId === currentUserId && fromId !== selectedUserId
        const nextMessage = shouldStayUnread ? { ...hydratedMessage, isRead: false } : hydratedMessage

        return messages.some((item) => item._id === nextMessage._id)
          ? messages.map((item) => item._id === nextMessage._id ? { ...item, ...nextMessage } : item)
          : [nextMessage, ...messages]
      })
    }

    const handleEditedMessage = ({ messageId, text }) => {
      setRecentMessages((messages) => messages.map((message) => (
        message._id === messageId ? { ...message, text, is_edited: true } : message
      )))
    }

    const handleDeletedMessage = ({ messageId }) => {
      setRecentMessages((messages) => messages.map((message) => (
        message._id === messageId ? { ...message, is_deleted: true, text: '', media_urls: [] } : message
      )))
    }

    const handleReactionUpdated = ({ messageId, reactions }) => {
      setRecentMessages((messages) => messages.map((message) => (
        message._id === messageId ? { ...message, reactions } : message
      )))
    }

    activeSocket.on('new-message', handleNewMessage)
    activeSocket.on('message-edited', handleEditedMessage)
    activeSocket.on('message-deleted', handleDeletedMessage)
    activeSocket.on('message-reaction-updated', handleReactionUpdated)

    return () => {
      activeSocket.off('new-message', handleNewMessage)
      activeSocket.off('message-edited', handleEditedMessage)
      activeSocket.off('message-deleted', handleDeletedMessage)
      activeSocket.off('message-reaction-updated', handleReactionUpdated)
    }
  }, [currentUser, currentUserId, selectedUserId, socket, socketRef])

  const recentConversations = useMemo(() => (
    buildRecentConversations(recentMessages, currentUserId)
  ), [currentUserId, recentMessages])

  const cardUsers = useMemo(() => {
    const recentUsers = recentConversations.map((conversation) => conversation.user)
    return mergeUniqueUsers(currentUserId, recentUsers, connections, followers, following)
  }, [connections, currentUserId, followers, following, recentConversations])

  const conversationsForSidebar = useMemo(() => {
    if (!selectedUserId || selectedUserId === currentUserId) return recentConversations
    if (recentConversations.some((conversation) => getUserId(conversation.user) === selectedUserId)) return recentConversations

    const selectedUser = cardUsers.find((user) => getUserId(user) === selectedUserId)
    return selectedUser
      ? [{ user: selectedUser, lastMessage: null, unreadCount: 0 }, ...recentConversations]
      : recentConversations
  }, [cardUsers, currentUserId, recentConversations, selectedUserId])

  const filteredCards = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    if (!keyword) return cardUsers

    return cardUsers.filter((user) => (
      getDisplayName(user).toLowerCase().includes(keyword) ||
      (user.username || '').toLowerCase().includes(keyword) ||
      (user.bio || '').toLowerCase().includes(keyword)
    ))
  }, [cardUsers, searchTerm])

  const filteredConversations = useMemo(() => {
    const baseConversations = conversationFilter === 'unread'
      ? conversationsForSidebar.filter((conversation) => conversation.unreadCount > 0)
      : conversationsForSidebar

    const keyword = searchTerm.trim().toLowerCase()
    if (!keyword || selectedUserId) return baseConversations

    return baseConversations.filter(({ user, lastMessage }) => (
      getDisplayName(user).toLowerCase().includes(keyword) ||
      (user?.username || '').toLowerCase().includes(keyword) ||
      getMessagePreview(lastMessage, getUserId(currentUser)).toLowerCase().includes(keyword)
    ))
  }, [conversationFilter, conversationsForSidebar, currentUser, searchTerm, selectedUserId])

  const selectedSearchMessages = useMemo(() => (
    messageSearch.messages.filter((message) => (
      getUserId(getSearchResultContact(message, currentUserId)) === selectedSearchUserId
    ))
  ), [currentUserId, messageSearch.messages, selectedSearchUserId])

  const markConversationAsRead = async (contactId) => {
    try {
      const token = await getToken()
      await api.post('/api/user/mark-messages-read', { from_user_id: contactId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setRecentMessages((messages) => messages.map((message) => (
        getUserId(message.from_user_id) === contactId ? { ...message, isRead: true } : message
      )))
    } catch (error) {
      toast.error(error.message)
    }
  }

  const openConversationInCurrentWindow = (userId) => {
    navigate(`/messages/${userId}`)
  }

  const openMessengerWindow = (userId) => {
    const url = `${window.location.origin}/messages/${userId}`
    const chatWindow = window.open(url, '_blank')
    chatWindow?.focus()
  }

  const openConversation = (conversation) => {
    const contactId = getUserId(conversation.user)
    openConversationInCurrentWindow(contactId)
    if (conversation.unreadCount > 0) markConversationAsRead(contactId)
  }

  const clearSidebarSearch = () => {
    setSearchTerm('')
    setSelectedSearchUserId('')
    setMessageSearch({ groups: [], messages: [], loading: false })
  }

  const openSearchMessage = (message) => {
    const contactId = getUserId(getSearchResultContact(message, currentUserId))
    if (!contactId) return

    setHighlightTarget({ userId: contactId, messageId: message._id, nonce: Date.now() })
    openConversationInCurrentWindow(contactId)
  }

  const clearHighlightTarget = useCallback(() => {
    setHighlightTarget(null)
  }, [])

  const renderSidebarSearch = () => {
    const keyword = searchTerm.trim()
    if (!keyword) return null

    if (messageSearch.loading) {
      return (
        <div className='flex h-full items-center justify-center px-6 text-center text-sm font-bold text-slate-400'>
          Đang tìm tin nhắn...
        </div>
      )
    }

    if (selectedSearchUserId) {
      const selectedGroup = messageSearch.groups.find((group) => getUserId(group.user) === selectedSearchUserId)

      return (
        <div className='space-y-2'>
          <button
            type='button'
            onClick={() => setSelectedSearchUserId('')}
            className='mb-2 flex items-center gap-2 rounded-full px-3 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100'
          >
            <ArrowLeft className='size-4' />
            Quay lại kết quả
          </button>

          {selectedSearchMessages.length === 0 ? (
            <div className='px-4 py-8 text-center text-sm text-slate-500'>Không còn tin nhắn trùng khớp.</div>
          ) : selectedSearchMessages.map((message) => (
            <button
              type='button'
              key={message._id}
              onClick={() => openSearchMessage(message)}
              className='flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-100'
            >
              <img
                src={getAvatarUrl(selectedGroup?.user || getSearchResultContact(message, currentUserId))}
                alt=''
                className='size-11 shrink-0 rounded-full object-cover'
              />
              <div className='min-w-0 flex-1'>
                <div className='flex items-start gap-2'>
                  <p className='min-w-0 flex-1 truncate text-sm font-black text-slate-950'>
                    {getDisplayName(selectedGroup?.user || getSearchResultContact(message, currentUserId))}
                  </p>
                  <span className='shrink-0 text-xs text-slate-400'>{formatSidebarTime(message.createdAt)}</span>
                </div>
                <p className='mt-1 line-clamp-2 text-sm leading-5 text-slate-500'>
                  <span className='font-bold text-slate-700'>{getSearchResultSenderLabel(message, currentUserId)}: </span>
                  {getSearchResultText(message)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )
    }

    return (
      <div className='space-y-2'>
        <button
          type='button'
          onClick={clearSidebarSearch}
          className='mb-2 flex items-center gap-2 rounded-full px-3 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100'
        >
          <ArrowLeft className='size-4' />
          Quay lại đoạn chat
        </button>

        {messageSearch.groups.length === 0 ? (
          <div className='px-4 py-8 text-center text-sm text-slate-500'>Không tìm thấy tin nhắn trùng khớp.</div>
        ) : messageSearch.groups.map((group) => (
          <button
            type='button'
            key={getUserId(group.user)}
            onClick={() => setSelectedSearchUserId(getUserId(group.user))}
            className='flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-100'
          >
            <img src={getAvatarUrl(group.user)} alt='' className='size-12 shrink-0 rounded-full object-cover' />
            <div className='min-w-0 flex-1'>
              <p className='truncate font-black text-slate-950'>{getDisplayName(group.user)}</p>
              <p className='mt-1 truncate text-sm text-slate-500'>{group.count} tin nhắn trùng khớp</p>
            </div>
          </button>
        ))}
      </div>
    )
  }

  if (!selectedUserId) {
    return (
      <div className='app-page min-h-full'>
        <div className='app-container xl:max-w-6xl'>
          <section className='mb-6 rounded-[2rem] surface p-5 sm:p-6'>
            <p className='page-kicker'>Tin nhắn</p>
            <div className='mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
              <div>
                <h1 className='page-title !text-[2rem] sm:!text-[2.5rem]'>Đoạn chat</h1>
                <p className='page-subtitle mt-3 max-w-2xl'>
                  Chọn bạn bè, người theo dõi hoặc người đã từng nhắn tin để mở cửa sổ Messenger đầy đủ.
                </p>
              </div>
              <div className='inline-flex w-fit items-center gap-2 rounded-full bg-cyan-50 px-4 py-2 text-sm font-black text-cyan-700'>
                <UsersRound className='size-4' />
                {cardUsers.length} người liên hệ
              </div>
            </div>

            <div className='relative mt-5'>
              <Search className='absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
              <input
                type='text'
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder='Tìm bạn bè để nhắn tin...'
                className='input-modern py-4 pl-12 pr-4 text-base'
              />
            </div>
          </section>

          {loading && cardUsers.length === 0 ? (
            <div className='surface flex min-h-72 items-center justify-center rounded-[2rem] p-10 text-sm font-bold text-slate-400'>
              Đang tải người liên hệ...
            </div>
          ) : filteredCards.length === 0 ? (
            <div className='surface flex min-h-72 flex-col items-center justify-center rounded-[2rem] p-10 text-center'>
              <Search className='mb-4 size-10 text-slate-300' />
              <h2 className='text-xl font-black text-slate-900'>Không tìm thấy người phù hợp</h2>
              <p className='mt-2 text-sm text-slate-500'>Thử tìm bằng tên hoặc username khác.</p>
            </div>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
              {filteredCards.map((user) => (
                <article key={getUserId(user)} className='surface flex h-full flex-col rounded-[1.5rem] p-5 transition hover:-translate-y-0.5 hover:shadow-xl'>
                  <div className='flex items-start gap-4'>
                    <img
                      src={getAvatarUrl(user)}
                      alt={getDisplayName(user)}
                      className='size-16 rounded-full object-cover avatar-ring'
                      onError={(event) => {
                        event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName(user))}&background=0891b2&color=fff`
                      }}
                    />
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-lg font-black text-slate-900'>{getDisplayName(user)}</p>
                      {user.username && <p className='text-sm text-slate-500'>@{user.username}</p>}
                      <p className='mt-2 min-h-12 overflow-hidden text-sm leading-6 text-slate-600 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]'>
                        {user.bio || ''}
                      </p>
                    </div>
                  </div>

                  <button
                    type='button'
                    onClick={() => openMessengerWindow(getUserId(user))}
                    className='btn-primary mt-auto w-full px-4 py-3 cursor-pointer'
                  >
                    <MessageSquare className='h-4 w-4' />
                    Nhắn tin
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className='h-full min-h-full bg-slate-50'>
      <div className='flex h-full min-h-0'>
        <aside className='flex w-full max-w-[28rem] shrink-0 flex-col border-r border-slate-200 bg-white max-lg:max-w-[23rem] max-md:hidden'>
          <div className='border-b border-slate-200 px-5 py-5'>
            <div className='flex items-center justify-between'>
              <h1 className='text-2xl font-black text-slate-950'>Đoạn chat</h1>
            </div>

            <div className='relative mt-5'>
              <Search className='absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
              <input
                type='text'
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder='Tìm kiếm tin nhắn'
                className='w-full rounded-full border border-transparent bg-slate-100 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-cyan-200 focus:bg-white focus:ring-4 focus:ring-cyan-50'
              />
            </div>

            <div className='mt-5 flex items-center gap-3 text-sm font-black'>
              <button
                type='button'
                onClick={() => setConversationFilter('all')}
                className={`rounded-full px-4 py-2 transition ${
                  conversationFilter === 'all'
                    ? 'bg-cyan-50 text-cyan-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Tất cả
              </button>
              <button
                type='button'
                onClick={() => setConversationFilter('unread')}
                className={`rounded-full px-4 py-2 transition ${
                  conversationFilter === 'unread'
                    ? 'bg-cyan-50 text-cyan-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Chưa đọc
              </button>
            </div>
          </div>

          <div className='min-h-0 flex-1 overflow-y-auto px-3 py-3'>
            {searchTerm.trim() ? renderSidebarSearch() : filteredConversations.length === 0 ? (
              <div className='flex h-full flex-col items-center justify-center px-6 text-center text-slate-500'>
                <UsersRound className='mb-3 h-10 w-10 text-slate-300' />
                <p className='font-black text-slate-950'>
                  {conversationFilter === 'unread' ? 'Không có tin nhắn chưa đọc' : 'Chưa có đoạn chat'}
                </p>
                <p className='mt-1 text-sm'>
                  {conversationFilter === 'unread'
                    ? 'Các đoạn chat chưa đọc sẽ xuất hiện ở đây.'
                    : 'Những người đã nhắn tin sẽ xuất hiện ở đây.'}
                </p>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const contactId = getUserId(conversation.user)
                const isActive = contactId === selectedUserId
                const effectiveUnreadCount = isActive ? 0 : conversation.unreadCount
                const preview = getMessagePreview(conversation.lastMessage, getUserId(currentUser))

                return (
                  <button
                    key={contactId}
                    type='button'
                    onClick={() => openConversation(conversation)}
                    className={`mb-2 flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${
                      isActive ? 'bg-cyan-50' : 'hover:bg-slate-100'
                    }`}
                  >
                    <img
                      src={getAvatarUrl(conversation.user)}
                      alt=''
                      className='size-14 rounded-full object-cover'
                    />
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-start gap-2'>
                        <p className={`min-w-0 flex-1 truncate ${effectiveUnreadCount > 0 ? 'font-black' : 'font-bold'} text-slate-950`}>
                          {getDisplayName(conversation.user)}
                        </p>
                        {conversation.lastMessage?.createdAt && (
                          <span className='shrink-0 text-xs text-slate-400'>
                            {formatSidebarTime(conversation.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className='mt-1 flex items-center gap-2'>
                        <p className={`min-w-0 flex-1 truncate text-sm ${effectiveUnreadCount > 0 ? 'font-black text-slate-950' : 'text-slate-500'}`}>
                          {preview}
                        </p>
                        {effectiveUnreadCount > 0 && (
                          <span className='flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-[10px] font-black text-white'>
                            {effectiveUnreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <main className='min-w-0 flex-1'>
          <ChatBox
            onStartCall={onStartCall}
            variant='embedded'
            scrollToMessageId={highlightTarget?.userId === selectedUserId ? highlightTarget.messageId : ''}
            onScrolledToMessage={clearHighlightTarget}
          />
        </main>
      </div>
    </div>
  )
}

export default Message
