import React from 'react'
import { Eye, MessageSquare, Search, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'

const Message = () => {
  const { connections } = useSelector((state)=>state.connections)
  const navigate = useNavigate()

  return (
    <div className='app-page min-h-full'>
      <div className='app-container'>
        <section className='mb-8 rounded-[2rem] surface p-6'>
          <p className='page-kicker'>Tin nhắn</p>
          <div className='mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
            <div>
              <h1 className='page-title'>Trò chuyện với bạn bè</h1>
              <p className='page-subtitle mt-3'>Mở nhanh cuộc trò chuyện hoặc xem hồ sơ của những người đã kết nối.</p>
            </div>
            <div className='inline-flex items-center gap-2 rounded-full bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-700'>
              <UsersRound className='size-4'/>
              {connections.length} bạn bè
            </div>
          </div>
        </section>

        {connections.length === 0 ? (
          <div className='surface flex min-h-72 flex-col items-center justify-center rounded-[2rem] p-10 text-center'>
            <Search className='mb-4 size-10 text-slate-300'/>
            <h2 className='text-xl font-black text-slate-900'>Chưa có cuộc trò chuyện</h2>
            <p className='mt-2 text-sm text-slate-500'>Kết bạn với mọi người để bắt đầu nhắn tin.</p>
          </div>
        ) : (
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {connections.map((user)=>(
              <article key={user._id} className='surface rounded-[1.5rem] p-5 transition hover:-translate-y-0.5 hover:shadow-xl'>
                <div className='flex items-start gap-4'>
                  <img src={user.profile_picture} alt='' className='size-14 rounded-full object-cover avatar-ring'/>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate font-black text-slate-900'>{user.full_name}</p>
                    <p className='text-sm text-slate-500'>@{user.username}</p>
                    <p className='mt-2 line-clamp-2 text-sm leading-6 text-slate-600'>{user.bio}</p>
                  </div>
                </div>

                <div className='mt-5 flex gap-2'>
                  <button onClick={()=>navigate(`/messages/${user._id}`)} className='btn-primary flex-1 px-4 py-2.5 cursor-pointer'>
                    <MessageSquare className='w-4 h-4'/>
                    Nhắn tin
                  </button>
                  <button onClick={()=>navigate(`/profile/${user._id}`)} className='btn-muted px-4 py-2.5 cursor-pointer'>
                    <Eye className='w-4 h-4'/>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Message
