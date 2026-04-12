import React, { useEffect } from 'react'
import { assets } from '../assets/assets'
import Loading from '../components/Loading'
import StoriesBar from '../components/StoriesBar'
import PostCard from '../components/PostCard'
import RecentMessages from '../components/RecentMessages'
import { useAuth } from '@clerk/clerk-react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchPosts, deletePost } from '../features/posts/postSlice'

const Feed = () => {

  const dispatch = useDispatch()
  const { posts, loading } = useSelector((state) => state.posts)
  const { getToken } = useAuth()

  useEffect(() => {
    const load = async () => {
      const token = await getToken()
      dispatch(fetchPosts(token))
    }
    load()
  }, [])

  const handlePostDeleted = (postId) => {
    dispatch(deletePost(postId))
  }

  return !loading ? (
    <div className='h-full overflow-y-scroll no-scrollbar py-10 xl:pr-5 flex items-start justify-center xl:gap-8'>
       <div>
        <StoriesBar/>
        <div className='p-4 space-y-6'>
          {posts.map((post) => (
            <PostCard key={post._id} post={post} onPostDeleted={handlePostDeleted}/>
          ))}
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