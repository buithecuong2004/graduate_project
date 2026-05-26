import React, { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { assets } from '../../assets/assets'
import Loading from '../../components/user/Loading'
import StoriesBar from '../../components/user/StoriesBar'
import PostCard from '../../components/user/PostCard'
import RecentMessages from '../../components/user/RecentMessages'
import { useAuth } from '../../context/AuthContext'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'
import { fetchPosts, deletePost } from '../../features/posts/postSlice'

const SUGGESTED_INJECT_INTERVAL = 5

const buildInterleavedFeed = (posts = [], suggestedPosts = []) => {
  if (!posts.length) {
    return suggestedPosts.map((p) => ({ type: 'suggested', data: p }))
  }

  const result = []
  const renderedPostIds = new Set()

  posts.forEach((post) => {
    renderedPostIds.add(post._id)
  })

  const remainingSuggestedPosts = suggestedPosts.filter((post) => !renderedPostIds.has(post._id))
  let suggestedIndex = 0

  posts.forEach((post, i) => {
    result.push({ type: post.is_suggested ? 'suggested' : 'post', data: post })

    if ((i + 1) % SUGGESTED_INJECT_INTERVAL === 0 && suggestedIndex < remainingSuggestedPosts.length) {
      result.push({ type: 'suggested', data: remainingSuggestedPosts[suggestedIndex] })
      suggestedIndex++
    }
  })

  while (suggestedIndex < remainingSuggestedPosts.length) {
    result.push({ type: 'suggested', data: remainingSuggestedPosts[suggestedIndex] })
    suggestedIndex++
  }

  return result
}

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
  }, [dispatch, getToken, location.state?.refresh])

  const handlePostDeleted = (postId) => {
    dispatch(deletePost(postId))
  }

  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!hasMore || loading) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoadingMore.current) {
          isLoadingMore.current = true
          const loadMore = async () => {
            const token = await getToken()
            await dispatch(fetchPosts({ token, page: page + 1, limit: 10 }))
            isLoadingMore.current = false
          }
          loadMore()
        }
      },
      { root: null, rootMargin: '50px', threshold: 0.1 }
    )

    const currentSentinel = sentinelRef.current
    if (currentSentinel) {
      observer.observe(currentSentinel)
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel)
      }
    }
  }, [hasMore, loading, page, getToken, dispatch])

  const interleavedFeed = buildInterleavedFeed(posts, suggestedPosts || [])

  return (
    <div ref={feedRef} className='app-page h-full overflow-y-scroll'>
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
                            <PostCard post={item.data} onPostDeleted={handlePostDeleted}/>
                          </div>
                        )
                        : (
                          <PostCard key={item.data._id} post={item.data} onPostDeleted={handlePostDeleted}/>
                        )
                    ))}
                    {hasMore && (
                      <div ref={sentinelRef} className='h-8 flex items-center justify-center py-2'>
                        {loading && page > 1 && <Loading height='6vh' />}
                      </div>
                    )}
                    {!hasMore && posts.length > 0 && (
                      <div className='rounded-2xl border border-slate-200 bg-white/70 py-6 text-center text-sm text-slate-500'>
                        Không còn bài viết để tải
                      </div>
                    )}
                  </>
              }
            </div>
          </main>

          <aside className='max-xl:hidden sticky top-6 max-h-[calc(100vh-3rem)] space-y-5 overflow-y-auto pb-6 pr-1'>
            <div className='surface overflow-hidden rounded-[1.5rem] p-4 text-sm text-slate-700'>
              <div className='mb-3 flex items-center justify-between'>
                <h3 className='font-black text-slate-900'>Được tài trợ</h3>
                <span className='rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700'>Ad</span>
              </div>
              <img src={assets.sponsored_img} className='h-44 w-full rounded-2xl object-cover' alt='' />
              <p className='mt-4 font-bold text-slate-900'>Email Marketing</p>
              <p className='mt-1 leading-6 text-slate-500'>Tăng cường tiếp thị email với nền tảng mạnh mẽ, dễ sử dụng và tối ưu cho kết quả.</p>
            </div>
            <RecentMessages />
          </aside>
        </div>
      </div>
    </div>
  )
}

export default Feed
