import React, { useEffect, useState } from 'react'
import { Users, UserPlus, UserCheck, UserRoundPen, MessageSquare, X, Eye } from 'lucide-react'
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

  const refreshConnections = async () => {
    dispatch(fetchConnections(await getToken()))
  }

  const handleUnFollow = async (userId) => {
    try {
      const { data } = await api.post('/api/user/unfollow', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      data.success ? (toast.success(localizeMessage(data.message)), refreshConnections()) : toast(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }

  const declineConnection = async (userId) => {
    try {
      const { data } = await api.post('/api/user/decline', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      data.success ? (toast.success(localizeMessage(data.message)), refreshConnections()) : toast.error(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }

  const acceptConnection = async (userId) => {
    try {
      const { data } = await api.post('/api/user/accept', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      data.success ? (toast.success(localizeMessage(data.message)), refreshConnections()) : toast(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }

  const removeConnection = async (userId) => {
    try {
      const { data } = await api.post('/api/user/remove-connection', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      data.success ? (toast.success(localizeMessage(data.message)), refreshConnections()) : toast.error(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }

  useEffect(() => {
    getToken().then((token) => {
      dispatch(fetchConnections(token))
    })
  }, [location.state?.refresh])

  const activeData = dataArray.find((item) => item.label === currentTab)?.value || []

  return (
    <div className='app-page min-h-full'>
      <div className='app-container'>
        <section className='mb-8 rounded-[2rem] surface p-6'>
          <p className='page-kicker'>Mạng lưới</p>
          <h1 className='page-title mt-2'>Bạn bè và kết nối</h1>
          <p className='page-subtitle mt-3 max-w-2xl'>Quản lý người theo dõi, lời mời kết bạn và các cuộc trò chuyện đã kết nối.</p>
        </section>

        <div className='mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          {dataArray.map((item) => (
            <button key={item.label} onClick={() => setCurrentTab(item.label)} className={`surface rounded-[1.35rem] p-4 text-left transition hover:-translate-y-0.5 cursor-pointer ${currentTab === item.label ? 'ring-2 ring-cyan-300' : ''}`}>
              <div className='mb-4 flex size-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700'>
                <item.icon className='w-5 h-5' />
              </div>
              <b className='text-3xl text-slate-950'>{item.value.length}</b>
              <p className='mt-1 text-sm font-semibold text-slate-500'>{item.label}</p>
            </button>
          ))}
        </div>

        <div className='surface mb-6 inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl p-1'>
          {dataArray.map((tab) => (
            <button onClick={() => setCurrentTab(tab.label)} key={tab.label} className={`cursor-pointer flex items-center px-4 py-2.5 text-sm rounded-xl transition ${currentTab === tab.label ? 'bg-slate-950 font-bold text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'}`}>
              <tab.icon className='w-4 h-4' />
              <span className='ml-2'>{tab.label}</span>
            </button>
          ))}
        </div>

        {activeData.length === 0 ? (
          <div className='surface rounded-[2rem] p-12 text-center text-slate-500'>
            <Users className='mx-auto mb-3 size-10 text-slate-300'/>
            <p className='font-bold text-slate-900'>Chưa có dữ liệu trong mục này</p>
          </div>
        ) : (
          <div className='grid gap-4 lg:grid-cols-2'>
            {activeData.map((user) => (
              <article key={user._id} className='surface rounded-[1.5rem] p-5'>
                <div className='flex gap-4'>
                  <img src={user.profile_picture} alt='' className='rounded-full w-16 h-16 object-cover avatar-ring flex-shrink-0' />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-lg font-black text-slate-900'>{user.full_name}</p>
                    <p className='text-sm text-slate-500'>@{user.username}</p>
                    <p className='mt-2 line-clamp-2 text-sm leading-6 text-slate-600'>{user.bio}</p>
                  </div>
                </div>

                <div className='mt-5 flex flex-wrap gap-2'>
                  <button onClick={() => navigate(`/profile/${user._id}`)} className='btn-muted px-4 py-2.5 cursor-pointer'>
                    <Eye className='w-4 h-4' />
                    Xem hồ sơ
                  </button>
                  {currentTab === 'Đang theo dõi' && (
                    <button onClick={() => handleUnFollow(user._id)} className='rounded-full border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-100 cursor-pointer'>
                      Bỏ theo dõi
                    </button>
                  )}
                  {currentTab === 'Đang chờ xử lý' && (
                    <>
                      <button onClick={() => acceptConnection(user._id)} className='rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer'>
                        Chấp nhận
                      </button>
                      <button onClick={() => declineConnection(user._id)} className='rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100 flex items-center gap-2 cursor-pointer'>
                        <X className='w-4 h-4' />
                        Từ chối
                      </button>
                    </>
                  )}
                  {currentTab === 'Bạn bè' && (
                    <>
                      <button onClick={() => navigate(`/messages/${user._id}`)} className='btn-primary px-4 py-2.5 cursor-pointer'>
                        <MessageSquare className='w-4 h-4' />
                        Tin nhắn
                      </button>
                      <button onClick={() => removeConnection(user._id)} className='rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100 flex items-center gap-2 cursor-pointer'>
                        <X className='w-4 h-4' />
                        Hủy kết bạn
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Connections
