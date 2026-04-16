import React from 'react'
import { BadgeCheck } from 'lucide-react'
import moment from 'moment'
import { useNavigate } from 'react-router-dom'

const SharedPostPreview = ({ post }) => {
  const navigate = useNavigate()

  if (!post) return null

  const postWithHashtags = (post.content || '').replace(/(#\w+)/g, '<span class="text-indigo-600">$1</span>')

  return (
    <div className='bg-white rounded-lg border border-gray-200 p-4 space-y-3'>
      {/* Header */}
      <div className='flex items-center justify-between gap-3'>
        <div 
          onClick={() => navigate('/profile/' + post.user._id)} 
          className='inline-flex items-center gap-2 cursor-pointer flex-1'
        >
          <img src={post.user.profile_picture} alt="" className='w-10 h-10 rounded-full shadow'/>
          <div>
            <div className='flex items-center space-x-1'>
              <span className='font-semibold text-sm'>{post.user.full_name}</span>
              <BadgeCheck className='w-4 h-4 text-blue-500'/>
            </div>
            <div className='text-gray-500 text-xs'>@{post.user.username} ● {moment(post.createdAt).fromNow()}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <div 
          className='text-gray-800 text-sm whitespace-pre-line' 
          dangerouslySetInnerHTML={{__html: postWithHashtags}}
        />
      )}

      {/* Video */}
      {post.video_url && (
        <video
          src={post.video_url}
          controls
          className='w-full h-auto rounded-lg bg-black'
        />
      )}

      {/* Images */}
      {post.image_urls && post.image_urls.length > 0 && (
        <div className='grid grid-cols-2 gap-2'>
          {post.image_urls.map((img, index) => (
            <img 
              key={index} 
              src={img} 
              className={`w-full h-48 object-cover rounded-lg ${post.image_urls.length === 1 && 'col-span-2 h-auto'}`} 
              alt="shared post" 
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default SharedPostPreview
