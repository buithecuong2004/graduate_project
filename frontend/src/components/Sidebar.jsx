import React from 'react'
import { assets } from '../assets/assets'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import MenuItems from './MenuItems'
import NotificationBell from './NotificationBell'
import { CirclePlus, Home, LogOut, UserCheck, UserPlus, UserRoundPen, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSelector } from 'react-redux'

const Sidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useSelector((state) => state.user.value)
  const { connections, pendingConnections, followers, following } = useSelector((state) => state.connections)
  const { logout } = useAuth()
  const isConnectionsPage = location.pathname === '/connections'
  const activeFriendTab = new URLSearchParams(location.search).get('tab') || 'home'

  const friendMenuItems = [
    { to: '/connections?tab=home', tab: 'home', label: 'Mọi người', Icon: Users },
    { to: '/connections?tab=requests', tab: 'requests', label: 'Lời mời kết bạn', Icon: UserRoundPen, count: pendingConnections.length },
    { to: '/connections?tab=followers', tab: 'followers', label: 'Người theo dõi', Icon: Users, count: followers.length },
    { to: '/connections?tab=following', tab: 'following', label: 'Đang theo dõi', Icon: UserCheck, count: following.length },
    { to: '/connections?tab=friends', tab: 'friends', label: 'Bạn bè', Icon: UserPlus, count: connections.length }
  ]

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className={`${isConnectionsPage ? 'w-72 xl:w-80' : 'w-64 xl:w-72'} surface border-r border-slate-200 flex flex-col justify-between items-center max-sm:absolute top-0 bottom-0 z-20
  ${sidebarOpen ? 'translate-x-0' : 'max-sm:-translate-x-full'} transition-all duration-300 ease-in-out`}>
        <div className='w-full'>
          <div className='flex items-center justify-between px-6 py-5'>
            <img onClick={() => navigate('/')} src={assets.tarous_logo} className='w-28 cursor-pointer' alt='' />
            <NotificationBell />
          </div>
          <div className='mx-4 mb-6 h-px bg-slate-200' />

          {isConnectionsPage ? (
            <nav className='px-4 text-slate-700 space-y-1.5 font-semibold'>
              {friendMenuItems.map((item) => {
                const FriendIcon = item.Icon
                const isActive = activeFriendTab === item.tab

                return (
                  <Link
                    key={item.tab}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition ${
                      isActive
                        ? 'bg-cyan-50 text-cyan-700 shadow-sm ring-1 ring-cyan-100'
                        : 'hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                      isActive ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}>
                      <FriendIcon className='h-5 w-5' />
                    </span>
                    <span className='min-w-0 flex-1 truncate'>{item.label}</span>
                    {typeof item.count === 'number' && item.count > 0 && (
                      <span className='rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600'>
                        {item.count}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          ) : (
            <>
              <MenuItems setSidebarOpen={setSidebarOpen} />
              <Link
                to='/create-post'
                className='mx-5 mt-6 flex w-[calc(100%-2.5rem)] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-700 via-cyan-500 to-teal-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-cyan-900/20 transition hover:from-cyan-600 hover:via-cyan-400 hover:to-teal-400 active:scale-[0.98] cursor-pointer whitespace-nowrap'
              >
                <CirclePlus className='w-5 h-5 shrink-0'/>
                Tạo bài viết
              </Link>
            </>
          )}
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
