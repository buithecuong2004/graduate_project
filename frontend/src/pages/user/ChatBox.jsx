import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ImageIcon, SendHorizonal, X, Video, Mic, Square, Trash2, MoreVertical, Reply, CornerUpRight, Check, Pencil, Phone, VideoIcon, ChevronDown, UserRound, Ban, Flag, Search } from 'lucide-react'
import { useSocket } from '../../context/SocketContext'
import { useDispatch, useSelector } from 'react-redux'
import { setViewStory } from '../../features/stories/storiesSlice'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'
import { resetMessages, setMessages as setMessagesAction, setNewMessageTrigger } from '../../features/messages/messagesSlice'
import toast from 'react-hot-toast'
import Loading from '../../components/user/Loading'
import moment from '../../utils/moment'
import ChatMediaViewer from '../../components/user/ChatMediaViewer'
import { SmilePlus } from 'lucide-react'
import ReactionPicker from '../../components/user/ReactionPicker'
import ReactionListModal from '../../components/user/ReactionListModal'
import ConfirmDialog from '../../components/user/ConfirmDialog'
import localizeMessage from '../../utils/localization'
import { REACTION_ICONS } from '../../utils/reactions'
import { fetchUser } from '../../features/user/userSlice'

const FLOATING_REACTION_WIDTH = 292
const FLOATING_REACTION_HEIGHT = 64
const FLOATING_MENU_WIDTH = 156
const FLOATING_MENU_HEIGHT = 132
const PROFILE_MENU_WIDTH = 260
const PROFILE_MENU_HEIGHT = 272
const MESSAGE_PAGE_SIZE = 30

const getMessageUserId = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value._id) return value._id.toString()
  return value.toString?.() || ''
}

const updateMessagesValue = (currentMessages, updater) => (
  typeof updater === 'function' ? updater(currentMessages) : updater
)

const getFloatingPanelPosition = (anchorRect, panelWidth, panelHeight, align = 'left') => {
  if (typeof window === 'undefined') return { top: 0, left: 0 }

  const margin = 10
  const preferredTop = anchorRect.top - panelHeight - 8
  const top = preferredTop < margin
    ? anchorRect.bottom + 8
    : preferredTop
  const preferredLeft = align === 'right'
    ? anchorRect.right - panelWidth
    : anchorRect.left

  return {
    top: Math.max(margin, Math.min(top, window.innerHeight - panelHeight - margin)),
    left: Math.max(margin, Math.min(preferredLeft, window.innerWidth - panelWidth - margin)),
  }
}

