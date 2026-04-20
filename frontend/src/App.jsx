import React from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import Feed from './pages/Feed'
import Message from './pages/Message'
import ChatBox from './pages/ChatBox'
import Connections from './pages/Connections'
import Discover from './pages/Discover'
import Profile from './pages/Profile'
import CreatePost from './pages/CreatePost'
import PostDetail from './pages/PostDetail'
import Notification from './components/Notification'
import { useUser, useAuth } from '@clerk/clerk-react'
import Layout from './pages/Layout'
import {Toaster} from 'react-hot-toast'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchUser } from './features/user/userSlice'
import { fetchConnections } from './features/connections/connectionsSlice'
import { useRef } from 'react'
import { addMessages, setNewMessageTrigger, editMessageLocal, deleteMessageLocal, updateMessageReactionsLocal } from './features/messages/messagesSlice'
import { addNotification } from './features/notifications/notificationsSlice'
import toast from 'react-hot-toast'
import { Navigate } from 'react-router-dom'

import { io } from 'socket.io-client'

const App = () => {
  const {user: clerkUser} = useUser()
  const {getToken} = useAuth()
  const {pathname} = useLocation()
  const pathnameRef = useRef(pathname)
  const socketRef = useRef(null)
  const currentUser = useSelector((state)=>state.user.value)
  const dispatch = useDispatch()

  useEffect(()=>{
    const fetchData = async () => {
      if(clerkUser) {
        const token = await getToken()
        dispatch(fetchUser(token))
        dispatch(fetchConnections(token))
      }
    }
    fetchData()
  },[clerkUser, getToken, dispatch])

  useEffect(()=>{
    pathnameRef.current = pathname
  },[pathname])

  // Initialize Socket.IO connection
  useEffect(()=>{
    if(currentUser?._id) {
      if(!socketRef.current) {
        const socket = io(import.meta.env.VITE_BASEURL, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5
        })

        socketRef.current = socket

        socket.on('connect', () => {
          console.log('🔌 Socket connected:', socket.id)
          socket.emit('user-connect', currentUser._id)
        })

        // Listen for new messages
       socket.on('new-message', (message) => {
        if(pathnameRef.current === (`/messages/${message.from_user_id?._id}`)) {
            dispatch(addMessages(message))
        } else {
            toast.custom((t) => <Notification t={t} message={message}/>, {position: "bottom-right"})
        }
        dispatch(setNewMessageTrigger(Date.now()))
       })

       // Listen for message updates
       socket.on('message-edited', ({ messageId, text }) => {
         dispatch(editMessageLocal({ messageId, text }))
       })

       socket.on('message-deleted', ({ messageId }) => {
         dispatch(deleteMessageLocal(messageId))
       })

       socket.on('message-reaction-updated', ({ messageId, reactions }) => {
         dispatch(updateMessageReactionsLocal({ messageId, reactions }))
       })

        // Listen for friend requests
        socket.on('friend-request', (notification) => {
          console.log('🤝 Friend request received:', notification)
          dispatch(addNotification(notification))
        })

        // Listen for connection accepted
        socket.on('connection-accepted', (notification) => {
          console.log('✅ Connection accepted:', notification)
          dispatch(addNotification(notification))
        })

        // Listen for new stories
        socket.on('new-story', (notification) => {
          console.log('📖 New story received:', notification)
          dispatch(addNotification(notification))
        })

        // Listen for new posts
        socket.on('new-post-notification', (notification) => {
          console.log('📝 New post notification:', notification)
          dispatch(addNotification(notification))
        })

        // Listen for new comments
        socket.on('new-comment-notification', (notification) => {
          console.log('💬 New comment notification:', notification)
          dispatch(addNotification(notification))
        })

        // Listen for new replies
        socket.on('new-reply-notification', (notification) => {
          console.log('💬 New reply notification:', notification)
          dispatch(addNotification(notification))
        })

        // Listen for likes
        socket.on('new-like-notification', (notification) => {
          console.log('👍 New like notification:', notification)
          dispatch(addNotification(notification))
        })

        // Listen for reactions
        socket.on('new-reaction-notification', (notification) => {
          console.log('😮 New reaction notification:', notification)
          dispatch(addNotification(notification))
        })

        socket.on('new-message-reaction-notification', (notification) => {
          console.log('😮 New message reaction notification:', notification)
          dispatch(addNotification(notification))
        })

        socket.on('new-story-reaction-notification', (notification) => {
          console.log('😮 New story reaction notification:', notification)
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
      if(socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  },[currentUser?._id, dispatch])

  return (
    <>
    <Toaster/>
      <Routes>
        <Route path='/' element={ clerkUser ? <Layout/> : <Login/>}>
          <Route index element={<Navigate to="/feed" replace />}/>
          <Route path='feed' element={<Feed/>}/>
          <Route path='messages' element={<Message/>}/>
          <Route path='messages/:userId' element={<ChatBox/>}/>
          <Route path='connections' element={<Connections/>}/>
          <Route path='discover' element={<Discover/>}/>
          <Route path='profile' element={<Profile/>}/>
          <Route path='profile/:profileId' element={<Profile/>}/>
          <Route path='create-post' element={<CreatePost/>}/>
          <Route path='post/:postId' element={<PostDetail/>}/>
        </Route>
      </Routes>
    </>
  )
}

export default App