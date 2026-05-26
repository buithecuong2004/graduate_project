import React, { useEffect, useState } from 'react'
import { BadgeCheck, MessageCircle, Share2, ThumbsUp, X } from 'lucide-react'
import { assets } from '../../assets/assets'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatNumber } from './adminShared'

const getImages = (post) => (Array.isArray(post?.image_urls) ? post.image_urls.filter(Boolean) : [])

const PostMedia = ({ post, nested = false }) => {
  const images = getImages(post)

  return (
    <>
      {post?.video_url && (
        <video src={post.video_url} controls className={`${nested ? 'mt-3' : 'mt-5'} max-h-[34rem] w-full rounded-xl bg-black object-contain`} />
      )}

      {images.length > 0 && (
        <div className={`${nested ? 'mt-3' : 'mt-5'} grid gap-3 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((imageUrl, index) => (
            <img
              key={`${imageUrl}-${index}`}
              src={imageUrl}
              alt=''
              className='max-h-[34rem] w-full rounded-xl object-contain ring-1 ring-slate-200'
            />
          ))}
        </div>
      )}
    </>
  )
}

const PostContent = ({ post, nested = false }) => (
  <>
    {post?.content && (
      <p className={`${nested ? 'text-sm leading-6' : 'text-sm leading-7'} whitespace-pre-wrap text-slate-800`}>{post.content}</p>
    )}
    <PostMedia post={post} nested={nested} />
  </>
)

const SharedPost = ({ post }) => {
  if (!post || typeof post !== 'object') return null

  return (
    <section className='mt-5 rounded-2xl border border-slate-200 bg-white p-4'>
      <div className='mb-4 flex items-center gap-3'>
        <img src={post.user?.profile_picture || assets.sample_profile} alt='' className='size-11 rounded-full object-cover ring-2 ring-cyan-100' />
        <div className='min-w-0'>
          <div className='flex items-center gap-1'>
            <p className='truncate text-sm font-black text-slate-950'>{post.user?.full_name || 'Không rõ'}</p>
            <BadgeCheck className='size-4 shrink-0 text-cyan-500' />
          </div>
          <p className='text-xs text-slate-500'>@{post.user?.username || 'unknown'} - {formatDate(post.createdAt)}</p>
        </div>
      </div>
      <PostContent post={post} nested />
    </section>
  )
}

const PostPreviewModal = ({ post, onClose }) => {
  const { getToken } = useAuth()
  const [detailPost, setDetailPost] = useState(post)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  useEffect(() => {
    setDetailPost(post)
    if (!post?._id) return undefined

    let cancelled = false

    const loadPostDetail = async () => {
      try {
        setIsLoadingDetail(true)
        const token = await getToken()
        const { data } = await api.get(`/api/post/${post._id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!cancelled && data.success && data.post) setDetailPost(data.post)
      } catch {
        if (!cancelled) setDetailPost(post)
      } finally {
        if (!cancelled) setIsLoadingDetail(false)
      }
    }

    loadPostDetail()
    return () => {
      cancelled = true
    }
  }, [getToken, post])

  if (!post) return null

  const currentPost = detailPost || post
  const commentsCount = currentPost.comments_count ?? currentPost.total_comments_count ?? (Array.isArray(currentPost.comments) ? currentPost.comments.length : 0)
  const reactionsCount = currentPost.reactions_count ?? (Array.isArray(currentPost.reactions) ? currentPost.reactions.length : 0)
  const likesCount = currentPost.old_likes_count ?? (Array.isArray(currentPost.likes_count) ? currentPost.likes_count.length : 0)
  const sharesCount = Array.isArray(currentPost.shares_count) ? currentPost.shares_count.length : currentPost.shares_count

  return (
    <div className='fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm' onClick={onClose}>
      <section className='flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl' onClick={(event) => event.stopPropagation()}>
        <header className='flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4'>
          <div className='min-w-0'>
            <p className='text-xs font-black uppercase tracking-wide text-slate-500'>Chi tiết bài viết</p>
            <h2 className='mt-1 truncate text-lg font-black text-slate-950'>
              {currentPost.user?.full_name || 'Không rõ người đăng'}
            </h2>
            <p className='text-sm text-slate-500'>@{currentPost.user?.username || 'unknown'} - {formatDate(currentPost.createdAt)}</p>
          </div>
          <button type='button' onClick={onClose} className='rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900'>
            <X className='size-5' />
          </button>
        </header>

        <div className='min-h-0 overflow-y-auto px-5 py-5'>
          <div className='mb-4 flex items-center gap-3'>
            <img src={currentPost.user?.profile_picture || assets.sample_profile} alt='' className='size-12 rounded-full object-cover ring-2 ring-cyan-100' />
            <div className='min-w-0'>
              <div className='flex items-center gap-1'>
                <p className='truncate font-black text-slate-950'>{currentPost.user?.full_name || 'Không rõ'}</p>
                <BadgeCheck className='size-4 shrink-0 text-cyan-500' />
              </div>
              <p className='text-xs text-slate-500'>{formatDate(currentPost.createdAt)}</p>
            </div>
          </div>

          {isLoadingDetail && <p className='mb-3 text-xs font-bold text-slate-400'>Đang tải đầy đủ bài viết...</p>}
          <PostContent post={currentPost} />
          <SharedPost post={currentPost.shared_from} />
        </div>

        <footer className='flex flex-wrap gap-3 border-t border-slate-200 px-5 py-4 text-xs font-bold text-slate-500'>
          <span className='inline-flex items-center gap-1'><MessageCircle className='size-4' /> {formatNumber(commentsCount)} bình luận</span>
          <span className='inline-flex items-center gap-1'><ThumbsUp className='size-4' /> {formatNumber(likesCount + reactionsCount)} thích/cảm xúc</span>
          <span className='inline-flex items-center gap-1'><Share2 className='size-4' /> {formatNumber(sharesCount)} chia sẻ</span>
        </footer>
      </section>
    </div>
  )
}

export default PostPreviewModal
