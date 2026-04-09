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
import Notification from './components/Notification'
import { useUser, useAuth } from '@clerk/clerk-react'
import Layout from './pages/Layout'
import {Toaster} from 'react-hot-toast'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchUser } from './features/user/userSlice'
import { fetchConnections } from './features/connections/connectionsSlice'
import { useRef } from 'react'
import { addMessages } from './features/messages/messagesSlice'
import toast from 'react-hot-toast'


const App = () => {
  const {user: clerkUser} = useUser()
  const {getToken} = useAuth()
  const {pathname} = useLocation()
  const pathnameRef = useRef(pathname)
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

  useEffect(()=>{
    if(currentUser?._id){
      const eventSource = new EventSource(import.meta.env.VITE_BASEURL + '/api/message/' + currentUser._id)

      eventSource.onopen = () => {
        console.log('✅ EventSource connected for user:', currentUser._id)
      }

      eventSource.onmessage = (event)=>{
        try {
          console.log('📨 Raw event data:', event.data)
          const message = JSON.parse(event.data)
          console.log('✅ Parsed message:', message)
          console.log('📍 Current pathname:', pathnameRef.current)
          console.log('💬 Message from_user_id._id:', message.from_user_id?._id)
          
          if(pathnameRef.current === ('/messages/'+message.from_user_id?._id)){
            console.log('📝 Adding to current chat')
            dispatch(addMessages(message))
          } else {
            console.log('🔔 Showing notification toast')
            const toastId = toast.custom((t)=>(
              <Notification t={t} message={message}/>
            ), {position: "bottom-right"})
            console.log('✅ Toast created with id:', toastId)
          }
        } catch (error) {
          console.error('❌ Error parsing SSE message:', error, 'Event data:', event.data)
          toast.error('Failed to process message')
        }
      }

      eventSource.onerror = (error) => {
        console.error('❌ EventSource error:', error)
        if(eventSource.readyState === EventSource.CLOSED) {
          console.log('EventSource closed, reconnecting...')
        }
        eventSource.close()
      }

      return ()=>{
        console.log('Closing EventSource')
        eventSource.close()
      }
    }
  },[currentUser?._id,dispatch])

  return (
    <>
    <Toaster/>
      <Routes>
        <Route path='/' element={ clerkUser ? <Layout/> : <Login/>}>
          <Route index element={<Feed/>}/>
          <Route path='messages' element={<Message/>}/>
          <Route path='messages/:userId' element={<ChatBox/>}/>
          <Route path='connections' element={<Connections/>}/>
          <Route path='discover' element={<Discover/>}/>
          <Route path='profile' element={<Profile/>}/>
          <Route path='profile/:profileId' element={<Profile/>}/>
          <Route path='create-post' element={<CreatePost/>}/>
        </Route>
      </Routes>
    </>
  )
}

export default App