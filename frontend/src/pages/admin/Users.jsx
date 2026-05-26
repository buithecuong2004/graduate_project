import React from 'react'
import { Lock, Search, Unlock } from 'lucide-react'
import { assets } from '../../assets/assets'
import AdminPagination from '../../components/admin/AdminPagination'
import { StatusBadge, formatDate } from '../../components/admin/adminShared'

const Users = ({
  actionId,
  filters,
  loading = false,
  onFilterChange,
  onLimitChange,
  onPageChange,
  onSearch,
  onUpdateUser,
  pagination,
  users = []
}) => (
  <section className='rounded-xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
    <div className='flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center'>
      <div className='relative flex-1'>
        <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
        <input
          value={filters.search}
          onChange={(event) => onFilterChange({ search: event.target.value })}
          className='h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
          placeholder='Tim theo ten, username hoac email'
        />
      </div>
      <button type='button' onClick={onSearch} className='rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-black text-white cursor-pointer'>
        Tim kiem
      </button>
    </div>

    <div className='overflow-x-auto'>
      <table className='w-full min-w-[860px] text-left text-sm'>
        <thead className='bg-slate-50 text-xs uppercase text-slate-500'>
          <tr>
            <th className='px-4 py-3'>Nguoi dung</th>
            <th className='px-4 py-3'>Trang thai online</th>
            <th className='px-4 py-3'>Vai tro</th>
            <th className='px-4 py-3'>Tai khoan</th>
            <th className='px-4 py-3'>Ngay tao</th>
            <th className='px-4 py-3 text-right'>Thao tac</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-slate-100'>
          {users.map((user) => (
            <tr key={user._id} className='align-top hover:bg-slate-50/60'>
              <td className='px-4 py-3'>
                <div className='flex items-center gap-3'>
                  <img src={user.profile_picture || assets.sample_profile} alt='' className='size-10 rounded-full object-cover ring-1 ring-slate-200' />
                  <div>
                    <p className='font-black text-slate-950'>{user.full_name}</p>
                    <p className='text-xs text-slate-500'>@{user.username} - {user.email}</p>
                  </div>
                </div>
              </td>
              <td className='px-4 py-3'>
                <StatusBadge status={user.isOnline ? 'approved' : 'hidden'}>
                  {user.isOnline ? 'Online' : 'Offline'}
                </StatusBadge>
              </td>
              <td className='px-4 py-3'>
                <select
                  value={user.role || 'user'}
                  disabled={actionId === user._id}
                  onChange={(event) => onUpdateUser(user._id, { role: event.target.value })}
                  className='h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none'
                >
                  <option value='user'>Nguoi dung</option>
                  <option value='admin'>Quan tri vien</option>
                </select>
              </td>
              <td className='px-4 py-3'>
                <StatusBadge status={user.account_status === 'locked' ? 'locked' : 'active'}>
                  {user.account_status === 'locked' ? 'Da khoa' : 'Hoat dong'}
                </StatusBadge>
              </td>
              <td className='px-4 py-3 text-slate-500'>{formatDate(user.createdAt)}</td>
              <td className='px-4 py-3 text-right'>
                {user.account_status === 'locked' ? (
                  <button type='button' onClick={() => onUpdateUser(user._id, { account_status: 'active' })} disabled={actionId === user._id} className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 cursor-pointer'>
                    <Unlock className='size-4' /> Mo khoa
                  </button>
                ) : (
                  <button type='button' onClick={() => onUpdateUser(user._id, { account_status: 'locked', locked_reason: 'Khoa boi quan tri vien' })} disabled={actionId === user._id} className='inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 cursor-pointer'>
                    <Lock className='size-4' /> Khoa
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <AdminPagination
      disabled={loading}
      hasMore={pagination?.hasMore}
      limit={pagination?.limit}
      onLimitChange={onLimitChange}
      onPageChange={onPageChange}
      page={pagination?.page}
      total={pagination?.total}
    />
  </section>
)

export default Users
