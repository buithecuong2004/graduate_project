import React, { useEffect, useRef, useState } from 'react'
import { ImageIcon, SendHorizonal, X } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import api from '../api/axios'
import { addMessages, fetchMessages, resetMessages } from '../features/messages/messagesSlice'
import toast from 'react-hot-toast'
import Loading from '../components/Loading'

const ChatBox = () => {

  const {messages} = useSelector((state)=>state.messages)
  const currentUser = useSelector((state)=>state.user.value)
  const { userId } = useParams()
  const { getToken } = useAuth()
  const dispatch = useDispatch()

  const [text, setText] = useState('')
  const [images, setImages] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messageCount, setMessageCount] = useState(0)
  const messagesEndRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)

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

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index))
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
      if(!text && images.length === 0) return

      const token = await getToken()
      const formData = new FormData()
      formData.append('to_user_id', userId)
      formData.append('text', text)

      if(images.length > 0) {
        images.forEach((img) => {
          formData.append('images', img)
        })
      }

      const {data} = await api.post('/api/message/send', formData, {
        headers: {Authorization: `Bearer ${token}`}
      })

      if(data.success) {
        setText('')
        setImages([])
        dispatch(addMessages(data.message))
        shouldAutoScrollRef.current = true // Enable scroll for new message
      } else {
        throw new Error(data.message)
      }
    } catch (error) {
      toast.error(error.message)
    }
  }

  useEffect(()=>{
    fetchUserData()
    fetchUserMessages()

    // Poll for new messages every 2 seconds as fallback
    const pollInterval = setInterval(() => {
      fetchUserMessages()
    }, 2000)

    return () => {
      dispatch(resetMessages())
      clearInterval(pollInterval)
    }
  },[userId, dispatch])

  useEffect(()=>{
    // Only scroll if we have new messages (not just polling updates)
    if(messages.length > messageCount && shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({behavior: "smooth"})
      setMessageCount(messages.length)
    } else if(messages.length > messageCount) {
      // Update count but don't scroll if user is reading old messages
      setMessageCount(messages.length)
    }
  },[messages, messageCount])

  if(loading) return <Loading height='100vh'/>

  return user && (
    <div className='flex flex-col h-screen'>
      <div className='flex items-center gap-3 p-4 md:px-10 bg-linear-to-r from-indigo-50 to-purple-50 border-b border-gray-200 shadow-sm'>
        <img src={user.profile_picture} alt="" className='size-10 rounded-full shadow-sm'/>
        <div>
          <p className='font-semibold text-slate-800'>{user.full_name}</p>
          <p className='text-sm text-gray-500'>@{user.username}</p>
        </div>
      </div>
      <div className='p-5 md:px-10 h-full overflow-y-scroll bg-gray-50'>
        <div className='space-y-4 max-w-4xl mx-auto'>
          {
            messages.toSorted((a,b)=> new Date(a.createdAt) - new Date(b.createdAt)).map((message, index)=>{
              const isOwn = message.from_user_id?._id === currentUser._id
              const mediaUrls = message.media_urls || (message.media_url ? [message.media_url] : [])

              return (
                <div key={index} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 text-sm max-w-sm rounded-2xl shadow-sm ${isOwn ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-white text-slate-800 rounded-bl-none border border-gray-200'}`}>
                    {mediaUrls.length > 0 && (
                        <div className='flex flex-wrap gap-2 mb-2'>
                          {mediaUrls.map((url, idx) => (
                            <img key={idx} src={url} alt="sent-image" className='w-full max-w-sm rounded-lg'/>
                          ))}
                        </div>
                    )}
                    {message.text && <p className='break-words'>{message.text}</p>}
                  </div>
                </div>
              )
            })
          }
          <div ref={messagesEndRef}></div>
        </div>
      </div>
      <div className='px-4 pb-5'>
        {images.length > 0 && (
          <div className='flex flex-wrap gap-2 mb-3 p-3 bg-white rounded-lg border border-gray-200 max-w-2xl mx-auto'>
            {images.map((img, idx) => (
              <div key={idx} className='relative group'>
                <img src={URL.createObjectURL(img)} alt="" className='h-16 rounded-md'/>
                <button
                  onClick={() => removeImage(idx)}
                  className='absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition'
                >
                  <X size={14} className='text-white'/>
                </button>
              </div>
            ))}
            <p className='text-xs text-gray-500 w-full'>({images.length}/5)</p>
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

          <button onClick={sendMessage} className='bg-linear-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-95 cursor-pointer text-white p-2 rounded-full transition'>
            <SendHorizonal size={18}/>
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatBox