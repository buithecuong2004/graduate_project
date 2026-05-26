import React, { useState } from 'react'
import { Clock, MapPin, MessageCircle, Plus, UserPlus, X } from 'lucide-react'
import { useSelector, useDispatch } from 'react-redux'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { fetchUser } from '../../features/user/userSlice'
import { useNavigate } from 'react-router-dom'

const UserCard = ({user}) => {
    const currentUser = useSelector((state)=>state.user.value)
    const dispatch = useDispatch()
    const { getToken } = useAuth()
    const navigate = useNavigate()
    const [isFollowing, setIsFollowing] = useState(user.isFollowing || false)
    const [connectionStatus, setConnectionStatus] = useState(user.connectionStatus || (user.isConnected ? 'connected' : 'none'))
    const [loading, setLoading] = useState(false)
    const isConnected = connectionStatus === 'connected'
    const isPendingSent = connectionStatus === 'pending_sent'
    const isPendingReceived = connectionStatus === 'pending_received'

    const openProfile = () => {
        navigate('/profile/'+user._id)
    }

    const handleCardKeyDown = (event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openProfile()
        }
    }

    const handleActionClick = (event, action) => {
        event.stopPropagation()
        action()
    }

    const refreshUser = async () => {
        dispatch(fetchUser(await getToken()))
    }

    const handleFollow = async () => {
        try {
            setLoading(true)
            const { data } = await api.post('/api/user/follow', {id: user._id}, {
                headers: {Authorization: `Bearer ${await getToken()}`}
            })
            if(data.success) {
                setIsFollowing(true)
                toast.success(data.message)
                refreshUser()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleUnfollow = async () => {
        try {
            setLoading(true)
            const { data } = await api.post('/api/user/unfollow', {id: user._id}, {
                headers: {Authorization: `Bearer ${await getToken()}`}
            })
            if(data.success) {
                setIsFollowing(false)
                toast.success(data.message)
                refreshUser()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleConnectionRequest = async () => {
        const hasCurrentConnection = currentUser?.connections?.some(connectionId => connectionId.toString() === user._id)
        if(isConnected || hasCurrentConnection) {
            return navigate('/messages/'+user._id)
        }
        if(isPendingSent || isPendingReceived) return

        try {
            setLoading(true)
            const { data } = await api.post('/api/user/send-connection-request', {id: user._id}, {
                headers: {Authorization: `Bearer ${await getToken()}`}
            })
            if(data.success) {
                toast.success(data.message)
                setConnectionStatus('pending_sent')
                setIsFollowing(true)
                refreshUser()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleCancelConnectionRequest = async () => {
        try {
            setLoading(true)
            const { data } = await api.post('/api/user/cancel-connection-request', {id: user._id}, {
                headers: {Authorization: `Bearer ${await getToken()}`}
            })
            if(data.success) {
                setConnectionStatus('none')
                toast.success(data.message)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleUnconnect = async () => {
        try {
            setLoading(true)
            const { data } = await api.post('/api/user/remove-connection', {id: user._id}, {
                headers: {Authorization: `Bearer ${await getToken()}`}
            })
            if(data.success) {
                setConnectionStatus('none')
                toast.success(data.message)
                refreshUser()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

  return (
    <article
        role='button'
        tabIndex={0}
        onClick={openProfile}
        onKeyDown={handleCardKeyDown}
        className='surface flex min-h-80 flex-col justify-between rounded-[1.6rem] p-5 outline-none transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-4 focus-visible:ring-cyan-100 cursor-pointer'
    >
        <div className='text-center'>
            <img src={user.profile_picture} alt='' className='rounded-full size-20 object-cover avatar-ring mx-auto'/>
            <button
                type='button'
                onClick={(event) => handleActionClick(event, openProfile)}
                className='mx-auto mt-4 block max-w-full truncate text-lg font-black text-slate-900 transition hover:text-cyan-700'
            >
                {user.full_name}
            </button>
            {user.username && <p className='text-sm text-slate-500'>@{user.username}</p>}
            {user.bio && <p className='mt-3 line-clamp-3 px-2 text-center text-sm leading-6 text-slate-600'>{user.bio}</p>}
        </div>

        <div className='mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600'>
            {user.location && (
                <div className='flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5'>
                    <MapPin className='w-4 h-4 text-cyan-600'/> {user.location}
                </div>
            )}
            <div className='rounded-full border border-slate-200 bg-white px-3 py-1.5'>
                <span className='font-bold text-slate-900'>{user.followers.length}</span> người theo dõi
            </div>
        </div>

        <div className='mt-5 flex flex-col gap-3'>
            <button onClick={(event) => handleActionClick(event, isFollowing ? handleUnfollow : handleFollow)} disabled={loading} className='btn-primary w-full py-2.5 cursor-pointer disabled:opacity-50'>
                <UserPlus className='w-4 h-4'/> {isFollowing ? 'Đang theo dõi' : 'Theo dõi'}
            </button>
            {connectionStatus === 'none' && (
                <button onClick={(event) => handleActionClick(event, handleConnectionRequest)} disabled={loading} className='btn-muted w-full py-2.5 cursor-pointer disabled:opacity-50'>
                    <Plus className='w-4 h-4'/> Kết bạn
                </button>
            )}
            {isPendingSent && (
                <button onClick={(event) => handleActionClick(event, handleCancelConnectionRequest)} disabled={loading} className='flex w-full items-center justify-center gap-2 rounded-full border border-amber-200 bg-amber-50 py-2.5 font-bold text-amber-700 transition hover:bg-amber-100 active:scale-95 cursor-pointer disabled:opacity-50'>
                    <X className='w-4 h-4'/> Hủy lời mời
                </button>
            )}
            {isPendingReceived && (
                <button disabled className='flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-2.5 font-bold text-slate-500 disabled:opacity-80'>
                    <Clock className='w-4 h-4'/> Đang chờ bạn phản hồi
                </button>
            )}
            {isConnected && (
                <div className='flex gap-2'>
                    <button onClick={(event) => handleActionClick(event, () => navigate('/messages/'+user._id))} disabled={loading} className='btn-muted flex-1 py-2.5 cursor-pointer disabled:opacity-50'>
                        <MessageCircle className='w-4 h-4'/> Tin nhắn
                    </button>
                    <button onClick={(event) => handleActionClick(event, handleUnconnect)} disabled={loading} className='flex flex-1 items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 py-2.5 font-bold text-red-600 transition hover:bg-red-100 active:scale-95 cursor-pointer disabled:opacity-50'>
                        <X className='w-4 h-4'/> Hủy
                    </button>
                </div>
            )}
        </div>
    </article>
  )
}

export default UserCard
