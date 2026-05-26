import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Loading from '../../components/user/Loading'
import UserProfileInfo from '../../components/user/UserProfileInfo'
import PostCard from '../../components/user/PostCard'
import moment from '../../utils/moment'
import ProfileModal from '../../components/user/ProfileModal'
import ChangePasswordModal from '../../components/user/ChangePasswordModal'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import localizeMessage from '../../utils/localization'

const Profile = () => {

  const currentUser = useSelector((state)=>state.user.value)
  const {getToken} = useAuth()
  const {profileId} = useParams()
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [activeTab, setActiveTab] = useState('bài viết')
  const [showEdit, setShowEdit] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const fetchUser = useCallback(async(targetProfileId) => {
    const token = await getToken()
    try {
      const { data } = await api.post('/api/user/profiles', {profileId: targetProfileId}, {
        headers: {Authorization: `Bearer ${token}`}
      })
      if(data.success) {
        setUser(data.profile)
        setPosts(data.posts)
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
        toast.error(localizeMessage(error.message))
    }
  }, [getToken])

  useEffect(()=>{
    const targetProfileId = profileId || currentUser?._id
    if(targetProfileId){
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchUser(targetProfileId)
    }
  },[profileId, currentUser?._id, fetchUser])

  const handleProfileUpdated = (updatedUser) => {
    setUser(updatedUser)
    setPosts((prevPosts) => prevPosts.map((post) => (
      post.user?._id === updatedUser._id
        ? {...post, user: {...post.user, ...updatedUser}}
        : post
    )))
  }

  const handlePostDeleted = (postId) => {
    setPosts(posts.filter(post => post._id !== postId))
  }

  if(!user) return <Loading/>

  return (
    <div className='app-page relative h-full overflow-y-scroll'>
      <div className='app-container max-w-5xl'>
        <div className='surface overflow-hidden rounded-[2rem]'>
          <div className='h-48 md:h-72 bg-[linear-gradient(135deg,#0f172a,#0e7490,#0f766e)]'>
            {user.cover_photo && <img src={user.cover_photo} alt='' className='w-full h-full object-cover'/>}
          </div>

          <UserProfileInfo user={user} posts={posts} profileId={profileId} setShowEdit={setShowEdit} setShowChangePassword={setShowChangePassword}/>
        </div>

        <div className='mt-6'>
          <div className='surface mx-auto flex max-w-md rounded-2xl p-1'>
            {['bài viết', 'phương tiện', 'lượt thích'].map((tab)=>(
              <button onClick={()=>setActiveTab(tab)} key={tab} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition cursor-pointer
                ${activeTab === tab ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'bài viết' && (
            <div className='mt-6 flex flex-col items-center gap-6'>
              {posts.map((post)=><PostCard key={post._id} post={post} onPostDeleted={handlePostDeleted}/>)}
            </div>
          )}

          {activeTab === 'phương tiện' && (
            <div className='mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
              {posts.filter((post)=>post.image_urls.length > 0).map((post)=>(
                <React.Fragment key={post._id}>
                  {post.image_urls.map((image, index)=>(
                    <Link target='_blank' to={image} key={index} className='relative group overflow-hidden rounded-2xl surface'>
                      <img src={image} alt='' className='w-full aspect-video object-cover transition group-hover:scale-105'/>
                      <p className='absolute bottom-2 right-2 rounded-full bg-black/50 px-3 py-1 text-xs text-white opacity-0 backdrop-blur-xl transition duration-300 group-hover:opacity-100'>
                        Đã đăng {moment(post.createdAt).fromNow()}
                      </p>
                    </Link>
                  ))}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
      {showEdit && <ProfileModal setShowEdit={setShowEdit} onUserUpdated={handleProfileUpdated}/>}
      {showChangePassword && <ChangePasswordModal setShowChangePassword={setShowChangePassword}/>}
    </div>
  )
}

export default Profile
