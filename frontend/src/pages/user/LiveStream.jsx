import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, CircleStop, Eye, LoaderCircle, Mic, MicOff, Radio, Send, Video, VideoOff, WifiOff } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import localizeMessage from '../../utils/localization'
import moment from '../../utils/moment'
import { REACTION_ICONS, REACTION_LABELS, REACTIONS } from '../../utils/reactions'

const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
]

const splitList = (value) => {
  if (!value) return []
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

const makeIceServer = (urls, username, credential) => {
  if (!urls.length) return null
  const server = { urls: urls.length === 1 ? urls[0] : urls }
  if (username && credential) {
    server.username = username
    server.credential = credential
  }
  return server
}

const buildClientIceConfig = () => {
  const stunUrls = splitList(import.meta.env.VITE_STUN_URLS)
  const turnUrls = splitList(import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL)
  const turnServer = makeIceServer(
    turnUrls,
    import.meta.env.VITE_TURN_USERNAME,
    import.meta.env.VITE_TURN_CREDENTIAL || import.meta.env.VITE_TURN_PASSWORD
  )

  const iceConfig = {
    iceServers: [
      makeIceServer(stunUrls.length > 0 ? stunUrls : DEFAULT_STUN_URLS),
      turnServer,
    ].filter(Boolean)
  }

  const policy = import.meta.env.VITE_ICE_TRANSPORT_POLICY
  if (policy === 'all' || policy === 'relay') {
    iceConfig.iceTransportPolicy = policy
  }

  return iceConfig
}

const normalizeIceConfig = (config) => {
  if (!config?.iceServers?.length) return buildClientIceConfig()
  return config
}

const getReactionCounts = (reactions = []) => reactions.reduce((counts, reaction) => {
  counts[reaction.type] = (counts[reaction.type] || 0) + 1
  return counts
}, {})

const getUserId = (userOrId) => userOrId?._id?.toString?.() || userOrId?.toString?.() || ''

const LiveStream = () => {
  const { streamId } = useParams()
  const navigate = useNavigate()
  const currentUser = useSelector((state) => state.user.value)
  const { getToken } = useAuth()
  const { socketRef, socket } = useSocket()

  const [stream, setStream] = useState(null)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [loading, setLoading] = useState(true)
  const [isPostingComment, setIsPostingComment] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isCamOff, setIsCamOff] = useState(false)
  const [viewerCount, setViewerCount] = useState(0)
  const [reactions, setReactions] = useState([])
  const [reactionCounts, setReactionCounts] = useState({})
  const [floatingReactions, setFloatingReactions] = useState([])
  const [connectionState, setConnectionState] = useState('Đang kết nối')
  const [hasEnded, setHasEnded] = useState(false)
  const [hasRemoteStream, setHasRemoteStream] = useState(false)
  // Pre-live preview states (host only)
  const [isLiveStarted, setIsLiveStarted] = useState(false)
  const [liveTitle, setLiveTitle] = useState('')
  const [previewReady, setPreviewReady] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [isGoingLive, setIsGoingLive] = useState(false)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const peerConnectionsRef = useRef(new Map())
  const pendingCandidatesRef = useRef(new Map())
  const iceConfigRef = useRef(null)
  const iceConfigPromiseRef = useRef(null)
  const floatingTimersRef = useRef(new Set())
  const pendingViewerSocketIdsRef = useRef(new Set())
  const isLiveStartedRef = useRef(false)

  const currentUserId = getUserId(currentUser)
  const isHost = !!stream?.user && getUserId(stream.user) === currentUserId
  const activeSocket = socket || socketRef?.current

  const currentUserReaction = useMemo(() => {
    const reaction = reactions.find((item) => getUserId(item.user) === currentUserId)
    return reaction?.type || null
  }, [currentUserId, reactions])

  const totalReactions = useMemo(() => (
    Object.values(reactionCounts).reduce((total, count) => total + count, 0)
  ), [reactionCounts])

  useEffect(() => {
    isLiveStartedRef.current = isLiveStarted
  }, [isLiveStarted])

  const loadIceConfig = useCallback(async () => {
    if (iceConfigRef.current) return iceConfigRef.current

    if (!iceConfigPromiseRef.current) {
      iceConfigPromiseRef.current = (async () => {
        try {
          const token = await getToken()
          const { data } = await api.get('/api/call/ice-config', {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (data?.success) return normalizeIceConfig(data.iceConfig)
        } catch (error) {
          console.warn('Could not load ICE config for livestream:', error.message)
        }

        return buildClientIceConfig()
      })()
    }

    iceConfigRef.current = await iceConfigPromiseRef.current
    return iceConfigRef.current
  }, [getToken])

  const attachLocalStream = useCallback(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
      localVideoRef.current.play().catch(() => {})
    }
  }, [])

  const attachRemoteStream = useCallback((streamValue) => {
    remoteStreamRef.current = streamValue
    setHasRemoteStream(true)
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = streamValue
      remoteVideoRef.current.play().catch(() => {
        setConnectionState('Nhấn vào video nếu trình duyệt chặn tự phát âm thanh')
      })
    }
  }, [])

  const cleanupPeerConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.oniceconnectionstatechange = null
      try { pc.close() } catch { /* Peer may already be closed. */ }
    })
    peerConnectionsRef.current.clear()
    pendingCandidatesRef.current.clear()
    remoteStreamRef.current = null
    setHasRemoteStream(false)
  }, [])

  const cleanupLocalMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
  }, [])

  const startLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      attachLocalStream()
      return localStreamRef.current
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Trình duyệt không hỗ trợ camera/micro')
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localStreamRef.current = mediaStream
    attachLocalStream()
    return mediaStream
  }, [attachLocalStream])

  const sendSignal = useCallback((targetSocketId, signal) => {
    activeSocket?.emit('live-webrtc-signal', {
      streamId,
      targetSocketId,
      signal
    })
  }, [activeSocket, streamId])

  const flushPendingCandidates = useCallback(async (socketId, pc) => {
    if (!pc.remoteDescription) return

    const pendingCandidates = pendingCandidatesRef.current.get(socketId) || []
    pendingCandidatesRef.current.delete(socketId)

    for (const candidate of pendingCandidates) {
      try {
        await pc.addIceCandidate(candidate)
      } catch (error) {
        console.error('Live addIceCandidate error:', error)
      }
    }
  }, [])

  const addOrQueueCandidate = useCallback(async (socketId, pc, candidate) => {
    if (pc.remoteDescription) {
      await pc.addIceCandidate(candidate)
      return
    }

    const pendingCandidates = pendingCandidatesRef.current.get(socketId) || []
    pendingCandidates.push(candidate)
    pendingCandidatesRef.current.set(socketId, pendingCandidates)
  }, [])

  const closePeerConnection = useCallback((socketId) => {
    const pc = peerConnectionsRef.current.get(socketId)
    if (!pc) return

    pc.onicecandidate = null
    pc.ontrack = null
    pc.onconnectionstatechange = null
    pc.oniceconnectionstatechange = null
    try { pc.close() } catch { /* Peer may already be closed. */ }
    peerConnectionsRef.current.delete(socketId)
    pendingCandidatesRef.current.delete(socketId)
  }, [])

  const createPeerConnection = useCallback(async (socketId) => {
    const existing = peerConnectionsRef.current.get(socketId)
    if (existing) return existing

    const pc = new RTCPeerConnection(await loadIceConfig())
    peerConnectionsRef.current.set(socketId, pc)

    if (isHost && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal(socketId, { type: 'candidate', candidate })
      }
    }

    pc.ontrack = (event) => {
      const [incomingStream] = event.streams
      if (incomingStream) {
        attachRemoteStream(incomingStream)
        return
      }

      const mediaStream = remoteStreamRef.current || new MediaStream()
      if (!mediaStream.getTracks().some((track) => track.id === event.track.id)) {
        mediaStream.addTrack(event.track)
      }
      attachRemoteStream(mediaStream)
    }

    const updateState = () => {
      if (pc.connectionState === 'connected') setConnectionState('Đang xem trực tiếp')
      if (pc.connectionState === 'connecting') setConnectionState('Đang kết nối')
      if (pc.connectionState === 'failed') setConnectionState('Kết nối media bị lỗi')
      if (pc.connectionState === 'disconnected') setConnectionState('Kết nối media bị gián đoạn')
    }

    pc.onconnectionstatechange = updateState
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionState(isHost ? 'Đang phát trực tiếp' : 'Đang xem trực tiếp')
      }
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setConnectionState('Kết nối media không ổn định')
      }
    }

    return pc
  }, [attachRemoteStream, isHost, loadIceConfig, sendSignal])

  const createOfferForViewer = useCallback(async (viewerSocketId) => {
    if (!isHost || !viewerSocketId || !localStreamRef.current) return

    try {
      closePeerConnection(viewerSocketId)
      const pc = await createPeerConnection(viewerSocketId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendSignal(viewerSocketId, { type: 'offer', sdp: offer.sdp })
    } catch (error) {
      console.error('Live offer error:', error)
    }
  }, [closePeerConnection, createPeerConnection, isHost, sendSignal])

  const handleRemoteSignal = useCallback(async ({ streamId: signalStreamId, signal, fromSocketId }) => {
    if (signalStreamId?.toString() !== streamId?.toString() || !signal || !fromSocketId) return

    try {
      if (isHost) {
        const pc = peerConnectionsRef.current.get(fromSocketId)
        if (!pc) return

        if (signal.type === 'answer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
          await flushPendingCandidates(fromSocketId, pc)
          return
        }

        if (signal.type === 'candidate' && signal.candidate) {
          await addOrQueueCandidate(fromSocketId, pc, signal.candidate)
        }
        return
      }

      const pc = await createPeerConnection(fromSocketId)
      if (signal.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
        await flushPendingCandidates(fromSocketId, pc)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendSignal(fromSocketId, { type: 'answer', sdp: answer.sdp })
        return
      }

      if (signal.type === 'candidate' && signal.candidate) {
        await addOrQueueCandidate(fromSocketId, pc, signal.candidate)
      }
    } catch (error) {
      console.error('Live WebRTC signal error:', error)
      setConnectionState('Không thể kết nối media')
    }
  }, [addOrQueueCandidate, createPeerConnection, flushPendingCandidates, isHost, sendSignal, streamId])

  const addFloatingReaction = useCallback((reaction) => {
    const id = `${Date.now()}-${Math.random()}`
    const timer = setTimeout(() => {
      setFloatingReactions((items) => items.filter((item) => item.id !== id))
      floatingTimersRef.current.delete(timer)
    }, 1800)

    floatingTimersRef.current.add(timer)
    setFloatingReactions((items) => [
      ...items,
      { id, reaction, left: 18 + Math.random() * 64 }
    ].slice(-12))
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadLiveStream = async () => {
      try {
        setLoading(true)
        const token = await getToken()
        const [streamResponse, commentsResponse] = await Promise.all([
          api.get(`/api/live/${streamId}`, { headers: { Authorization: `Bearer ${token}` } }),
          api.get(`/api/live/${streamId}/comments`, { headers: { Authorization: `Bearer ${token}` } })
        ])

        if (cancelled) return

        if (!streamResponse.data.success) {
          toast.error(localizeMessage(streamResponse.data.message))
          navigate('/feed', { replace: true })
          return
        }

        const liveStream = streamResponse.data.stream
        setStream(liveStream)
        setViewerCount(liveStream.viewers_count || 0)
        setReactions(liveStream.reactions || [])
        setReactionCounts(liveStream.reaction_counts || getReactionCounts(liveStream.reactions || []))
        setHasEnded(liveStream.status === 'ended')
        if (getUserId(liveStream.user) === currentUserId && liveStream.status === 'live') {
          isLiveStartedRef.current = true
          setIsLiveStarted(true)
        }

        if (commentsResponse.data.success) {
          setComments(commentsResponse.data.comments || [])
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(localizeMessage(error.message))
          navigate('/feed', { replace: true })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadLiveStream()

    return () => {
      cancelled = true
    }
  }, [currentUserId, getToken, navigate, streamId])

  useEffect(() => {
    attachLocalStream()
  }, [attachLocalStream, isCamOff, isLiveStarted, previewReady])

  useEffect(() => {
    if (!activeSocket || !stream?._id || !currentUserId || hasEnded) return undefined

    let cancelled = false
    const pendingViewerSocketIds = pendingViewerSocketIdsRef.current

    const handleCommentCreated = (payload) => {
      if (payload?.streamId?.toString() !== streamId?.toString() || !payload.comment) return

      setComments((items) => {
        if (items.some((comment) => comment._id === payload.comment._id)) return items
        return [...items, payload.comment]
      })
    }

    const handleReactionUpdated = (payload) => {
      if (payload?.streamId?.toString() !== streamId?.toString()) return
      if (Array.isArray(payload.reactions)) setReactions(payload.reactions)
      if (payload.reactionCounts) setReactionCounts(payload.reactionCounts)
    }

    const handleReactionBurst = (payload) => {
      if (payload?.streamId?.toString() !== streamId?.toString() || !payload.reaction) return
      addFloatingReaction(payload.reaction)
    }

    const handleViewerCountUpdated = (payload) => {
      if (payload?.streamId?.toString() !== streamId?.toString()) return
      setViewerCount(payload.viewers_count || 0)
    }

    const handleViewerJoined = (payload) => {
      if (payload?.streamId?.toString() !== streamId?.toString()) return
      if (!payload.viewerSocketId) return
      if (isHost && !isLiveStartedRef.current) {
        pendingViewerSocketIdsRef.current.add(payload.viewerSocketId)
        return
      }
      createOfferForViewer(payload.viewerSocketId)
    }

    const handleViewerLeft = (payload) => {
      if (payload?.streamId?.toString() !== streamId?.toString()) return
      if (payload.viewerSocketId) pendingViewerSocketIdsRef.current.delete(payload.viewerSocketId)
      closePeerConnection(payload.viewerSocketId)
      if (Number.isFinite(payload.viewers_count)) setViewerCount(payload.viewers_count)
    }

    const handleEnded = (payload) => {
      if (payload?.streamId?.toString() !== streamId?.toString()) return
      setHasEnded(true)
      setStream((value) => value ? { ...value, status: 'ended', ended_at: payload.endedAt } : value)
      cleanupPeerConnections()
      cleanupLocalMedia()
    }

    const joinLiveRoom = async () => {
      try {
        if (isHost && isLiveStartedRef.current) {
          await startLocalStream()
          if (cancelled) return
          setConnectionState('Đang phát trực tiếp')
        } else if (isHost) {
          setConnectionState('Sẵn sàng phát trực tiếp')
        }

        activeSocket.emit('join-live-stream', {
          streamId,
          role: isHost ? 'host' : 'viewer'
        })
      } catch (error) {
        toast.error(localizeMessage(error.message))
        setConnectionState('Không thể truy cập camera/micro')
      }
    }

    activeSocket.on('live-comment-created', handleCommentCreated)
    activeSocket.on('live-reaction-updated', handleReactionUpdated)
    activeSocket.on('live-reaction-burst', handleReactionBurst)
    activeSocket.on('live-viewer-count-updated', handleViewerCountUpdated)
    activeSocket.on('live-viewer-joined', handleViewerJoined)
    activeSocket.on('live-viewer-left', handleViewerLeft)
    activeSocket.on('live-stream-ended', handleEnded)
    activeSocket.on('live-webrtc-signal', handleRemoteSignal)

    joinLiveRoom()

    return () => {
      cancelled = true
      activeSocket.emit('leave-live-stream', { streamId })
      activeSocket.off('live-comment-created', handleCommentCreated)
      activeSocket.off('live-reaction-updated', handleReactionUpdated)
      activeSocket.off('live-reaction-burst', handleReactionBurst)
      activeSocket.off('live-viewer-count-updated', handleViewerCountUpdated)
      activeSocket.off('live-viewer-joined', handleViewerJoined)
      activeSocket.off('live-viewer-left', handleViewerLeft)
      activeSocket.off('live-stream-ended', handleEnded)
      activeSocket.off('live-webrtc-signal', handleRemoteSignal)
      pendingViewerSocketIds.clear()
      cleanupPeerConnections()
      if (isHost) cleanupLocalMedia()
    }
  }, [
    activeSocket,
    addFloatingReaction,
    cleanupLocalMedia,
    cleanupPeerConnections,
    closePeerConnection,
    createOfferForViewer,
    currentUserId,
    handleRemoteSignal,
    hasEnded,
    isHost,
    startLocalStream,
    stream?._id,
    streamId
  ])

  // Start preview camera as soon as we know user is host
  useEffect(() => {
    if (!stream || !isHost || isLiveStarted) return undefined
    let cancelled = false

    const startPreview = async () => {
      try {
        setPreviewError('')
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop())
          return
        }
        localStreamRef.current = mediaStream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream
          localVideoRef.current.play().catch(() => {})
        }
        setPreviewReady(true)
      } catch {
        if (!cancelled) setPreviewError('Không thể truy cập camera/micro. Vui lòng kiểm tra quyền truy cập.')
      }
    }

    startPreview()
    return () => { cancelled = true }
  }, [stream, isHost, isLiveStarted])

  // Handle going live: update title on server then join the socket room
  const handleGoLive = async () => {
    if (isGoingLive || !previewReady) return
    try {
      setIsGoingLive(true)
      const token = await getToken()
      await startLocalStream()
      const { data } = await api.post(`/api/live/${streamId}/go-live`, { title: liveTitle.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!data.success) {
        toast.error(localizeMessage(data.message))
        return
      }

      if (data.stream) {
        setStream(data.stream)
        setViewerCount(data.stream.viewers_count || 0)
        setReactions(data.stream.reactions || [])
        setReactionCounts(data.stream.reaction_counts || getReactionCounts(data.stream.reactions || []))
        setHasEnded(data.stream.status === 'ended')
      }

      isLiveStartedRef.current = true
      setIsLiveStarted(true)
      setConnectionState('Đang phát trực tiếp')
      const pendingViewerSocketIds = Array.from(pendingViewerSocketIdsRef.current)
      pendingViewerSocketIdsRef.current.clear()
      await Promise.all(pendingViewerSocketIds.map((viewerSocketId) => createOfferForViewer(viewerSocketId)))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setIsGoingLive(false)
    }
  }

  useEffect(() => () => {
    floatingTimersRef.current.forEach((timer) => clearTimeout(timer))
    floatingTimersRef.current.clear()
  }, [])

  const handleSubmitComment = async (event) => {
    event.preventDefault()
    const content = commentText.trim()
    if (!content || isPostingComment || hasEnded) return

    try {
      setIsPostingComment(true)
      const token = await getToken()
      const { data } = await api.post(`/api/live/${streamId}/comment`, { content }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (data.success) {
        setCommentText('')
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setIsPostingComment(false)
    }
  }

  const handleReact = async (reactionType) => {
    if (hasEnded) return

    try {
      const token = await getToken()
      const { data } = await api.post(`/api/live/${streamId}/react`, { reactionType }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!data.success) {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }

  const handleEndLive = async () => {
    if (!isHost || isEnding) return

    try {
      setIsEnding(true)
      const token = await getToken()
      const { data } = await api.post(`/api/live/${streamId}/end`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (data.success) {
        setHasEnded(true)
        cleanupPeerConnections()
        cleanupLocalMedia()
        navigate('/feed', { state: { refresh: `live-ended-${streamId}` } })
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setIsEnding(false)
    }
  }

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled
    })
    setIsMuted((value) => !value)
  }

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled
    })
    setIsCamOff((value) => !value)
  }

  // ── Pre-live preview screen (host only) ──────────────────────────────────
  if (!loading && stream && isHost && !isLiveStarted) {
    return (
      <div className='flex min-h-full flex-col items-center justify-center bg-slate-100 p-4 text-slate-950'>
        <div className='w-full max-w-2xl'>
          {/* Header */}
          <div className='mb-6 flex items-center gap-3'>
            <button
              type='button'
              onClick={() => {
                cleanupLocalMedia()
                navigate('/feed')
              }}
              className='rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50'
            >
              ← Hủy
            </button>
            <div>
              <p className='text-xs font-black uppercase tracking-wide text-red-600'>Chuẩn bị phát trực tiếp</p>
              <h1 className='text-xl font-black'>Xem trước Livestream</h1>
            </div>
          </div>

          {/* Camera preview */}
          <div className='relative mb-5 aspect-video w-full overflow-hidden rounded-3xl bg-black shadow-2xl'>
            {previewReady ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className='h-full w-full object-contain'
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : previewError ? (
              <div className='flex h-full flex-col items-center justify-center gap-3 p-6 text-center'>
                <VideoOff className='size-10 text-red-400' />
                <p className='text-sm font-bold text-white/70'>{previewError}</p>
                <button
                  type='button'
                  onClick={() => {
                    setPreviewError('')
                    setPreviewReady(false)
                    // re-trigger the effect by toggling a dummy state — re-mount trick
                    navigate(0)
                  }}
                  className='rounded-full bg-white/15 px-4 py-2 text-xs font-black transition hover:bg-white/25'
                >
                  Thử lại
                </button>
              </div>
            ) : (
              <div className='flex h-full items-center justify-center'>
                <LoaderCircle className='size-8 animate-spin text-cyan-400' />
              </div>
            )}

            {/* LIVE badge overlay */}
            {previewReady && (
              <div className='absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur'>
                <span className='size-2 animate-pulse rounded-full bg-red-500' />
                <span className='text-xs font-black text-white'>XEM TRƯỚC</span>
              </div>
            )}
          </div>

          {/* Title input */}
          <div className='mb-5'>
            <label className='mb-2 block text-sm font-black text-slate-700'>Tiêu đề livestream (tuỳ chọn)</label>
            <input
              type='text'
              value={liveTitle}
              onChange={(e) => setLiveTitle(e.target.value)}
              maxLength={120}
              placeholder='Nhập tiêu đề hấp dẫn cho buổi livestream của bạn...'
              className='w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100'
            />
          </div>

          {/* Tips */}
          <div className='mb-6 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3'>
            <p className='text-xs font-bold text-cyan-900'>💡 Mẹo: Đảm bảo ánh sáng tốt và micro hoạt động trước khi bắt đầu.</p>
          </div>

          {/* Go Live button */}
          <button
            type='button'
            onClick={handleGoLive}
            disabled={!previewReady || isGoingLive}
            className='flex w-full items-center justify-center gap-3 rounded-2xl bg-red-600 py-4 text-base font-black text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {isGoingLive
              ? <><LoaderCircle className='size-5 animate-spin' /> Đang bắt đầu...</>
              : <><Radio className='size-5' /> Bắt đầu Livestream</>}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className='app-page flex min-h-full items-center justify-center'>
        <LoaderCircle className='size-8 animate-spin text-cyan-700' />
      </div>
    )
  }

  if (!stream) return null

  return (
    <div className='app-page min-h-full overflow-y-auto bg-slate-950 text-white'>
      <div className='mx-auto grid min-h-full max-w-7xl gap-0 lg:grid-cols-[minmax(0,1fr)_24rem]'>
        <main className='flex min-h-[60vh] flex-col lg:min-h-screen'>
          <header className='flex items-center justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6'>
            <button
              type='button'
              onClick={() => navigate('/feed')}
              className='inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/15'
            >
              <Radio className='size-4 text-red-400' />
              Livestream
            </button>
            <div className='flex items-center gap-3 text-sm font-bold text-white/75'>
              <span className='inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white'>
                <span className='size-2 rounded-full bg-white' />
                {hasEnded ? 'ĐÃ KẾT THÚC' : 'LIVE'}
              </span>
              <span className='inline-flex items-center gap-1.5'>
                <Eye className='size-4' />
                {viewerCount}
              </span>
            </div>
          </header>

          <section className='relative flex flex-1 items-center justify-center overflow-hidden bg-black'>
            {isHost ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className='h-full max-h-[calc(100vh-7rem)] min-h-[28rem] w-full object-contain'
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                controls
                className='h-full max-h-[calc(100vh-7rem)] min-h-[28rem] w-full object-contain'
              />
            )}

            {!isHost && !hasRemoteStream && !hasEnded && (
              <div className='absolute inset-0 flex flex-col items-center justify-center bg-black text-center'>
                <LoaderCircle className='mb-4 size-8 animate-spin text-cyan-300' />
                <p className='text-sm font-bold text-white/75'>{connectionState}</p>
              </div>
            )}

            {hasEnded && (
              <div className='absolute inset-0 flex flex-col items-center justify-center bg-black/85 px-6 text-center'>
                <WifiOff className='mb-4 size-10 text-white/70' />
                <h1 className='text-2xl font-black'>Livestream đã kết thúc</h1>
                <button
                  type='button'
                  onClick={() => navigate('/feed', { state: { refresh: `live-ended-${streamId}` } })}
                  className='mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-100'
                >
                  Quay lại bảng tin
                </button>
              </div>
            )}

            <div className='pointer-events-none absolute inset-0 overflow-hidden'>
              {floatingReactions.map((item) => (
                <span
                  key={item.id}
                  className='absolute bottom-20 animate-[floatLiveReaction_1.8s_ease-out_forwards] text-4xl'
                  style={{ left: `${item.left}%` }}
                >
                  {REACTION_ICONS[item.reaction]}
                </span>
              ))}
            </div>

            <div className='absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-2xl bg-black/45 px-4 py-3 backdrop-blur'>
              <div className='flex min-w-0 items-center gap-3'>
                <img src={stream.user.profile_picture} alt='' className='size-11 rounded-full object-cover ring-2 ring-white/20' />
                <div className='min-w-0'>
                  <div className='flex min-w-0 items-center gap-1'>
                    <span className='truncate text-sm font-black'>{stream.user.full_name}</span>
                    <BadgeCheck className='size-4 shrink-0 text-cyan-300' />
                  </div>
                  <p className='truncate text-xs font-bold text-white/60'>@{stream.user.username} · {moment(stream.started_at || stream.createdAt).fromNow()}</p>
                </div>
              </div>
              {stream.title && <p className='mt-2 line-clamp-2 text-sm font-semibold text-white/85'>{stream.title}</p>}
            </div>

            {isHost && !hasEnded && (
              <div className='absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/55 p-2 backdrop-blur'>
                <button
                  type='button'
                  onClick={toggleMute}
                  className={`flex size-11 items-center justify-center rounded-full transition ${isMuted ? 'bg-white text-slate-950' : 'bg-white/15 text-white hover:bg-white/25'}`}
                  title={isMuted ? 'Bật micro' : 'Tắt micro'}
                >
                  {isMuted ? <MicOff className='size-5' /> : <Mic className='size-5' />}
                </button>
                <button
                  type='button'
                  onClick={toggleCamera}
                  className={`flex size-11 items-center justify-center rounded-full transition ${isCamOff ? 'bg-white text-slate-950' : 'bg-white/15 text-white hover:bg-white/25'}`}
                  title={isCamOff ? 'Bật camera' : 'Tắt camera'}
                >
                  {isCamOff ? <VideoOff className='size-5' /> : <Video className='size-5' />}
                </button>
                <button
                  type='button'
                  onClick={handleEndLive}
                  disabled={isEnding}
                  className='inline-flex h-11 items-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-60'
                  title='Kết thúc livestream'
                >
                  {isEnding ? <LoaderCircle className='size-5 animate-spin' /> : <CircleStop className='size-5' />}
                  Kết thúc live
                </button>
              </div>
            )}
          </section>
        </main>

        <aside className='flex max-h-screen min-h-[34rem] flex-col border-l border-white/10 bg-white text-slate-950 lg:min-h-screen'>
          <div className='border-b border-slate-200 p-4'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <p className='text-xs font-black uppercase tracking-wide text-cyan-700'>Trò chuyện trực tiếp</p>
                <h2 className='mt-1 text-lg font-black'>Bình luận</h2>
              </div>
              <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600'>
                {comments.length}
              </span>
            </div>

            <div className='mt-4 flex flex-wrap gap-2'>
              {REACTIONS.map((reaction) => (
                <button
                  key={reaction.type}
                  type='button'
                  onClick={() => handleReact(reaction.type)}
                  disabled={hasEnded}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-black transition disabled:opacity-50 ${
                    currentUserReaction === reaction.type
                      ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                  title={reaction.label}
                >
                  <span className='text-lg leading-none'>{reaction.icon}</span>
                  <span>{reactionCounts[reaction.type] || 0}</span>
                </button>
              ))}
            </div>

            {totalReactions > 0 && (
              <p className='mt-2 text-xs font-bold text-slate-500'>
                {totalReactions} cảm xúc · {REACTION_LABELS[currentUserReaction] || 'Chọn cảm xúc của bạn'}
              </p>
            )}
          </div>

          <div className='flex-1 space-y-3 overflow-y-auto p-4'>
            {comments.length === 0 ? (
              <div className='flex h-full flex-col items-center justify-center text-center text-slate-500'>
                <Radio className='mb-3 size-8 text-cyan-600' />
                <p className='text-sm font-bold'>Chưa có bình luận nào</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment._id} className='flex items-start gap-3'>
                  <img src={comment.user?.profile_picture} alt='' className='size-9 rounded-full object-cover avatar-ring' />
                  <div className='min-w-0 flex-1'>
                    <div className='rounded-2xl bg-slate-100 px-3 py-2'>
                      <div className='truncate text-sm font-black text-slate-900'>
                        {comment.user?.full_name || comment.user?.username || 'Người dùng'}
                      </div>
                      <p className='break-words text-sm leading-6 text-slate-700'>{comment.content}</p>
                    </div>
                    <p className='mt-1 px-2 text-[11px] font-bold text-slate-400'>{moment(comment.createdAt).fromNow()}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSubmitComment} className='border-t border-slate-200 p-3'>
            <div className='flex items-end gap-2'>
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                disabled={hasEnded}
                className='input-modern max-h-28 min-h-11 flex-1 resize-none rounded-2xl px-4 py-3 text-sm'
                placeholder={hasEnded ? 'Livestream đã kết thúc' : 'Viết bình luận...'}
                rows={1}
              />
              <button
                type='submit'
                disabled={hasEnded || isPostingComment || !commentText.trim()}
                className='flex size-11 shrink-0 items-center justify-center rounded-full bg-cyan-700 text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50'
                title='Gửi bình luận'
              >
                {isPostingComment ? <LoaderCircle className='size-5 animate-spin' /> : <Send className='size-5' />}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  )
}

export default LiveStream
