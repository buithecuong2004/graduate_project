import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useSelector } from 'react-redux'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

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

export default function CallModal({ callInfo, onClose, isIncoming }) {
    const { socketRef } = useSocket()
    const currentUser = useSelector(s => s.user.value)
    const { getToken } = useAuth()

    const [callState, setCallState] = useState(isIncoming ? 'incoming' : 'outgoing')
    const callStateRef = useRef(isIncoming ? 'incoming' : 'outgoing')
    const [isMuted, setIsMuted] = useState(false)
    const [isCamOff, setIsCamOff] = useState(false)
    const [duration, setDuration] = useState(0)

    const callType = callInfo.callType
    const otherUserId = isIncoming ? callInfo.from : callInfo.to
    const otherName = callInfo.callerName || 'Unknown'
    const otherAvatar = callInfo.callerAvatar || null

    const localVideoRef = useRef(null)
    const remoteVideoRef = useRef(null)
    const remoteAudioRef = useRef(null)
    const pcRef = useRef(null)
    const pcCreatePromiseRef = useRef(null)
    const pendingCandidatesRef = useRef([])
    const localStreamRef = useRef(null)
    const remoteStreamRef = useRef(null)
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
        callStateRef.current = s;
        setCallState(s)
    }, [])

    const startTimer = useCallback(() => {
        if (callStartTimeRef.current) return
        callStartTimeRef.current = Date.now()
        durationTimerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    }, [])

    const saveCallRecord = useCallback(async (status, dur = 0) => {
        try {
            const token = await getToken()
            await api.post('/api/message/save-call', {
                to_user_id: otherUserId,
                call_type: callType,
                call_status: status,
                call_duration: dur,
            }, { headers: { Authorization: `Bearer ${token}` } })
        } catch (e) { console.error('saveCall error:', e) }
    }, [otherUserId, callType, getToken])

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
                    console.warn('Could not load server ICE config, using client fallback:', error.message)
                }
                return buildClientIceConfig()
            })()
        }

        iceConfigRef.current = await iceConfigPromiseRef.current
        return iceConfigRef.current
    }, [getToken])

    const cleanup = useCallback(() => {
        ringtoneRef.current?.stop()
        clearTimeout(timeoutRef.current)
        clearInterval(durationTimerRef.current)
        localStreamRef.current?.getTracks().forEach(t => t.stop())
        if (pcRef.current) {
            pcRef.current.onicecandidate = null
            pcRef.current.ontrack = null
            pcRef.current.onconnectionstatechange = null
            pcRef.current.oniceconnectionstatechange = null
            try { pcRef.current.close() } catch { /* RTCPeerConnection may already be closed. */ }
            pcRef.current = null
        }
        pcCreatePromiseRef.current = null
        pendingCandidatesRef.current = []
        localStreamRef.current = null
        remoteStreamRef.current = null
    }, [])

    const endCall = useCallback(async (reason = 'completed') => {
        socketRef.current?.emit('call-ended', { to: otherUserId, from: currentUser._id })
        const dur = callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0
        cleanup()
        if (reason === 'completed') await saveCallRecord('completed', dur)
        onCloseRef.current()
    }, [otherUserId, currentUser._id, socketRef, cleanup, saveCallRecord])

    const getMedia = useCallback(async () => {
        const tryGet = async (c) => {
            try { return await navigator.mediaDevices.getUserMedia(c) }
            catch { return null }
        }
        let stream = null
        if (callType === 'video') {
            stream = await tryGet({ video: true, audio: true }) || await tryGet({ audio: true })
        } else {
            stream = await tryGet({ audio: true })
        }
        if (!stream) {
            alert('Không thể truy cập mic/camera. Hãy cấp quyền rồi thử lại.');
            return null
        }
        localStreamRef.current = stream
        if (localVideoRef.current && stream.getVideoTracks().length > 0) {
            localVideoRef.current.srcObject = stream
        }
        return stream
    }, [callType])

    const attachRemote = useCallback((remote) => {
        console.log('🎥 Attaching remote stream, tracks:', remote.getTracks().map(t => `${t.kind}(enabled=${t.enabled})`))
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
        if (callStateRef.current !== 'active') {
            setState('active')
        }
        startTimer()
    }, [setState, startTimer])

    const sendSignal = useCallback((signal) => {
        console.log('Sending WebRTC signal:', signal.type || 'candidate')
        socketRef.current?.emit('webrtc-signal', {
            to: otherUserId,
            from: currentUser._id,
            signal,
        })
    }, [socketRef, otherUserId, currentUser._id])

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

    // ─── Native RTCPeerConnection ────────────────────────────────────────
    const createPC = useCallback(async () => {
        if (pcRef.current) return pcRef.current
        if (pcCreatePromiseRef.current) return pcCreatePromiseRef.current

        pcCreatePromiseRef.current = (async () => {
            const iceConfig = await loadIceConfig()
            console.log('Creating RTCPeerConnection:', iceConfig)

            const pc = new RTCPeerConnection(iceConfig)
            pcRef.current = pc

            localStreamRef.current?.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current)
            })

            pc.onicecandidate = ({ candidate }) => {
                if (candidate) {
                    sendSignal({ type: 'candidate', candidate })
                }
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
                console.log('Peer connection state:', pc.connectionState)
                if (pc.connectionState === 'connected') {
                    markActive()
                }
            }

            pc.oniceconnectionstatechange = () => {
                console.log('ICE state:', pc.iceConnectionState)
                if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                    markActive()
                }
            }

            return pc
        })()

        try {
            return await pcCreatePromiseRef.current
        } finally {
            pcCreatePromiseRef.current = null
        }
    }, [loadIceConfig, attachRemote, markActive, sendSignal])

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

    // ─── Socket Listeners ────────────────────────────────────────────────
    const handlersAttachedRef = useRef(false)

    const removeListeners = useCallback(() => {
        const h = handlersAttachedRef.current
        if (h && h.socket) {
            console.log('🧹 Removing socket listeners')
            h.socket.off('call-accepted', h.onCallAccepted)
            h.socket.off('webrtc-signal', h.onWebRTCSignal)
            h.socket.off('call-rejected', h.onRejected)
            h.socket.off('call-ended', h.onEnded)
        }
        handlersAttachedRef.current = false
    }, [])

    const ensureListeners = useCallback(() => {
        const socket = socketRef.current
        if (!socket || handlersAttachedRef.current) return

        handlersAttachedRef.current = true
        console.log('🔧 Registering socket listeners, isIncoming:', isIncoming)

        const onCallAccepted = async (data) => {
            if (data?.from !== otherUserId || data?.to !== currentUser._id) return
            console.log('✅ call-accepted received, isIncoming:', isIncoming, 'state:', callStateRef.current)
            if (isIncoming) return
            if (callStateRef.current !== 'outgoing') return

            ringtoneRef.current?.stop()
            clearTimeout(timeoutRef.current)
            setState('active')
            startTimer()

            // Caller: ensure media, create peer connection, then send offer.
            if (!localStreamRef.current) {
                const stream = await getMedia()
                if (!stream) return
            }
            await startOffer()
        }

        const onWebRTCSignal = async (data) => {
            if (data?.from !== otherUserId || data?.to !== currentUser._id) return
            if (!data?.signal) return
            console.log(`📶 Signal received: ${data.signal.type || 'candidate'}, hasPC: ${!!pcRef.current}`)

            try {
                if (!localStreamRef.current) {
                    const stream = await getMedia()
                    if (!stream) return
                }
                await handleRemoteSignal(data.signal)
            } catch (error) {
                console.error('WebRTC signal error:', error)
            }
        }

        const onRejected = async (data) => {
            if (data?.from !== otherUserId || data?.to !== currentUser._id) return
            ringtoneRef.current?.stop()
            clearTimeout(timeoutRef.current)
            await saveCallRecord('rejected', 0)
            removeListeners()
            cleanup(); onCloseRef.current()
        }

        const onEnded = async (data) => {
            if (data?.from !== otherUserId || data?.to !== currentUser._id) return
            const dur = callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0
            if (callStateRef.current === 'active') await saveCallRecord('completed', dur)
            removeListeners()
            cleanup(); onCloseRef.current()
        }

        socket.on('call-accepted', onCallAccepted)
        socket.on('webrtc-signal', onWebRTCSignal)
        socket.on('call-rejected', onRejected)
        socket.on('call-ended', onEnded)

        handlersAttachedRef.current = { socket, onCallAccepted, onWebRTCSignal, onRejected, onEnded }
    }, [isIncoming, socketRef, setState, startTimer, getMedia, startOffer, handleRemoteSignal, saveCallRecord, cleanup, removeListeners, otherUserId, currentUser._id])

    // ─── Accept / Reject ─────────────────────────────────────────────────
    const acceptCall = useCallback(async () => {
        ringtoneRef.current?.stop()
        clearTimeout(timeoutRef.current)

        const stream = await getMedia()
        if (!stream) return

        setState('active')
        startTimer()

        // Create PC for receiver (wait for caller's offer)
        await createPC()

        // Tell caller we accepted → caller will send offer
        socketRef.current?.emit('call-accepted', {
            to: otherUserId,
            from: currentUser._id
        })
    }, [getMedia, createPC, socketRef, otherUserId, currentUser._id, setState, startTimer])

    const rejectCall = useCallback(async () => {
        ringtoneRef.current?.stop()
        clearTimeout(timeoutRef.current)
        socketRef.current?.emit('call-rejected', { to: otherUserId, from: currentUser._id })
        await saveCallRecord('rejected', 0)
        removeListeners()
        cleanup(); onCloseRef.current()
    }, [socketRef, otherUserId, currentUser._id, saveCallRecord, cleanup, removeListeners])

    const toggleMute = () => {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
        setIsMuted(m => !m)
    }

    const toggleCamera = () => {
        localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
        setIsCamOff(c => !c)
    }

    // ─── Init ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (initDoneRef.current) return
        initDoneRef.current = true

        const init = async () => {
            ensureListeners()
            ringtoneRef.current = createRingtone()
            await loadIceConfig()

            if (!isIncoming) {
                await getMedia()
                timeoutRef.current = setTimeout(async () => {
                    await saveCallRecord('missed', 0)
                    endCall('missed')
                }, 45000)
            } else {
                timeoutRef.current = setTimeout(async () => {
                    await saveCallRecord('missed', 0)
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

    // Unmount cleanup
    useEffect(() => {
        return () => {
            initDoneRef.current = false
            removeListeners()
            cleanup()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Re-attach streams on UI state change
    useEffect(() => {
        if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current
        }
        if (remoteStreamRef.current) {
            attachRemote(remoteStreamRef.current)
        }
    }, [callState, callType, attachRemote])

    // ─── Render UI ───────────────────────────────────────────────────────
    const modal = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)' }}>

            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            {callState === 'active' && callType === 'video' ? (
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
                    <div className="absolute top-12 left-1/2 -translate-x-1/2 text-white/70 text-sm z-10">{otherName}</div>
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
                            {otherAvatar ? <img src={otherAvatar} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full bg-indigo-700 flex items-center justify-center text-white text-4xl font-bold">{otherName[0]}</div>}
                        </div>
                        <div className="absolute inset-0 rounded-full border-2 border-indigo-400/30 animate-ping scale-110" />
                    </div>
                    <div className="text-center">
                        <p className="text-white font-semibold text-xl">{otherName}</p>
                        <p className="text-indigo-300 text-sm mt-1">{fmt(duration)}</p>
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
                            {otherAvatar ? <img src={otherAvatar} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full bg-blue-700 flex items-center justify-center text-white text-4xl font-bold">{otherName[0]}</div>}
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-white font-semibold text-xl">{otherName}</p>
                        <p className="text-blue-300 text-sm mt-1">
                            {callType === 'video' ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến'}
                        </p>
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
                    style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95)', minWidth: 320 }}>
                    <div className="relative">
                        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-indigo-400/50 shadow-2xl">
                            {otherAvatar ? <img src={otherAvatar} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full bg-indigo-700 flex items-center justify-center text-white text-4xl font-bold">{otherName[0]}</div>}
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-white font-semibold text-xl">{otherName}</p>
                        <p className="text-indigo-300 text-sm mt-1 animate-pulse">Đang gọi...</p>
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
