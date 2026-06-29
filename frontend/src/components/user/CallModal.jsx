import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react'
import { useSocket } from '../../context/SocketContext'
import { useSelector } from 'react-redux'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'

const createRingtone = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    let playing = true
    const playOnce = () => {
        if (!playing) return
        const osc = ctx.createOscillator(); const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(660, ctx.currentTime)
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6)
    }
    playOnce()
    const iv = setInterval(() => { if (playing) playOnce() }, 1800)
    return { stop: () => { playing = false; clearInterval(iv); try { ctx.close() } catch { /* AudioContext may already be closed. */ } } }
}

const fmt = s => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

const normalizeId = (value) => value?._id?.toString?.() || value?.toString?.() || ''

const isTruthyFlag = (value) => value === true || value === 'true' || value === 1 || value === '1'

const splitList = (value) => {
    if (!value) return []
    return value.split(',').map(item => item.trim()).filter(Boolean)
}

const makeIceServer = (urls, username, credential) => {
    if (urls.length === 0) return null
    const server = { urls: urls.length === 1 ? urls[0] : urls }
    if (username && credential) {
        server.username = username
        server.credential = credential
    }
    return server
}

const DEFAULT_STUN_URLS = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
    'stun:stun3.l.google.com:19302',
]

const buildClientIceConfig = () => {
    const stunUrls = splitList(import.meta.env.VITE_STUN_URLS)
    const turnUrls = splitList(import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL)
    const turnServer = makeIceServer(
        turnUrls,
        import.meta.env.VITE_TURN_USERNAME,
        import.meta.env.VITE_TURN_CREDENTIAL || import.meta.env.VITE_TURN_PASSWORD
    )

    const configuredServers = [
        makeIceServer(stunUrls.length > 0 ? stunUrls : DEFAULT_STUN_URLS),
        turnServer,
    ].filter(Boolean)

    const iceConfig = {
        iceServers: configuredServers
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

const hasTurnServer = (iceConfig = {}) => (
    (iceConfig.iceServers || []).some((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
        return urls.some((url) => typeof url === 'string' && url.startsWith('turn'))
    })
)

const getGroupGridColumns = (count) => {
    if (count <= 1) return 'grid-cols-1'
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2'
    if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
}

const GroupVideoTile = React.memo(function GroupVideoTile({ isLocal, stream, participant, isCamOff, isConfirmedParticipant, trackHash }) {
    const videoRef = useRef(null)
    const videoTracks = stream?.getVideoTracks?.() || []
    const hasLiveVideo = videoTracks.some((track) => track.readyState !== 'ended' && (!isLocal || track.enabled))
    const showVideo = hasLiveVideo && (!isLocal || !isCamOff)
    const name = participant?.name || 'Thanh vien'
    const initial = name[0] || '?'

    // Only show 'Dang ket noi' for remote peers not yet confirmed as participants
    // Confirmed participants with no video just have camera off
    const statusText = isLocal
        ? (isCamOff || !hasLiveVideo ? 'Camera off' : '')
        : (isConfirmedParticipant ? 'Camera tắt' : 'Đang kết nối...')

    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        if (stream) {
            if (video.srcObject !== stream) video.srcObject = stream
            video.play().catch(() => { })
            return
        }

        if (video.srcObject) video.srcObject = null
    }, [stream, trackHash])

    return (
        <div className="relative min-h-0 overflow-hidden rounded-xl bg-slate-950">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isLocal}
                className={`h-full w-full object-cover ${showVideo ? '' : 'hidden'}`}
                style={isLocal ? { transform: 'scaleX(-1)' } : undefined}
            />

            {!showVideo && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 text-white">
                    <div className="size-20 overflow-hidden rounded-full border border-white/20 bg-cyan-700">
                        {participant?.avatar
                            ? <img src={participant.avatar} alt="" className="h-full w-full object-cover" />
                            : <div className="flex h-full w-full items-center justify-center text-2xl font-bold">{initial}</div>}
                    </div>
                    {statusText && (
                        <p className="max-w-[80%] truncate text-sm font-semibold">
                            {statusText}
                        </p>
                    )}
                </div>
            )}

            <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                {isLocal ? 'Bạn' : name}
            </span>
        </div>
    )
})

const GroupVoiceTile = React.memo(function GroupVoiceTile({ isLocal, participant, isMuted }) {
    const name = participant?.name || 'Thanh vien'
    const displayName = isLocal ? 'Ban' : name
    const initial = (displayName.trim()[0] || '?').toUpperCase()

    return (
        <div className="relative flex min-h-0 flex-col items-center justify-center gap-4 overflow-hidden rounded-xl bg-slate-900 px-4 py-6 text-white">
            <div className="size-24 overflow-hidden rounded-full border border-white/20 bg-cyan-700 shadow-2xl sm:size-28">
                {participant?.avatar
                    ? <img src={participant.avatar} alt="" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center text-3xl font-bold">{initial}</div>}
            </div>
            <div className="max-w-full text-center">
                <p className="max-w-full truncate text-base font-semibold">{displayName}</p>
                {isLocal && isMuted && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                        <MicOff size={14} />
                        Muted
                    </span>
                )}
            </div>
        </div>
    )
})

