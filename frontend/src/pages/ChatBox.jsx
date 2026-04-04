import React, { useEffect, useRef, useState } from 'react'
import { ImageIcon, SendHorizonal } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import api from '../api/axios'
import { addMessages, fetchMessages, resetMessages } from '../features/messages/messagesSlice'
import toast from 'react-hot-toast'
import Loading from '../components/Loading'

const ChatBox = () => {

  const {messages} = useSelector((state)=>state.messages)
  const { userId } = useParams()
  const { getToken } = useAuth()
  const dispatch = useDispatch()

  const [text, setText] = useState('')
  const [image, setImage] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)

  const fetchUserData = async() => {
    try {
      const { data } = await api.post('/api/user/profiles', {profileId: userId})
      if(data.success) {
        setUser(data.profile)
      }
    } catch (error) {
      toast.error('Failed to load user')
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
      if(!text && !image) return

      const token = await getToken()
      const formData = new FormData()
      formData.append('to_user_id',userId)
      formData.append('text',text)
      image && formData.append('image', image)

      const {data} = await api.post('/api/message/send', formData, {
        headers: {Authorization: `Bearer ${token}`}
      })
      if(data.success) {
        setText('')
        setImage(null)
        dispatch(addMessages(data.message))
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
    messagesEndRef.current?.scrollIntoView({behavior: "smooth"})
  },[messages])

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
              const isOwn = message.to_user_id === user._id
              return (
                <div key={index} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 text-sm max-w-sm rounded-2xl shadow-sm ${isOwn ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-white text-slate-800 rounded-bl-none border border-gray-200'}`}>
                    {
                      message.message_type === 'image' && message.media_url && (
                        <img src={message.media_url} alt="sent-image" className='w-full max-w-sm rounded-lg mb-2'/>
                      )
                    }
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
          <div className='flex items-center gap-3 pl-5 p-1.5 bg-white w-full max-w-2xl mx-auto border border-gray-200 shadow-sm rounded-full'>
            <input type="text" className='flex-1 outline-none text-slate-700 bg-transparent'
            placeholder='Type a message...'
            onKeyDown={e=>e.key === 'Enter' && sendMessage()}
            onChange={(e)=>setText(e.target.value)} value={text}
            />

            <label htmlFor="image">
              {
                image
                ? <img src={URL.createObjectURL(image)} alt="" className='h-8 rounded'/>
                : <ImageIcon className='size-6 text-gray-400 cursor-pointer hover:text-gray-600 transition'/>
              }
              <input type="file" id='image' accept='image/*' hidden onChange={(e)=>setImage(e.target.files[0])}/>
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