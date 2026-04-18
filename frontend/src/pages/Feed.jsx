import React, { useEffect, useRef, useCallback } from 'react'
import { assets } from '../assets/assets'
import Loading from '../components/Loading'
import StoriesBar from '../components/StoriesBar'
import PostCard from '../components/PostCard'
import RecentMessages from '../components/RecentMessages'
import { useAuth } from '@clerk/clerk-react'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'
import { fetchPosts, deletePost, incrementPage } from '../features/posts/postSlice'

const Feed = () => {
  const location = useLocation()
  const dispatch = useDispatch()
  const { posts, loading, hasMore, page } = useSelector((state) => state.posts)
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

  return !loading ? (
    <div ref={feedRef} onScroll={handleScroll} className='h-full overflow-y-scroll py-10 xl:pr-5 flex items-start justify-center xl:gap-8'>
       <div>
        <StoriesBar refreshTrigger={location.state?.refresh}/>
        <div className='p-4 space-y-6'>
          {posts.map((post) => (
            <PostCard key={post._id} post={post} onPostDeleted={handlePostDeleted}/>
          ))}
          {!hasMore && posts.length > 0 && (
            <div className='text-center text-gray-500 py-8 text-sm'>
              No more posts to load
            </div>
          )}
        </div>
       </div>

       <div className='max-xl:hidden sticky top-0'>
        <div className='max-w-xs bg-white text-xs p-4 rounded-md inline-flex flex-col gap-2 shadow'>
          <h3 className='text-slate-800 font-semibold'>Sponsored</h3>
          <img src={assets.sponsored_img} className='w-75 h-50 rounded-md' alt="" />
          <p className='text-slate-600'>Email marketing</p>
          <p className='text-slate-400'>Supercharge your maketing with a powerfull, easy-to-use platform built for results.</p>
        </div>
        <RecentMessages/>
       </div>
    </div>
  ) : <Loading/>
}

export default Feed