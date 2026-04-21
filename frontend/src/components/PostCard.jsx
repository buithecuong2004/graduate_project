import { BadgeCheck, Heart, MessageCircle, Share2, Trash2 } from 'lucide-react'
import moment from 'moment'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { updateCommentCount } from '../features/posts/postSlice'
import { useAuth } from '@clerk/clerk-react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import ConfirmDialog from './ConfirmDialog'
import CommentModal from './CommentModal'
import ShareModal from './ShareModal'
import ReactionPicker, { REACTION_ICONS } from './ReactionPicker'
import ReactionListModal from './ReactionListModal'

const PostCard = ({ post, onPostDeleted, autoOpenComments, targetCommentId }) => {

    const postWithHashtags = post.content.replace(/(#\w+)/g, '<span class="text-indigo-600">$1</span>')
    const [likes, setLikes] = useState(Array.isArray(post.likes_count) ? post.likes_count : [])
    const [reactions, setReactions] = useState(post.reactions || [])
    const [shares, setShares] = useState(post.shares_count || [])
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showCommentModal, setShowCommentModal] = useState(autoOpenComments || false)
    const [showShareModal, setShowShareModal] = useState(false)
    const [showReactionList, setShowReactionList] = useState(false)

    useEffect(() => {
        if (autoOpenComments) {
            setShowCommentModal(true)
        }
    }, [autoOpenComments])
    const commentCount = post.total_comments_count ?? post.comments?.length ?? 0
    const currentUser = useSelector((state) => state.user.value)
    const dispatch = useDispatch()

    const { getToken } = useAuth()
    const navigate = useNavigate()
    const isOwner = post.user._id === currentUser._id

    const handleLike = async () => {
        try {
            const { data } = await api.post('/api/post/like', { postId: post._id }, { headers: { Authorization: `Bearer ${await getToken()}` } })
            if (data.success) {
                // If it's a simple like, we still call the backend like API for legacy, 
                // but we also can just call reactPost with 'like'
                handleReact('like');
            } else {
                toast(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    const handleReact = async (reactionType) => {
        try {
            const { data } = await api.post('/api/post/react', { postId: post._id, reactionType }, { headers: { Authorization: `Bearer ${await getToken()}` } })
            if (data.success) {
                setReactions(data.reactions)
                setLikes(prev => prev.filter(id => id !== currentUser._id))
            } else {
                toast(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    // Reaction summary calculation
    const reactionCounts = reactions.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
    }, {});

    // Add old likes to 'like' count if they aren't already in reactions
    let oldLikesCount = 0;
    if (likes && likes.length > 0) {
        const usersInReactions = new Set(reactions.map(r => r.user?._id || r.user));
        oldLikesCount = likes.filter(userId => !usersInReactions.has(userId)).length;
        if (oldLikesCount > 0) {
            reactionCounts['like'] = (reactionCounts['like'] || 0) + oldLikesCount;
        }
    }

    // Get top 3 reactions for icons
    const topReactions = Object.entries(reactionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => entry[0]);

    const totalReactions = reactions.length + oldLikesCount;

    // Check if current user reacted (from new reactions array)
    const currentUserReactionObj = reactions.find(r =>
        (r.user?._id || r.user) === currentUser._id
    );
    // If not in reactions array, fallback to old likes array
    const currentUserReaction = currentUserReactionObj
        ? currentUserReactionObj.type
        : (likes.includes(currentUser._id) ? 'like' : null);

    const handleDelete = async () => {
        try {
            setIsDeleting(true)
            const token = await getToken()
            const { data } = await api.post('/api/post/delete', { postId: post._id }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (data.success) {
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
                <div onClick={() => navigate('/profile/' + post.user._id)} className='inline-flex items-center gap-3 cursor-pointer'>
                    <img src={post.user.profile_picture} alt="" className='w-10 h-10 rounded-full shadow' />
                    <div>
                        <div className='flex items-center space-x-1'>
                            <span>{post.user.full_name}</span>
                            <BadgeCheck className='w-4 h-4 text-blue-500' />
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
                        <Trash2 className='w-5 h-5' />
                    </button>
                )}
            </div>

            {post.content && <div className='text-gray-800 text-sm whitespace-pre-line' dangerouslySetInnerHTML={{ __html: postWithHashtags }} />}

            {post.video_url && (
                <video
                    src={post.video_url}
                    controls
                    className='w-full h-auto rounded-lg bg-black'
                />
            )}

            {post.image_urls && post.image_urls.length > 0 && (
                <div className='grid grid-cols-2 gap-2'>
                    {post.image_urls.map((img, index) => (
                        <img src={img} key={index} className={`w-full h-48 object-cover rounded-lg ${post.image_urls.length === 1 && 'col-span-2 h-auto'}`} alt="" />
                    ))}
                </div>
            )}

            {post.shared_from && post.shared_from.user && (
                <div className='bg-gray-50 border border-gray-200 rounded-lg p-3 mt-2'>
                    <div onClick={() => navigate('/profile/' + post.shared_from.user._id)} className='inline-flex items-center gap-2 cursor-pointer mb-2'>
                        <img src={post.shared_from.user.profile_picture} alt="" className='w-8 h-8 rounded-full shadow' />
                        <div>
                            <div className='flex items-center space-x-1 text-sm'>
                                <span className='font-semibold'>{post.shared_from.user.full_name}</span>
                                <BadgeCheck className='w-3 h-3 text-blue-500' />
                            </div>
                            <div className='text-gray-500 text-xs'>@{post.shared_from.user.username}</div>
                        </div>
                    </div>
                    {post.shared_from.content && <div className='text-gray-800 text-sm whitespace-pre-line' dangerouslySetInnerHTML={{ __html: post.shared_from.content.replace(/(#\w+)/g, '<span class="text-indigo-600">$1</span>') }} />}
                    {post.shared_from.video_url && (
                        <video
                            src={post.shared_from.video_url}
                            controls
                            className='w-full h-auto rounded-lg bg-black mt-2'
                        />
                    )}
                    {post.shared_from.image_urls && post.shared_from.image_urls.length > 0 && (
                        <div className='grid grid-cols-2 gap-2 mt-2'>
                            {post.shared_from.image_urls.map((img, index) => (
                                <img src={img} key={index} className={`w-full h-32 object-cover rounded-lg ${post.shared_from.image_urls.length === 1 && 'col-span-2 h-auto'}`} alt="" />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className='flex items-center justify-between text-gray-600 text-sm pt-2 border-t border-gray-300'>
                <div className='flex items-center gap-4'>
                    <div className='group relative flex items-center gap-1 cursor-pointer'>
                        {/* Hover Reaction Menu */}
                        <div className="absolute bottom-full left-0 pb-2 hidden group-hover:block z-20">
                            <ReactionPicker onReact={handleReact} currentReaction={currentUserReaction} />
                        </div>
                        {/* Like Button */}
                        <div onClick={() => handleReact('like')} className={`flex items-center gap-1 hover:text-indigo-600 ${currentUserReaction ? 'text-indigo-600' : ''}`}>
                            {currentUserReaction ? (
                                <span className="text-xl leading-none">{REACTION_ICONS[currentUserReaction]}</span>
                            ) : (
                                <Heart className={`w-4 h-4 ${likes.includes(currentUser._id) && 'text-red-500 fill-red-500'}`} />
                            )}
                            <span className="capitalize">{currentUserReaction || 'Like'}</span>
                        </div>
                    </div>

                    <div className='flex items-center gap-1 cursor-pointer hover:text-indigo-600' onClick={() => setShowCommentModal(true)}>
                        <MessageCircle className='w-4 h-4' />
                        <span>{commentCount}</span>
                    </div>
                    <div className='flex items-center gap-1 cursor-pointer hover:text-indigo-600' onClick={() => setShowShareModal(true)}>
                        <Share2 className='w-4 h-4' />
                        <span>{shares.length}</span>
                    </div>
                </div>

                {/* Reaction Summary */}
                {totalReactions > 0 && (
                    <div
                        className="flex items-center gap-1 cursor-pointer hover:underline"
                        onClick={() => setShowReactionList(true)}
                    >
                        <div className="flex -space-x-1">
                            {topReactions.map((type, idx) => (
                                <span key={type} className="text-sm bg-white rounded-full z-10" style={{ zIndex: 3 - idx }}>
                                    {REACTION_ICONS[type]}
                                </span>
                            ))}
                        </div>
                        <span>{totalReactions}</span>
                    </div>
                )}
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

            {showCommentModal && (
                <CommentModal
                    isOpen={showCommentModal}
                    onClose={() => setShowCommentModal(false)}
                    post={post}
                    targetCommentId={targetCommentId}
                    onCommentAdded={() => dispatch(updateCommentCount({ postId: post._id, count: commentCount + 1 }))}
                    onReplyAdded={() => dispatch(updateCommentCount({ postId: post._id, count: commentCount + 1 }))}
                    onTotalCount={(total) => dispatch(updateCommentCount({ postId: post._id, count: total }))}
                    onCountChange={(delta) => dispatch(updateCommentCount({ postId: post._id, count: commentCount + delta }))}
                />
            )}

            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                post={post}
                onShareAdded={() => setShares([...shares, currentUser._id])}
            />

            <ReactionListModal
                isOpen={showReactionList}
                onClose={() => setShowReactionList(false)}
                reactions={reactions}
            />
        </div>
    )
}

export default PostCard