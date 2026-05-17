import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useSelector } from 'react-redux'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import Peer from 'simple-peer'

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
    return { stop: () => { playing = false; clearInterval(iv); try { ctx.close() } catch (_) { } } }
}

const fmt = s => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

const ICE_CFG = {
    iceServers: [
        // STUN servers (free, chỉ dùng để lấy public IP)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },

        // TURN servers - UDP (ưu tiên, nhanh nhất)
        {
            urls: 'turn:openrelay.metered.ca:3478?transport=udp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },

        // TURN servers - TCP (fallback, khi UDP không work)
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },

        // TURN servers - TLS (fallback thứ 2, an toàn nhất)
        {
            urls: 'turns:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
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
    const localStreamRef = useRef(null)
    const remoteStreamRef = useRef(null)

    const ringtoneRef = useRef(null)
    const durationTimerRef = useRef(null)
    const timeoutRef = useRef(null)
    const callStartTimeRef = useRef(null)
    const iceCandidateBufferRef = useRef([])
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

    const cleanup = useCallback(() => {
        ringtoneRef.current?.stop()
        clearTimeout(timeoutRef.current)
        clearInterval(durationTimerRef.current)
        localStreamRef.current?.getTracks().forEach(t => t.stop())
        if (pcRef.current) {
            try { pcRef.current.destroy() } catch (_) { }
            pcRef.current = null
        }
        localStreamRef.current = null
        remoteStreamRef.current = null
    }, [])

    const endCall = useCallback(async (reason = 'completed') => {
        socketRef.current?.emit('call-ended', { to: otherUserId, from: currentUser._id })
        const dur = callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0
        cleanup()
        if (reason === 'completed') await saveCallRecord('completed', dur)
        onCloseRef.current()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otherUserId, currentUser._id, socketRef, cleanup, saveCallRecord])

    const getMedia = useCallback(async () => {
        const tryGet = async (c) => {
            try { return await navigator.mediaDevices.getUserMedia(c) }
            catch (_) { return null }
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

    // ─── Create Simple-Peer ──────────────────────────────────────────────
    const createPC = useCallback((isInitiator = false) => {
        if (pcRef.current) return pcRef.current;

        console.log(`🚀 Creating SimplePeer (initiator=${isInitiator})`);
        const peer = new Peer({
            initiator: isInitiator,
            trickle: true,
            stream: localStreamRef.current,
            config: ICE_CFG
        })

        peer.on('signal', data => {
            console.log(`📡 Sending signal:`, data.type || 'candidate')
            socketRef.current?.emit('webrtc-signal', {
                to: otherUserId,
                from: currentUser._id,
                signal: data
            })
        })

        peer.on('stream', stream => {
            console.log('🎥 Remote stream received from simple-peer')
            attachRemote(stream)
        })

        peer.on('connect', () => {
            console.log('🔗 Peer connected')
            if (callStateRef.current !== 'active') {
                setState('active')
                startTimer()
            }
        })

        peer.on('error', err => {
            console.error('❌ Peer error:', err)
        })

        peer.on('close', () => {
            console.log('📵 Peer closed')
        })

        pcRef.current = peer
        return peer
    }, [socketRef, otherUserId, currentUser._id, attachRemote, setState, startTimer])

    // ─── Socket Listeners ────────────────────────────────────────────────
    const handlersAttachedRef = useRef(false)

    const ensureListeners = useCallback(() => {
        const socket = socketRef.current
        if (!socket || handlersAttachedRef.current) return

        handlersAttachedRef.current = true
        console.log('🔧 Registering socket listeners, isIncoming:', isIncoming)

        const onCallAccepted = async () => {
            console.log('✅ call-accepted received, isIncoming:', isIncoming, 'state:', callStateRef.current)
            if (isIncoming) return
            if (callStateRef.current !== 'outgoing') return

            ringtoneRef.current?.stop()
            clearTimeout(timeoutRef.current)
            setState('active')
            startTimer()

            // Caller: ensure media, create initiator PC
            if (!localStreamRef.current) await getMedia()
            createPC(true) // initiator = true -> will automatically generate offer and trigger peer.on('signal')
        }

        const onWebRTCSignal = async (data) => {
            if (!data?.signal) return
            console.log(`📶 Signal received: ${data.signal.type || 'candidate'}, hasPC: ${!!pcRef.current}`)

            if (pcRef.current) {
                pcRef.current.signal(data.signal)
            } else {
                console.warn('⚠️ Received signal but pcRef is null. Creating non-initiator PC.')
                if (!localStreamRef.current) await getMedia()
                const pc = createPC(false)
                pc.signal(data.signal)
            }
        }

        const onRejected = async () => {
            ringtoneRef.current?.stop()
            clearTimeout(timeoutRef.current)
            await saveCallRecord('rejected', 0)
            removeListeners()
            cleanup(); onCloseRef.current()
        }

        const onEnded = async () => {
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
    }, [isIncoming, socketRef, setState, startTimer, getMedia, createPC, saveCallRecord, cleanup, otherUserId, currentUser._id])

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

    // ─── Accept / Reject ─────────────────────────────────────────────────
    const acceptCall = useCallback(async () => {
        ringtoneRef.current?.stop()
        clearTimeout(timeoutRef.current)

        const stream = await getMedia()
        if (!stream) return

        setState('active')
        startTimer()

        // Create PC for receiver (wait for caller's signal)
        createPC(false)

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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