export default function CallModal({ callInfo, onClose, isIncoming }) {
    const { socketRef, socket: socketInstance } = useSocket()
    const currentUser = useSelector(s => s.user.value)
    const { getToken } = useAuth()

    const currentUserId = normalizeId(currentUser)
    const isGroupCall = !!(
        isTruthyFlag(callInfo.groupCall) ||
        isTruthyFlag(callInfo.isGroupCall) ||
        callInfo.callScope === 'group' ||
        callInfo.conversationType === 'group' ||
        callInfo.groupId
    )
    // isJoiningActiveCall: user chủ động bấm "Tham gia" từ banner — không phải đang bị gọi
    // Khi đó cần auto-accept ngay, không hiển thị màn hình "incoming"
    const isJoiningActiveCall = isGroupCall && isIncoming && !!callInfo.isJoiningActiveCall
    const groupId = callInfo.groupId || ''
    const callId = callInfo.callId || `${groupId || 'direct'}-${normalizeId(callInfo.from) || currentUserId}`
    const callerId = normalizeId(callInfo.from)
    const otherUserId = isGroupCall ? callerId : (isIncoming ? callerId : normalizeId(callInfo.to))
    const callType = callInfo.callType
    const groupMembers = useMemo(() => callInfo.groupMembers || [], [callInfo.groupMembers])
    const callTitle = isGroupCall
        ? (callInfo.groupName || 'Nhom chat')
        : (callInfo.callerName || 'Unknown')
    const callAvatar = isGroupCall
        ? (callInfo.groupAvatar || callInfo.callerAvatar || null)
        : (callInfo.callerAvatar || null)
    const callerName = callInfo.callerName || 'Unknown'

    // Nếu join chủ động từ banner → vào thẳng state 'active', không hiện incoming screen
    const initialCallState = isJoiningActiveCall ? 'active' : (isIncoming ? 'incoming' : 'outgoing')
    const [callState, setCallState] = useState(initialCallState)
    const callStateRef = useRef(initialCallState)
    const [isMuted, setIsMuted] = useState(false)
    const [isCamOff, setIsCamOff] = useState(false)
    const [duration, setDuration] = useState(0)
    const [connectionWarning, setConnectionWarning] = useState('')
    const [localStream, setLocalStream] = useState(null)
    const [remoteStreams, setRemoteStreams] = useState([])
    const [groupParticipantIds, setGroupParticipantIds] = useState(() => (
        isGroupCall && currentUserId ? [currentUserId] : []
    ))

    const localVideoRef = useRef(null)
    const remoteVideoRef = useRef(null)
    const remoteAudioRef = useRef(null)
    const pcRef = useRef(null)
    const pcCreatePromiseRef = useRef(null)
    const pendingCandidatesRef = useRef([])
    const localStreamRef = useRef(null)
    const localStreamPromiseRef = useRef(null)
    const remoteStreamRef = useRef(null)
    const groupPcRefs = useRef(new Map())
    const groupPcCreatePromisesRef = useRef(new Map())
    const groupPendingCandidatesRef = useRef(new Map())
    const groupOfferInFlightRef = useRef(new Set())
    const groupRemoteStreamsRef = useRef(new Map())
    const groupRemoteTrackKeysRef = useRef(new Map())
    const groupParticipantIdsRef = useRef(new Set(isGroupCall && currentUserId ? [currentUserId] : []))
    const groupAudioRefs = useRef({})
    const iceConfigRef = useRef(null)
    const iceConfigPromiseRef = useRef(null)

    const ringtoneRef = useRef(null)
    const durationTimerRef = useRef(null)
    const timeoutRef = useRef(null)
    const callStartTimeRef = useRef(null)
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose
    const initDoneRef = useRef(false)

    const setState = useCallback(s => {
        callStateRef.current = s
        setCallState(s)
    }, [])

    const startTimer = useCallback(() => {
        if (callStartTimeRef.current) return
        callStartTimeRef.current = Date.now()
        durationTimerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    }, [])

    const getParticipantInfo = useCallback((userId) => {
        const id = normalizeId(userId)
        if (id === currentUserId) {
            return {
                name: currentUser?.full_name || currentUser?.username || 'You',
                avatar: currentUser?.profile_picture || null,
            }
        }
        if (id === callerId) {
            return { name: callerName, avatar: callInfo.callerAvatar || null }
        }
        const member = groupMembers.find((item) => normalizeId(item) === id)
        return {
            name: member?.full_name || member?.username || 'Thanh vien',
            avatar: member?.profile_picture || null,
        }
    }, [callInfo.callerAvatar, callerId, callerName, currentUser, currentUserId, groupMembers])

    const saveCallRecord = useCallback(async (status, dur = 0) => {
        if (isGroupCall && isIncoming) return

        try {
            const token = await getToken()
            const payload = {
                call_type: callType,
                call_status: status,
                call_duration: dur,
            }
            if (isGroupCall) payload.group_id = groupId
            else payload.to_user_id = otherUserId

            await api.post('/api/message/save-call', payload, { headers: { Authorization: `Bearer ${token}` } })
        } catch (e) { console.error('saveCall error:', e) }
    }, [callType, getToken, groupId, isGroupCall, isIncoming, otherUserId])

    const loadIceConfig = useCallback(async () => {
        if (iceConfigRef.current) return iceConfigRef.current

        if (!iceConfigPromiseRef.current) {
            iceConfigPromiseRef.current = (async () => {
                try {
                    const token = await getToken()
                    const { data } = await api.get('/api/call/ice-config', {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                    if (data?.success) {
                        const iceConfig = normalizeIceConfig(data.iceConfig)
                        if (!data.hasTurn && !hasTurnServer(iceConfig)) {
                            console.warn('WebRTC is using STUN only. Calls may fail across different networks without a TURN server.')
                        }
                        return iceConfig
                    }
                } catch (error) {
                    console.warn('Could not load server ICE config, using client fallback:', error.message)
                }
                const fallbackConfig = buildClientIceConfig()
                if (!hasTurnServer(fallbackConfig)) {
                    console.warn('WebRTC fallback ICE config has no TURN server. Calls may fail across different networks.')
                }
                return fallbackConfig
            })()
        }

        iceConfigRef.current = await iceConfigPromiseRef.current
        return iceConfigRef.current
    }, [getToken])

    const closePeerConnection = (pc) => {
        if (!pc) return
        pc.onicecandidate = null
        pc.ontrack = null
        pc.onconnectionstatechange = null
        pc.oniceconnectionstatechange = null
        try { pc.close() } catch { /* RTCPeerConnection may already be closed. */ }
    }

    const addLocalMediaToPeer = useCallback((pc) => {
        const stream = localStreamRef.current
        const tracks = stream?.getTracks?.() || []
        const audioTracks = stream?.getAudioTracks?.() || []
        const videoTracks = stream?.getVideoTracks?.() || []

        tracks.forEach(track => {
            pc.addTrack(track, stream)
        })

        if (audioTracks.length === 0) {
            pc.addTransceiver('audio', { direction: 'recvonly' })
        }

        if (callType === 'video' && videoTracks.length === 0) {
            pc.addTransceiver('video', { direction: 'recvonly' })
        }
    }, [callType])

    const cleanup = useCallback(() => {
        ringtoneRef.current?.stop()
        clearTimeout(timeoutRef.current)
        clearInterval(durationTimerRef.current)
        localStreamRef.current?.getTracks().forEach(t => t.stop())
        closePeerConnection(pcRef.current)
        groupPcRefs.current.forEach(closePeerConnection)
        pcRef.current = null
        pcCreatePromiseRef.current = null
        pendingCandidatesRef.current = []
        groupPcRefs.current.clear()
        groupPcCreatePromisesRef.current.clear()
        groupPendingCandidatesRef.current.clear()
        groupOfferInFlightRef.current.clear()
        groupRemoteStreamsRef.current.clear()
        groupRemoteTrackKeysRef.current.clear()
        groupParticipantIdsRef.current.clear()
        localStreamRef.current = null
        localStreamPromiseRef.current = null
        setLocalStream(null)
        remoteStreamRef.current = null
    }, [])

    const endCall = useCallback(async (reason = 'completed') => {
        if (isGroupCall && reason === 'missed' && (callStateRef.current === 'active' || groupParticipantIdsRef.current.size > 1)) {
            return
        }

        const dur = callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0

        if (isGroupCall) {
            socketRef.current?.emit('call-ended', {
                to: otherUserId,
                from: currentUserId,
                groupCall: true,
                isGroupCall: true,
                callScope: 'group',
                conversationType: 'group',
                groupId,
                callId,
                endForAll: !isIncoming || currentUserId === callerId,
            })
            cleanup()
            if (!isIncoming && reason === 'completed') await saveCallRecord('completed', dur)
            onCloseRef.current()
            return
        }

        socketRef.current?.emit('call-ended', { to: otherUserId, from: currentUserId })
        cleanup()
        if (reason === 'completed') await saveCallRecord('completed', dur)
        onCloseRef.current()
    }, [callId, callerId, cleanup, currentUserId, groupId, isGroupCall, isIncoming, otherUserId, saveCallRecord, socketRef])

    const getMedia = useCallback(async () => {
        if (localStreamRef.current) return localStreamRef.current
        if (localStreamPromiseRef.current) return localStreamPromiseRef.current

        const tryGet = async (constraints) => {
            try { return await navigator.mediaDevices.getUserMedia(constraints) }
            catch { return null }
        }

        localStreamPromiseRef.current = (async () => {
            let stream = null
            if (callType === 'video') {
                stream = await tryGet({ video: true, audio: true }) || await tryGet({ audio: true })
            } else {
                stream = await tryGet({ audio: true })
            }
            if (!stream) {
                if (!isGroupCall) {
                    alert('Khong the truy cap mic/camera. Hay cap quyen roi thu lai.')
                    return null
                }

                setConnectionWarning('Khong the truy cap mic/camera tren thiet bi nay. Ban van co the tham gia de xem/nghe nguoi khac.')
                stream = new MediaStream()
            }
            localStreamRef.current = stream
            setLocalStream(stream)
            if (localVideoRef.current && stream.getVideoTracks().length > 0) {
                localVideoRef.current.srcObject = stream
            }
            return stream
        })()

        try {
            return await localStreamPromiseRef.current
        } finally {
            localStreamPromiseRef.current = null
        }
    }, [callType, isGroupCall])

    const attachRemote = useCallback((remote) => {
        remoteStreamRef.current = remote
        if (callType === 'video' && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remote
            remoteVideoRef.current.play().catch(() => { })
        }
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remote
            remoteAudioRef.current.play().catch(() => { })
        }
    }, [callType])

    const markActive = useCallback(() => {
        ringtoneRef.current?.stop()
        clearTimeout(timeoutRef.current)
        if (callStateRef.current !== 'active') {
            setState('active')
        }
        startTimer()
    }, [setState, startTimer])

    const sendSignal = useCallback((signal) => {
        socketRef.current?.emit('webrtc-signal', {
            to: otherUserId,
            from: currentUserId,
            signal,
        })
    }, [socketRef, otherUserId, currentUserId])

    const flushPendingCandidates = useCallback(async (pc) => {
        if (!pc.remoteDescription) return

        const candidates = pendingCandidatesRef.current.splice(0)
        for (const candidate of candidates) {
            try {
                await pc.addIceCandidate(candidate)
            } catch (error) {
                console.error('addIceCandidate error:', error)
            }
        }
    }, [])

    const createPC = useCallback(async () => {
        if (pcRef.current) return pcRef.current
        if (pcCreatePromiseRef.current) return pcCreatePromiseRef.current

        pcCreatePromiseRef.current = (async () => {
            const iceConfig = await loadIceConfig()
            const pc = new RTCPeerConnection(iceConfig)
            pcRef.current = pc

            addLocalMediaToPeer(pc)

            pc.onicecandidate = ({ candidate }) => {
                if (candidate) sendSignal({ type: 'candidate', candidate })
            }

            pc.ontrack = (event) => {
                const [stream] = event.streams
                if (stream) {
                    attachRemote(stream)
                    return
                }

                const remote = remoteStreamRef.current || new MediaStream()
                if (!remote.getTracks().some(track => track.id === event.track.id)) {
                    remote.addTrack(event.track)
                }
                attachRemote(remote)
            }

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'connected') {
                    setConnectionWarning('')
                    markActive()
                }
                if (pc.connectionState === 'failed') {
                    setConnectionWarning('Khong the ket noi media. Hay cau hinh TURN server de goi on dinh hon.')
                }
            }

            pc.oniceconnectionstatechange = () => {
                if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                    setConnectionWarning('')
                    markActive()
                }
                if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                    setConnectionWarning('Ket noi cuoc goi bi chan boi NAT/firewall. Can TURN server de goi khac mang on dinh.')
                }
            }

            return pc
        })()

        try {
            return await pcCreatePromiseRef.current
        } finally {
            pcCreatePromiseRef.current = null
        }
    }, [addLocalMediaToPeer, loadIceConfig, attachRemote, markActive, sendSignal])

    const startOffer = useCallback(async () => {
        const pc = await createPC()
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sendSignal({ type: 'offer', sdp: offer.sdp })
    }, [createPC, sendSignal])

    const handleRemoteSignal = useCallback(async (signal) => {
        const pc = await createPC()

        if (signal.type === 'offer') {
            await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
            await flushPendingCandidates(pc)
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            sendSignal({ type: 'answer', sdp: answer.sdp })
            return
        }

        if (signal.type === 'answer') {
            await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
            await flushPendingCandidates(pc)
            return
        }

        if (signal.type === 'candidate' && signal.candidate) {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(signal.candidate)
            } else {
                pendingCandidatesRef.current.push(signal.candidate)
            }
        }
    }, [createPC, flushPendingCandidates, sendSignal])

    const refreshRemoteStreams = useCallback(() => {
        setRemoteStreams(Array.from(groupRemoteStreamsRef.current.entries()).map(([userId, stream]) => ({ userId, stream })))
    }, [])

    const refreshGroupParticipants = useCallback(() => {
        setGroupParticipantIds(Array.from(groupParticipantIdsRef.current).filter(Boolean))
    }, [])

    const addGroupParticipants = useCallback((ids = []) => {
        let changed = false
        ids.forEach((value) => {
            const id = normalizeId(value)
            if (!id || groupParticipantIdsRef.current.has(id)) return
            groupParticipantIdsRef.current.add(id)
            changed = true
        })
        if (changed) refreshGroupParticipants()
    }, [refreshGroupParticipants])

    const removeGroupParticipant = useCallback((userId) => {
        const id = normalizeId(userId)
        if (!id || !groupParticipantIdsRef.current.delete(id)) return
        refreshGroupParticipants()
    }, [refreshGroupParticipants])

    const setGroupAudioElement = useCallback((userId, element) => {
        if (element) {
            groupAudioRefs.current[userId] = element
            const stream = groupRemoteStreamsRef.current.get(userId)
            if (stream) {
                element.srcObject = stream
                element.play().catch(() => { })
            }
        } else {
            delete groupAudioRefs.current[userId]
        }
    }, [])

    const attachGroupRemote = useCallback((peerId, remote) => {
        addGroupParticipants([peerId])
        const trackKey = remote.getTracks().map((track) => track.id).sort().join('|')
        const previousStream = groupRemoteStreamsRef.current.get(peerId)
        const previousTrackKey = groupRemoteTrackKeysRef.current.get(peerId)
        groupRemoteStreamsRef.current.set(peerId, remote)
        groupRemoteTrackKeysRef.current.set(peerId, trackKey)
        if (previousStream !== remote || previousTrackKey !== trackKey) refreshRemoteStreams()

        const audio = groupAudioRefs.current[peerId]
        if (audio) {
            audio.srcObject = remote
            audio.play().catch(() => { })
        }
    }, [addGroupParticipants, refreshRemoteStreams])

    const sendGroupSignal = useCallback((peerId, signal) => {
        if (!peerId || peerId === currentUserId) return
        socketRef.current?.emit('webrtc-signal', {
            to: peerId,
            from: currentUserId,
            groupCall: true,
            isGroupCall: true,
            callScope: 'group',
            conversationType: 'group',
            groupId,
            callId,
            signal,
        })
    }, [callId, currentUserId, groupId, socketRef])

    const getGroupPendingCandidates = (peerId) => {
        const existing = groupPendingCandidatesRef.current.get(peerId)
        if (existing) return existing
        const next = []
        groupPendingCandidatesRef.current.set(peerId, next)
        return next
    }

    const flushGroupPendingCandidates = useCallback(async (peerId, pc) => {
        if (!pc.remoteDescription) return
        const candidates = groupPendingCandidatesRef.current.get(peerId) || []
        groupPendingCandidatesRef.current.set(peerId, [])
        for (const candidate of candidates) {
            try {
                await pc.addIceCandidate(candidate)
            } catch (error) {
                console.error('group addIceCandidate error:', error)
            }
        }
    }, [])

    const createGroupPC = useCallback(async (peerId) => {
        if (!peerId || peerId === currentUserId) return null
        if (groupPcRefs.current.has(peerId)) return groupPcRefs.current.get(peerId)
        if (groupPcCreatePromisesRef.current.has(peerId)) return groupPcCreatePromisesRef.current.get(peerId)

        const createPromise = (async () => {
            const iceConfig = await loadIceConfig()
            const pc = new RTCPeerConnection(iceConfig)
            groupPcRefs.current.set(peerId, pc)

            // NOTE: addLocalMediaToPeer is NOT called here to avoid a race condition
            // where loadIceConfig() resolves before getMedia() and localStreamRef is still null.
            // Callers (startGroupOffer, handleGroupSignal) are responsible for adding media
            // after they have confirmed localStreamRef.current is set via getMedia().

            pc.onicecandidate = ({ candidate }) => {
                if (candidate) sendGroupSignal(peerId, { type: 'candidate', candidate })
            }

            pc.ontrack = (event) => {
                const [stream] = event.streams
                if (stream) {
                    attachGroupRemote(peerId, stream)
                    return
                }

                const remote = groupRemoteStreamsRef.current.get(peerId) || new MediaStream()
                if (!remote.getTracks().some(track => track.id === event.track.id)) {
                    remote.addTrack(event.track)
                }
                attachGroupRemote(peerId, remote)
            }

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'connected') {
                    setConnectionWarning('')
                    markActive()
                }
                if (pc.connectionState === 'failed') {
                    const participant = getParticipantInfo(peerId)
                    setConnectionWarning(`Khong the ket noi media voi ${participant.name}. Can TURN server de goi on dinh hon.`)
                }
            }

            pc.oniceconnectionstatechange = () => {
                if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                    setConnectionWarning('')
                    markActive()
                }
            }

            return pc
        })()

        groupPcCreatePromisesRef.current.set(peerId, createPromise)
        try {
            return await createPromise
        } finally {
            groupPcCreatePromisesRef.current.delete(peerId)
        }
    }, [attachGroupRemote, currentUserId, getParticipantInfo, loadIceConfig, markActive, sendGroupSignal])

    const startGroupOffer = useCallback(async (peerId) => {
        if (!peerId || peerId === currentUserId) return
        if (groupOfferInFlightRef.current.has(peerId)) return
        groupOfferInFlightRef.current.add(peerId)
        try {
            // Ensure media is ready BEFORE creating/accessing the PC
            // so that addLocalMediaToPeer always has tracks to add
            if (!localStreamRef.current) {
                const stream = await getMedia()
                if (!stream) return
            }
            const pc = await createGroupPC(peerId)
            if (!pc) return

            // Add local tracks if not already added (PC may have been created empty
            // by handleGroupSignal before our stream was ready)
            const senders = pc.getSenders()
            if (senders.length === 0) {
                addLocalMediaToPeer(pc)
            }

            if (pc.localDescription?.type === 'offer' || pc.signalingState !== 'stable') return

            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            sendGroupSignal(peerId, { type: 'offer', sdp: offer.sdp })
        } finally {
            groupOfferInFlightRef.current.delete(peerId)
        }
    }, [addLocalMediaToPeer, createGroupPC, currentUserId, getMedia, sendGroupSignal])

    const handleGroupSignal = useCallback(async (data) => {
        const peerId = normalizeId(data?.from)
        const signal = data?.signal
        if (!peerId || peerId === currentUserId || !signal) return

        // Ensure stream is ready before creating PC so addLocalMediaToPeer has tracks
        if (!localStreamRef.current) {
            const stream = await getMedia()
            if (!stream) return
        }

        const pc = await createGroupPC(peerId)
        if (!pc) return

        // Ensure local tracks are on this PC (may have been created before stream was ready)
        if (pc.getSenders().length === 0) {
            addLocalMediaToPeer(pc)
        }

        if (signal.type === 'offer') {
            // ── Perfect Negotiation: giải quyết glare (cả 2 bên cùng gửi offer) ──
            // "Impolite peer" (userId lớn hơn) bỏ qua offer đến nếu đang có local offer
            // "Polite peer" (userId nhỏ hơn) rollback local offer và chấp nhận offer đến
            const isImpolite = currentUserId > peerId
            const hasLocalOffer = pc.signalingState === 'have-local-offer'

            if (hasLocalOffer && isImpolite) {
                // Impolite peer: bỏ qua — ta đã gửi offer, đợi answer của mình
                return
            }

            if (hasLocalOffer && !isImpolite) {
                // Polite peer: rollback local offer, chấp nhận offer của bên kia
                try {
                    await pc.setLocalDescription({ type: 'rollback' })
                } catch (e) {
                    console.warn('Rollback failed, recreating PC for', peerId, e)
                    closePeerConnection(pc)
                    groupPcRefs.current.delete(peerId)
                    groupPcCreatePromisesRef.current.delete(peerId)
                    groupPendingCandidatesRef.current.delete(peerId)
                    groupOfferInFlightRef.current.delete(peerId)
                    const newPc = await createGroupPC(peerId)
                    if (!newPc) return
                    if (newPc.getSenders().length === 0) addLocalMediaToPeer(newPc)
                    await newPc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
                    await flushGroupPendingCandidates(peerId, newPc)
                    const answer = await newPc.createAnswer()
                    await newPc.setLocalDescription(answer)
                    sendGroupSignal(peerId, { type: 'answer', sdp: answer.sdp })
                    return
                }
            }

            if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer') {
                // Trạng thái không hợp lệ để nhận offer, bỏ qua
                return
            }

            await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
            await flushGroupPendingCandidates(peerId, pc)
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            sendGroupSignal(peerId, { type: 'answer', sdp: answer.sdp })
            return
        }

        if (signal.type === 'answer') {
            if (pc.signalingState !== 'have-local-offer') return
            await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
            await flushGroupPendingCandidates(peerId, pc)
            return
        }

        if (signal.type === 'candidate' && signal.candidate) {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(signal.candidate)
            } else {
                getGroupPendingCandidates(peerId).push(signal.candidate)
            }
        }
    }, [createGroupPC, currentUserId, flushGroupPendingCandidates, getMedia, sendGroupSignal])

    const removeGroupPeer = useCallback((peerId) => {
        closePeerConnection(groupPcRefs.current.get(peerId))
        groupPcRefs.current.delete(peerId)
        groupPcCreatePromisesRef.current.delete(peerId)
        groupPendingCandidatesRef.current.delete(peerId)
        groupOfferInFlightRef.current.delete(peerId)
        groupRemoteStreamsRef.current.delete(peerId)
        groupRemoteTrackKeysRef.current.delete(peerId)
        removeGroupParticipant(peerId)
        delete groupAudioRefs.current[peerId]
        refreshRemoteStreams()
    }, [refreshRemoteStreams, removeGroupParticipant])

    const sameGroupCall = useCallback((data) => (
        !!data?.callId &&
        data.callId === callId &&
        (!data.groupId || !groupId || data.groupId?.toString?.() === groupId?.toString?.())
    ), [callId, groupId])

    const handlersAttachedRef = useRef(false)

    const removeListeners = useCallback(() => {
        const h = handlersAttachedRef.current
        if (h && h.socket) {
            h.socket.off('call-accepted', h.onCallAccepted)
            h.socket.off('webrtc-signal', h.onWebRTCSignal)
            h.socket.off('call-rejected', h.onRejected)
            h.socket.off('call-ended', h.onEnded)
            h.socket.off('group-call-participant-joined', h.onGroupParticipantJoined)
            h.socket.off('group-call-existing-participants', h.onGroupExistingParticipants)
            h.socket.off('group-call-participant-left', h.onGroupParticipantLeft)
        }
        handlersAttachedRef.current = false
    }, [])

    const ensureListeners = useCallback(() => {
        const socket = socketRef.current
        if (!socket) return
        const existing = handlersAttachedRef.current
        if (existing && existing.socket === socket) return
        if (existing) removeListeners()

        const onCallAccepted = async (data) => {
            if (isGroupCall) {
                if (!sameGroupCall(data)) return
                const toId = normalizeId(data.to)
                if (toId && toId !== currentUserId) return
                const peerId = normalizeId(data.from)
                if (!peerId || peerId === currentUserId) return
                ringtoneRef.current?.stop()
                clearTimeout(timeoutRef.current)
                addGroupParticipants([currentUserId, peerId, ...(data.participantIds || [])])
                markActive()
                return
            }
            if (normalizeId(data?.from) !== otherUserId || normalizeId(data?.to) !== currentUserId) return
            if (isIncoming) return
            if (callStateRef.current !== 'outgoing') return
            ringtoneRef.current?.stop()
            clearTimeout(timeoutRef.current)
            setState('active')
            startTimer()
            if (!localStreamRef.current) {
                const stream = await getMedia()
                if (!stream) return
            }
            await startOffer()
        }

        const onWebRTCSignal = async (data) => {
            if (isGroupCall) {
                const signalIsGroupCall = isTruthyFlag(data?.groupCall) || isTruthyFlag(data?.isGroupCall) || data?.groupId || data?.callScope === 'group'
                if (!signalIsGroupCall || !sameGroupCall(data) || normalizeId(data.to) !== currentUserId) return
                try { await handleGroupSignal(data) } catch (error) { console.error('Group WebRTC signal error:', error) }
                return
            }
            if (normalizeId(data?.from) !== otherUserId || normalizeId(data?.to) !== currentUserId) return
            if (!data?.signal) return
            try {
                if (!localStreamRef.current) {
                    const stream = await getMedia()
                    if (!stream) return
                }
                await handleRemoteSignal(data.signal)
            } catch (error) { console.error('WebRTC signal error:', error) }
        }

        const onRejected = async (data) => {
            if (isGroupCall) {
                if (!sameGroupCall(data) || normalizeId(data.to) !== currentUserId) return
                return
            }
            if (normalizeId(data?.from) !== otherUserId || normalizeId(data?.to) !== currentUserId) return
            ringtoneRef.current?.stop()
            clearTimeout(timeoutRef.current)
            await saveCallRecord('rejected', 0)
            removeListeners()
            cleanup(); onCloseRef.current()
        }

        const onEnded = async (data) => {
            if (isGroupCall) {
                if (!sameGroupCall(data)) return
                const endedBy = normalizeId(data.from)
                if (data.endForAll || endedBy === callerId) {
                    const dur = callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0
                    if (!isIncoming && callStateRef.current === 'active') await saveCallRecord('completed', dur)
                    removeListeners()
                    cleanup(); onCloseRef.current()
                    return
                }
                removeGroupPeer(endedBy)
                return
            }
            if (normalizeId(data?.from) !== otherUserId || normalizeId(data?.to) !== currentUserId) return
            const dur = callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0
            if (callStateRef.current === 'active') await saveCallRecord('completed', dur)
            removeListeners()
            cleanup(); onCloseRef.current()
        }

        const onGroupParticipantJoined = async (data) => {
            if (!isGroupCall || !sameGroupCall(data)) return
            const peerId = normalizeId(data.userId)
            if (!peerId || peerId === currentUserId) return
            addGroupParticipants([currentUserId, peerId, ...(data.participantIds || [])])
            markActive()

            // Deterministic offer initiation: only offer if currentUserId < peerId.
            // This prevents glare (both sides offering at the same time), which leads
            // to rollback race conditions and black screens.
            if (currentUserId < peerId) {
                try { await startGroupOffer(peerId) } catch (error) { console.warn('startGroupOffer (participant-joined) error:', error) }
            }
        }

        const onGroupExistingParticipants = async (data) => {
            if (!isGroupCall || !sameGroupCall(data)) return
            const existingParticipantIds = (data.participantIds || [])
                .map(normalizeId)
                .filter((id) => id && id !== currentUserId)
            addGroupParticipants([currentUserId, ...existingParticipantIds])
            markActive()

            // Deterministic offer initiation: only offer if currentUserId < id.
            // The user with the larger ID will wait for the offer from the smaller ID.
            await Promise.all(existingParticipantIds.map(async (id) => {
                if (currentUserId < id) {
                    try { await startGroupOffer(id) } catch (error) { console.error('Group existing participant offer error:', error) }
                }
            }))
        }

        const onGroupParticipantLeft = (data) => {
            if (!isGroupCall || !sameGroupCall(data)) return
            const peerId = normalizeId(data.userId)
            if (peerId) removeGroupPeer(peerId)
        }

        socket.on('call-accepted', onCallAccepted)
        socket.on('webrtc-signal', onWebRTCSignal)
        socket.on('call-rejected', onRejected)
        socket.on('call-ended', onEnded)
        socket.on('group-call-participant-joined', onGroupParticipantJoined)
        socket.on('group-call-existing-participants', onGroupExistingParticipants)
        socket.on('group-call-participant-left', onGroupParticipantLeft)

        handlersAttachedRef.current = {
            socket, onCallAccepted, onWebRTCSignal, onRejected, onEnded,
            onGroupParticipantJoined, onGroupExistingParticipants, onGroupParticipantLeft,
        }
    }, [addGroupParticipants, callerId, cleanup, currentUserId, getMedia, handleGroupSignal, handleRemoteSignal, isGroupCall, isIncoming, markActive, otherUserId, removeGroupPeer, removeListeners, sameGroupCall, saveCallRecord, setState, socketRef, startGroupOffer, startOffer, startTimer])

    // Keep a ref to the latest ensureListeners so socket-watching effect
    // always calls the fresh version without stale closures
    const ensureListenersRef = useRef(ensureListeners)
    ensureListenersRef.current = ensureListeners



    const acceptCall = useCallback(async () => {
        ringtoneRef.current?.stop()
        clearTimeout(timeoutRef.current)

        const stream = await getMedia()
        if (!stream) return

        setState('active')
        startTimer()

        if (isGroupCall) {
            addGroupParticipants([currentUserId, callerId])
            socketRef.current?.emit('call-accepted', {
                to: otherUserId,
                from: currentUserId,
                groupCall: true,
                isGroupCall: true,
                callScope: 'group',
                conversationType: 'group',
                groupId,
                callId,
            })
            return
        }

        await createPC()

        socketRef.current?.emit('call-accepted', {
            to: otherUserId,
            from: currentUserId
        })
    }, [addGroupParticipants, callId, callerId, createPC, currentUserId, getMedia, groupId, isGroupCall, otherUserId, setState, socketRef, startTimer])

    const rejectCall = useCallback(async () => {
        ringtoneRef.current?.stop()
        clearTimeout(timeoutRef.current)

        if (isGroupCall) {
            socketRef.current?.emit('call-rejected', {
                to: otherUserId,
                from: currentUserId,
                groupCall: true,
                isGroupCall: true,
                callScope: 'group',
                conversationType: 'group',
                groupId,
                callId,
            })
            removeListeners()
            cleanup(); onCloseRef.current()
            return
        }

        socketRef.current?.emit('call-rejected', { to: otherUserId, from: currentUserId })
        await saveCallRecord('rejected', 0)
        removeListeners()
        cleanup(); onCloseRef.current()
    }, [callId, cleanup, currentUserId, groupId, isGroupCall, otherUserId, removeListeners, saveCallRecord, socketRef])

    const toggleMute = () => {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
        setIsMuted(m => !m)
    }

    const toggleCamera = () => {
        localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
        setIsCamOff(c => !c)
    }

    // Re-attach listeners whenever socket changes (handles reconnect and initial load race)
    useEffect(() => {
        if (!socketInstance) return
        ensureListenersRef.current()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socketInstance])

    useEffect(() => {
        if (initDoneRef.current) return
        initDoneRef.current = true

        const init = async () => {
            // Try to attach listeners immediately; also covered by the socketInstance effect above
            ensureListeners()

            // Tạo ringtone TRƯỚC khi await để tránh race condition:
            // Nếu user bấm Chấp nhận trong khi loadIceConfig() đang chờ,
            // acceptCall() sẽ gọi ringtoneRef.current?.stop() — nếu ringtone
            // chưa được tạo thì stop() là no-op, sau đó init() tiếp tục tạo
            // ringtone mới không ai stop được nữa.
            if (!isJoiningActiveCall) {
                ringtoneRef.current = createRingtone()
            }

            await loadIceConfig()

            // User chủ động join từ banner "Tham gia" → auto-accept ngay, không đổ chuông
            if (isJoiningActiveCall) {
                await acceptCall()
                return
            }

            // Guard: nếu user đã accept trong khi loadIceConfig() đang await → stop ringtone và thoát
            if (callStateRef.current === 'active') {
                ringtoneRef.current?.stop()
                return
            }

            if (!isIncoming) {
                await getMedia()
                timeoutRef.current = setTimeout(async () => {
                    if (callStateRef.current === 'active' || (isGroupCall && groupParticipantIdsRef.current.size > 1)) return
                    await saveCallRecord('missed', 0)
                    endCall('missed')
                }, 45000)
            } else {
                timeoutRef.current = setTimeout(async () => {
                    if (callStateRef.current === 'active') return
                    if (isGroupCall) {
                        socketRef.current?.emit('call-rejected', {
                            to: otherUserId,
                            from: currentUserId,
                            groupCall: true,
                            isGroupCall: true,
                            callScope: 'group',
                            conversationType: 'group',
                            groupId,
                            callId,
                        })
                    } else {
                        await saveCallRecord('missed', 0)
                    }
                    removeListeners()
                    cleanup(); onCloseRef.current()
                }, 30000)
            }
        }
        init()

        return () => {
            if (!initDoneRef.current) {
                removeListeners()
                cleanup()
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        return () => {
            initDoneRef.current = false
            removeListeners()
            cleanup()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream
        }
        if (!isGroupCall && remoteStreamRef.current) {
            attachRemote(remoteStreamRef.current)
        }
    }, [callState, callType, attachRemote, isGroupCall, localStream])

    const participantCount = isGroupCall ? Math.max(1, groupParticipantIds.length) : Math.max(1, remoteStreams.length + 1)
    // Build a Set of confirmed participant IDs for tile status display
    const confirmedParticipantSet = useMemo(() => new Set(groupParticipantIds), [groupParticipantIds])
    const getTrackHash = (stream) => {
        if (!stream) return ''
        return stream.getTracks().map(t => `${t.id}:${t.readyState}:${t.enabled}`).join(',')
    }
    const groupVideoTiles = isGroupCall
        ? [
            { userId: currentUserId, isLocal: true, stream: localStream, isConfirmedParticipant: true, trackHash: getTrackHash(localStream) },
            ...groupParticipantIds
                .filter((userId) => userId && userId !== currentUserId)
                .map((userId) => {
                    const s = groupRemoteStreamsRef.current.get(userId) || null
                    return {
                        userId,
                        isLocal: false,
                        stream: s,
                        isConfirmedParticipant: confirmedParticipantSet.has(userId),
                        trackHash: getTrackHash(s)
                    }
                })
        ]
        : []
    const incomingSubtitle = isGroupCall
        ? `${callerName} đang gọi nhóm`
        : (callType === 'video' ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến')
    const outgoingSubtitle = isGroupCall ? 'Đang gọi nhóm...' : 'Đang gọi...'

    const avatarContent = (
        callAvatar
            ? <img src={callAvatar} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-cyan-700 flex items-center justify-center text-white text-4xl font-bold">{callTitle[0]}</div>
    )

    const modal = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)' }}>

            {isGroupCall
                ? remoteStreams.map(({ userId }) => (
                    <audio
                        key={userId}
                        ref={(element) => setGroupAudioElement(userId, element)}
                        autoPlay
                        playsInline
                        muted={callType === 'video'}
                        style={{ display: 'none' }}
                    />
                ))
                : <audio ref={remoteAudioRef} autoPlay playsInline muted={callType === 'video'} style={{ display: 'none' }} />}

            {connectionWarning && (
                <div className="absolute top-5 left-1/2 z-20 max-w-md -translate-x-1/2 rounded-xl bg-amber-500/95 px-4 py-2 text-center text-sm font-semibold text-slate-950 shadow-lg">
                    {connectionWarning}
                </div>
            )}

            {callState === 'active' && callType === 'video' && isGroupCall ? (
                <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
                    <div className={`grid h-full w-full auto-rows-fr gap-2 p-2 ${getGroupGridColumns(groupVideoTiles.length)}`}>
                        {groupVideoTiles.map(({ userId, isLocal, stream, isConfirmedParticipant, trackHash }) => {
                            const participant = getParticipantInfo(userId)
                            return (
                                <GroupVideoTile
                                    key={userId}
                                    isLocal={isLocal}
                                    stream={stream}
                                    participant={participant}
                                    isCamOff={isCamOff}
                                    isConfirmedParticipant={isConfirmedParticipant}
                                    trackHash={trackHash}
                                />
                            )
                        })}
                    </div>
                    <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-4 py-1 rounded-full z-10">{fmt(duration)} · {participantCount} nguoi</div>
                    <div className="absolute top-12 left-1/2 -translate-x-1/2 text-white/70 text-sm z-10">{callTitle}</div>
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-5 z-10">
                        <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${isMuted ? 'bg-gray-600' : 'bg-white/20 hover:bg-white/30'}`}>
                            {isMuted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
                        </button>
                        <button onClick={toggleCamera} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${isCamOff ? 'bg-gray-600' : 'bg-white/20 hover:bg-white/30'}`}>
                            {isCamOff ? <VideoOff size={22} className="text-white" /> : <Video size={22} className="text-white" />}
                        </button>
                        <button onClick={() => endCall()} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg">
                            <PhoneOff size={22} className="text-white" />
                        </button>
                    </div>
                </div>
            ) : callState === 'active' && isGroupCall ? (
                <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
                    <div className={`grid h-full w-full auto-rows-fr gap-2 p-2 pb-28 ${getGroupGridColumns(groupVideoTiles.length)}`}>
                        {groupVideoTiles.map(({ userId, isLocal }) => {
                            const participant = getParticipantInfo(userId)
                            return (
                                <GroupVoiceTile
                                    key={userId}
                                    isLocal={isLocal}
                                    participant={participant}
                                    isMuted={isMuted}
                                />
                            )
                        })}
                    </div>
                    <div className="absolute top-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1 text-sm text-white">{fmt(duration)} - {participantCount} nguoi</div>
                    <div className="absolute top-12 left-1/2 z-10 -translate-x-1/2 text-sm text-white/70">{callTitle}</div>
                    <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-5">
                        <button onClick={toggleMute} className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all ${isMuted ? 'bg-gray-600' : 'bg-white/20 hover:bg-white/30'}`}>
                            {isMuted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
                        </button>
                        <button onClick={() => endCall()} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 shadow-lg hover:bg-red-600">
                            <PhoneOff size={22} className="text-white" />
                        </button>
                    </div>
                </div>
            ) : callState === 'active' && callType === 'video' ? (
                <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <div className="absolute bottom-28 right-5 rounded-2xl overflow-hidden border-2 border-white/60 shadow-2xl bg-black z-10"
                        style={{ width: 120, height: 168 }}>
                        <video ref={localVideoRef} autoPlay playsInline muted
                            className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                        {isCamOff && <div className="absolute inset-0 bg-gray-900 flex items-center justify-center"><VideoOff size={20} className="text-gray-400" /></div>}
                        <span className="absolute bottom-1 w-full text-center text-white text-[10px] opacity-70">You</span>
                    </div>
                    <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-4 py-1 rounded-full z-10">{fmt(duration)}</div>
                    <div className="absolute top-12 left-1/2 -translate-x-1/2 text-white/70 text-sm z-10">{callTitle}</div>
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-5 z-10">
                        <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${isMuted ? 'bg-gray-600' : 'bg-white/20 hover:bg-white/30'}`}>
                            {isMuted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
                        </button>
                        <button onClick={toggleCamera} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${isCamOff ? 'bg-gray-600' : 'bg-white/20 hover:bg-white/30'}`}>
                            {isCamOff ? <VideoOff size={22} className="text-white" /> : <Video size={22} className="text-white" />}
                        </button>
                        <button onClick={() => endCall()} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg">
                            <PhoneOff size={22} className="text-white" />
                        </button>
                    </div>
                </div>
            ) : callState === 'active' ? (
                <div className="flex flex-col items-center gap-6 px-10 py-12 rounded-3xl shadow-2xl"
                    style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95)', minWidth: 320 }}>
                    <video ref={remoteVideoRef} autoPlay playsInline muted style={{ display: 'none' }} />
                    <video ref={localVideoRef} autoPlay playsInline muted style={{ display: 'none' }} />
                    <div className="relative">
                        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-indigo-400/50 shadow-2xl">
                            {avatarContent}
                        </div>
                        <div className="absolute inset-0 rounded-full border-2 border-indigo-400/30 animate-ping scale-110" />
                    </div>
                    <div className="text-center">
                        <p className="text-white font-semibold text-xl">{callTitle}</p>
                        <p className="text-indigo-300 text-sm mt-1">
                            {fmt(duration)}{isGroupCall ? ` · ${participantCount} nguoi tham gia` : ''}
                        </p>
                    </div>
                    <div className="flex gap-5 mt-4">
                        <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${isMuted ? 'bg-gray-600' : 'bg-white/20 hover:bg-white/30'}`}>
                            {isMuted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
                        </button>
                        <button onClick={() => endCall()} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg">
                            <PhoneOff size={22} className="text-white" />
                        </button>
                    </div>
                </div>
            ) : callState === 'incoming' ? (
                <div className="flex flex-col items-center gap-6 px-10 py-12 rounded-3xl shadow-2xl"
                    style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', minWidth: 320 }}>
                    <div className="relative">
                        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-green-400/50 shadow-2xl">
                            {avatarContent}
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-white font-semibold text-xl">{callTitle}</p>
                        <p className="text-blue-300 text-sm mt-1">{incomingSubtitle}</p>
                    </div>
                    <div className="flex gap-8 mt-2">
                        <button onClick={rejectCall} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center">
                            <PhoneOff size={26} className="text-white" />
                        </button>
                        <button onClick={acceptCall} className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center animate-bounce">
                            <Phone size={26} className="text-white" />
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-6 px-10 py-12 rounded-3xl shadow-2xl"
                    style={{ background: 'linear-gradient(135deg, #083344, #0e7490, #06b6d4)', minWidth: 320 }}>
                    <div className="relative">
                        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-cyan-400/50 shadow-2xl">
                            {avatarContent}
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-white font-semibold text-xl">{callTitle}</p>
                        <p className="text-indigo-300 text-sm mt-1 animate-pulse">{outgoingSubtitle}</p>
                    </div>
                    {callType === 'video' && (
                        <div className="w-24 h-32 rounded-xl overflow-hidden border border-indigo-400/40 bg-black">
                            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                        </div>
                    )}
                    <button onClick={() => endCall()} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center mt-4">
                        <PhoneOff size={22} className="text-white" />
                    </button>
                </div>
            )}
        </div>
    )

    return createPortal(modal, document.body)
}