const ChatBox = ({ onStartCall, chatUserId, variant = 'page', onClose, scrollToMessageId, onScrolledToMessage }) => {

  const { userId: routeUserId } = useParams()
  const userId = chatUserId || routeUserId
  const isMini = variant === 'mini'
  const isEmbedded = variant === 'embedded'

  const currentUser = useSelector((state) => state.user.value)
  const reduxConnections = useSelector((state) => state.connections.connections)
  const newMessageTrigger = useSelector((state) => state.messages.newMessageTrigger)
  const [localMessages, setLocalMessages] = useState([])
  const messages = localMessages
  const currentUserId = getMessageUserId(currentUser)

  const { getToken } = useAuth()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { socketRef, socket } = useSocket()

  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const prevScrollHeightRef = useRef(0)
  const preserveScrollRef = useRef(false)
  const messagesRef = useRef([])

  useEffect(() => {
    messagesRef.current = messages || []
  }, [messages])

  const setMessages = useCallback((updater) => {
    const nextMessages = updateMessagesValue(messagesRef.current, updater)
    messagesRef.current = nextMessages
    setLocalMessages(nextMessages)
    // Also dispatch to Redux for global socket listener updates
    dispatch(setMessagesAction(nextMessages))
  }, [dispatch])

  const [text, setText] = useState('')
  const [images, setImages] = useState([])
  const [videos, setVideos] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [videoPreviews, setVideoPreviews] = useState([])
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [blockStatus, setBlockStatus] = useState({ isBlockedByMe: false, hasBlockedMe: false })
  const [pendingDialog, setPendingDialog] = useState(null)
  const [isDialogLoading, setIsDialogLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const profileMenuAnchorRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)
  const isSendingMessageRef = useRef(false)
  const isForwardingRef = useRef(false)
  const miniReadMarkedRef = useRef(false)
  const messageRefs = useRef({})   // map of _id → DOM element for scroll-to
  const scrollToMessageIdRef = useRef('')

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
  const [isForwarding, setIsForwarding] = useState(false)

  // Media Viewer and Reaction states
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false)
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const [reactionMenuId, setReactionMenuId] = useState(null)
  const [reactionMenuPosition, setReactionMenuPosition] = useState(null)
  const [actionMenuPosition, setActionMenuPosition] = useState(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileMenuPosition, setProfileMenuPosition] = useState(null)
  const [showReactionListMsg, setShowReactionListMsg] = useState(null)
  const [chatSearchOpen, setChatSearchOpen] = useState(false)
  const [chatSearchTerm, setChatSearchTerm] = useState('')
  const [chatSearchMessages, setChatSearchMessages] = useState([])
  const [chatSearchLoading, setChatSearchLoading] = useState(false)
  const imageInputId = `${variant}-images-${userId || 'chat'}`
  const videoInputId = `${variant}-videos-${userId || 'chat'}`
  const isBlockedByMe = !!blockStatus.isBlockedByMe
  const hasBlockedMe = !!blockStatus.hasBlockedMe
  const isChatBlocked = isBlockedByMe || hasBlockedMe

  const handleStoryClick = async (storyId) => {
    if (!storyId) return toast.error('Tin không còn khả dụng')
    try {
      const token = await getToken()
      const { data } = await api.get(`/api/story/${storyId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (data.success && data.story) {
        setMediaViewerOpen(false)
        dispatch(setViewStory(data.story))
      } else {
        toast.error('Tin không còn khả dụng')
      }
    } catch {
      toast.error('Không thể tải tin')
    }
  }

  const allMedia = React.useMemo(() => {
    const mediaItems = []
    const sortedMessages = [...(messages || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    sortedMessages.forEach(msg => {
      if (!msg.is_deleted && msg.message_type !== 'voice' && msg.forwarded_type !== 'story' && msg.media_urls && msg.media_urls.length > 0) {
        msg.media_urls.forEach(url => {
          mediaItems.push({
            url,
            messageId: msg._id,
            type: msg.message_type?.includes('video') || url.match(/\.(mp4|webm|mov|ogg)$/i) ? 'video' : 'image'
          })
        })
      }
    })
    return mediaItems
  }, [messages])

  const openMediaViewer = (url) => {
    const idx = allMedia.findIndex(m => m.url === url)
    if (idx !== -1) {
      setCurrentMediaIndex(idx)
      setMediaViewerOpen(true)
    }
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const getSupportedAudioMimeType = () => {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''

    return [
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav'
    ].find(type => MediaRecorder.isTypeSupported(type)) || ''
  }

  const getAudioExtension = (mimeType = '') => {
    const baseType = mimeType.split(';')[0].toLowerCase()
    if (baseType === 'audio/mp4') return 'm4a'
    if (baseType === 'audio/ogg') return 'ogg'
    if (baseType === 'audio/wav' || baseType === 'audio/wave' || baseType === 'audio/x-wav') return 'wav'
    if (baseType === 'audio/mpeg') return 'mp3'
    if (baseType === 'audio/aac') return 'aac'
    return 'webm'
  }

  const getAudioSourceType = (url = '') => {
    const cleanUrl = url.split('?')[0].toLowerCase()
    if (cleanUrl.endsWith('.m4a') || cleanUrl.endsWith('.mp4')) return 'audio/mp4'
    if (cleanUrl.endsWith('.ogg') || cleanUrl.endsWith('.oga')) return 'audio/ogg'
    if (cleanUrl.endsWith('.wav')) return 'audio/wav'
    if (cleanUrl.endsWith('.mp3')) return 'audio/mpeg'
    if (cleanUrl.endsWith('.aac')) return 'audio/aac'
    return 'audio/webm'
  }

  const stopAudioControlEvent = (event) => {
    event.stopPropagation()
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
    else if (messageTime.isSame(yesterday, 'day')) return 'Hôm qua ' + messageTime.format('HH:mm')
    else if (messageTime.isSame(today, 'year')) return messageTime.format('DD/MM HH:mm')
    else return messageTime.format('DD/MM/YYYY HH:mm')
  }

  const validateImages = (files) => {
    const maxSize = 10 * 1024 * 1024
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    for (let file of files) {
      if (!allowedTypes.includes(file.type)) { toast.error('Định dạng hình ảnh không hợp lệ. Chỉ chấp nhận JPG, PNG, WebP, GIF'); return false }
      if (file.size > maxSize) { toast.error('Mỗi hình ảnh phải nhỏ hơn 10MB'); return false }
    }
    return true
  }

  const validateVideos = (files) => {
    const maxSize = 100 * 1024 * 1024
    const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
    for (let file of files) {
      if (!allowedTypes.includes(file.type)) { toast.error('Định dạng video không hợp lệ. Chỉ chấp nhận MP4, WebM, OGG, MOV'); return false }
      if (file.size > maxSize) { toast.error('Mỗi video phải nhỏ hơn 100MB'); return false }
    }
    return true
  }

  const handleImagesChange = (e) => {
    const newFiles = Array.from(e.target.files)
    if (images.length + newFiles.length > 5) { toast.error('Tối đa 5 hình ảnh cho mỗi tin nhắn'); return }
    if (validateImages(newFiles)) {
      setImages(prev => [...prev, ...newFiles])
      setImagePreviews(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))])
    }
  }

  const handleVideosChange = (e) => {
    const newFiles = Array.from(e.target.files)
    if (videos.length + newFiles.length > 3) { toast.error('Tối đa 3 video cho mỗi tin nhắn'); return }
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
      const mimeType = getSupportedAudioMimeType()
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || mimeType || 'audio/webm' })
        setAudioBlob(blob)
        setAudioPreviewUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorder.start(100)
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000)
    } catch {
      toast.error('Truy cập micro bị từ chối. Vui lòng cấp quyền sử dụng micro.')
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
    if (isChatBlocked) {
      toast.error('Bạn không thể gửi tin nhắn trong đoạn chat này')
      return
    }
    try {
      setIsSendingVoice(true)
      const token = await getToken()
      const formData = new FormData()
      formData.append('to_user_id', userId)
      const ext = getAudioExtension(audioBlob.type)
      formData.append('voice', audioBlob, `voice_${Date.now()}.${ext}`)
      const { data } = await api.post('/api/message/send', formData, { headers: { Authorization: `Bearer ${token}` } })
      if (data.success) {
        URL.revokeObjectURL(audioPreviewUrl)
        setAudioBlob(null); setAudioPreviewUrl(null); setRecordingTime(0)
        setMessages((prev) => (
          prev.some((message) => message._id === data.message._id)
            ? prev
            : [...prev, data.message]
        ))
        dispatch(setNewMessageTrigger(Date.now()))
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      } else throw new Error(data.message)
    } catch (error) { toast.error(localizeMessage(error.message)) }
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
    const previousMessage = messages.find((message) => message._id === messageId)
    closeMessageActions()
    setMessages((prev) => prev.map(msg =>
      msg._id === messageId
        ? { ...msg, is_deleted: true, text: '', media_urls: [], media_ids: [] }
        : msg
    ))

    try {
      const token = await getToken()
      const { data } = await api.post('/api/message/delete', { messageId }, { headers: { Authorization: `Bearer ${token}` } })
      if (!data.success) throw new Error(data.message)
      dispatch(setNewMessageTrigger(Date.now()))
    } catch (e) {
      if (previousMessage) {
        setMessages((prev) => prev.map((message) => (
          message._id === messageId ? previousMessage : message
        )))
      }
      toast.error(localizeMessage(e.message))
    }
  }

  const handleEditSave = async () => {
    const nextText = editText.trim()
    if (!editingMsg || !nextText) return
    if (isChatBlocked) {
      toast.error('Bạn không thể chỉnh sửa trong đoạn chat này')
      return
    }

    const messageId = editingMsg._id
    const previousMessage = messages.find((message) => message._id === messageId)
    setMessages((prev) => prev.map(msg =>
      msg._id === messageId
        ? { ...msg, text: nextText, is_edited: true }
        : msg
    ))
    setEditingMsg(null)
    setEditText('')
    setText('')
    closeMessageActions()

    try {
      const token = await getToken()
      const { data } = await api.post('/api/message/edit', { messageId, text: nextText }, { headers: { Authorization: `Bearer ${token}` } })
      if (!data.success) throw new Error(data.message)
      dispatch(setNewMessageTrigger(Date.now()))
    } catch (e) {
      if (previousMessage) {
        setMessages((prev) => prev.map((message) => (
          message._id === messageId ? previousMessage : message
        )))
      }
      toast.error(localizeMessage(e.message))
    }
  }

  const closeMessageActions = () => {
    setOpenMenuId(null)
    setReactionMenuId(null)
    setActionMenuPosition(null)
    setReactionMenuPosition(null)
    setProfileMenuOpen(false)
    setProfileMenuPosition(null)
  }

  const openReactionPicker = (event, message, isOwn) => {
    event.stopPropagation()
    setOpenMenuId(null)
    setActionMenuPosition(null)

    if (reactionMenuId === message._id) {
      setReactionMenuId(null)
      setReactionMenuPosition(null)
      return
    }

    setReactionMenuId(message._id)
    setReactionMenuPosition(getFloatingPanelPosition(
      event.currentTarget.getBoundingClientRect(),
      FLOATING_REACTION_WIDTH,
      FLOATING_REACTION_HEIGHT,
      isOwn ? 'right' : 'left'
    ))
  }

  const openActionMenu = (event, message, isOwn) => {
    event.stopPropagation()
    setReactionMenuId(null)
    setReactionMenuPosition(null)

    if (openMenuId === message._id) {
      setOpenMenuId(null)
      setActionMenuPosition(null)
      return
    }

    setOpenMenuId(message._id)
    setActionMenuPosition(getFloatingPanelPosition(
      event.currentTarget.getBoundingClientRect(),
      FLOATING_MENU_WIDTH,
      FLOATING_MENU_HEIGHT,
      isOwn ? 'right' : 'left'
    ))
  }

  const handleReply = (message) => {
    setReplyingTo(message)
    closeMessageActions()
  }

  const handleReactMessage = async (messageId, reactionType) => {
    if (isChatBlocked) {
      toast.error('Bạn không thể tương tác trong đoạn chat này')
      return
    }

    const previousMessage = messages.find((message) => message._id === messageId)
    closeMessageActions()
    setMessages((prev) => prev.map(msg => {
      if (msg._id !== messageId) return msg

      const reactions = msg.reactions || []
      const currentReactionIndex = reactions.findIndex(r => (r.user?._id || r.user) === currentUser?._id)
      let nextReactions = reactions

      if (currentReactionIndex === -1) {
        nextReactions = [...reactions, { user: currentUser, type: reactionType }]
      } else if (reactions[currentReactionIndex].type === reactionType) {
        nextReactions = reactions.filter((_, index) => index !== currentReactionIndex)
      } else {
        nextReactions = reactions.map((reaction, index) => (
          index === currentReactionIndex ? { ...reaction, type: reactionType, user: reaction.user || currentUser } : reaction
        ))
      }

      return { ...msg, reactions: nextReactions }
    }))

    try {
      const token = await getToken()
      const { data } = await api.post('/api/message/react', { messageId, reactionType }, { headers: { Authorization: `Bearer ${token}` } })
      if (data.success) {
        setMessages((prev) => prev.map(msg =>
          msg._id === messageId
            ? { ...msg, reactions: data.messageData.reactions }
            : msg
        ))
        dispatch(setNewMessageTrigger(Date.now()))
      } else throw new Error(data.message)
    } catch (e) {
      if (previousMessage) {
        setMessages((prev) => prev.map((message) => (
          message._id === messageId ? previousMessage : message
        )))
      }
      toast.error(localizeMessage(e.message))
    }
  }

  const handleForwardOpen = (message) => {
    setForwardingMsg(message)
    setShowForwardModal(true)
    setForwardSelected([])
    setForwardSearch('')
    setConnections(reduxConnections || [])
    if (!reduxConnections?.length) fetchConnections()
    closeMessageActions()
  }

  const closeForwardModal = () => {
    setShowForwardModal(false)
    setForwardingMsg(null)
    setForwardSelected([])
    setForwardSearch('')
  }

  // ── FIX: forward media (images / videos / voice) by passing media_urls + message_type ──
  const handleForwardSend = async () => {
    if (forwardSelected.length === 0) return toast.error('Vui lòng chọn ít nhất một người')
    if (isForwardingRef.current) return
    if (isChatBlocked && forwardSelected.includes(userId)) {
      return toast.error('Bạn không thể chuyển tiếp vào đoạn chat này')
    }

    const selectedIds = [...forwardSelected]
    const messageToForward = forwardingMsg
    if (!messageToForward) return

    const shouldAppendToCurrentChat = selectedIds.includes(userId)
    const tempMessageId = `temp-forward-${Date.now()}`
    const isLink = messageToForward?.text && /https?:\/\/|\/post\//.test(messageToForward.text)

    isForwardingRef.current = true
    setIsForwarding(true)
    closeForwardModal()

    if (shouldAppendToCurrentChat && messageToForward) {
      setMessages((prev) => [...prev, {
        _id: tempMessageId,
        from_user_id: currentUser,
        to_user_id: userId,
        text: messageToForward?.text || '',
        media_urls: messageToForward?.forwarded_type === 'story' ? [] : (messageToForward?.media_urls || []),
        message_type: messageToForward?.forwarded_type === 'story'
          ? 'text'
          : (messageToForward?.message_type || 'text'),
        is_forwarded: true,
        forwarded_type: isLink ? 'link' : 'message',
        createdAt: new Date().toISOString(),
        is_pending: true,
      }])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }

    try {
      const token = await getToken()

      await Promise.all(
        selectedIds.map(async uid => {
          const formData = new FormData()
          formData.append('to_user_id', uid)
          formData.append('text', messageToForward?.text || '')
          formData.append('is_forwarded', 'true')
          formData.append('forwarded_type', isLink ? 'link' : 'message')

          // ✅ Pass pre-existing media URLs so the backend can attach them
          // DO NOT pass media if it's a story reply, as that media belongs to the story, not the reply message itself.
          const isStoryReply = messageToForward?.forwarded_type === 'story'
          const urls = isStoryReply ? [] : (messageToForward?.media_urls || [])
          if (urls.length > 0) {
            urls.forEach(url => formData.append('media_urls[]', url))
            formData.append('message_type', messageToForward?.message_type || 'images')
          } else if (isStoryReply) {
            formData.append('message_type', 'text')
          }

          const res = await api.post('/api/message/send', formData, {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (!res.data.success) throw new Error(res.data.message)

          if (uid === userId && res.data.success) {
            setMessages((prev) => {
              if (prev.some((message) => message._id === res.data.message._id)) {
                return prev.filter((message) => message._id !== tempMessageId)
              }
              if (prev.some((message) => message._id === tempMessageId)) {
                return prev.map((message) => message._id === tempMessageId ? res.data.message : message)
              }
              return [...prev, res.data.message]
            })
          }
          return res
        })
      )
      toast.success('Đã chuyển tiếp tin nhắn')
      dispatch(setNewMessageTrigger(Date.now()))
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e) {
      if (shouldAppendToCurrentChat) {
        setMessages((prev) => prev.filter((message) => message._id !== tempMessageId))
      }
      toast.error(localizeMessage(e.message))
    } finally {
      isForwardingRef.current = false
      setIsForwarding(false)
    }
  }

  // ── Scroll to a specific message by id ──────────────────────
  const scrollToMessage = useCallback((msgId) => {
    const el = messageRefs.current[msgId]
    if (!el) return false
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('msg-highlight')
    setTimeout(() => el.classList.remove('msg-highlight'), 1400)
    return true
  }, [])

  const fetchMessagesAround = useCallback(async (messageId) => {
    if (!messageId || !userId) return false

    try {
      const token = await getToken()
      const { data } = await api.post('/api/message/get-around', {
        to_user_id: userId,
        messageId,
        limit: MESSAGE_PAGE_SIZE,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!data.success) throw new Error(data.message)
      shouldAutoScrollRef.current = false
      setMessages(data.messages || [])
      setHasMoreMessages(!!data.hasMore)
      return true
    } catch (error) {
      toast.error(localizeMessage(error.message))
      return false
    }
  }, [getToken, setMessages, userId])

  const jumpToMessage = useCallback(async (messageId) => {
    if (!messageId) return false
    if (scrollToMessage(messageId)) return true

    const loaded = await fetchMessagesAround(messageId)
    if (!loaded) return false

    window.setTimeout(() => scrollToMessage(messageId), 80)
    return true
  }, [fetchMessagesAround, scrollToMessage])

  const getChatSearchSender = (message) => (
    getMessageUserId(message?.from_user_id) === currentUserId ? currentUser : message?.from_user_id
  )

  const getChatSearchSenderName = (message) => (
    getMessageUserId(message?.from_user_id) === currentUserId ? 'Bạn' : (message?.from_user_id?.full_name || user?.full_name || 'Người dùng Tarous')
  )

  const getChatSearchAvatar = (message) => {
    const sender = getChatSearchSender(message)
    return sender?.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(getChatSearchSenderName(message))}&background=0891b2&color=fff`
  }

  // ── Human-readable label for a message (used in reply bars) ──
  const getReplyLabel = (msg) => {
    if (!msg) return ''
    if (msg.is_deleted) return 'Tin nhắn đã bị thu hồi'
    if (msg.message_type === 'voice') return '🎤 Tin nhắn thoại'
    if (msg.message_type?.includes('video')) return `🎬 Video (${msg.media_urls?.length || 1})`
    if (msg.message_type?.includes('image')) return `🖼️ Ảnh (${msg.media_urls?.length || 1})`
    return msg.text || '📎 Phương tiện'
  }

  const isEditable = (message) => {
    if (message.is_deleted) return false
    if (message.is_forwarded) return false
    if (message.message_type === 'voice') return false
    if (message.media_urls && message.media_urls.length > 0) return false
    if (!message.createdAt) return false
    const msgTime = new Date(message.createdAt).getTime()
    if (isNaN(msgTime)) return false
    const diffMins = (Date.now() - msgTime) / 60000
    return diffMins >= 0 && diffMins <= 30
  }

  const fetchUserData = useCallback(async () => {
    try {
      const token = await getToken()
      const { data } = await api.post('/api/user/profiles', { profileId: userId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (data.success) setUser(data.profile)
      else toast.error(localizeMessage(data.message))
    } catch (error) { toast.error(localizeMessage(error.message)) }
    finally { setLoading(false) }
  }, [getToken, userId])

  const fetchBlockStatus = useCallback(async () => {
    try {
      const token = await getToken()
      const { data } = await api.post('/api/user/block-status', { id: userId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (data.success) {
        const nextStatus = {
          isBlockedByMe: !!data.isBlockedByMe,
          hasBlockedMe: !!data.hasBlockedMe
        }
        setBlockStatus({
          isBlockedByMe: !!data.isBlockedByMe,
          hasBlockedMe: !!data.hasBlockedMe
        })
        return nextStatus
      }
    } catch (error) {
      console.error('block-status error:', error)
    }
    return null
  }, [getToken, userId])

  const fetchUserMessages = useCallback(async () => {
    try {
      const token = await getToken()
      const { data } = await api.post('/api/message/get', {
        to_user_id: userId,
        limit: MESSAGE_PAGE_SIZE,
        mark_read: !isMini,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (data.success) {
        setMessages(data.messages || [])
        setHasMoreMessages(!!data.hasMore)
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) { toast.error(localizeMessage(error.message)) }
  }, [getToken, isMini, setMessages, userId])

  const fetchOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasMoreMessages || !userId) return

    const currentMessages = messagesRef.current || []
    const oldestMessage = currentMessages
      .filter((message) => message?._id && !message._id.startsWith?.('temp-'))
      .toSorted((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0]

    if (!oldestMessage?._id) {
      setHasMoreMessages(false)
      return
    }

    const container = messagesContainerRef.current
    if (container) prevScrollHeightRef.current = container.scrollHeight

    setLoadingOlder(true)
    try {
      const token = await getToken()
      const { data } = await api.post('/api/message/get', {
        to_user_id: userId,
        limit: MESSAGE_PAGE_SIZE,
        before: oldestMessage._id,
        mark_read: !isMini,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!data.success) throw new Error(data.message)

      const olderMessages = data.messages || []
      if (olderMessages.length === 0) {
        setHasMoreMessages(false)
        return
      }

      preserveScrollRef.current = true
      setMessages((prev) => {
        const existingIds = new Set(prev.map((message) => message._id))
        const uniqueOlderMessages = olderMessages.filter((message) => !existingIds.has(message._id))
        return [...uniqueOlderMessages, ...prev]
      })
      setHasMoreMessages(!!data.hasMore)
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setLoadingOlder(false)
    }
  }, [getToken, hasMoreMessages, isMini, loadingOlder, setMessages, userId])

  useLayoutEffect(() => {
    if (preserveScrollRef.current && messagesContainerRef.current) {
      const container = messagesContainerRef.current
      container.scrollTop = container.scrollHeight - prevScrollHeightRef.current
      preserveScrollRef.current = false
    }
  }, [messages])


  const sendMessage = async () => {
    if (editingMsg) { handleEditSave(); return }
    if (isSendingMessageRef.current) return
    if (isChatBlocked) {
      toast.error('Bạn không thể gửi tin nhắn trong đoạn chat này')
      return
    }
    try {
      const messageText = text.trim()
      if (!messageText && images.length === 0 && videos.length === 0) return
      isSendingMessageRef.current = true
      setIsSendingMessage(true)
      const token = await getToken()
      const formData = new FormData()
      formData.append('to_user_id', userId)
      formData.append('text', messageText)
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
        setMessages((prev) => (
          prev.some((message) => message._id === data.message._id)
            ? prev
            : [...prev, data.message]
        ))
        dispatch(setNewMessageTrigger(Date.now()))
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      } else throw new Error(data.message)
    } catch (error) { toast.error(localizeMessage(error.message)) }
    finally {
      isSendingMessageRef.current = false
      setIsSendingMessage(false)
    }
  }

  const handleInputKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (isSendingMessageRef.current) return
    editingMsg ? handleEditSave() : sendMessage()
  }

  const markMessagesAsRead = useCallback(async () => {
    try {
      const token = await getToken()
      await api.post('/api/user/mark-messages-read', { from_user_id: userId }, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) { console.error('mark-as-read error:', error) }
  }, [getToken, userId])

  const markMiniMessagesAsRead = () => {
    if (!isMini || miniReadMarkedRef.current) return
    miniReadMarkedRef.current = true
    markMessagesAsRead()
    dispatch(setNewMessageTrigger(Date.now()))
  }

  const openUserProfile = () => {
    if (!userId) return
    setProfileMenuOpen(false)
    navigate(`/profile/${userId}`)
    if (isMini) onClose?.()
  }

  const openChatSearch = () => {
    setProfileMenuOpen(false)
    setChatSearchOpen(true)
  }

  const closeChatSearch = () => {
    setChatSearchOpen(false)
    setChatSearchTerm('')
    setChatSearchMessages([])
    setChatSearchLoading(false)
  }

  const handleChatSearchMessageClick = async (messageId) => {
    closeChatSearch()
    await jumpToMessage(messageId)
  }

  const openProfileMenu = (event) => {
    event.stopPropagation()
    closeMessageActions()

    if (profileMenuOpen) {
      setProfileMenuOpen(false)
      return
    }

    setProfileMenuPosition(getFloatingPanelPosition(
      event.currentTarget.getBoundingClientRect(),
      PROFILE_MENU_WIDTH,
      PROFILE_MENU_HEIGHT,
      'left'
    ))
    setProfileMenuOpen(true)
  }

  const requestDeleteConversation = () => {
    setProfileMenuOpen(false)
    setPendingDialog('delete-conversation')
  }

  const requestBlockUser = () => {
    setProfileMenuOpen(false)
    setPendingDialog('block-user')
  }

  const closeConfirmDialog = () => {
    if (!isDialogLoading) setPendingDialog(null)
  }

  const refreshCurrentUser = (token) => {
    if (token) dispatch(fetchUser(token))
  }

  const handleDeleteConversation = async () => {
    const previousMessages = messagesRef.current
    setIsDialogLoading(true)
    setMessages([])

    try {
      const token = await getToken()
      const { data } = await api.post('/api/message/delete-conversation', { to_user_id: userId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!data.success) throw new Error(data.message)
      dispatch(setNewMessageTrigger(Date.now()))
      toast.success('Đã xóa đoạn chat')
      setPendingDialog(null)
      if (isMini) onClose?.()
    } catch (error) {
      setMessages(previousMessages)
      toast.error(localizeMessage(error.message))
    } finally {
      setIsDialogLoading(false)
    }
  }

  const handleBlockUser = async () => {
    setIsDialogLoading(true)
    try {
      const token = await getToken()
      const { data } = await api.post('/api/user/block', { id: userId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!data.success) throw new Error(data.message)
      setBlockStatus((current) => ({ ...current, isBlockedByMe: true }))
      refreshCurrentUser(token)
      dispatch(setNewMessageTrigger(Date.now()))
      toast.success('Đã chặn người dùng')
      setPendingDialog(null)
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setIsDialogLoading(false)
    }
  }

  const handleUnblockUser = async () => {
    setIsDialogLoading(true)
    try {
      const token = await getToken()
      const { data } = await api.post('/api/user/unblock', { id: userId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!data.success) throw new Error(data.message)
      setBlockStatus((current) => ({ ...current, isBlockedByMe: false }))
      refreshCurrentUser(token)
      dispatch(setNewMessageTrigger(Date.now()))
      toast.success('Đã bỏ chặn người dùng')
      setPendingDialog(null)
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setIsDialogLoading(false)
    }
  }

  const handleConfirmDialog = () => {
    if (pendingDialog === 'delete-conversation') return handleDeleteConversation()
    if (pendingDialog === 'block-user') return handleBlockUser()
    if (pendingDialog === 'unblock-user') return handleUnblockUser()
  }

  // Socket listeners removed — App.jsx handles socket events and dispatches to Redux
  // This approach (Redux only, no local socket listeners) is faster and prevents duplicate updates

  // Local socket listeners (optimistic UI for this chat only)
  useEffect(() => {
    const activeSocket = socket || socketRef?.current
    if (!activeSocket || !userId || !currentUserId) return

    const handleNewMessage = (message) => {
      const fromId = getMessageUserId(message.from_user_id)
      const toId = getMessageUserId(message.to_user_id)
      const belongsToCurrentChat = (
        (fromId === userId && toId === currentUserId) ||
        (fromId === currentUserId && toId === userId)
      )
      if (!belongsToCurrentChat) return

      setMessages((prev) => (
        prev.some((m) => m._id === message._id) ? prev : [...prev, message]
      ))

      if (!isMini && fromId === userId) {
        markMessagesAsRead()
        dispatch(setNewMessageTrigger(Date.now()))
      }
    }

    const handleReactionUpdated = ({ messageId, reactions }) => {
      setMessages((prev) => prev.map((m) => (
        m._id === messageId ? { ...m, reactions } : m
      )))
    }

    const handleEdited = ({ messageId, text }) => {
      setMessages((prev) => prev.map((m) => (
        m._id === messageId ? { ...m, text, is_edited: true } : m
      )))
    }

    const handleDeleted = ({ messageId }) => {
      setMessages((prev) => prev.map((m) => (
        m._id === messageId ? { ...m, is_deleted: true, text: '', media_urls: [] } : m
      )))
    }

    const handleConversationDeleted = ({ userId: deletedChatUserId }) => {
      if (deletedChatUserId?.toString?.() === userId?.toString?.()) {
        setMessages([])
      }
    }

    const handleBlockStatusChanged = ({ blockerId, blockedUserId, isBlocked }) => {
      const blocker = blockerId?.toString?.() || blockerId
      const blocked = blockedUserId?.toString?.() || blockedUserId

      if (blocker === currentUserId && blocked === userId) {
        setBlockStatus((current) => ({ ...current, isBlockedByMe: !!isBlocked }))
      }

      if (blocked === currentUserId && blocker === userId) {
        setBlockStatus((current) => ({ ...current, hasBlockedMe: !!isBlocked }))
      }
    }

    activeSocket.on('new-message', handleNewMessage)
    activeSocket.on('message-reaction-updated', handleReactionUpdated)
    activeSocket.on('message-edited', handleEdited)
    activeSocket.on('message-deleted', handleDeleted)
    activeSocket.on('conversation-deleted', handleConversationDeleted)
    activeSocket.on('user-block-status-changed', handleBlockStatusChanged)

    return () => {
      activeSocket.off('new-message', handleNewMessage)
      activeSocket.off('message-reaction-updated', handleReactionUpdated)
      activeSocket.off('message-edited', handleEdited)
      activeSocket.off('message-deleted', handleDeleted)
      activeSocket.off('conversation-deleted', handleConversationDeleted)
      activeSocket.off('user-block-status-changed', handleBlockStatusChanged)
    }
  }, [currentUserId, dispatch, isMini, markMessagesAsRead, setMessages, socket, socketRef, userId])

  useEffect(() => {
    scrollToMessageIdRef.current = scrollToMessageId || ''
  }, [scrollToMessageId])

  useEffect(() => {
    if (!userId) return
    const initialScrollTarget = scrollToMessageIdRef.current
    miniReadMarkedRef.current = false
    setHasMoreMessages(true)
    setLoadingOlder(false)
    setProfileMenuOpen(false)
    setChatSearchOpen(false)
    setChatSearchTerm('')
    setChatSearchMessages([])
    setChatSearchLoading(false)
    setBlockStatus({ isBlockedByMe: false, hasBlockedMe: false })
    fetchUserData()
    fetchBlockStatus()
    if (initialScrollTarget) fetchMessagesAround(initialScrollTarget)
    else fetchUserMessages()
    if (!isMini) markMessagesAsRead()
    return () => {
      if (!isMini) markMessagesAsRead()
      // Only reset the global messages slice for full-page chat (not mini chat boxes)
      if (!isMini) dispatch(resetMessages())
      imagePreviews.forEach(url => URL.revokeObjectURL(url))
      videoPreviews.forEach(url => URL.revokeObjectURL(url))
    }
  }, [fetchBlockStatus, fetchMessagesAround, fetchUserData, fetchUserMessages, isMini, markMessagesAsRead, userId, dispatch])

  useEffect(() => {
    if (!newMessageTrigger || !userId) return
    if (!isMini) markMessagesAsRead()
  }, [isMini, markMessagesAsRead, newMessageTrigger, userId])

  useEffect(() => {
    if (messages.length === 0) return
    const sorted = [...messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    if (!isMini && sorted[0]?.from_user_id?._id === userId) markMessagesAsRead()
  }, [isMini, markMessagesAsRead, messages, userId])

  useEffect(() => {
    if (messages.length > 0 && shouldAutoScrollRef.current) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages])

  useEffect(() => {
    const keyword = chatSearchTerm.trim()
    if (!chatSearchOpen || !keyword || !userId) {
      setChatSearchMessages([])
      setChatSearchLoading(false)
      return undefined
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      try {
        setChatSearchLoading(true)
        const token = await getToken()
        const { data } = await api.post('/api/message/search', {
          query: keyword,
          to_user_id: userId,
          limit: 120,
        }, {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (cancelled) return
        if (!data.success) throw new Error(data.message)
        setChatSearchMessages(data.messages || [])
      } catch (error) {
        if (!cancelled) {
          setChatSearchMessages([])
          toast.error(localizeMessage(error.message))
        }
      } finally {
        if (!cancelled) setChatSearchLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [chatSearchOpen, chatSearchTerm, getToken, userId])

  useEffect(() => {
    if (!scrollToMessageId || !userId || loading) return undefined

    let cancelled = false
    const run = async () => {
      await jumpToMessage(scrollToMessageId)
      if (!cancelled) onScrolledToMessage?.()
    }

    run()
    return () => { cancelled = true }
  }, [jumpToMessage, loading, onScrolledToMessage, scrollToMessageId, userId])

  if (loading) {
    return isMini
      ? (
        <div className='flex h-[33rem] w-[25rem] items-center justify-center rounded-t-2xl border border-slate-200 bg-white shadow-2xl'>
          <Loading height='10rem' />
        </div>
      )
      : <Loading height={isEmbedded ? '100%' : '100vh'} />
  }

  const startCall = async (callType) => {
    if (!onStartCall || !socketRef.current || !user) return
    if (isChatBlocked) {
      toast.error('Bạn không thể gọi trong đoạn chat này')
      return
    }

    const latestStatus = await fetchBlockStatus()
    if (latestStatus?.isBlockedByMe || latestStatus?.hasBlockedMe) {
      toast.error('Bạn không thể gọi trong đoạn chat này')
      return
    }

    const callData = {
      to: userId,
      from: currentUser._id,
      callType,
      callerName: currentUser.full_name,
      callerAvatar: currentUser.profile_picture,
    }
    // Notify receiver immediately (no WebRTC offer yet — that comes after receiver accepts)
    socketRef.current.emit('call-user', callData)
    onStartCall({ ...callData, isIncoming: false })
  }

  // ── Call back from history ────────────────────────────────────────────────
  const callBack = (callType) => startCall(callType)

  // ── Format call duration ─────────────────────────────────────────────────
  const formatCallDuration = (secs) => {
    if (!secs || secs === 0) return ''
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return ` · ${m}:${s}`
  }

  const shellClass = isMini
    ? 'flex h-[33rem] w-[25rem] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl'
    : isEmbedded
      ? 'flex h-full min-h-0 flex-col bg-slate-100'
      : 'flex h-screen flex-col bg-slate-100'
  const floatingReactionMessage = reactionMenuId
    ? messages.find((message) => message._id === reactionMenuId)
    : null
  const floatingActionMessage = openMenuId
    ? messages.find((message) => message._id === openMenuId)
    : null
  const floatingReaction = floatingReactionMessage?.reactions?.find((reaction) => (
    (reaction.user?._id || reaction.user) === currentUser?._id
  ))?.type
  const floatingActionIsOwn = getMessageUserId(floatingActionMessage?.from_user_id) === currentUserId
  const canUsePortal = typeof document !== 'undefined'
  const forwardConnections = connections.length > 0 ? connections : (reduxConnections || [])
  const confirmDialogContent = pendingDialog === 'delete-conversation'
    ? {
      title: 'Xóa đoạn chat?',
      message: 'Tin nhắn sẽ bị xóa khỏi hộp chat của bạn. Người còn lại vẫn có thể xem đoạn chat của họ.',
      confirmLabel: 'Xóa đoạn chat',
      loadingLabel: 'Đang xóa...'
    }
    : pendingDialog === 'block-user'
      ? {
        title: `Chặn ${user.full_name}?`,
        message: 'Sau khi chặn, hai bạn sẽ không thể nhắn tin, gọi điện hoặc gửi nội dung cho nhau.',
        confirmLabel: 'Chặn',
        loadingLabel: 'Đang chặn...'
      }
      : pendingDialog === 'unblock-user'
        ? {
          title: `Bỏ chặn ${user.full_name}?`,
          message: 'Sau khi bỏ chặn, hai bạn có thể nhắn tin và gọi điện lại.',
          confirmLabel: 'Bỏ chặn',
          loadingLabel: 'Đang xử lý...'
        }
        : null

  return user && (
    <div className={shellClass} onFocusCapture={markMiniMessagesAsRead} onPointerDown={markMiniMessagesAsRead}>
      {/* ── Header ── */}
      <div className={isMini ? 'flex items-center border-b border-slate-200 bg-white px-3 py-2' : 'surface m-3 mb-0 flex items-center rounded-[1.4rem] px-4 py-3'}>
        <button
          type='button'
          onClick={openUserProfile}
          className='shrink-0 rounded-full transition hover:brightness-95 focus:outline-none focus:ring-4 focus:ring-cyan-100'
          title='Xem trang cá nhân'
        >
          <img src={user.profile_picture} alt="" className={`${isMini ? 'size-9' : 'size-11 avatar-ring'} rounded-full object-cover`} />
        </button>
        <button
          type='button'
          ref={profileMenuAnchorRef}
          onClick={openProfileMenu}
          className={`${isMini ? 'ml-2' : 'ml-4'} flex min-w-0 flex-1 items-center gap-1 rounded-xl px-1 py-0.5 text-left transition hover:bg-slate-100`}
        >
          <span className='min-w-0 flex-1'>
            <span className={`${isMini ? 'text-sm' : ''} block truncate font-black text-slate-900`}>{user.full_name}</span>
            <span className='block truncate text-sm text-slate-500'>@{user.username}</span>
          </span>
          <ChevronDown className={`size-4 shrink-0 text-slate-500 transition ${profileMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        {/* Call buttons */}
        {/* Call buttons */}
        <div className='flex items-center gap-1'>
          <button
            id='voice-call-btn'
            onClick={() => startCall('voice')}
            title='Gọi thoại'
            disabled={isChatBlocked}
            className='p-2 rounded-full hover:bg-cyan-50 text-cyan-700 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent'
          >
            <Phone size={20} />
          </button>
          <button
            id='video-call-btn'
            onClick={() => startCall('video')}
            title='Gọi video'
            disabled={isChatBlocked}
            className='p-2 rounded-full hover:bg-cyan-50 text-cyan-700 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent'
          >
            <VideoIcon size={20} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title='Đóng'
              className='p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer'
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {chatSearchOpen && (
        <div className={isMini ? 'border-b border-slate-100 bg-white px-3 py-3' : 'border-b border-slate-200 bg-white/90 px-4 py-3'}>
          <div className={isMini ? 'space-y-3' : 'mx-auto max-w-4xl space-y-3'}>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={closeChatSearch}
                className='flex size-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100'
                title='Quay lại'
              >
                <ArrowLeft className='size-5' />
              </button>
              <div className='relative min-w-0 flex-1'>
                <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
                <input
                  type='text'
                  value={chatSearchTerm}
                  onChange={(event) => setChatSearchTerm(event.target.value)}
                  placeholder='Tìm kiếm tin nhắn trong đoạn chat'
                  autoFocus
                  className='w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-cyan-200 focus:bg-white focus:ring-4 focus:ring-cyan-50'
                />
              </div>
            </div>

            <div className={isMini ? 'max-h-40 overflow-y-auto' : 'max-h-56 overflow-y-auto'}>
              {!chatSearchTerm.trim() ? (
                <div className='px-4 py-5 text-center text-sm font-bold text-slate-400'>
                  Nhập nội dung tin nhắn cần tìm.
                </div>
              ) : chatSearchLoading ? (
                <div className='px-4 py-5 text-center text-sm font-bold text-slate-400'>
                  Đang tìm tin nhắn...
                </div>
              ) : chatSearchMessages.length === 0 ? (
                <div className='px-4 py-5 text-center text-sm text-slate-500'>
                  Không tìm thấy tin nhắn trùng khớp.
                </div>
              ) : (
                <div className='space-y-1'>
                  <p className='px-3 pb-1 text-xs font-black uppercase tracking-wide text-slate-400'>
                    {chatSearchMessages.length} tin nhắn trùng khớp
                  </p>
                  {chatSearchMessages.map((message) => (
                    <button
                      type='button'
                      key={message._id}
                      onClick={() => handleChatSearchMessageClick(message._id)}
                      className='flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-slate-100'
                    >
                      <img
                        src={getChatSearchAvatar(message)}
                        alt=''
                        className='size-10 shrink-0 rounded-full object-cover'
                      />
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-start gap-2'>
                          <p className='min-w-0 flex-1 truncate text-sm font-black text-slate-900'>
                            {getChatSearchSenderName(message)}
                          </p>
                          <span className='shrink-0 text-[11px] text-slate-400'>{moment(message.createdAt).fromNow()}</span>
                        </div>
                        <p className='mt-1 line-clamp-2 text-sm leading-5 text-slate-500'>
                          {message.text || 'Tin nhắn'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Messages area ── */}
      <div
        className={isMini ? 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-white px-4' : 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 md:px-6 bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.08),transparent_30rem),#f8fafc]'}
        ref={messagesContainerRef}
        onScroll={() => {
          if (openMenuId || reactionMenuId) closeMessageActions()
          if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
            shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100
            if (scrollTop < 100 && hasMoreMessages && !loadingOlder) {
              fetchOlderMessages()
            }
          }
        }}
      >
        <div className={isMini ? 'space-y-2 py-3' : 'mx-auto max-w-4xl space-y-2 py-5'} onClick={closeMessageActions}>
          {loadingOlder && (
            <div className='flex justify-center py-2'>
              <Loading height='2.5rem' />
            </div>
          )}
          {messages.toSorted((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((message, index) => {
            if (message.message_type === 'reaction') return null;

            // ── Call history bubble ───────────────────────────────────────────
            if (message.message_type === 'call') {
              const isOwn = (message.from_user_id?._id || message.from_user_id)?.toString() === currentUser?._id?.toString()
              const sorted = messages.toSorted((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
              const previousMessage = index > 0 ? sorted[index - 1] : null
              const showTimestamp = shouldShowTimestamp(message, previousMessage)
              const { call_type, call_status, call_duration } = message
              const isVideo = call_type === 'video'
              const isMissed = call_status === 'missed'
              const isRejected = call_status === 'rejected'
              const callIcon = isMissed ? '📵' : isRejected ? '❌' : isVideo ? '📹' : '📞'
              const statusLabel = isMissed
                ? (isOwn ? 'Đã bỏ lỡ cuộc gọi' : 'Đã bỏ lỡ cuộc gọi của bạn')
                : isRejected
                  ? (isOwn ? 'Cuộc gọi nhỡ' : 'Đã từ chối cuộc gọi')
                  : (isVideo ? 'Gọi video' : 'Gọi thoại') + formatCallDuration(call_duration)
              return (
                <div key={message._id || index}
                  ref={el => { if (message._id) messageRefs.current[message._id] = el }}
                >
                  {showTimestamp && (
                    <div className='flex justify-center my-3'>
                      <p className='text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full'>
                        {formatMessageTime(message.createdAt)}
                      </p>
                    </div>
                  )}
                  <div className={`flex items-center gap-2 my-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm max-w-xs
                      ${isMissed || isRejected
                        ? 'bg-red-50 text-red-600 border border-red-100'
                        : 'bg-green-50 text-green-700 border border-green-100'
                      }`}>
                      <span className='text-base'>{callIcon}</span>
                      <div className='flex flex-col'>
                        <span className='font-medium text-xs leading-tight'>
                          {isVideo ? 'Gọi video' : 'Gọi thoại'}
                        </span>
                        <span className='text-[11px] opacity-75'>{statusLabel}</span>
                      </div>
                      <button
                        onClick={() => callBack(call_type)}
                        title='Gọi lại'
                        className={`ml-1 p-1.5 rounded-full transition-colors
                          ${isMissed || isRejected
                            ? 'bg-red-100 hover:bg-red-200 text-red-600'
                            : 'bg-green-100 hover:bg-green-200 text-green-700'
                          }`}
                      >
                        {isVideo ? <VideoIcon size={13} /> : <Phone size={13} />}
                      </button>
                    </div>
                  </div>
                </div>
              )
            }
            // ─────────────────────────────────────────────────────────────────

            const isOwn = (message.from_user_id?._id || message.from_user_id)?.toString() === currentUser?._id?.toString()
            const mediaUrls = message.media_urls || (message.media_url ? [message.media_url] : [])
            const sorted = messages.toSorted((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            const previousMessage = index > 0 ? sorted[index - 1] : null
            const showTimestamp = shouldShowTimestamp(message, previousMessage)
            const isVoice = message.message_type === 'voice'
            const menuOpen = openMenuId === message._id
            const reactionMenuOpen = reactionMenuId === message._id

            // Calculate reactions
            const reactions = message.reactions || []
            const reactionCounts = reactions.reduce((acc, r) => {
              acc[r.type] = (acc[r.type] || 0) + 1;
              return acc;
            }, {})
            const topReactions = Object.entries(reactionCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(entry => entry[0])

            // ── Inline action buttons (no pill, no border) ──────────
            const ActionButtons = ({ side }) => !message.is_deleted && (
              <div className={`
                z-20 flex shrink-0 items-center gap-0.5 self-end mb-1
                opacity-0 group-hover:opacity-100 transition-opacity duration-150
                ${side === 'left' ? 'order-first' : 'order-last'}
              `}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleReply(message) }}
                  className='p-1 text-gray-400 hover:text-cyan-600 transition-colors'
                  title='Trả lời'
                >
                  <Reply size={15} />
                </button>
                <button
                  onClick={(event) => openReactionPicker(event, message, isOwn)}
                  className={`p-1 transition-colors ${reactionMenuOpen ? 'text-cyan-600' : 'text-gray-400 hover:text-cyan-600'}`}
                  title='Bày tỏ cảm xúc'
                >
                  <SmilePlus size={15} />
                </button>
                <button
                  onClick={(event) => openActionMenu(event, message, isOwn)}
                  className={`p-1 transition-colors ${menuOpen ? 'text-cyan-600' : 'text-gray-400 hover:text-cyan-600'}`}
                  title='Tác vụ khác'
                >
                  <MoreVertical size={15} />
                </button>
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
                  className={`group flex items-end gap-1 ${isOwn ? 'justify-end' : 'justify-start'} mb-3 relative`}
                  onClick={closeMessageActions}
                >
                  {/* Own messages: actions LEFT of bubble */}
                  {isOwn && <ActionButtons side='left' />}

                  <div className='flex flex-col relative'>
                    {/* ── Bubble ── */}
                    <div className={`
                    p-3 text-sm
                    ${isMini ? 'max-w-[16.5rem]' : 'max-w-[70vw] md:max-w-lg lg:max-w-xl'}
                    rounded-[1.25rem] shadow-sm
                    ${message.is_deleted
                        ? 'bg-slate-100 text-slate-400 italic border border-dashed border-slate-300 rounded-br-none'
                        : isOwn
                          ? 'bg-cyan-700 text-white rounded-br-none shadow-cyan-700/10'
                          : 'bg-white text-slate-800 rounded-bl-none border border-slate-200'
                      }
                  `}>
                      {/* Forward label */}
                      {message.is_forwarded && !message.is_deleted && message.forwarded_type !== 'story' && (
                        <p className={`text-[10px] mb-1 flex items-center gap-1 ${isOwn ? 'text-cyan-100' : 'text-slate-400'}`}>
                          <CornerUpRight size={10} /> Đã chuyển tiếp
                        </p>
                      )}

                      {/* ── Reply quote — click scrolls to original ── */}
                      {message.reply_to && !message.is_deleted && (
                        <div
                          className={`text-xs mb-2 px-2 py-1 rounded-lg border-l-2 cursor-pointer transition-opacity hover:opacity-80 ${isOwn ? 'bg-cyan-600/50 border-cyan-100 text-cyan-50' : 'bg-slate-100 border-cyan-400 text-slate-600'}`}
                          onClick={(e) => { e.stopPropagation(); scrollToMessage(message.reply_to._id) }}
                        >
                          <p className='font-semibold text-[10px] mb-0.5'>
                            {message.reply_to.from_user_id?._id === currentUser._id ? 'Bạn' : message.reply_to.from_user_id?.full_name}
                          </p>
                          <p className='line-clamp-1 text-[11px]'>
                            {getReplyLabel(message.reply_to)}
                          </p>
                        </div>
                      )}

                      {message.is_deleted ? (
                        <p>Tin nhắn đã bị thu hồi</p>
                      ) : message.is_forwarded && message.forwarded_type === 'story' ? (
                        <div className='flex items-center gap-3'>
                          <div className='w-14 h-20 bg-black/10 rounded-lg overflow-hidden shrink-0 shadow-sm cursor-pointer relative group' onClick={() => handleStoryClick(message.shared_story_id)}>
                            {message.message_type === 'video' && mediaUrls[0] ? (
                              <>
                                <video src={mediaUrls[0]} className='w-full h-full object-cover' />
                                <div className='absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/40 transition'>
                                  <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[6px] border-l-white border-b-[4px] border-b-transparent ml-0.5"></div>
                                </div>
                              </>
                            ) : mediaUrls[0] ? (
                              <img src={mediaUrls[0]} className='w-full h-full object-cover group-hover:brightness-90 transition' />
                            ) : (
                              <div className='w-full h-full bg-gradient-to-tr from-cyan-600 to-teal-600 flex items-center justify-center'>
                                <span className='text-white text-xs font-bold'>Aa</span>
                              </div>
                            )}
                          </div>
                          <div className='flex-1 flex flex-col justify-center min-w-[120px]'>
                            <p className={`text-[10px] mb-1 flex items-center gap-1 ${isOwn ? 'text-cyan-100' : 'text-gray-400'}`}>
                              <CornerUpRight size={10} /> Đã trả lời tin
                            </p>
                            {message.text && renderMessageText(message.text)}
                            {message.is_edited && (
                              <span className={`text-[10px] mt-1 ${isOwn ? 'text-cyan-100' : 'text-gray-400'}`}> · đã sửa</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          {isVoice && mediaUrls.length > 0 && (
                            <div className='flex items-center gap-2 min-w-[200px]'>
                              <span className='text-lg'>🎤</span>
                              <audio
                                controls
                                preload='metadata'
                                className='h-8 w-full max-w-[220px]'
                                style={{ accentColor: isOwn ? '#fff' : '#6366f1' }}
                                onClick={stopAudioControlEvent}
                                onPointerDown={stopAudioControlEvent}
                                onTouchStart={stopAudioControlEvent}
                              >
                                <source src={mediaUrls[0]} type={getAudioSourceType(mediaUrls[0])} />
                              </audio>
                            </div>
                          )}
                          {!isVoice && mediaUrls.length > 0 && (
                            <div className='flex flex-wrap gap-2 mb-2'>
                              {mediaUrls.map((url, idx) => {
                                const isVideo = url.match(/\.(mp4|webm|mov|ogg)$/i) || message.message_type?.includes('video')
                                return isVideo
                                  ? (
                                    <div key={idx} onClick={() => openMediaViewer(url)} className={`relative group cursor-pointer w-full ${isMini ? 'max-w-[13.5rem]' : 'max-w-[18rem]'} rounded-lg overflow-hidden border border-gray-100`}>
                                      <video src={url} className='max-h-[14rem] w-full object-cover' />
                                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/30 transition">
                                        <div className="bg-white/80 p-3 rounded-full backdrop-blur-sm shadow-sm group-hover:scale-110 transition-transform">
                                          <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-gray-800 border-b-[6px] border-b-transparent ml-1"></div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                  : <img key={idx} src={url} alt='sent-image' onClick={() => openMediaViewer(url)} className={`cursor-pointer w-full ${isMini ? 'max-w-[13.5rem]' : 'max-w-[18rem]'} max-h-[14rem] rounded-lg border border-gray-100 object-contain transition hover:brightness-95`} />
                              })}
                            </div>
                          )}
                          {message.text && renderMessageText(message.text)}
                          {message.is_edited && (
                            <span className={`text-[10px] ${isOwn ? 'text-cyan-100' : 'text-gray-400'}`}> · đã sửa</span>
                          )}
                        </>
                      )}

                      {/* Reactions display half-outside bottom-right */}
                      {!message.is_deleted && topReactions.length > 0 && (
                        <div
                          className={`absolute -bottom-2.5 ${isOwn ? 'right-0' : 'right-0'} translate-x-1/4 w-fit rounded-full px-1.5 py-0.5 flex items-center cursor-pointer hover:scale-105 transition bg-white shadow-sm border border-gray-200 z-10`}
                          onClick={(e) => { e.stopPropagation(); setShowReactionListMsg(message) }}
                        >
                          <div className="flex -space-x-1">
                            {topReactions.map((type, idx) => (
                              <span key={type} className="text-[12px] bg-white rounded-full z-10" style={{ zIndex: 3 - idx }}>
                                {REACTION_ICONS[type]}
                              </span>
                            ))}
                          </div>
                          {reactions.length > 1 && <span className={`text-[10px] font-medium ml-1 text-gray-500`}>{reactions.length}</span>}
                        </div>
                      )}
                    </div>
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
      <div className={isMini ? 'border-t border-slate-100 bg-white px-3 pb-3 pt-2' : 'px-4 pb-5 pt-2 bg-slate-100'}>
        {/* Media previews */}
        {!isChatBlocked && (imagePreviews.length > 0 || videoPreviews.length > 0) && (
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
            <p className='text-xs text-gray-500 w-full'>({images.length}/5 ảnh, {videos.length}/3 video)</p>
          </div>
        )}

        {/* Voice recording panel */}
        {!isChatBlocked && (isRecording || audioBlob) && (
          <div className='surface flex items-center gap-3 mb-3 px-4 py-3 rounded-2xl max-w-2xl mx-auto'>
            {isRecording ? (
              <>
                <span className='relative flex h-3 w-3'>
                  <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75'></span>
                  <span className='relative inline-flex rounded-full h-3 w-3 bg-red-500'></span>
                </span>
                <span className='text-red-500 font-mono text-sm font-semibold flex-1'>
                  Đang ghi âm... {formatTime(recordingTime)}
                </span>
                <button onClick={stopRecording} className='flex items-center gap-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 px-3 py-1.5 rounded-full text-xs font-medium transition'>
                  <Square size={12} fill='currentColor' /> Dừng
                </button>
                <button onClick={cancelRecording} className='flex items-center gap-1 text-gray-400 hover:text-red-500 px-2 py-1.5 rounded-full text-xs transition'>
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <>
                <span className='text-cyan-600 text-lg'>🎤</span>
                <audio
                  controls
                  src={audioPreviewUrl}
                  className='h-8 flex-1'
                  onClick={stopAudioControlEvent}
                  onPointerDown={stopAudioControlEvent}
                  onTouchStart={stopAudioControlEvent}
                />
                <span className='text-xs text-gray-400 font-mono'>{formatTime(recordingTime)}</span>
                <button onClick={sendVoiceMessage} disabled={isSendingVoice}
                  className='btn-primary disabled:opacity-60 px-4 py-1.5 text-xs transition flex items-center gap-1'>
                  {isSendingVoice
                    ? <span className='animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full'></span>
                    : <SendHorizonal size={14} />}
                  Gửi
                </button>
                <button onClick={cancelRecording} className='flex items-center gap-1 text-gray-400 hover:text-red-500 px-2 py-1.5 rounded-full text-xs transition'>
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Edit mode bar */}
        {editingMsg && !isChatBlocked && (
          <div className='flex items-center gap-2 mb-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-xl max-w-2xl mx-auto'>
            <Pencil size={14} className='text-yellow-500 shrink-0' />
            <span className='text-xs text-yellow-700 flex-1 truncate'>Đang sửa: {editingMsg.text}</span>
            <button onClick={() => { setEditingMsg(null); setEditText(''); setText('') }} className='text-gray-400 hover:text-red-400'><X size={14} /></button>
          </div>
        )}

        {/* Reply bar */}
        {replyingTo && !isChatBlocked && (
          <div className='flex items-center gap-2 mb-2 px-4 py-2 bg-cyan-50 border border-cyan-100 rounded-xl max-w-2xl mx-auto'>
            <Reply size={14} className='text-cyan-500 shrink-0' />
            <div className='flex-1 min-w-0'>
              <p className='text-[10px] font-semibold text-cyan-700'>
                {replyingTo.from_user_id?._id === currentUser._id ? 'Bạn' : replyingTo.from_user_id?.full_name}
              </p>
              <p className='text-xs text-gray-500 truncate'>{getReplyLabel(replyingTo)}</p>
            </div>
            <button onClick={() => setReplyingTo(null)} className='text-gray-400 hover:text-red-400'><X size={14} /></button>
          </div>
        )}

        {isChatBlocked ? (
          <div className='mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center'>
            <p className='text-sm font-bold text-slate-900'>
              {isBlockedByMe ? `Bạn đã chặn ${user.full_name}` : 'Bạn không thể nhắn tin hoặc gọi điện trong đoạn chat này'}
            </p>
            <p className='text-xs leading-5 text-slate-500'>
              {isBlockedByMe
                ? 'Các bạn sẽ không thể nhắn tin, gọi điện hoặc gửi nội dung cho nhau cho đến khi bạn bỏ chặn.'
                : 'Người này hiện không thể nhận tin nhắn, cuộc gọi hoặc nội dung từ bạn.'}
            </p>
            {isBlockedByMe && (
              <button
                type='button'
                onClick={() => setPendingDialog('unblock-user')}
                className='btn-muted mx-auto px-4 py-2 text-sm'
              >
                Bỏ chặn
              </button>
            )}
          </div>
        ) : (
        <div className={isMini ? 'flex w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-2' : 'surface flex items-center gap-3 pl-5 p-2 w-full max-w-2xl mx-auto rounded-full'}>
          <input
            type="text"
            className='min-w-0 flex-1 bg-transparent text-slate-700 outline-none'
            placeholder={editingMsg ? 'Sửa tin nhắn...' : 'Nhập tin nhắn...'}
            onKeyDown={handleInputKeyDown}
            onChange={(e) => { setText(e.target.value); if (editingMsg) setEditText(e.target.value) }}
            value={text}
          />
          <label htmlFor={imageInputId} className='group relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition hover:bg-white hover:text-gray-600'>
            <ImageIcon className='size-5' />
            <span className='pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100'>
              Thêm ảnh
            </span>
            <input type="file" id={imageInputId} accept='image/*' hidden multiple onChange={handleImagesChange} />
          </label>
          <label htmlFor={videoInputId} className='group relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition hover:bg-white hover:text-gray-600'>
            <Video className='size-5' />
            <span className='pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100'>
              Thêm video
            </span>
            <input type="file" id={videoInputId} accept='video/*' hidden multiple onChange={handleVideosChange} />
          </label>
          <button
            type='button'
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!!audioBlob}
            className={`group relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition ${isRecording ? 'text-red-500 animate-pulse' : audioBlob ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:bg-white hover:text-cyan-600'}`}
            title={isRecording ? 'Dừng ghi âm' : 'Bắt đầu ghi âm'}
          >
            <Mic size={20} />
            <span className='pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100'>
              {isRecording ? 'Dừng ghi âm' : audioBlob ? 'Đã có ghi âm' : 'Ghi âm'}
            </span>
          </button>
          <button
            type='button'
            onClick={editingMsg ? handleEditSave : sendMessage}
            disabled={isSendingMessage}
            className='btn-primary size-9 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70'
            title={editingMsg ? 'Lưu chỉnh sửa' : 'Gửi tin nhắn'}
          >
            {isSendingMessage
              ? <span className='inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent' />
              : editingMsg ? <Check size={18} /> : <SendHorizonal size={18} />}
          </button>
        </div>
        )}
      </div>

      {canUsePortal && profileMenuOpen && profileMenuPosition && createPortal(
        <div
          className='fixed z-[9999] w-[260px] overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-2xl'
          style={{ top: profileMenuPosition.top, left: profileMenuPosition.left }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type='button'
            onClick={openUserProfile}
            className='flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-50'
          >
            <UserRound className='size-5 text-slate-700' />
            Xem trang cá nhân
          </button>
          <button
            type='button'
            onClick={openChatSearch}
            className='flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-50'
          >
            <Search className='size-5 text-slate-700' />
            Tìm kiếm tin nhắn
          </button>
          <button
            type='button'
            onClick={requestDeleteConversation}
            className='flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-50'
          >
            <Trash2 className='size-5 text-slate-700' />
            Xóa đoạn chat
          </button>
          {!isBlockedByMe && (
            <button
              type='button'
              onClick={requestBlockUser}
              className='flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-50'
            >
              <Ban className='size-5 text-slate-700' />
              Chặn
            </button>
          )}
          <button
            type='button'
            onClick={() => setProfileMenuOpen(false)}
            className='flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-slate-400 hover:bg-slate-50'
          >
            <Flag className='size-5 text-slate-400' />
            Báo cáo vi phạm
          </button>
        </div>,
        document.body
      )}

      {canUsePortal && floatingReactionMessage && reactionMenuPosition && createPortal(
        <div
          className='fixed z-[9999]'
          style={{ top: reactionMenuPosition.top, left: reactionMenuPosition.left }}
          onClick={(event) => event.stopPropagation()}
        >
          <ReactionPicker
            onReact={(type) => handleReactMessage(floatingReactionMessage._id, type)}
            currentReaction={floatingReaction}
          />
        </div>,
        document.body
      )}

      {canUsePortal && floatingActionMessage && actionMenuPosition && createPortal(
        <div
          className='fixed z-[9999] min-w-[140px] rounded-xl border border-gray-100 bg-white py-1 shadow-xl'
          style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
          onClick={(event) => event.stopPropagation()}
        >
          {floatingActionIsOwn && isEditable(floatingActionMessage) && (
            <button
              type='button'
              onClick={() => {
                setEditingMsg(floatingActionMessage)
                setEditText(floatingActionMessage.text || '')
                setText(floatingActionMessage.text || '')
                closeMessageActions()
              }}
              className='flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50'
            >
              <Pencil size={13} /> Sửa
            </button>
          )}
          <button
            type='button'
            onClick={() => handleForwardOpen(floatingActionMessage)}
            className='flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50'
          >
            <CornerUpRight size={13} /> Chuyển tiếp
          </button>
          {floatingActionIsOwn && (
            <button
              type='button'
              onClick={() => handleDelete(floatingActionMessage._id)}
              className='flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-500 hover:bg-red-50'
            >
              <Trash2 size={13} /> Xóa
            </button>
          )}
        </div>,
        document.body
      )}

      {/* ── Forward Modal ── */}
      {showForwardModal && (
        <div className='fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50'>
          <div className='bg-white rounded-2xl shadow-xl w-full max-w-md mx-4'>
            <div className='flex items-center justify-between px-5 py-4 border-b border-gray-100'>
              <h3 className='font-semibold text-slate-800'>Chuyển tiếp tin nhắn</h3>
              {/* ✅ closeForwardModal clears all forward state */}
              <button onClick={closeForwardModal} className='text-gray-400 hover:text-gray-600'><X size={18} /></button>
            </div>
            <div className='px-5 py-3'>
              {/* Preview */}
              <div className='bg-gray-50 rounded-xl px-3 py-2 mb-3 text-sm text-gray-600 border border-gray-200'>
                <p className='text-[10px] text-gray-400 mb-1 flex items-center gap-1'><CornerUpRight size={10} /> Đang chuyển tiếp</p>
                {forwardingMsg?.message_type === 'voice' && <p>🎤 Tin nhắn thoại</p>}
                {forwardingMsg?.message_type?.includes('video') && <p>🎬 Tin nhắn video ({forwardingMsg?.media_urls?.length || 0} tệp)</p>}
                {forwardingMsg?.message_type?.includes('image') && <p>🖼️ Tin nhắn ảnh ({forwardingMsg?.media_urls?.length || 0} tệp)</p>}
                {(!forwardingMsg?.message_type || forwardingMsg?.message_type === 'text') && (
                  <p className='line-clamp-2'>{forwardingMsg?.text || '—'}</p>
                )}
              </div>
              {/* Search */}
              <input
                type='text'
                placeholder='Tìm kiếm người bạn...'
                value={forwardSearch}
                onChange={e => setForwardSearch(e.target.value)}
                className='w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-indigo-300 mb-2'
              />
              {/* List */}
              <div className='max-h-52 overflow-y-auto space-y-1'>
                {forwardConnections
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
              <button onClick={closeForwardModal} className='flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition'>Hủy</button>
              <button
                onClick={handleForwardSend}
                disabled={forwardSelected.length === 0 || isForwarding}
                className='flex-1 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-medium transition disabled:opacity-50'
              >
                {isForwarding ? 'Đang gửi...' : `Gửi (${forwardSelected.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Media Viewer Modal ── */}
      {mediaViewerOpen && (
        <ChatMediaViewer
          mediaList={allMedia}
          currentIndex={currentMediaIndex}
          onClose={() => setMediaViewerOpen(false)}
          onNavigate={setCurrentMediaIndex}
        />
      )}

      {/* Reaction List Modal */}
      <ReactionListModal
        isOpen={!!showReactionListMsg}
        onClose={() => setShowReactionListMsg(null)}
        reactions={showReactionListMsg?.reactions || []}
      />

      <ConfirmDialog
        isOpen={!!confirmDialogContent}
        title={confirmDialogContent?.title || ''}
        message={confirmDialogContent?.message || ''}
        confirmLabel={confirmDialogContent?.confirmLabel}
        loadingLabel={confirmDialogContent?.loadingLabel}
        isDangerous={pendingDialog !== 'unblock-user'}
        isLoading={isDialogLoading}
        onConfirm={handleConfirmDialog}
        onCancel={closeConfirmDialog}
      />



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
