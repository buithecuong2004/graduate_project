import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ImageIcon, SendHorizonal, X, Video, Mic, Square, Trash2, MoreVertical, Reply, CornerUpRight, Check, Pencil } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import api from '../api/axios'
import { addMessages, fetchMessages, resetMessages, deleteMessageLocal, editMessageLocal } from '../features/messages/messagesSlice'
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
  const messageRefs = useRef({})   // map of _id → DOM element for scroll-to

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

  // Message action states
  const [openMenuId, setOpenMenuId] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [editingMsg, setEditingMsg] = useState(null)
  const [editText, setEditText] = useState('')
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [forwardingMsg, setForwardingMsg] = useState(null)
  const [connections, setConnections] = useState([])
  const [forwardSelected, setForwardSelected] = useState([])
  const [forwardSearch, setForwardSearch] = useState('')

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

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
              <a key={idx} onClick={() => navigate(`/post/${postId}`)}
                className='text-blue-300 underline cursor-pointer hover:text-blue-100' title={`View post ${postId}`}>
                {part}
              </a>
            ) : (
              <a key={idx} href={part} target='_blank' rel='noopener noreferrer'
                className='text-blue-300 underline cursor-pointer hover:text-blue-100'>
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
    const timeDiffMinutes = (new Date(currentMsg.createdAt) - new Date(previousMsg.createdAt)) / (1000 * 60)
    return timeDiffMinutes >= 5
  }

  const formatMessageTime = (date) => {
    const messageTime = moment(date)
    const today = moment()
    const yesterday = moment().subtract(1, 'day')
    if (messageTime.isSame(today, 'day')) return messageTime.format('HH:mm')
    else if (messageTime.isSame(yesterday, 'day')) return 'Yesterday ' + messageTime.format('HH:mm')
    else if (messageTime.isSame(today, 'year')) return messageTime.format('DD/MM HH:mm')
    else return messageTime.format('DD/MM/YYYY HH:mm')
  }

  const validateImages = (files) => {
    const maxSize = 10 * 1024 * 1024
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    for (let file of files) {
      if (!allowedTypes.includes(file.type)) { toast.error('Invalid image format. Only JPG, PNG, WebP, GIF allowed'); return false }
      if (file.size > maxSize) { toast.error('Each image must be less than 10MB'); return false }
    }
    return true
  }

  const validateVideos = (files) => {
    const maxSize = 100 * 1024 * 1024
    const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
    for (let file of files) {
      if (!allowedTypes.includes(file.type)) { toast.error('Invalid video format. Only MP4, WebM, OGG, MOV allowed'); return false }
      if (file.size > maxSize) { toast.error('Each video must be less than 100MB'); return false }
    }
    return true
  }

  const handleImagesChange = (e) => {
    const newFiles = Array.from(e.target.files)
    if (images.length + newFiles.length > 5) { toast.error('Maximum 5 images per message'); return }
    if (validateImages(newFiles)) {
      setImages(prev => [...prev, ...newFiles])
      setImagePreviews(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))])
    }
  }

  const handleVideosChange = (e) => {
    const newFiles = Array.from(e.target.files)
    if (videos.length + newFiles.length > 3) { toast.error('Maximum 3 videos per message'); return }
    if (validateVideos(newFiles)) {
      setVideos(prev => [...prev, ...newFiles])
      setVideoPreviews(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))])
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

  // ── Voice recording ──────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        setAudioPreviewUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorder.start(100)
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000)
    } catch (err) {
      toast.error('Microphone access denied. Please allow microphone permission.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
    clearInterval(timerRef.current)
    setIsRecording(false)
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
    clearInterval(timerRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    setIsRecording(false)
    setRecordingTime(0)
    setAudioBlob(null)
    if (audioPreviewUrl) { URL.revokeObjectURL(audioPreviewUrl); setAudioPreviewUrl(null) }
  }

  const sendVoiceMessage = async () => {
    if (!audioBlob) return
    try {
      setIsSendingVoice(true)
      const token = await getToken()
      const formData = new FormData()
      formData.append('to_user_id', userId)
      const ext = audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
      formData.append('voice', audioBlob, `voice_${Date.now()}.${ext}`)
      const { data } = await api.post('/api/message/send', formData, { headers: { Authorization: `Bearer ${token}` } })
      if (data.success) {
        URL.revokeObjectURL(audioPreviewUrl)
        setAudioBlob(null); setAudioPreviewUrl(null); setRecordingTime(0)
        dispatch(addMessages(data.message))
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      } else throw new Error(data.message)
    } catch (error) { toast.error(error.message) }
    finally { setIsSendingVoice(false) }
  }

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ── Message action handlers ──────────────────────────────────
  const fetchConnections = async () => {
    try {
      const token = await getToken()
      const { data } = await api.get('/api/user/connections', { headers: { Authorization: `Bearer ${token}` } })
      if (data.success) setConnections(data.connections || [])
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (messageId) => {
    try {
      const token = await getToken()
      const { data } = await api.post('/api/message/delete', { messageId }, { headers: { Authorization: `Bearer ${token}` } })
      if (data.success) dispatch(deleteMessageLocal(messageId))
      else toast.error(data.message)
    } catch (e) { toast.error(e.message) }
    setOpenMenuId(null)
  }

  const handleEditSave = async () => {
    if (!editingMsg || !editText.trim()) return
    try {
      const token = await getToken()
      const { data } = await api.post('/api/message/edit', { messageId: editingMsg._id, text: editText }, { headers: { Authorization: `Bearer ${token}` } })
      if (data.success) {
        dispatch(editMessageLocal({ messageId: editingMsg._id, text: editText.trim() }))
        setEditingMsg(null); setEditText(''); setText('')
      } else toast.error(data.message)
    } catch (e) { toast.error(e.message) }
  }

  const handleReply = (message) => {
    setReplyingTo(message)
    setOpenMenuId(null)
  }

  const handleForwardOpen = (message) => {
    setForwardingMsg(message)
    setShowForwardModal(true)
    setForwardSelected([])
    setForwardSearch('')
    fetchConnections()
    setOpenMenuId(null)
  }

  const closeForwardModal = () => {
    setShowForwardModal(false)
    setForwardingMsg(null)
    setForwardSelected([])
    setForwardSearch('')
  }

  // ── FIX: forward media (images / videos / voice) by passing media_urls + message_type ──
  const handleForwardSend = async () => {
    if (forwardSelected.length === 0) return toast.error('Select at least one person')
    try {
      const token = await getToken()
      const isLink = forwardingMsg?.text && /https?:\/\/|\/post\//.test(forwardingMsg.text)

      await Promise.all(
        forwardSelected.map(async uid => {
          const formData = new FormData()
          formData.append('to_user_id', uid)
          formData.append('text', forwardingMsg?.text || '')
          formData.append('is_forwarded', 'true')
          formData.append('forwarded_type', isLink ? 'link' : 'message')

          // ✅ Pass pre-existing media URLs so the backend can attach them
          const urls = forwardingMsg?.media_urls || []
          if (urls.length > 0) {
            urls.forEach(url => formData.append('media_urls[]', url))
            formData.append('message_type', forwardingMsg?.message_type || 'images')
          }

          const res = await api.post('/api/message/send', formData, {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (uid === userId && res.data.success) {
            dispatch(addMessages(res.data.message))
          }
          return res
        })
      )
      toast.success('Message forwarded')
      closeForwardModal()
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e) { toast.error(e.message) }
  }

  // ── Scroll to a specific message by id ──────────────────────
  const scrollToMessage = (msgId) => {
    const el = messageRefs.current[msgId]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('msg-highlight')
    setTimeout(() => el.classList.remove('msg-highlight'), 1400)
  }

  // ── Human-readable label for a message (used in reply bars) ──
  const getReplyLabel = (msg) => {
    if (!msg) return ''
    if (msg.is_deleted) return 'Message recalled'
    if (msg.message_type === 'voice') return '🎤 Voice message'
    if (msg.message_type?.includes('video')) return `🎬 Video (${msg.media_urls?.length || 1})`
    if (msg.message_type?.includes('image')) return `🖼️ Image (${msg.media_urls?.length || 1})`
    return msg.text || '📎 Media'
  }

  const isEditable = (message) => {
    if (message.is_deleted) return false
    if (message.is_forwarded) return false
    if (message.message_type === 'voice') return false
    if (!message.createdAt) return false
    const msgTime = new Date(message.createdAt).getTime()
    if (isNaN(msgTime)) return false
    const diffMins = (Date.now() - msgTime) / 60000
    return diffMins >= 0 && diffMins <= 30
  }

  const fetchUserData = async () => {
    try {
      const { data } = await api.post('/api/user/profiles', { profileId: userId })
      if (data.success) setUser(data.profile)
    } catch (error) { toast.error(error.message) }
    finally { setLoading(false) }
  }

  const fetchUserMessages = async () => {
    try {
      const token = await getToken()
      dispatch(fetchMessages({ token, userId }))
    } catch (error) { toast.error(error.message) }
  }

  const sendMessage = async () => {
    if (editingMsg) { handleEditSave(); return }
    try {
      if (!text && images.length === 0 && videos.length === 0) return
      const token = await getToken()
      const formData = new FormData()
      formData.append('to_user_id', userId)
      formData.append('text', text)
      if (replyingTo) formData.append('reply_to', replyingTo._id)
      images.forEach((img) => formData.append('images', img))
      videos.forEach((vid) => formData.append('videos', vid))

      const { data } = await api.post('/api/message/send', formData, { headers: { Authorization: `Bearer ${token}` } })
      if (data.success) {
        setText('')
        setReplyingTo(null)
        imagePreviews.forEach(url => URL.revokeObjectURL(url))
        videoPreviews.forEach(url => URL.revokeObjectURL(url))
        setImages([]); setVideos([]); setImagePreviews([]); setVideoPreviews([])
        dispatch(addMessages(data.message))
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      } else throw new Error(data.message)
    } catch (error) { toast.error(error.message) }
  }

  const markMessagesAsRead = async () => {
    try {
      const token = await getToken()
      await api.post('/api/user/mark-messages-read', { from_user_id: userId }, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) { console.error('mark-as-read error:', error) }
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
    if (sorted[0]?.from_user_id?._id === userId) markMessagesAsRead()
  }, [messages.length])

  useEffect(() => {
    if (messages.length > 0 && shouldAutoScrollRef.current) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages])

  if (loading) return <Loading height='100vh' />

  return user && (
    <div className='flex flex-col h-screen'>
      {/* ── Header ── */}
      <div className='flex items-center pl-8 pt-2 pb-2 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200 shadow-sm'>
        <img src={user.profile_picture} alt="" className='size-10 rounded-full shadow-sm' />
        <div className='ml-4'>
          <p className='font-semibold text-slate-800'>{user.full_name}</p>
          <p className='text-sm text-gray-500'>@{user.username}</p>
        </div>
      </div>

      {/* ── Messages area ── */}
      <div
        className='px-3 md:px-6 h-full overflow-y-scroll bg-gray-50'
        ref={messagesContainerRef}
        onScroll={() => {
          if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
            shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100
          }
        }}
      >
        <div className='space-y-2 py-4' onClick={() => setOpenMenuId(null)}>
          {messages.toSorted((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((message, index) => {
            const isOwn = message.from_user_id?._id === currentUser._id
            const mediaUrls = message.media_urls || (message.media_url ? [message.media_url] : [])
            const sorted = messages.toSorted((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            const previousMessage = index > 0 ? sorted[index - 1] : null
            const showTimestamp = shouldShowTimestamp(message, previousMessage)
            const isVoice = message.message_type === 'voice'
            const menuOpen = openMenuId === message._id

            // ── Inline action buttons (no pill, no border) ──────────
            const ActionButtons = ({ side }) => !message.is_deleted && (
              <div className={`
                flex items-center gap-0.5 self-end mb-1
                opacity-0 group-hover:opacity-100 transition-opacity duration-150
                ${side === 'left' ? 'order-first' : 'order-last'}
              `}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleReply(message) }}
                  className='p-1 text-gray-400 hover:text-indigo-500 transition-colors'
                  title='Reply'
                >
                  <Reply size={15} />
                </button>
                <div className='relative'>
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : message._id) }}
                    className='p-1 text-gray-400 hover:text-indigo-500 transition-colors'
                  >
                    <MoreVertical size={15} />
                  </button>
                  {menuOpen && (
                    <div
                      className={`absolute ${isOwn ? 'right-0' : 'left-0'} bottom-8 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 min-w-[130px]`}
                      onClick={e => e.stopPropagation()}
                    >
                      {isOwn && isEditable(message) && (
                        <button
                          onClick={() => { setEditingMsg(message); setEditText(message.text || ''); setText(message.text || ''); setOpenMenuId(null) }}
                          className='w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50'
                        >
                          <Pencil size={13} /> Edit
                        </button>
                      )}
                      <button
                        onClick={() => handleForwardOpen(message)}
                        className='w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50'
                      >
                        <CornerUpRight size={13} /> Forward
                      </button>
                      {isOwn && (
                        <button
                          onClick={() => handleDelete(message._id)}
                          className='w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50'
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )

            return (
              <div
                key={message._id || index}
                ref={el => { if (message._id) messageRefs.current[message._id] = el }}
              >
                {showTimestamp && (
                  <div className='flex justify-center my-3'>
                    <p className='text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full'>
                      {formatMessageTime(message.createdAt)}
                    </p>
                  </div>
                )}

                {/* ── Message row: [actions-left] [bubble] [actions-right] ── */}
                <div
                  className={`group flex items-end gap-1 ${isOwn ? 'justify-end' : 'justify-start'} mb-0.5`}
                  onClick={() => setOpenMenuId(null)}
                >
                  {/* Own messages: actions LEFT of bubble */}
                  {isOwn && <ActionButtons side='left' />}

                  {/* ── Bubble ── */}
                  <div className={`
                    p-3 text-sm
                    max-w-[70vw] md:max-w-lg lg:max-w-xl
                    rounded-2xl shadow-sm
                    ${message.is_deleted
                      ? 'bg-gray-100 text-gray-400 italic border border-dashed border-gray-300 rounded-br-none'
                      : isOwn
                        ? 'bg-indigo-500 text-white rounded-br-none'
                        : 'bg-white text-slate-800 rounded-bl-none border border-gray-200'
                    }
                  `}>
                    {/* Forward label */}
                    {message.is_forwarded && !message.is_deleted && (
                      <p className={`text-[10px] mb-1 flex items-center gap-1 ${isOwn ? 'text-indigo-200' : 'text-gray-400'}`}>
                        <CornerUpRight size={10} /> Forwarded
                      </p>
                    )}

                    {/* ── Reply quote — click scrolls to original ── */}
                    {message.reply_to && !message.is_deleted && (
                      <div
                        className={`text-xs mb-2 px-2 py-1 rounded-lg border-l-2 cursor-pointer transition-opacity hover:opacity-80 ${isOwn ? 'bg-indigo-400/40 border-indigo-200 text-indigo-100' : 'bg-gray-100 border-indigo-400 text-gray-600'}`}
                        onClick={(e) => { e.stopPropagation(); scrollToMessage(message.reply_to._id) }}
                      >
                        <p className='font-semibold text-[10px] mb-0.5'>
                          {message.reply_to.from_user_id?._id === currentUser._id ? 'You' : message.reply_to.from_user_id?.full_name}
                        </p>
                        <p className='line-clamp-1 text-[11px]'>
                          {getReplyLabel(message.reply_to)}
                        </p>
                      </div>
                    )}

                    {message.is_deleted ? (
                      <p>Message recalled</p>
                    ) : (
                      <>
                        {isVoice && mediaUrls.length > 0 && (
                          <div className='flex items-center gap-2 min-w-[200px]'>
                            <span className='text-lg'>🎤</span>
                            <audio controls src={mediaUrls[0]} className='h-8 w-full max-w-[220px]' style={{ accentColor: isOwn ? '#fff' : '#6366f1' }} />
                          </div>
                        )}
                        {!isVoice && mediaUrls.length > 0 && (
                          <div className='flex flex-wrap gap-2 mb-2'>
                            {mediaUrls.map((url, idx) => {
                              const isVideo = url.includes('.mp4') || url.includes('.webm') || url.includes('.mov')
                              return isVideo
                                ? <video key={idx} src={url} controls className='w-full max-w-sm rounded-lg' />
                                : <img key={idx} src={url} alt='sent-image' className='w-full max-w-sm rounded-lg' />
                            })}
                          </div>
                        )}
                        {message.text && renderMessageText(message.text)}
                        {message.is_edited && (
                          <span className={`text-[10px] ${isOwn ? 'text-indigo-200' : 'text-gray-400'}`}> · edited</span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Others' messages: actions RIGHT of bubble */}
                  {!isOwn && <ActionButtons side='right' />}
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef}></div>
        </div>
      </div>

      {/* ── Input area ── */}
      <div className='px-4 pb-5'>
        {/* Media previews */}
        {(imagePreviews.length > 0 || videoPreviews.length > 0) && (
          <div className='flex flex-wrap gap-2 mb-3 p-3 bg-white rounded-lg border border-gray-200 max-w-4xl mx-auto'>
            {imagePreviews.map((url, idx) => (
              <div key={`img-${idx}`} className='relative group'>
                <img src={url} alt="" className='h-16 rounded-md' />
                <button onClick={() => removeImage(idx)} className='absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition'>
                  <X size={14} className='text-white' />
                </button>
              </div>
            ))}
            {videoPreviews.map((url, idx) => (
              <div key={`vid-${idx}`} className='relative group'>
                <video src={url} className='h-16 rounded-md' />
                <button onClick={() => removeVideo(idx)} className='absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition'>
                  <X size={14} className='text-white' />
                </button>
              </div>
            ))}
            <p className='text-xs text-gray-500 w-full'>({images.length}/5 images, {videos.length}/3 videos)</p>
          </div>
        )}

        {/* Voice recording panel */}
        {(isRecording || audioBlob) && (
          <div className='flex items-center gap-3 mb-3 px-4 py-3 bg-white rounded-2xl border border-indigo-200 shadow-sm max-w-2xl mx-auto'>
            {isRecording ? (
              <>
                <span className='relative flex h-3 w-3'>
                  <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75'></span>
                  <span className='relative inline-flex rounded-full h-3 w-3 bg-red-500'></span>
                </span>
                <span className='text-red-500 font-mono text-sm font-semibold flex-1'>
                  Recording... {formatTime(recordingTime)}
                </span>
                <button onClick={stopRecording} className='flex items-center gap-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1.5 rounded-full text-xs font-medium transition'>
                  <Square size={12} fill='currentColor' /> Stop
                </button>
                <button onClick={cancelRecording} className='flex items-center gap-1 text-gray-400 hover:text-red-500 px-2 py-1.5 rounded-full text-xs transition'>
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <>
                <span className='text-indigo-500 text-lg'>🎤</span>
                <audio controls src={audioPreviewUrl} className='h-8 flex-1' />
                <span className='text-xs text-gray-400 font-mono'>{formatTime(recordingTime)}</span>
                <button onClick={sendVoiceMessage} disabled={isSendingVoice}
                  className='bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1'>
                  {isSendingVoice
                    ? <span className='animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full'></span>
                    : <SendHorizonal size={14} />}
                  Send
                </button>
                <button onClick={cancelRecording} className='flex items-center gap-1 text-gray-400 hover:text-red-500 px-2 py-1.5 rounded-full text-xs transition'>
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Edit mode bar */}
        {editingMsg && (
          <div className='flex items-center gap-2 mb-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-xl max-w-2xl mx-auto'>
            <Pencil size={14} className='text-yellow-500 shrink-0' />
            <span className='text-xs text-yellow-700 flex-1 truncate'>Editing: {editingMsg.text}</span>
            <button onClick={() => { setEditingMsg(null); setEditText(''); setText('') }} className='text-gray-400 hover:text-red-400'><X size={14} /></button>
          </div>
        )}

        {/* Reply bar */}
        {replyingTo && (
          <div className='flex items-center gap-2 mb-2 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl max-w-2xl mx-auto'>
            <Reply size={14} className='text-indigo-400 shrink-0' />
            <div className='flex-1 min-w-0'>
              <p className='text-[10px] font-semibold text-indigo-600'>
                {replyingTo.from_user_id?._id === currentUser._id ? 'You' : replyingTo.from_user_id?.full_name}
              </p>
              <p className='text-xs text-gray-500 truncate'>{getReplyLabel(replyingTo)}</p>
            </div>
            <button onClick={() => setReplyingTo(null)} className='text-gray-400 hover:text-red-400'><X size={14} /></button>
          </div>
        )}

        {/* Main input bar */}
        <div className='flex items-center gap-3 pl-5 p-1.5 bg-white w-full max-w-2xl mx-auto border border-gray-200 shadow-sm rounded-full'>
          <input
            type="text"
            className='flex-1 outline-none text-slate-700 bg-transparent'
            placeholder={editingMsg ? 'Edit message...' : 'Type a message...'}
            onKeyDown={e => e.key === 'Enter' && (editingMsg ? handleEditSave() : sendMessage())}
            onChange={(e) => { setText(e.target.value); if (editingMsg) setEditText(e.target.value) }}
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
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!!audioBlob}
            className={`cursor-pointer transition p-1 rounded-full ${isRecording ? 'text-red-500 animate-pulse' : audioBlob ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-indigo-500'}`}
            title={isRecording ? 'Stop recording' : 'Start voice message'}
          >
            <Mic size={22} />
          </button>
          <button
            onClick={editingMsg ? handleEditSave : sendMessage}
            className='bg-linear-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-95 cursor-pointer text-white p-2 rounded-full transition'
          >
            {editingMsg ? <Check size={18} /> : <SendHorizonal size={18} />}
          </button>
        </div>
      </div>

      {/* ── Forward Modal ── */}
      {showForwardModal && (
        <div className='fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50'>
          <div className='bg-white rounded-2xl shadow-xl w-full max-w-md mx-4'>
            <div className='flex items-center justify-between px-5 py-4 border-b border-gray-100'>
              <h3 className='font-semibold text-slate-800'>Forward Message</h3>
              {/* ✅ closeForwardModal clears all forward state */}
              <button onClick={closeForwardModal} className='text-gray-400 hover:text-gray-600'><X size={18} /></button>
            </div>
            <div className='px-5 py-3'>
              {/* Preview */}
              <div className='bg-gray-50 rounded-xl px-3 py-2 mb-3 text-sm text-gray-600 border border-gray-200'>
                <p className='text-[10px] text-gray-400 mb-1 flex items-center gap-1'><CornerUpRight size={10} /> Forwarding</p>
                {forwardingMsg?.message_type === 'voice' && <p>🎤 Voice message</p>}
                {forwardingMsg?.message_type?.includes('video') && <p>🎬 Video message ({forwardingMsg?.media_urls?.length || 0} file{forwardingMsg?.media_urls?.length > 1 ? 's' : ''})</p>}
                {forwardingMsg?.message_type?.includes('image') && <p>🖼️ Image message ({forwardingMsg?.media_urls?.length || 0} file{forwardingMsg?.media_urls?.length > 1 ? 's' : ''})</p>}
                {(!forwardingMsg?.message_type || forwardingMsg?.message_type === 'text') && (
                  <p className='line-clamp-2'>{forwardingMsg?.text || '—'}</p>
                )}
              </div>
              {/* Search */}
              <input
                type='text'
                placeholder='Search connections...'
                value={forwardSearch}
                onChange={e => setForwardSearch(e.target.value)}
                className='w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-indigo-300 mb-2'
              />
              {/* List */}
              <div className='max-h-52 overflow-y-auto space-y-1'>
                {connections
                  .filter(c => c.full_name.toLowerCase().includes(forwardSearch.toLowerCase()) || c.username.toLowerCase().includes(forwardSearch.toLowerCase()))
                  .map(conn => (
                    <label key={conn._id} className='flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer'>
                      <input type='checkbox' checked={forwardSelected.includes(conn._id)}
                        onChange={() => setForwardSelected(prev => prev.includes(conn._id) ? prev.filter(id => id !== conn._id) : [...prev, conn._id])}
                        className='w-4 h-4 rounded accent-indigo-500'
                      />
                      <img src={conn.profile_picture} alt='' className='w-8 h-8 rounded-full object-cover' />
                      <div>
                        <p className='text-sm font-medium text-slate-800'>{conn.full_name}</p>
                        <p className='text-xs text-gray-500'>@{conn.username}</p>
                      </div>
                    </label>
                  ))}
              </div>
            </div>
            <div className='px-5 py-4 border-t border-gray-100 flex gap-2'>
              <button onClick={closeForwardModal} className='flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition'>Cancel</button>
              <button
                onClick={handleForwardSend}
                disabled={forwardSelected.length === 0}
                className='flex-1 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition disabled:opacity-50'
              >
                Send ({forwardSelected.length})
              </button>
            </div>
          </div>
        </div>
      )}
      {/* scroll-to highlight keyframe */}
      <style>{`
        .msg-highlight { animation: msgFlash 1.4s ease-out; }
        @keyframes msgFlash {
          0%,20% { background-color: rgba(99,102,241,0.18); border-radius: 12px; }
          100%    { background-color: transparent; }
        }
      `}</style>
    </div>
  )
}

export default ChatBox