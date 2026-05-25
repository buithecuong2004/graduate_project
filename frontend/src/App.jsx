import React, { useCallback } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Feed from './pages/Feed'
import Message from './pages/Message'
import Connections from './pages/Connections'
import Discover from './pages/Discover'
import Profile from './pages/Profile'
import CreatePost from './pages/CreatePost'
import PostDetail from './pages/PostDetail'
import { useAuth } from './context/AuthContext'
import Layout from './pages/Layout'
import toast, { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchUser } from './features/user/userSlice'
import { fetchConnections, updateUserPresence } from './features/connections/connectionsSlice'
import { useRef } from 'react'
import { addMessages, setNewMessageTrigger, editMessageLocal, deleteMessageLocal, updateMessageReactionsLocal } from './features/messages/messagesSlice'
import { addNotification } from './features/notifications/notificationsSlice'
import { Navigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { SocketProvider, useSocket } from './context/SocketContext'
import CallModal from './components/CallModal'

const getUserId = (userOrId) => userOrId?._id?.toString?.() || userOrId?.toString?.() || ''

// ─── Inner App (needs SocketProvider to be parent) ───────────────────────────
const AppInner = () => {
  const { isAuthenticated, getToken, loading } = useAuth()
  const { pathname } = useLocation()
  const pathnameRef = useRef(pathname)

  // callAcceptedSignal đã được loại bỏ — CallModal tự lắng nghe socket trực tiếp
  const { socketRef, setSocket, openChatFromMessage } = useSocket()

  const [activeCall, setActiveCall] = useState(null)
  const activeCallRef = useRef(null)
  const currentUser = useSelector((state) => state.user.value)
  const dispatch = useDispatch()

  useEffect(() => {
    const fetchData = async () => {
      if (isAuthenticated) {
        const token = await getToken()
        dispatch(fetchUser(token))
        dispatch(fetchConnections(token))
      }
    }
    fetchData()
  }, [isAuthenticated, getToken, dispatch])

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  // Initialize Socket.IO connection
  useEffect(() => {
    if (currentUser?._id) {
      if (!socketRef.current) {
        const socket = io(import.meta.env.VITE_BASEURL, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5
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
          const call = { ...data, isIncoming: true }
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
        })

        socket.on('new-post-notification', (notification) => {
          dispatch(addNotification(notification))
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <>
      <Toaster />
      <Routes>
        <Route path='/auth/callback' element={<AuthCallback />} />
        <Route path='/' element={isAuthenticated ? <Layout onStartCall={handleStartCall} /> : <Login />}>
          <Route index element={<Navigate to="/feed" replace />} />
          <Route path='feed' element={<Feed />} />
          <Route path='messages' element={<Message onStartCall={handleStartCall} />} />
          <Route path='messages/:userId' element={<Message onStartCall={handleStartCall} />} />
          <Route path='connections' element={<Connections />} />
          <Route path='discover' element={<Discover />} />
          <Route path='profile' element={<Profile />} />
          <Route path='profile/:profileId' element={<Profile />} />
          <Route path='create-post' element={<CreatePost />} />
          <Route path='post/:postId' element={<PostDetail />} />
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
