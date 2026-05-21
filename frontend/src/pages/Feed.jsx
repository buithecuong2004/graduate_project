import React, { useEffect, useRef, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { assets } from '../assets/assets'
import Loading from '../components/Loading'
import StoriesBar from '../components/StoriesBar'
import PostCard from '../components/PostCard'
import RecentMessages from '../components/RecentMessages'
import { useAuth } from '../context/AuthContext'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'
import { fetchPosts, deletePost, incrementPage } from '../features/posts/postSlice'

const SUGGESTED_INJECT_INTERVAL = 5

const buildInterleavedFeed = (posts, suggestedPosts) => {
  const result = []
  let suggestedIndex = 0

  posts.forEach((post, i) => {
    result.push({ type: 'post', data: post })

    if ((i + 1) % SUGGESTED_INJECT_INTERVAL === 0 && suggestedIndex < suggestedPosts.length) {
      result.push({ type: 'suggested', data: suggestedPosts[suggestedIndex] })
      suggestedIndex++
    }
  })

  return result
}

const SuggestedBadge = () => (
  <div className='mb-3 flex items-center gap-3'>
    <div className='inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700'>
      <Sparkles className='w-3 h-3' />
      <span>Gợi ý cho bạn</span>
    </div>
    <div className='h-px flex-1 bg-slate-200' />
  </div>
)

const Feed = () => {
  const location = useLocation()
  const dispatch = useDispatch()
  const { posts, suggestedPosts, loading, hasMore, page } = useSelector((state) => state.posts)
  const { getToken } = useAuth()
  const feedRef = useRef(null)
  const isLoadingMore = useRef(false)

  useEffect(() => {
    const load = async () => {
      const token = await getToken()
      dispatch(fetchPosts({ token, page: 1, limit: 10 }))
    }
    load()
  }, [location.state?.refresh])

  const handlePostDeleted = (postId) => {
    dispatch(deletePost(postId))
  }

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    if (scrollHeight - scrollTop - clientHeight < 500 && hasMore && !loading && !isLoadingMore.current) {
      isLoadingMore.current = true
      const loadMore = async () => {
        const token = await getToken()
        dispatch(fetchPosts({ token, page: page + 1, limit: 10 }))
        dispatch(incrementPage())
        isLoadingMore.current = false
      }
      loadMore()
    }
  }, [hasMore, loading, page, getToken, dispatch])

  const interleavedFeed = buildInterleavedFeed(posts, suggestedPosts || [])

  return (
    <div ref={feedRef} onScroll={handleScroll} className='app-page h-full overflow-y-scroll'>
      <div className='app-container xl:max-w-7xl'>
        <div className='grid gap-8 xl:grid-cols-[minmax(0,42rem)_22rem] xl:items-start xl:justify-center'>
          <main className='min-w-0'>
            <section className='mb-6 rounded-[2rem] surface p-5 sm:p-6'>
              <p className='page-kicker'>Bảng tin</p>
              <div className='mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
                <div>
                  <h1 className='page-title !text-[1.75rem] sm:!text-[2.25rem] lg:!text-[2.5rem]'>Hôm nay có gì mới?</h1>
                  <p className='page-subtitle mt-3 max-w-xl'>Theo dõi bài viết, story và những cập nhật mới từ mạng lưới của bạn.</p>
                </div>
              </div>
              <div className='mt-5'>
                <StoriesBar refreshTrigger={location.state?.refresh}/>
              </div>
            </section>

            <div className='space-y-6'>
              {loading && page === 1
                ? <Loading height='60vh'/>
                : <>
                    {interleavedFeed.map((item, idx) => (
                      item.type === 'suggested'
                        ? (
                          <div key={`suggested-${item.data._id}-${idx}`}>
                            <SuggestedBadge />
                            <PostCard post={item.data} onPostDeleted={handlePostDeleted}/>
                          </div>
                        )
                        : (
                          <PostCard key={item.data._id} post={item.data} onPostDeleted={handlePostDeleted}/>
                        )
                    ))}
                    {loading && page > 1 && <Loading height='10vh'/>}
                    {!hasMore && posts.length > 0 && (
                      <div className='rounded-2xl border border-slate-200 bg-white/70 py-6 text-center text-sm text-slate-500'>
                        Không còn bài viết để tải
                      </div>
                    )}
                  </>
              }
            </div>
          </main>

          <aside className='max-xl:hidden sticky top-6 space-y-5'>
            <div className='surface overflow-hidden rounded-[1.5rem] p-4 text-sm text-slate-700'>
              <div className='mb-3 flex items-center justify-between'>
                <h3 className='font-black text-slate-900'>Được tài trợ</h3>
                <span className='rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700'>Ad</span>
              </div>
              <img src={assets.sponsored_img} className='h-44 w-full rounded-2xl object-cover' alt='' />
              <p className='mt-4 font-bold text-slate-900'>Email Marketing</p>
              <p className='mt-1 leading-6 text-slate-500'>Tăng cường tiếp thị email với nền tảng mạnh mẽ, dễ sử dụng và tối ưu cho kết quả.</p>
            </div>
            <RecentMessages/>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default Feed
