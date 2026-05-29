import React, { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, Radio } from 'lucide-react'
import { assets } from '../../assets/assets'
import Loading from '../../components/user/Loading'
import StoriesBar from '../../components/user/StoriesBar'
import PostCard from '../../components/user/PostCard'
import RecentMessages from '../../components/user/RecentMessages'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchPosts, deletePost } from '../../features/posts/postSlice'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import localizeMessage from '../../utils/localization'
import moment from '../../utils/moment'

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
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { posts, suggestedPosts, loading, hasMore, page } = useSelector((state) => state.posts)
  const { getToken } = useAuth()
  const { socketRef, socket } = useSocket()
  const feedRef = useRef(null)
  const isLoadingMore = useRef(false)
  const [activeLiveStreams, setActiveLiveStreams] = useState([])
  const [isStartingLive, setIsStartingLive] = useState(false)

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

  const loadActiveLiveStreams = useCallback(async () => {
    try {
      const token = await getToken()
      const { data } = await api.get('/api/live/active', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (data.success) setActiveLiveStreams(data.streams || [])
    } catch (error) {
      console.error('active live streams error:', error)
    }
  }, [getToken])

  useEffect(() => {
    loadActiveLiveStreams()
  }, [loadActiveLiveStreams, location.state?.refresh])

  useEffect(() => {
    const activeSocket = socket || socketRef?.current
    if (!activeSocket) return undefined

    const handleLiveStarted = (stream) => {
      if (!stream?._id) return
      setActiveLiveStreams((items) => [stream, ...items.filter((item) => item._id !== stream._id)])
    }

    const handleLiveEnded = ({ streamId }) => {
      if (!streamId) return
      setActiveLiveStreams((items) => items.filter((stream) => stream._id !== streamId))
    }

    activeSocket.on('live-stream-started', handleLiveStarted)
    activeSocket.on('live-stream-ended', handleLiveEnded)

    return () => {
      activeSocket.off('live-stream-started', handleLiveStarted)
      activeSocket.off('live-stream-ended', handleLiveEnded)
    }
  }, [socket, socketRef])

  const handleStartLive = async () => {
    if (isStartingLive) return

    try {
      setIsStartingLive(true)
      const token = await getToken()
      const { data } = await api.post('/api/live/start', {}, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (data.success && data.stream?._id) {
        navigate(`/live/${data.stream._id}`, { state: { isHost: true } })
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setIsStartingLive(false)
    }
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
                <button
                  type='button'
                  onClick={handleStartLive}
                  disabled={isStartingLive}
                  className='btn-primary h-12 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60'
                >
                  {isStartingLive ? <LoaderCircle className='size-5 animate-spin' /> : <Radio className='size-5' />}
                  Livestream
                </button>
              </div>
              <div className='mt-5'>
                <StoriesBar refreshTrigger={location.state?.refresh}/>
              </div>
            </section>

            {activeLiveStreams.length > 0 && (
              <section className='mb-6 surface rounded-[1.5rem] p-4'>
                <div className='mb-3 flex items-center justify-between gap-3'>
                  <div>
                    <p className='page-kicker'>Đang trực tiếp</p>
                    <h2 className='text-lg font-black text-slate-950'>Livestream từ mạng lưới của bạn</h2>
                  </div>
                  <span className='rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600'>{activeLiveStreams.length} LIVE</span>
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  {activeLiveStreams.map((stream) => (
                    <button
                      key={stream._id}
                      type='button'
                      onClick={() => navigate(`/live/${stream._id}`)}
                      className='group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-200 hover:bg-cyan-50/50'
                    >
                      <div className='relative shrink-0'>
                        <img src={stream.user?.profile_picture} alt='' className='size-12 rounded-full object-cover avatar-ring' />
                        <span className='absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white'>LIVE</span>
                      </div>
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-black text-slate-950'>{stream.user?.full_name || stream.user?.username}</p>
                        <p className='truncate text-xs font-bold text-slate-500'>
                          {stream.title || 'Đang livestream'} · {moment(stream.started_at || stream.createdAt).fromNow()}
                        </p>
                      </div>
                      <Radio className='size-5 shrink-0 text-red-500 transition group-hover:scale-110' />
                    </button>
                  ))}
                </div>
              </section>
            )}

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
