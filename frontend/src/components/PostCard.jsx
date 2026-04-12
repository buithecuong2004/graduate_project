import { BadgeCheck, Heart, MessageCircle, Share2, Trash2 } from 'lucide-react'
import moment from 'moment'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { updateCommentCount } from '../features/posts/postSlice'
import { useAuth } from '@clerk/clerk-react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import ConfirmDialog from './ConfirmDialog'
import CommentModal from './CommentModal'

const PostCard = ({post, onPostDeleted}) => {

    const postWithHashtags = post.content.replace(/(#\w+)/g, '<span class="text-indigo-600">$1</span>')
    const [likes, setLikes] = useState(post.likes_count)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showCommentModal, setShowCommentModal] = useState(false)
    const commentCount = post.total_comments_count ?? post.comments?.length ?? 0
    const currentUser = useSelector((state)=>state.user.value)
    const dispatch = useDispatch()

    const { getToken } = useAuth()
    const navigate = useNavigate()
    const isOwner = post.user._id === currentUser._id

    const handleLike = async() => {
        try {
            const {data} = await api.post('/api/post/like',{postId: post._id}, {headers: {Authorization: `Bearer ${await getToken()}`}})
            if (data.success) {
                toast.success(data.message)
                setLikes(prev=>{
                    if(prev.includes(currentUser._id)) {
                        return prev.filter(id=> id != currentUser._id)
                    } else {
                        return [...prev, currentUser._id]
                    }
                })
            } else {
                toast(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    const handleDelete = async () => {
        try {
            setIsDeleting(true)
            const token = await getToken()
            const {data} = await api.post('/api/post/delete', {postId: post._id}, {
                headers: {Authorization: `Bearer ${token}`}
            })
            if(data.success) {
                toast.success('Post deleted successfully')
                setShowDeleteConfirm(false)
                onPostDeleted && onPostDeleted(post._id)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setIsDeleting(false)
        }
    }

    const handleDeleteClick = () => {
        setShowDeleteConfirm(true)
    }

  return (
    <div className='bg-white rounded-xl shadow p-4 space-y-4 w-full max-w-2xl'>
        <div className='flex items-center justify-between'>
            <div onClick={()=>navigate('/profile/' + post.user._id)} className='inline-flex items-center gap-3 cursor-pointer'>
                <img src={post.user.profile_picture} alt="" className='w-10 h-10 rounded-full shadow'/>
                <div>
                    <div className='flex items-center space-x-1'>
                        <span>{post.user.full_name}</span>
                        <BadgeCheck className='w-4 h-4 text-blue-500'/>
                    </div>
                    <div className='text-gray-500 text-sm'>@{post.user.username} ● {moment(post.createdAt).fromNow()}</div>
                </div>
            </div>
            {isOwner && (
                <button
                    onClick={handleDeleteClick}
                    disabled={isDeleting}
                    className='text-gray-400 hover:text-red-500 transition disabled:opacity-50'
                    title='Delete post'
                >
                    <Trash2 className='w-5 h-5'/>
                </button>
            )}
        </div>

        {post.content && <div className='text-gray-800 text-sm whitespace-pre-line' dangerouslySetInnerHTML={{__html: postWithHashtags}}/>}

        {post.video_url && (
            <video
                src={post.video_url}
                controls
                className='w-full h-auto rounded-lg bg-black'
            />
        )}

        {post.image_urls && post.image_urls.length > 0 && (
            <div className='grid grid-cols-2 gap-2'>
                {post.image_urls.map((img, index)=>(
                    <img src={img} key={index} className={`w-full h-48 object-cover rounded-lg ${post.image_urls.length === 1 && 'col-span-2 h-auto'}`} alt="" />
                ))}
            </div>
        )}

        <div className='flex items-center gap-4 text-gray-600 text-sm pt-2 border-t border-gray-300'>
            <div className='flex items-center gap-1'>
                <Heart className={`w-4 h-4 cursor-pointer ${likes.includes(currentUser._id) && 'text-red-500 fill-red-500'}`} onClick={handleLike}/>
                <span>{likes.length}</span>
            </div>
            <div className='flex items-center gap-1 cursor-pointer hover:text-indigo-600' onClick={() => setShowCommentModal(true)}>
                <MessageCircle className='w-4 h-4'/>
                <span>{commentCount}</span>
            </div>
            <div className='flex items-center gap-1'>
                <Share2 className='w-4 h-4'/>
                <span>{7}</span>
            </div>
        </div>

        <ConfirmDialog
            isOpen={showDeleteConfirm}
            title="Delete Post"
            message="Are you sure you want to delete this post? This action cannot be undone."
            isDangerous={true}
            isLoading={isDeleting}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
        />

        <CommentModal
            isOpen={showCommentModal}
            onClose={() => setShowCommentModal(false)}
            post={post}
            onCommentAdded={() => dispatch(updateCommentCount({ postId: post._id, count: commentCount + 1 }))}
            onReplyAdded={() => dispatch(updateCommentCount({ postId: post._id, count: commentCount + 1 }))}
            onTotalCount={(total) => dispatch(updateCommentCount({ postId: post._id, count: total }))}
            onCountChange={(delta) => dispatch(updateCommentCount({ postId: post._id, count: commentCount + delta }))}
        />
    </div>
  )
}

export default PostCard