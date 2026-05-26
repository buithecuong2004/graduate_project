import React from 'react'
import { CalendarDays, Home, LogOut, RefreshCw, Search } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { assets } from '../../assets/assets'
import { ADMIN_TABS, formatNumber } from './adminShared'

const AdminLayout = ({
  activeTab,
  currentUser,
  globalSearch,
  loading,
  pendingReports = 0,
  onGlobalSearch,
  onGlobalSearchChange,
  onLogout,
  onRefresh,
  children
}) => {
  const navigate = useNavigate()
  const activeTabInfo = ADMIN_TABS.find((tab) => tab.id === activeTab) || ADMIN_TABS[0]

  return (
    <div className='h-screen w-full overflow-hidden bg-[#fbfcfd] text-slate-950'>
      <div className='flex h-full w-full overflow-hidden bg-white'>
        <aside className='fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white lg:flex lg:flex-col'>
          <div className='flex h-16 items-center gap-3 border-b border-slate-200 px-5'>
            <img src={assets.logo_icon || assets.tarous_logo} alt='' className='size-8 object-contain' />
            <div>
              <p className='text-sm font-black leading-none text-slate-950'>Tarous Admin</p>
              <p className='mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400'>Bang dieu khien</p>
            </div>
          </div>

          <nav className='flex-1 space-y-1.5 px-4 py-5'>
            {ADMIN_TABS.map((tab) => {
              const TabIcon = tab.Icon

              return (
                <NavLink
                  key={tab.id}
                  to={tab.path}
                  end={tab.id === 'overview'}
                  className={({ isActive }) => `flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-bold transition cursor-pointer ${
                    isActive
                      ? 'bg-slate-100 text-slate-950 shadow-sm ring-1 ring-slate-200/70'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <TabIcon className='size-4' />
                  <span className='flex-1'>{tab.label}</span>
                  {tab.id === 'reports' && pendingReports > 0 && (
                    <span className='rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700'>{formatNumber(pendingReports)}</span>
                  )}
                </NavLink>
              )
            })}

            <div className='my-4 h-px bg-slate-200' />
            <button type='button' onClick={() => navigate('/feed')} className='flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 cursor-pointer'>
              <Home className='size-4' />
              Ve ung dung
            </button>
          </nav>

          <div className='border-t border-slate-200 p-4'>
            <div className='mb-3 flex min-w-0 items-center gap-3'>
              <img src={currentUser?.profile_picture || assets.sample_profile} alt='' className='size-10 rounded-full object-cover ring-1 ring-slate-200' />
              <div className='min-w-0'>
                <p className='truncate text-sm font-black text-slate-950'>{currentUser?.full_name || 'Quan tri vien'}</p>
                <p className='truncate text-xs text-slate-500'>@{currentUser?.username || 'admin'}</p>
              </div>
            </div>
            <button type='button' onClick={onLogout} className='flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 cursor-pointer'>
              <LogOut className='size-4' />
              Dang xuat
            </button>
          </div>
        </aside>

        <main className='h-screen min-w-0 flex-1 overflow-y-auto bg-[#fbfcfd] lg:ml-72'>
          <header className='sticky top-0 z-20 flex h-auto flex-col gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:h-16 md:flex-row md:items-center md:px-5'>
            <div className='flex min-w-0 items-center gap-3'>
              <span className='flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800'>
                {React.createElement(activeTabInfo.Icon, { className: 'size-4' })}
              </span>
              <div className='min-w-0'>
                <p className='truncate text-sm font-black text-slate-950'>{activeTabInfo.label}</p>
                <p className='truncate text-xs text-slate-500'>Quan ly du lieu, kiem duyet va van hanh he thong</p>
              </div>
            </div>

            <form onSubmit={onGlobalSearch} className='relative min-w-0 flex-1 md:mx-auto md:max-w-xl'>
              <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
              <input
                value={globalSearch}
                onChange={(event) => onGlobalSearchChange(event.target.value)}
                className='h-10 w-full rounded-full border border-slate-200 bg-white pl-10 pr-14 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
                placeholder='Tim noi dung, nguoi dung, bai viet'
              />
              <span className='absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-400 sm:block'>Enter</span>
            </form>

            <div className='flex items-center gap-2'>
              <button type='button' onClick={onRefresh} className='flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 cursor-pointer' title='Lam moi'>
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <div className='hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 xl:flex'>
                <CalendarDays className='size-4' />
                {new Date().toLocaleDateString('vi-VN')}
              </div>
            </div>
          </header>

          <div className='border-b border-slate-200 bg-white px-4 py-3 md:hidden'>
            <div className='flex gap-2 overflow-x-auto'>
              {ADMIN_TABS.map((tab) => {
                const TabIcon = tab.Icon
                const isActive = activeTab === tab.id

                return (
                  <NavLink
                    key={tab.id}
                    to={tab.path}
                    end={tab.id === 'overview'}
                    className={`flex min-w-fit items-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition cursor-pointer ${isActive ? 'bg-slate-100 text-slate-950 ring-1 ring-slate-200' : 'bg-slate-50 text-slate-600'}`}
                  >
                    <TabIcon className='size-4' />
                    {tab.label}
                  </NavLink>
                )
              })}
            </div>
          </div>

          <div className='p-4 pb-10 md:p-6'>
            {loading && (
              <div className='mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500'>
                Dang tai du lieu...
              </div>
            )}

            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
