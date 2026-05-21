import React from 'react'
import { assets } from '../assets/assets'
import { Link, useNavigate } from 'react-router-dom'
import MenuItems from './MenuItems'
import NotificationBell from './NotificationBell'
import { CirclePlus, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSelector } from 'react-redux'

const Sidebar = ({sidebarOpen, setSidebarOpen}) => {
  const navigate = useNavigate()
  const user = useSelector((state)=>state.user.value)
  const { logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className={`w-64 xl:w-72 surface border-r border-slate-200 flex flex-col justify-between items-center max-sm:absolute top-0 bottom-0 z-20
  ${sidebarOpen ? 'translate-x-0' : 'max-sm:-translate-x-full'} transition-all duration-300 ease-in-out`}>
        <div className='w-full'>
          <div className='flex items-center justify-between px-6 py-5'>
            <img onClick={()=>navigate('/')} src={assets.tarous_logo} className='w-28 cursor-pointer' alt='' />
            <NotificationBell />
          </div>
          <div className='mx-4 mb-6 h-px bg-slate-200' />

          <MenuItems setSidebarOpen={setSidebarOpen}/>
          <Link
            to='/create-post'
            className='mx-5 mt-6 flex w-[calc(100%-2.5rem)] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-700 via-cyan-500 to-teal-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-cyan-900/20 transition hover:from-cyan-600 hover:via-cyan-400 hover:to-teal-400 active:scale-[0.98] cursor-pointer whitespace-nowrap'
          >     
       <CirclePlus className='w-5 h-5 shrink-0'/>
            Tạo bài viết
          </Link>
        </div>

        <div className='w-full border-t border-slate-200 p-4 flex items-center justify-between bg-white/65'>
          <div className='flex gap-3 items-center cursor-pointer min-w-0' onClick={() => navigate('/profile')}>
              <img
                src={user?.profile_picture || ''}
                alt={user?.full_name}
                className='w-10 h-10 rounded-full object-cover avatar-ring'
                onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.full_name || 'U')}&background=0891b2&color=fff` }}
              />
              <div className='min-w-0'>
                <h1 className='text-sm font-bold truncate max-w-36 text-slate-900'>{user?.full_name}</h1>
                <p className='text-xs text-slate-500 truncate'>@{user?.username}</p>
              </div>
          </div>
          <LogOut onClick={handleLogout} className='w-5 text-slate-400 hover:text-red-500 transition cursor-pointer shrink-0'/>
        </div>
    </div>
  )
}

export default Sidebar
