import React, { useState } from 'react'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
import { assets } from '../../assets/assets'
import AdminPagination from '../../components/admin/AdminPagination'
import PostPreviewModal from '../../components/admin/PostPreviewModal'
import { POST_STATUS_OPTIONS, StatusBadge, formatDate, formatNumber, shortText } from '../../components/admin/adminShared'

const Posts = ({
  actionId,
  filters,
  loading = false,
  onDeletePost,
  onFilterChange,
  onLimitChange,
  onPageChange,
  onSearch,
  onUpdateVisibility,
  pagination,
  posts = []
}) => {
  const [previewPost, setPreviewPost] = useState(null)

  return (
    <>
  <section className='rounded-xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
    <div className='grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[1fr_1fr_9rem_9rem_11rem_auto]'>
      <input value={filters.search} onChange={(event) => onFilterChange({ ...filters, search: event.target.value })} className='h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100' placeholder='Tim noi dung' />
      <input value={filters.user} onChange={(event) => onFilterChange({ ...filters, user: event.target.value })} className='h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100' placeholder='Loc theo user' />
      <input type='date' value={filters.from} onChange={(event) => onFilterChange({ ...filters, from: event.target.value })} className='h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none' />
      <input type='date' value={filters.to} onChange={(event) => onFilterChange({ ...filters, to: event.target.value })} className='h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none' />
      <select value={filters.status} onChange={(event) => onFilterChange({ ...filters, status: event.target.value })} className='h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none'>
        {POST_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button type='button' onClick={onSearch} className='rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-black text-white cursor-pointer'>
        Loc
      </button>
    </div>

    <div className='divide-y divide-slate-100'>
      {posts.map((post) => (
        <article key={post._id} onClick={() => setPreviewPost(post)} className='p-4 hover:bg-slate-50/50 cursor-pointer'>
          <div className='flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'>
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-3'>
                <img src={post.user?.profile_picture || assets.sample_profile} alt='' className='size-10 rounded-full object-cover ring-1 ring-slate-200' />
                <div className='min-w-0'>
                  <p className='truncate font-black text-slate-950'>{post.user?.full_name || 'Khong ro'}</p>
                  <p className='text-xs text-slate-500'>@{post.user?.username} - {formatDate(post.createdAt)}</p>
                </div>
                <StatusBadge status={post.is_hidden ? 'hidden' : 'active'}>
                  {post.is_hidden ? 'Da an' : 'Dang hien thi'}
                </StatusBadge>
              </div>
              <p className='mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700'>{shortText(post.content || 'Bai viet media', 280)}</p>
              <div className='mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500'>
                <span>{formatNumber(post.comments_count)} binh luan</span>
                <span>{formatNumber(post.old_likes_count + post.reactions_count)} thich/cam xuc</span>
                <span>{formatNumber(post.shares_count)} chia se</span>
                <span className={post.pending_reports_count > 0 ? 'text-amber-700' : ''}>{formatNumber(post.reports_count)} bao cao</span>
              </div>
            </div>
            <div className='flex flex-wrap gap-2 xl:justify-end'>
              <button type='button' onClick={(event) => { event.stopPropagation(); onUpdateVisibility(post._id, !post.is_hidden) }} disabled={actionId === post._id} className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 cursor-pointer'>
                {post.is_hidden ? <Eye className='size-4' /> : <EyeOff className='size-4' />}
                {post.is_hidden ? 'Hien thi' : 'An'}
              </button>
              <button type='button' onClick={(event) => { event.stopPropagation(); onDeletePost(post._id) }} disabled={actionId === post._id} className='inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 cursor-pointer'>
                <Trash2 className='size-4' />
                Xoa
              </button>
            </div>
          </div>
        </article>
      ))}
      {posts.length === 0 && <p className='p-6 text-sm text-slate-500'>Khong co bai viet phu hop.</p>}
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
  <PostPreviewModal post={previewPost} onClose={() => setPreviewPost(null)} />
    </>
  )
}

export default Posts
