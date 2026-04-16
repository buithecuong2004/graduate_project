import React, { useEffect, useRef, useState } from 'react'
import { ImageIcon, SendHorizonal, X, Video } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import api from '../api/axios'
import { addMessages, fetchMessages, resetMessages } from '../features/messages/messagesSlice'
import toast from 'react-hot-toast'
import Loading from '../components/Loading'
import moment from 'moment'

const ChatBox = () => {

  const {messages} = useSelector((state)=>state.messages)
  const currentUser = useSelector((state)=>state.user.value)
  const { userId } = useParams()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const [text, setText] = useState('')
  const [images, setImages] = useState([])
  const [videos, setVideos] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)

  // Render message text with clickable links
  const renderMessageText = (text) => {
    if (!text) return null
    
    // Match URLs like /post/123abc or http://...
    const urlPattern = /(\/post\/[a-zA-Z0-9]{0,}|https?:\/\/[^\s]+)/g
    const parts = text.split(urlPattern)
    
    return (
      <p className='break-words'>
        {parts.map((part, idx) => {
          if (!part) return null
          
          // Check if it's a URL
          if (part.match(urlPattern)) {
            // Extract just the /post/id part if it's a full URL with /post/ in it
            const postMatch = part.match(/\/post\/[a-zA-Z0-9]+/)
            const postId = postMatch ? postMatch[0].replace('/post/', '') : null
            
            return postId ? (
              <a
                key={idx}
                onClick={() => navigate(`/post/${postId}`)}
                className='text-blue-300 underline cursor-pointer hover:text-blue-100'
                title={`View post ${postId}`}
              >
                {part}
              </a>
            ) : (
              <a
                key={idx}
                href={part}
                target='_blank'
                rel='noopener noreferrer'
                className='text-blue-300 underline cursor-pointer hover:text-blue-100'
              >
                {part}
              </a>
            )
          }
          
          return <span key={idx}>{part}</span>
        })}
      </p>
    )
  }
  // Check if we should show timestamp for this message
  const shouldShowTimestamp = (currentMsg, previousMsg) => {
    // Always show for first message
    if (!previousMsg) return true
    
    const currentTime = new Date(currentMsg.createdAt)
    const previousTime = new Date(previousMsg.createdAt)
    
    // Show timestamp if gap is more than 5 minutes
    const timeDiffMinutes = (currentTime - previousTime) / (1000 * 60)
    return timeDiffMinutes >= 5
  }

  // Format time display like Facebook Messenger
  const formatMessageTime = (date) => {
    const messageTime = moment(date)
    const today = moment()
    const yesterday = moment().subtract(1, 'day')
    
    if (messageTime.isSame(today, 'day')) {
      // Today - show time only
      return messageTime.format('HH:mm')
    } else if (messageTime.isSame(yesterday, 'day')) {
      // Yesterday
      return 'Hôm qua ' + messageTime.format('HH:mm')
    } else if (messageTime.isSame(today, 'year')) {
      // Same year - show date without year
      return messageTime.format('DD/MM HH:mm')
    } else {
      // Different year
      return messageTime.format('DD/MM/YYYY HH:mm')
    }
  }

  const validateImages = (files) => {
    const maxSize = 10 * 1024 * 1024; // 10MB per image
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

    for(let file of files) {
      if(!allowedTypes.includes(file.type)) {
        toast.error('Invalid image format. Only JPG, PNG, WebP, GIF allowed')
        return false
      }
      if(file.size > maxSize) {
        toast.error('Each image must be less than 10MB')
        return false
      }
    }

    return true
  }

  const validateVideos = (files) => {
    const maxSize = 100 * 1024 * 1024; // 100MB per video
    const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']

    for(let file of files) {
      if(!allowedTypes.includes(file.type)) {
        toast.error('Invalid video format. Only MP4, WebM, OGG, MOV allowed')
        return false
      }
      if(file.size > maxSize) {
        toast.error('Each video must be less than 100MB')
        return false
      }
    }

    return true
  }

  const handleImagesChange = (e) => {
    const newFiles = Array.from(e.target.files)

    if(images.length + newFiles.length > 5) {
      toast.error('Maximum 5 images per message')
      return
    }

    if(validateImages(newFiles)) {
      setImages([...images, ...newFiles])
    }
  }

  const handleVideosChange = (e) => {
    const newFiles = Array.from(e.target.files)

    if(videos.length + newFiles.length > 3) {
      toast.error('Maximum 3 videos per message')
      return
    }

    if(validateVideos(newFiles)) {
      setVideos([...videos, ...newFiles])
    }
  }

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index))
  }

  const removeVideo = (index) => {
    setVideos(videos.filter((_, i) => i !== index))
  }

  const fetchUserData = async() => {
    try {
      const { data } = await api.post('/api/user/profiles', {profileId: userId})
      if(data.success) {
        setUser(data.profile)
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchUserMessages = async() => {
    try {
      const token = await getToken()
      dispatch(fetchMessages({token, userId}))
    } catch (error) {
      toast.error(error.message)
    }
  }

  const sendMessage = async () =>  {
    try {
      if(!text && images.length === 0 && videos.length === 0) return

      const token = await getToken()
      const formData = new FormData()
      formData.append('to_user_id', userId)
      formData.append('text', text)

      if(images.length > 0) {
        images.forEach((img) => {
          formData.append('images', img)
        })
      }

      if(videos.length > 0) {
        videos.forEach((vid) => {
          formData.append('videos', vid)
        })
      }

      const {data} = await api.post('/api/message/send', formData, {
        headers: {Authorization: `Bearer ${token}`}
      })

      if(data.success) {
        setText('')
        setImages([])
        setVideos([])
        dispatch(addMessages(data.message))
        // Scroll to bottom after sending
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({behavior: "smooth"})
        }, 100)
      } else {
        throw new Error(data.message)
      }
    } catch (error) {
      toast.error(error.message)
    }
  }

  const markMessagesAsRead = async () => {
    try {
      const token = await getToken()
      await api.post('/api/user/mark-messages-read',
        { from_user_id: userId },
        { headers: { Authorization: `Bearer ${token}` } }
      )
    } catch (error) {
      console.error('mark-as-read error:', error)
    }
  }

  useEffect(()=>{
    fetchUserData()
    fetchUserMessages()
    markMessagesAsRead() // ✅ Đánh dấu đã đọc ngay khi mở ChatBox

    return () => {
      dispatch(resetMessages())
      // Clean up video object URLs
      videos.forEach(vid => URL.revokeObjectURL(URL.createObjectURL(vid)))
    }
  },[userId, dispatch, videos])

  // Listen to real-time messages via SSE
  useEffect(()=>{
    if(currentUser?._id) {
      const eventSource = new EventSource(import.meta.env.VITE_BASEURL + '/api/message/' + currentUser._id)

      eventSource.onmessage = (event) => {
        try {
          const newMessage = JSON.parse(event.data)
          // Only add if message is from or to the current person we're chatting with
          if(newMessage.from_user_id._id === userId || newMessage.to_user_id._id === userId) {
            console.log('New message received in ChatBox:', newMessage)
            dispatch(addMessages(newMessage))
            shouldAutoScrollRef.current = true
            // ✅ Tin nhắn đến từ người kia → đánh dấu đã đọc ngay
            if(newMessage.from_user_id._id === userId) {
              markMessagesAsRead()
            }
          }
        } catch (error) {
          console.error('Error parsing SSE message in ChatBox:', error)
        }
      }

      eventSource.onerror = (error) => {
        console.error('EventSource error in ChatBox:', error)
        eventSource.close()
      }

      return () => {
        console.log('Closing EventSource in ChatBox')
        eventSource.close()
      }
    }
  },[userId, currentUser?._id, dispatch])

  useEffect(()=>{
    // Only scroll if we have new messages
    if(messages.length > 0 && shouldAutoScrollRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({behavior: "smooth"})
      }, 50)
    }
  },[messages])

  if(loading) return <Loading height='100vh'/>

  return user && (
    <div className='flex flex-col h-screen'>
      <div className='flex items-center pl-8 pt-2 pb-2 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200 shadow-sm'>
        <img src={user.profile_picture} alt="" className='size-10 rounded-full shadow-sm'/>
        <div className='ml-4'>
          <p className='font-semibold text-slate-800'>{user.full_name}</p>
          <p className='text-sm text-gray-500'>@{user.username}</p>
        </div>
      </div>
      <div className='p-5 md:px-10 h-full overflow-y-scroll bg-gray-50' ref={messagesContainerRef} onScroll={() => {
          // Disable auto-scroll if user scrolls up
          if(messagesContainerRef.current) {
            const {scrollTop, scrollHeight, clientHeight} = messagesContainerRef.current
            shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100
          }
        }}>
        <div className='space-y-4 max-w-4xl mx-auto'>
          {
            messages.toSorted((a,b)=> new Date(a.createdAt) - new Date(b.createdAt)).map((message, index)=>{
              const isOwn = message.from_user_id?._id === currentUser._id
              const mediaUrls = message.media_urls || (message.media_url ? [message.media_url] : [])
              const previousMessage = index > 0 ? messages.toSorted((a,b)=> new Date(a.createdAt) - new Date(b.createdAt))[index - 1] : null
              const showTimestamp = shouldShowTimestamp(message, previousMessage)

              return (
                <div key={index}>
                  {showTimestamp && (
                    <div className='flex justify-center my-3'>
                      <p className='text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full'>
                        {formatMessageTime(message.createdAt)}
                      </p>
                    </div>
                  )}
                  <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-3 text-sm max-w-sm rounded-2xl shadow-sm ${isOwn ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-white text-slate-800 rounded-bl-none border border-gray-200'}`}>
                      {mediaUrls.length > 0 && (
                          <div className='flex flex-wrap gap-2 mb-2'>
                            {mediaUrls.map((url, idx) => {
                              const isVideo = url.includes('.mp4') || url.includes('.webm') || url.includes('.mov')
                              return isVideo ? (
                                <video key={idx} src={url} controls className='w-full max-w-sm rounded-lg'/>
                              ) : (
                                <img key={idx} src={url} alt="sent-image" className='w-full max-w-sm rounded-lg'/>
                              )
                            })}
                          </div>
                      )}
                      {message.text && renderMessageText(message.text)}
                    </div>
                  </div>
                </div>
              )
            })
          }
          <div ref={messagesEndRef}></div>
        </div>
      </div>
      <div className='px-4 pb-5'>
        {(images.length > 0 || videos.length > 0) && (
          <div className='flex flex-wrap gap-2 mb-3 p-3 bg-white rounded-lg border border-gray-200 max-w-4xl mx-auto'>
            {images.map((img, idx) => (
              <div key={`img-${idx}`} className='relative group'>
                <img src={URL.createObjectURL(img)} alt="" className='h-16 rounded-md'/>
                <button
                  onClick={() => removeImage(idx)}
                  className='absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition'
                >
                  <X size={14} className='text-white'/>
                </button>
              </div>
            ))}
            {videos.map((vid, idx) => (
              <div key={`vid-${idx}`} className='relative group'>
                <video src={URL.createObjectURL(vid)} className='h-16 rounded-md' />
                <button
                  onClick={() => removeVideo(idx)}
                  className='absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition'
                >
                  <X size={14} className='text-white'/>
                </button>
              </div>
            ))}
            <p className='text-xs text-gray-500 w-full'>({images.length}/5 images, {videos.length}/3 videos)</p>
          </div>
        )}
        <div className='flex items-center gap-3 pl-5 p-1.5 bg-white w-full max-w-2xl mx-auto border border-gray-200 shadow-sm rounded-full'>
          <input type="text" className='flex-1 outline-none text-slate-700 bg-transparent'
          placeholder='Type a message...'
          onKeyDown={e=>e.key === 'Enter' && sendMessage()}
          onChange={(e)=>setText(e.target.value)} value={text}
          />

          <label htmlFor="images" className='cursor-pointer'>
            <ImageIcon className='size-6 text-gray-400 hover:text-gray-600 transition'/>
            <input
              type="file"
              id='images'
              accept='image/*'
              hidden
              multiple
              onChange={handleImagesChange}
            />
          </label>

          <label htmlFor="videos" className='cursor-pointer'>
            <Video className='size-6 text-gray-400 hover:text-gray-600 transition'/>
            <input
              type="file"
              id='videos'
              accept='video/*'
              hidden
              multiple
              onChange={handleVideosChange}
            />
          </label>

          <button onClick={sendMessage} className='bg-linear-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-95 cursor-pointer text-white p-2 rounded-full transition'>
            <SendHorizonal size={18}/>
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatBox