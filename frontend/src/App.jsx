import React, { useCallback } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Feed from './pages/user/Feed'
import Message from './pages/user/Message'
import Connections from './pages/user/Connections'
import Discover from './pages/user/Discover'
import Profile from './pages/user/Profile'
import CreatePost from './pages/user/CreatePost'
import PostDetail from './pages/user/PostDetail'
import LiveStream from './pages/user/LiveStream'
import Admin from './pages/admin/Admin'
import { useAuth } from './context/AuthContext'
import Layout from './pages/user/Layout'
import toast, { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { clearUser, fetchUser } from './features/user/userSlice'
import { fetchConnections, updateUserPresence } from './features/connections/connectionsSlice'
import { useRef } from 'react'
import { addMessages, setNewMessageTrigger, editMessageLocal, deleteMessageLocal, updateMessageReactionsLocal } from './features/messages/messagesSlice'
import { addNotification } from './features/notifications/notificationsSlice'
import { deletePost, updateCommentCount, updatePostReactions, updatePostShares, upsertPost } from './features/posts/postSlice'
import { addStoryLocal, deleteStoryLocal, updateStoryReactionsLocal } from './features/stories/storiesSlice'
import { Navigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { SocketProvider, useSocket } from './context/SocketContext'
import CallModal from './components/user/CallModal'
import Loading from './components/user/Loading'
import api from './api/axios'
import { ACCOUNT_LOCKED_MESSAGE, ACCOUNT_LOCKED_STORAGE_KEY } from './utils/authMessages'

const getUserId = (userOrId) => userOrId?._id?.toString?.() || userOrId?.toString?.() || ''

const buildRealtimePostFromNotification = (notification) => {
  const post = notification?.data?.post
  const user = notification?.data?.user
  if (!post?._id || !user?._id) return null

  return {
    likes_count: [],
    reactions: [],
    shares_count: [],
    comments: [],
    total_comments_count: 0,
    createdAt: new Date().toISOString(),
    ...post,
    user: post.user || user
  }
}

const buildRealtimeStoryFromNotification = (notification) => {
  const story = notification?.data?.story
  const user = notification?.data?.user
  if (!story?._id || !user?._id) return null

  return {
    reactions: [],
    createdAt: new Date().toISOString(),
    ...story,
    user: story.user || user
  }
}

const HomeRedirect = ({ currentUser }) => {
  if (!currentUser) return <Loading />
  return <Navigate to={currentUser.role === 'admin' ? '/admin' : '/feed'} replace />
}

const AdminRoute = ({ currentUser }) => {
  if (!currentUser) return <Loading />
  return currentUser.role === 'admin' ? <Admin /> : <Navigate to="/feed" replace />
}

// ─── Inner App (needs SocketProvider to be parent) ───────────────────────────
const AppInner = () => {
  const { isAuthenticated, getToken, loading, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const pathnameRef = useRef(pathname)

  // callAcceptedSignal đã được loại bỏ — CallModal tự lắng nghe socket trực tiếp
  const { socketRef, setSocket, openChatFromMessage, clearOpenChats } = useSocket()

  const [activeCall, setActiveCall] = useState(null)
  const activeCallRef = useRef(null)
  const currentUser = useSelector((state) => state.user.value)
  const currentUserId = getUserId(currentUser)
  const previousUserIdRef = useRef('')
  const dispatch = useDispatch()

  useEffect(() => {
    const fetchData = async () => {
      if (isAuthenticated) {
        const token = await getToken()
        dispatch(fetchUser(token))
        dispatch(fetchConnections(token))
      } else {
        dispatch(clearUser())
      }
    }
    fetchData()
  }, [isAuthenticated, getToken, dispatch])

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!isAuthenticated || !currentUserId) {
      previousUserIdRef.current = ''
      clearOpenChats()
      return
    }

    if (previousUserIdRef.current && previousUserIdRef.current !== currentUserId) {
      clearOpenChats()
    }
    previousUserIdRef.current = currentUserId
  }, [clearOpenChats, currentUserId, isAuthenticated])

  useEffect(() => {
    if (isAuthenticated && currentUser?.role === 'admin' && !pathname.startsWith('/admin') && !pathname.startsWith('/auth/')) {
      navigate('/admin', { replace: true })
    }
  }, [currentUser?.role, isAuthenticated, navigate, pathname])

  // Initialize Socket.IO connection
  useEffect(() => {
    if (currentUser?._id) {
      if (!socketRef.current) {
        const socket = io(import.meta.env.VITE_BASEURL, {
          // Chỉ dùng WebSocket, bỏ polling.
          // PM2 cluster: polling requests round-robin giữa workers →
          // worker nhận POST không có session của GET → 400 error.
          // WebSocket là TCP persistent → luôn vào đúng 1 worker.
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 10,
          timeout: 20000,
        })

        socketRef.current = socket
        setSocket(socket)

        socket.on('connect', () => {
          socket.emit('user-connect', currentUser._id)
        })

        socket.on('user-status-changed', (presence) => {
          dispatch(updateUserPresence(presence))
        })

        const refreshConnectionsFromSocket = async () => {
          const token = await getToken()
          if (token) dispatch(fetchConnections(token))
        }

        const fetchRealtimePost = async (postId, fallbackPost = null) => {
          if (fallbackPost) dispatch(upsertPost(fallbackPost))
          if (!postId) return

          try {
            const token = await getToken()
            const { data } = await api.get(`/api/post/${postId}`, {
              headers: { Authorization: `Bearer ${token}` }
            })
            if (data.success && data.post) dispatch(upsertPost(data.post))
          } catch (error) {
            console.error('post realtime fetch error:', error)
          }
        }

        const fetchRealtimeStory = async (storyId, fallbackStory = null) => {
          if (fallbackStory) dispatch(addStoryLocal(fallbackStory))
          if (!storyId) return

          try {
            const token = await getToken()
            const { data } = await api.get(`/api/story/${storyId}`, {
              headers: { Authorization: `Bearer ${token}` }
            })
            if (data.success && data.story) dispatch(addStoryLocal(data.story))
          } catch (error) {
            console.error('story realtime fetch error:', error)
          }
        }

        // Listen for new messages — dispatch to Redux so all components update instantly
        socket.on('new-message', (message) => {
          // Always add incoming message to Redux messages slice
          dispatch(addMessages(message))

          // If user is not currently viewing the chat, open mini chat preview
          const currentId = getUserId(currentUser._id)
          const fromId = getUserId(message.from_user_id)
          const toId = getUserId(message.to_user_id)
          const conversationId = fromId === currentId ? toId : fromId
          if (pathnameRef.current !== (`/messages/${conversationId}`) && message.message_type !== 'reaction' && message.message_type !== 'call') {
            openChatFromMessage(message, currentUser._id)
          }

          // Trigger sidebar / recent messages update
          dispatch(setNewMessageTrigger(Date.now()))
        })

        // Message edited
        socket.on('message-edited', ({ messageId, text }) => {
          dispatch(editMessageLocal({ messageId, text }))
          dispatch(setNewMessageTrigger(Date.now()))
        })

        // Message deleted
        socket.on('message-deleted', ({ messageId }) => {
          dispatch(deleteMessageLocal(messageId))
          dispatch(setNewMessageTrigger(Date.now()))
        })

        // Reaction updated
        socket.on('message-reaction-updated', ({ messageId, reactions }) => {
          dispatch(updateMessageReactionsLocal({ messageId, reactions }))
          dispatch(setNewMessageTrigger(Date.now()))
        })

        // ── Incoming Call ─────────────────────────────────────────────
        socket.on('incoming-call', (data) => {
          if (activeCallRef.current) return
          const isGroupCall = !!(
            data?.groupCall === true ||
            data?.groupCall === 'true' ||
            data?.isGroupCall === true ||
            data?.isGroupCall === 'true' ||
            data?.groupId ||
            data?.callScope === 'group' ||
            data?.conversationType === 'group'
          )
          const call = {
            ...data,
            isIncoming: true,
            groupCall: isGroupCall || data?.groupCall,
            isGroupCall: isGroupCall || data?.isGroupCall,
            callScope: isGroupCall ? 'group' : data?.callScope,
            conversationType: isGroupCall ? 'group' : data?.conversationType,
          }
          activeCallRef.current = call
          setActiveCall(call)
        })

        socket.on('call-blocked', () => {
          activeCallRef.current = null
          setActiveCall(null)
          toast.error('Không thể gọi trong đoạn chat này')
        })

        // NOTE: 'call-accepted' KHÔNG được xử lý ở App level nữa.
        // CallModal của caller tự đăng ký listener trực tiếp trên socket.

        // Listen for friend requests
        socket.on('friend-request', (notification) => {
          dispatch(addNotification(notification))
          refreshConnectionsFromSocket()
        })

        socket.on('connection-accepted', (notification) => {
          dispatch(addNotification(notification))
          refreshConnectionsFromSocket()
        })

        socket.on('new-story', (notification) => {
          dispatch(addNotification(notification))
          const story = buildRealtimeStoryFromNotification(notification)
          fetchRealtimeStory(notification?.data?.story_id || story?._id, story)
        })

        socket.on('new-live-notification', (notification) => {
          dispatch(addNotification(notification))
        })

        socket.on('story-created', (story) => {
          fetchRealtimeStory(story?._id, story)
        })

        socket.on('story-deleted', ({ storyId }) => {
          dispatch(deleteStoryLocal(storyId))
        })

        socket.on('story-reaction-updated', ({ storyId, reactions }) => {
          dispatch(updateStoryReactionsLocal({ storyId, reactions }))
        })

        socket.on('new-post-notification', (notification) => {
          dispatch(addNotification(notification))
          const post = buildRealtimePostFromNotification(notification)
          fetchRealtimePost(notification?.data?.post_id || post?._id, post)
        })

        socket.on('post-created', (post) => {
          fetchRealtimePost(post?._id, post)
        })

        socket.on('post-reaction-updated', ({ postId, reactions, likes_count }) => {
          dispatch(updatePostReactions({ postId, reactions, likes_count }))
        })

        socket.on('post-comment-created', ({ postId, totalCommentsCount }) => {
          if (Number.isFinite(totalCommentsCount)) {
            dispatch(updateCommentCount({ postId, count: totalCommentsCount }))
          }
        })

        socket.on('post-reply-created', ({ postId, totalCommentsCount }) => {
          if (Number.isFinite(totalCommentsCount)) {
            dispatch(updateCommentCount({ postId, count: totalCommentsCount }))
          }
        })

        socket.on('post-comment-deleted', ({ postId, totalCommentsCount }) => {
          if (Number.isFinite(totalCommentsCount)) {
            dispatch(updateCommentCount({ postId, count: totalCommentsCount }))
          }
        })

        socket.on('post-reply-deleted', ({ postId, totalCommentsCount }) => {
          if (Number.isFinite(totalCommentsCount)) {
            dispatch(updateCommentCount({ postId, count: totalCommentsCount }))
          }
        })

        socket.on('post-share-updated', ({ postId, shares_count }) => {
          dispatch(updatePostShares({ postId, shares_count }))
        })

        socket.on('post-deleted', ({ postId }) => {
          dispatch(deletePost(postId))
        })

        socket.on('post-visibility-updated', ({ postId, is_hidden }) => {
          if (is_hidden) dispatch(deletePost(postId))
        })

        socket.on('new-comment-notification', (notification) => {
          dispatch(addNotification(notification))
        })

        socket.on('new-reply-notification', (notification) => {
          dispatch(addNotification(notification))
        })

        socket.on('new-like-notification', (notification) => {
          dispatch(addNotification(notification))
        })

        socket.on('new-reaction-notification', (notification) => {
          dispatch(addNotification(notification))
        })

        socket.on('new-message-reaction-notification', (notification) => {
          dispatch(addNotification(notification))
        })

        socket.on('new-story-reaction-notification', (notification) => {
          dispatch(addNotification(notification))
        })

        // Khi admin lock tài khoản → force logout ngay lập tức
        socket.on('account-locked', () => {
          sessionStorage.setItem(ACCOUNT_LOCKED_STORAGE_KEY, ACCOUNT_LOCKED_MESSAGE)
          logout()
          dispatch(clearUser())
          socket.disconnect()
          socketRef.current = null
          setSocket(null)
          window.location.replace('/')
        })

        socket.on('disconnect', () => {
          console.log('❌ Socket disconnected')
        })

        socket.on('error', (error) => {
          console.error('❌ Socket error:', error)
        })
      }
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setSocket(null)
      }
    }
  }, [currentUser?._id, dispatch, getToken, openChatFromMessage, setSocket, socketRef])

  const handleStartCall = useCallback((callData) => {
    activeCallRef.current = callData
    setActiveCall(callData)
  }, [])

  const handleCloseCall = useCallback(() => {
    activeCallRef.current = null
    setActiveCall(null)
  }, [])

  // Show loading while verifying auth
  if (loading) {
    return <Loading />
  }

  return (
    <>
      <Toaster />
      <Routes>
        <Route path='/auth/callback' element={<AuthCallback />} />
        <Route path='/admin/*' element={isAuthenticated ? <AdminRoute currentUser={currentUser} /> : <Login />} />
        <Route path='/' element={isAuthenticated ? <Layout onStartCall={handleStartCall} /> : <Login />}>
          <Route index element={<HomeRedirect currentUser={currentUser} />} />
          <Route path='feed' element={<Feed />} />
          <Route path='messages' element={<Message onStartCall={handleStartCall} />} />
          <Route path='messages/group/:groupId' element={<Message onStartCall={handleStartCall} />} />
          <Route path='messages/:userId' element={<Message onStartCall={handleStartCall} />} />
          <Route path='connections' element={<Connections />} />
          <Route path='discover' element={<Discover />} />
          <Route path='profile' element={<Profile />} />
          <Route path='profile/:profileId' element={<Profile />} />
          <Route path='create-post' element={<CreatePost />} />
          <Route path='post/:postId' element={<PostDetail />} />
          <Route path='live/:streamId' element={<LiveStream />} />
        </Route>
      </Routes>

      {/* Global Call Modal — renders over everything */}
      {activeCall && currentUser && (
        <CallModal
          callInfo={activeCall}
          isIncoming={!!activeCall.isIncoming}
          onClose={handleCloseCall}
        />
      )}
    </>
  )
}

// ─── Root App with SocketProvider ─────────────────────────────────────────────
const App = () => (
  <SocketProvider>
    <AppInner />
  </SocketProvider>
)

export default App
