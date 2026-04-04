import React, { useState } from 'react'
import { MapPin, MessageCircle, Plus, UserPlus, X } from 'lucide-react'
import { useSelector, useDispatch } from 'react-redux'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { useAuth } from '@clerk/clerk-react'
import { fetchUser } from '../features/user/userSlice'
import { useNavigate } from 'react-router-dom'

const UserCard = ({user}) => {
    const currentUser = useSelector((state)=>state.user.value)
    const dispatch = useDispatch()
    const { getToken } = useAuth()
    const navigate = useNavigate()
    const [isFollowing, setIsFollowing] = useState(user.isFollowing || false)
    const [isConnected, setIsConnected] = useState(user.isConnected || false)
    const [loading, setLoading] = useState(false)

    const handleFollow = async () => {
        try {
            setLoading(true)
            const { data } = await api.post('/api/user/follow', {id: user._id}, {
                headers: {Authorization: `Bearer ${await getToken()}`}
            })
            if(data.success) {
                setIsFollowing(true)
                toast.success(data.message)
                dispatch(fetchUser(await getToken()))
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
                dispatch(fetchUser(await getToken()))
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
        if(currentUser.connections.includes(user._id)) {
            return navigate('/messages/'+user._id)
        }
        try {
            setLoading(true)
            const { data } = await api.post('/api/user/send-connection-request', {id: user._id}, {
                headers: {Authorization: `Bearer ${await getToken()}`}
            })
            if(data.success) {
                toast.success(data.message)
                setIsConnected(true)
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
                setIsConnected(false)
                toast.success(data.message)
                dispatch(fetchUser(await getToken()))
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
    <div key={user._id} className='p-4 pt-6 flex flex-col justify-between w-72 shadow border border-gray-200 rounded-md'>
        <div className='text-center'>
            <img src={user.profile_picture} alt="" className='rounded-full w-16 shadow-md mx-auto'/>
            <p className='mt-4 font-semibold'>{user.full_name}</p>
            {user.username && <p className='text-gray-500 font-light'>@{user.username}</p>}
            {user.bio && <p className='text-gray-600 mt-2 text-center text-sm px-4'>{user.bio}</p>}
        </div>

        <div className='flex items-center jutify-center gap-2 mt-4 text-xs text-gray-600'>
            <div className='flex items-center gap-1 border border-gray-300 rounded-full px-3 py-1'>
                <MapPin className='w-4 h-4'/> {user.location}
            </div>
            <div className='flex items-center gap-1 border border-gray-300 rounded-full px-3 py-1'>
                <span>{user.followers.length}</span> Followers
            </div>
        </div>

        <div className='flex flex-col mt-4 gap-3'>
            <button onClick={isFollowing ? handleUnfollow : handleFollow} disabled={loading} className='w-full py-2.5 rounded-lg flex justify-center items-center gap-2 bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-95 transition text-white font-medium cursor-pointer disabled:opacity-50 shadow-sm'>
                <UserPlus className='w-4 h-4'/> {isFollowing ? 'Following' : 'Follow'}
            </button>
            {!isConnected ? (
                <button onClick={handleConnectionRequest} disabled={loading} className='w-full py-2.5 flex items-center justify-center gap-2 border border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg font-medium cursor-pointer active:scale-95 transition disabled:opacity-50'>
                    <Plus className='w-4 h-4'/> Connect
                </button>
            ) : (
                <div className='flex gap-2'>
                    <button onClick={() => navigate('/messages/'+user._id)} disabled={loading} className='flex-1 py-2.5 flex items-center justify-center gap-2 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg font-medium cursor-pointer active:scale-95 transition disabled:opacity-50'>
                        <MessageCircle className='w-4 h-4'/> Message
                    </button>
                    <button onClick={handleUnconnect} disabled={loading} className='flex-1 py-2.5 flex items-center justify-center gap-2 border border-red-300 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-medium cursor-pointer active:scale-95 transition disabled:opacity-50'>
                        <X className='w-4 h-4'/> Disconnect
                    </button>
                </div>
            )}
        </div>
    </div>
  )
}

export default UserCard