import React, { useEffect, useState } from 'react'
import { Users, UserPlus, UserCheck, UserRoundPen, MessageSquare, X } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'



import { useDispatch, useSelector } from 'react-redux'
import { useAuth } from '../context/AuthContext'
import { fetchConnections } from '../features/connections/connectionsSlice'
import api from '../api/axios'
import toast from 'react-hot-toast'
import localizeMessage from '../utils/localization'

const Connections = () => {

  const [currentTab, setCurrentTab] = useState('Người theo dõi')
  const location = useLocation()

  const navigate = useNavigate()
  const { getToken } = useAuth()
  const dispatch = useDispatch()

  const { connections, pendingConnections, followers, following } = useSelector((state) => state.connections)

  const dataArray = [
    { label: 'Người theo dõi', value: followers, icon: Users },
    { label: 'Đang theo dõi', value: following, icon: UserCheck },
    { label: 'Đang chờ xử lý', value: pendingConnections, icon: UserRoundPen },
    { label: 'Bạn bè', value: connections, icon: UserPlus }
  ]

  const handleUnFollow = async (userId) => {
    try {
      const { data } = await api.post('/api/user/unfollow', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      if (data.success) {
        toast.success(localizeMessage(data.message))
        dispatch(fetchConnections(await getToken()))
      } else {
        toast(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }

  const declineConnection = async (userId) => {
    try {
      const { data } = await api.post('/api/user/decline', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      if (data.success) {
        toast.success(localizeMessage(data.message))
        dispatch(fetchConnections(await getToken()))
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }

  const acceptConnection = async (userId) => {
    try {
      const { data } = await api.post('/api/user/accept', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      if (data.success) {
        toast.success(localizeMessage(data.message))
        dispatch(fetchConnections(await getToken()))
      } else {
        toast(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }

  const removeConnection = async (userId) => {
    try {
      const { data } = await api.post('/api/user/remove-connection', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      if (data.success) {
        toast.success(localizeMessage(data.message))
        dispatch(fetchConnections(await getToken()))
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }

  useEffect(() => {
    getToken().then((token) => {
      dispatch(fetchConnections(token))
    })
  }, [location.state?.refresh])

  return (
    <div className='min-h-screen bg-slate-50'>
      <div className='max-w-6xl mx-auto p-6'>

        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-slate-900 mb-2'>Bạn bè</h1>
          <p className='text-slate-600'>Quản lý mạng lưới của bạn và khám phá những người bạn mới</p>
        </div>

        <div className='mb-8 flex flex-wrap gap-6'>
          {
            dataArray.map((item, index) => (
              <div key={index} className='flex flex-col items-center justify-center gap-1 border h-20 w-40 border-gray-200 bg-white shadow rounded-md'>
                <b>{item.value.length}</b>
                <p className='text-slate-600'>{item.label}</p>
              </div>
            ))
          }
        </div>

        <div className='inline-flex flex-wrap items-center border border-gray-200 rounded-md p-1 bg-white shadow-sm'>
          {
            dataArray.map((tab) => (
              <button onClick={() => setCurrentTab(tab.label)} key={tab.label} className={`cursor-pointer flex items-center px-3 py-1 text-sm rounded-md transition-md transition-colors ${currentTab === tab.label ? 'bg-white font-medium text-black' : 'text-gray-500 hover:text-black'}`}>
                <tab.icon className='w-4 h-4' />
                <span className='ml-1'>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className='ml-2 text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full'>{tab.count}</span>
                )}
              </button>
            ))
          }
        </div>

        <div className='flex flex-wrap gap-6 mt-6'>
          {dataArray.find((item) => item.label === currentTab).value.map((user) => (
            <div key={user._id} className='flex gap-6 p-6 bg-white shadow-sm rounded-lg border border-gray-100'>
              <img src={user.profile_picture} alt="" className='rounded-full w-16 h-16 shadow-md flex-shrink-0' />
              <div className='flex-1'>
                <p className='font-semibold text-slate-800 text-lg'>{user.full_name}</p>
                <p className='text-slate-500 text-sm'>@{user.username}</p>
                <p className='text-sm text-gray-600 mt-2'>{user.bio.slice(0, 50)}...</p>
                <div className='flex flex-wrap gap-2 mt-4'>
                  <button onClick={() => navigate(`/profile/${user._id}`)} className='px-4 py-2 text-sm font-medium rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 active:scale-95 transition cursor-pointer border border-indigo-300'>
                    Xem Hồ sơ
                  </button>
                  {
                    currentTab === 'Đang theo dõi' && (
                      <button onClick={() => handleUnFollow(user._id)} className='px-4 py-2 text-sm font-medium rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 active:scale-95 transition cursor-pointer border border-orange-300'>
                        Bỏ theo dõi
                      </button>
                    )
                  }
                  {
                    currentTab === 'Đang chờ xử lý' && (
                      <>
                        <button onClick={() => acceptConnection(user._id)} className='px-4 py-2 text-sm font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 active:scale-95 transition cursor-pointer border border-green-300'>
                          Chấp nhận
                        </button>
                        <button onClick={() => declineConnection(user._id)} className='px-4 py-2 text-sm font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 active:scale-95 transition cursor-pointer border border-red-300 flex items-center gap-2'>
                          <X className='w-4 h-4' />
                          Từ chối
                        </button>
                      </>
                    )
                  }
                  {
                    currentTab === 'Bạn bè' && (
                      <>
                        <button onClick={() => navigate(`/messages/${user._id}`)} className='px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition cursor-pointer border border-slate-300 flex items-center gap-2'>
                          <MessageSquare className='w-4 h-4' />
                          Tin nhắn
                        </button>
                        <button onClick={() => removeConnection(user._id)} className='px-4 py-2 text-sm font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 active:scale-95 transition cursor-pointer border border-red-300 flex items-center gap-2'>
                          <X className='w-4 h-4' />
                          Huỷ kết bạn
                        </button>
                      </>
                    )
                  }
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Connections