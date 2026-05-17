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

// Số bài viết mạng xã hội trước khi chèn bài gợi ý
const SUGGESTED_INJECT_INTERVAL = 5

/**
 * Xây dựng danh sách bài viết hiển thị, chèn bài gợi ý vào mỗi SUGGESTED_INJECT_INTERVAL bài.
 * Thuật toán:
 *   - Cứ mỗi N bài thường → chèn 1 bài gợi ý (nếu còn)
 *   - Mỗi bài gợi ý chỉ được chèn 1 lần duy nhất
 */
const buildInterleavedFeed = (posts, suggestedPosts) => {
  const result = []
  let suggestedIndex = 0

  posts.forEach((post, i) => {
    result.push({ type: 'post', data: post })

    // Sau mỗi SUGGESTED_INJECT_INTERVAL bài → chèn 1 bài gợi ý
    const isInjectionPoint = (i + 1) % SUGGESTED_INJECT_INTERVAL === 0
    if (isInjectionPoint && suggestedIndex < suggestedPosts.length) {
      result.push({ type: 'suggested', data: suggestedPosts[suggestedIndex] })
      suggestedIndex++
    }
  })

  return result
}

const SuggestedBadge = () => (
  <div className='flex items-center gap-1.5 mb-2'>
    <div className='flex items-center gap-1.5 bg-gradient-to-r from-violet-100 to-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full'>
      <Sparkles className='w-3 h-3' />
      <span>Gợi ý cho bạn</span>
    </div>
    <div className='flex-1 h-px bg-gradient-to-r from-indigo-100 to-transparent' />
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

  // Infinite scroll handler
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

  // Xây dựng feed xen kẽ (bài thường + bài gợi ý)
  const interleavedFeed = buildInterleavedFeed(posts, suggestedPosts || [])

  return (
    <div ref={feedRef} onScroll={handleScroll} className='h-full overflow-y-scroll py-10 xl:pr-5 flex items-start justify-center xl:gap-8'>
       <div className='w-full max-w-2xl'>
        <StoriesBar refreshTrigger={location.state?.refresh}/>
        <div className='space-y-6 pt-4'>
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
                  <div className='text-center text-gray-500 py-8 text-sm'>
                    Không còn bài viết để tải
                  </div>
                )}
              </>
          }
        </div>
       </div>

       <div className='max-xl:hidden sticky top-0'>
        <div className='max-w-xs bg-white text-xs p-4 rounded-md inline-flex flex-col gap-2 shadow'>
          <h3 className='text-slate-800 font-semibold'>Được tài trợ</h3>
          <img src={assets.sponsored_img} className='w-75 h-50 rounded-md' alt="" />
          <p className='text-slate-600'>Email Marketing</p>
          <p className='text-slate-400'>Tăng cường tiếp thị email của bạn với nền tảng mạnh mẽ, dễ sử dụng được xây dựng cho kết quả.</p>
        </div>
        <RecentMessages/>
       </div>
    </div>
  )
}

export default Feed