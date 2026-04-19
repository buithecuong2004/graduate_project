import React, { useEffect, useRef, useState } from 'react'
import { ImageIcon, SendHorizonal, X, Video, Mic, Square, Trash2 } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import api from '../api/axios'
import { addMessages, fetchMessages, resetMessages } from '../features/messages/messagesSlice'
import toast from 'react-hot-toast'
import Loading from '../components/Loading'
import moment from 'moment'

const ChatBox = () => {

  const { messages } = useSelector((state) => state.messages)
  const currentUser = useSelector((state) => state.user.value)
  const { userId } = useParams()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const [text, setText] = useState('')
  const [images, setImages] = useState([])
  const [videos, setVideos] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [videoPreviews, setVideoPreviews] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null)
  const [isSendingVoice, setIsSendingVoice] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  // Format recording time as MM:SS
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // Render message text with clickable links
  const renderMessageText = (text) => {
    if (!text) return null

    const urlPattern = /(\/post\/[a-zA-Z0-9]{0,}|https?:\/\/[^\s]+)/g
    const parts = text.split(urlPattern)

    return (
      <p className='break-words'>
        {parts.map((part, idx) => {
          if (!part) return null

          if (part.match(urlPattern)) {
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

  const shouldShowTimestamp = (currentMsg, previousMsg) => {
    if (!previousMsg) return true
    const currentTime = new Date(currentMsg.createdAt)
    const previousTime = new Date(previousMsg.createdAt)
    const timeDiffMinutes = (currentTime - previousTime) / (1000 * 60)
    return timeDiffMinutes >= 5
  }

  const formatMessageTime = (date) => {
    const messageTime = moment(date)
    const today = moment()
    const yesterday = moment().subtract(1, 'day')

    if (messageTime.isSame(today, 'day')) {
      return messageTime.format('HH:mm')
    } else if (messageTime.isSame(yesterday, 'day')) {
      return 'Yesterday ' + messageTime.format('HH:mm')
    } else if (messageTime.isSame(today, 'year')) {
      return messageTime.format('DD/MM HH:mm')
    } else {
      return messageTime.format('DD/MM/YYYY HH:mm')
    }
  }

  const validateImages = (files) => {
    const maxSize = 10 * 1024 * 1024
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    for (let file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast.error('Invalid image format. Only JPG, PNG, WebP, GIF allowed')
        return false
      }
      if (file.size > maxSize) {
        toast.error('Each image must be less than 10MB')
        return false
      }
    }
    return true
  }

  const validateVideos = (files) => {
    const maxSize = 100 * 1024 * 1024
    const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
    for (let file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast.error('Invalid video format. Only MP4, WebM, OGG, MOV allowed')
        return false
      }
      if (file.size > maxSize) {
        toast.error('Each video must be less than 100MB')
        return false
      }
    }
    return true
  }

  const handleImagesChange = (e) => {
    const newFiles = Array.from(e.target.files)
    if (images.length + newFiles.length > 5) {
      toast.error('Maximum 5 images per message')
      return
    }
    if (validateImages(newFiles)) {
      setImages(prev => [...prev, ...newFiles])
      const newPreviews = newFiles.map(f => URL.createObjectURL(f))
      setImagePreviews(prev => [...prev, ...newPreviews])
    }
  }

  const handleVideosChange = (e) => {
    const newFiles = Array.from(e.target.files)
    if (videos.length + newFiles.length > 3) {
      toast.error('Maximum 3 videos per message')
      return
    }
    if (validateVideos(newFiles)) {
      setVideos(prev => [...prev, ...newFiles])
      const newPreviews = newFiles.map(f => URL.createObjectURL(f))
      setVideoPreviews(prev => [...prev, ...newPreviews])
    }
  }

  const removeImage = (index) => {
    URL.revokeObjectURL(imagePreviews[index])
    setImages(images.filter((_, i) => i !== index))
    setImagePreviews(imagePreviews.filter((_, i) => i !== index))
  }

  const removeVideo = (index) => {
    URL.revokeObjectURL(videoPreviews[index])
    setVideos(videos.filter((_, i) => i !== index))
    setVideoPreviews(videoPreviews.filter((_, i) => i !== index))
  }

  // ──────────────────────────────────────────────────────────────
  // Voice recording functions
  // ──────────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioPreviewUrl(url)
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop())
      }

      mediaRecorder.start(100)
      setIsRecording(true)
      setRecordingTime(0)

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (err) {
      toast.error('Microphone access denied. Please allow microphone permission.')
      console.error('Recording error:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    clearInterval(timerRef.current)
    setIsRecording(false)
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    clearInterval(timerRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    setIsRecording(false)
    setRecordingTime(0)
    setAudioBlob(null)
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl)
      setAudioPreviewUrl(null)
    }
  }

  const sendVoiceMessage = async () => {
    if (!audioBlob) return
    try {
      setIsSendingVoice(true)
      const token = await getToken()
      const formData = new FormData()
      formData.append('to_user_id', userId)

      // Determine extension from mimeType
      const ext = audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
      formData.append('voice', audioBlob, `voice_${Date.now()}.${ext}`)

      const { data } = await api.post('/api/message/send', formData, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (data.success) {
        // Clean up
        URL.revokeObjectURL(audioPreviewUrl)
        setAudioBlob(null)
        setAudioPreviewUrl(null)
        setRecordingTime(0)
        dispatch(addMessages(data.message))
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      } else {
        throw new Error(data.message)
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsSendingVoice(false)
    }
  }

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ──────────────────────────────────────────────────────────────

  const fetchUserData = async () => {
    try {
      const { data } = await api.post('/api/user/profiles', { profileId: userId })
      if (data.success) {
        setUser(data.profile)
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchUserMessages = async () => {
    try {
      const token = await getToken()
      dispatch(fetchMessages({ token, userId }))
    } catch (error) {
      toast.error(error.message)
    }
  }

  const sendMessage = async () => {
    try {
      if (!text && images.length === 0 && videos.length === 0) return

      const token = await getToken()
      const formData = new FormData()
      formData.append('to_user_id', userId)
      formData.append('text', text)

      images.forEach((img) => formData.append('images', img))
      videos.forEach((vid) => formData.append('videos', vid))

      const { data } = await api.post('/api/message/send', formData, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (data.success) {
        setText('')
        imagePreviews.forEach(url => URL.revokeObjectURL(url))
        videoPreviews.forEach(url => URL.revokeObjectURL(url))
        setImages([])
        setVideos([])
        setImagePreviews([])
        setVideoPreviews([])
        dispatch(addMessages(data.message))
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
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

  useEffect(() => {
    fetchUserData()
    fetchUserMessages()
    markMessagesAsRead()

    return () => {
      markMessagesAsRead()
      dispatch(resetMessages())
      imagePreviews.forEach(url => URL.revokeObjectURL(url))
      videoPreviews.forEach(url => URL.revokeObjectURL(url))
    }
  }, [userId])

  useEffect(() => {
    if (messages.length === 0) return
    const sorted = [...messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const latest = sorted[0]
    if (latest?.from_user_id?._id === userId) {
      markMessagesAsRead()
    }
  }, [messages.length])

  useEffect(() => {
    if (messages.length > 0 && shouldAutoScrollRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      }, 50)
    }
  }, [messages])

  if (loading) return <Loading height='100vh' />

  return user && (
    <div className='flex flex-col h-screen'>
      <div className='flex items-center pl-8 pt-2 pb-2 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200 shadow-sm'>
        <img src={user.profile_picture} alt="" className='size-10 rounded-full shadow-sm' />
        <div className='ml-4'>
          <p className='font-semibold text-slate-800'>{user.full_name}</p>
          <p className='text-sm text-gray-500'>@{user.username}</p>
        </div>
      </div>

      <div
        className='p-5 md:px-10 h-full overflow-y-scroll bg-gray-50'
        ref={messagesContainerRef}
        onScroll={() => {
          if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
            shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100
          }
        }}
      >
        <div className='space-y-4 max-w-4xl mx-auto'>
          {messages.toSorted((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((message, index) => {
            const isOwn = message.from_user_id?._id === currentUser._id
            const mediaUrls = message.media_urls || (message.media_url ? [message.media_url] : [])
            const sorted = messages.toSorted((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            const previousMessage = index > 0 ? sorted[index - 1] : null
            const showTimestamp = shouldShowTimestamp(message, previousMessage)
            const isVoice = message.message_type === 'voice'

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
                    {/* Voice message */}
                    {isVoice && mediaUrls.length > 0 && (
                      <div className='flex items-center gap-2 min-w-[200px]'>
                        <span className='text-lg'>🎤</span>
                        <audio
                          controls
                          src={mediaUrls[0]}
                          className='h-8 w-full max-w-[220px]'
                          style={{ accentColor: isOwn ? '#fff' : '#6366f1' }}
                        />
                      </div>
                    )}
                    {/* Media (image/video) */}
                    {!isVoice && mediaUrls.length > 0 && (
                      <div className='flex flex-wrap gap-2 mb-2'>
                        {mediaUrls.map((url, idx) => {
                          const isVideo = url.includes('.mp4') || url.includes('.webm') || url.includes('.mov')
                          return isVideo ? (
                            <video key={idx} src={url} controls className='w-full max-w-sm rounded-lg' />
                          ) : (
                            <img key={idx} src={url} alt="sent-image" className='w-full max-w-sm rounded-lg' />
                          )
                        })}
                      </div>
                    )}
                    {message.text && renderMessageText(message.text)}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef}></div>
        </div>
      </div>

      <div className='px-4 pb-5'>
        {(imagePreviews.length > 0 || videoPreviews.length > 0) && (
          <div className='flex flex-wrap gap-2 mb-3 p-3 bg-white rounded-lg border border-gray-200 max-w-4xl mx-auto'>
            {imagePreviews.map((url, idx) => (
              <div key={`img-${idx}`} className='relative group'>
                <img src={url} alt="" className='h-16 rounded-md' />
                <button
                  onClick={() => removeImage(idx)}
                  className='absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition'
                >
                  <X size={14} className='text-white' />
                </button>
              </div>
            ))}
            {videoPreviews.map((url, idx) => (
              <div key={`vid-${idx}`} className='relative group'>
                <video src={url} className='h-16 rounded-md' />
                <button
                  onClick={() => removeVideo(idx)}
                  className='absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition'
                >
                  <X size={14} className='text-white' />
                </button>
              </div>
            ))}
            <p className='text-xs text-gray-500 w-full'>({images.length}/5 images, {videos.length}/3 videos)</p>
          </div>
        )}

        {/* ── Voice recording panel ── */}
        {(isRecording || audioBlob) && (
          <div className='flex items-center gap-3 mb-3 px-4 py-3 bg-white rounded-2xl border border-indigo-200 shadow-sm max-w-2xl mx-auto'>
            {isRecording ? (
              <>
                {/* Animated recording indicator */}
                <span className='relative flex h-3 w-3'>
                  <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75'></span>
                  <span className='relative inline-flex rounded-full h-3 w-3 bg-red-500'></span>
                </span>
                <span className='text-red-500 font-mono text-sm font-semibold flex-1'>
                  Recording... {formatTime(recordingTime)}
                </span>
                {/* Stop recording */}
                <button
                  onClick={stopRecording}
                  className='flex items-center gap-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1.5 rounded-full text-xs font-medium transition'
                >
                  <Square size={12} fill='currentColor' />
                  Stop
                </button>
                {/* Cancel */}
                <button
                  onClick={cancelRecording}
                  className='flex items-center gap-1 text-gray-400 hover:text-red-500 px-2 py-1.5 rounded-full text-xs transition'
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <>
                {/* Audio preview */}
                <span className='text-indigo-500 text-lg'>🎤</span>
                <audio controls src={audioPreviewUrl} className='h-8 flex-1' />
                <span className='text-xs text-gray-400 font-mono'>{formatTime(recordingTime)}</span>
                {/* Send voice */}
                <button
                  onClick={sendVoiceMessage}
                  disabled={isSendingVoice}
                  className='bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1'
                >
                  {isSendingVoice ? (
                    <span className='animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full'></span>
                  ) : (
                    <SendHorizonal size={14} />
                  )}
                  Send
                </button>
                {/* Discard */}
                <button
                  onClick={cancelRecording}
                  className='flex items-center gap-1 text-gray-400 hover:text-red-500 px-2 py-1.5 rounded-full text-xs transition'
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Main input bar ── */}
        <div className='flex items-center gap-3 pl-5 p-1.5 bg-white w-full max-w-2xl mx-auto border border-gray-200 shadow-sm rounded-full'>
          <input
            type="text"
            className='flex-1 outline-none text-slate-700 bg-transparent'
            placeholder='Type a message...'
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            onChange={(e) => setText(e.target.value)}
            value={text}
          />

          <label htmlFor="images" className='cursor-pointer'>
            <ImageIcon className='size-6 text-gray-400 hover:text-gray-600 transition' />
            <input type="file" id='images' accept='image/*' hidden multiple onChange={handleImagesChange} />
          </label>

          <label htmlFor="videos" className='cursor-pointer'>
            <Video className='size-6 text-gray-400 hover:text-gray-600 transition' />
            <input type="file" id='videos' accept='video/*' hidden multiple onChange={handleVideosChange} />
          </label>

          {/* Mic button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!!audioBlob}
            className={`cursor-pointer transition p-1 rounded-full ${
              isRecording
                ? 'text-red-500 animate-pulse'
                : audioBlob
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-400 hover:text-indigo-500'
            }`}
            title={isRecording ? 'Stop recording' : 'Start voice message'}
          >
            <Mic size={22} />
          </button>

          <button
            onClick={sendMessage}
            className='bg-linear-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-95 cursor-pointer text-white p-2 rounded-full transition'
          >
            <SendHorizonal size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatBox
