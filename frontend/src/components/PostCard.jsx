import { BadgeCheck, Heart, MessageCircle, Share2, Trash2 } from 'lucide-react'
import moment from '../utils/moment'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { updateCommentCount } from '../features/posts/postSlice'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import toast from 'react-hot-toast'
import localizeMessage from '../utils/localization'
import ConfirmDialog from './ConfirmDialog'
import CommentModal from './CommentModal'
import ShareModal from './ShareModal'
import ReactionPicker from './ReactionPicker'
import ReactionListModal from './ReactionListModal'
import { REACTION_ICONS, REACTION_LABELS } from '../utils/reactions'

const withHashtags = (content = '') => content.replace(/(#\w+)/g, '<span class="text-cyan-700 font-semibold">$1</span>')

const PostCard = ({ post, onPostDeleted, autoOpenComments, targetCommentId }) => {

    const postWithHashtags = withHashtags(post.content)
    const [likes, setLikes] = useState(Array.isArray(post.likes_count) ? post.likes_count : [])
    const [reactions, setReactions] = useState(post.reactions || [])
    const [shares, setShares] = useState(post.shares_count || [])
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showCommentModal, setShowCommentModal] = useState(autoOpenComments || false)
    const [showShareModal, setShowShareModal] = useState(false)
    const [showReactionList, setShowReactionList] = useState(false)

    useEffect(() => {
        if (autoOpenComments) setShowCommentModal(true)
    }, [autoOpenComments])

    const commentCount = post.total_comments_count ?? post.comments?.length ?? 0
    const currentUser = useSelector((state) => state.user.value)
    const dispatch = useDispatch()

    const { getToken } = useAuth()
    const navigate = useNavigate()
    const isOwner = post.user._id === currentUser._id

    const handleReact = async (reactionType) => {
        try {
            const { data } = await api.post('/api/post/react', { postId: post._id, reactionType }, { headers: { Authorization: `Bearer ${await getToken()}` } })
            if (data.success) {
                setReactions(data.reactions)
                setLikes(prev => prev.filter(id => id !== currentUser._id))
            } else {
                toast(localizeMessage(data.message))
            }
        } catch (error) {
            toast.error(localizeMessage(error.message))
        }
    }

    const reactionCounts = reactions.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1
        return acc
    }, {})

    let oldLikesCount = 0
    if (likes && likes.length > 0) {
        const usersInReactions = new Set(reactions.map(r => r.user?._id || r.user))
        oldLikesCount = likes.filter(userId => !usersInReactions.has(userId)).length
        if (oldLikesCount > 0) reactionCounts.like = (reactionCounts.like || 0) + oldLikesCount
    }

    const topReactions = Object.entries(reactionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => entry[0])

    const totalReactions = reactions.length + oldLikesCount

    const currentUserReactionObj = reactions.find(r =>
        (r.user?._id || r.user) === currentUser._id
    )
    const currentUserReaction = currentUserReactionObj
        ? currentUserReactionObj.type
        : (likes.includes(currentUser._id) ? 'like' : null)

    const handleDelete = async () => {
        try {
            setIsDeleting(true)
            const token = await getToken()
            const { data } = await api.post('/api/post/delete', { postId: post._id }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (data.success) {
                toast.success('Xóa bài viết thành công')
                setShowDeleteConfirm(false)
                onPostDeleted && onPostDeleted(post._id)
            } else {
                toast.error(localizeMessage(data.message))
            }
        } catch (error) {
            toast.error(localizeMessage(error.message))
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <article className='surface w-full max-w-2xl rounded-[1.6rem] p-4 space-y-4 sm:p-5'>
            <div className='flex items-center justify-between'>
                <div onClick={() => navigate('/profile/' + post.user._id)} className='inline-flex min-w-0 items-center gap-3 cursor-pointer'>
                    <img src={post.user.profile_picture} alt='' className='w-11 h-11 rounded-full object-cover avatar-ring' />
                    <div className='min-w-0'>
                        <div className='flex items-center gap-1'>
                            <span className='truncate font-bold text-slate-950'>{post.user.full_name}</span>
                            <BadgeCheck className='w-4 h-4 text-cyan-500 shrink-0' />
                        </div>
                        <div className='text-slate-500 text-sm truncate'>@{post.user.username} · {moment(post.createdAt).fromNow()}</div>
                    </div>
                </div>
                {isOwner && (
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isDeleting}
                        className='text-slate-400 hover:text-red-500 transition disabled:opacity-50 cursor-pointer'
                        title='Xóa bài viết'
                    >
                        <Trash2 className='w-5 h-5' />
                    </button>
                )}
            </div>

            {post.content && <div className='text-slate-800 text-[15px] leading-7 whitespace-pre-line' dangerouslySetInnerHTML={{ __html: postWithHashtags }} />}

            {post.video_url && (
                <video src={post.video_url} controls className='w-full h-auto rounded-2xl bg-black' />
            )}

            {post.image_urls && post.image_urls.length > 0 && (
                <div className='grid grid-cols-2 gap-2'>
                    {post.image_urls.map((img, index) => (
                        <img src={img} key={index} className={`w-full h-52 object-cover rounded-2xl ${post.image_urls.length === 1 && 'col-span-2 h-auto min-h-[300px] max-h-[34rem]'}`} alt='' />
                    ))}
                </div>
            )}

            {post.shared_from && post.shared_from.user && (
                <div className='surface-soft rounded-2xl p-3 mt-2'>
                    <div onClick={() => navigate('/profile/' + post.shared_from.user._id)} className='inline-flex items-center gap-2 cursor-pointer mb-2'>
                        <img src={post.shared_from.user.profile_picture} alt='' className='w-9 h-9 rounded-full object-cover avatar-ring' />
                        <div>
                            <div className='flex items-center gap-1 text-sm'>
                                <span className='font-bold text-slate-900'>{post.shared_from.user.full_name}</span>
                                <BadgeCheck className='w-3 h-3 text-cyan-500' />
                            </div>
                            <div className='text-slate-500 text-xs'>@{post.shared_from.user.username}</div>
                        </div>
                    </div>
                    {post.shared_from.content && <div className='text-slate-800 text-sm whitespace-pre-line' dangerouslySetInnerHTML={{ __html: withHashtags(post.shared_from.content) }} />}
                    {post.shared_from.video_url && (
                        <video src={post.shared_from.video_url} controls className='w-full h-auto rounded-2xl bg-black mt-2' />
                    )}
                    {post.shared_from.image_urls && post.shared_from.image_urls.length > 0 && (
                        <div className='grid grid-cols-2 gap-2 mt-2'>
                            {post.shared_from.image_urls.map((img, index) => (
                                <img src={img} key={index} className={`w-full h-32 object-cover rounded-xl ${post.shared_from.image_urls.length === 1 && 'col-span-2 h-auto min-h-[200px]'}`} alt='' />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className='flex items-center justify-between text-slate-600 text-sm pt-3 border-t border-slate-200'>
                <div className='flex items-center gap-2'>
                    <div className='group relative flex items-center gap-1 cursor-pointer'>
                        <div className='absolute bottom-full left-0 pb-2 hidden group-hover:block z-20'>
                            <ReactionPicker onReact={handleReact} currentReaction={currentUserReaction} />
                        </div>
                        <button type='button' onClick={() => handleReact('like')} className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 transition hover:bg-cyan-50 hover:text-cyan-700 cursor-pointer ${currentUserReaction ? 'text-cyan-700' : ''}`}>
                            {currentUserReaction ? (
                                <span className='text-xl leading-none'>{REACTION_ICONS[currentUserReaction]}</span>
                            ) : (
                                <Heart className={`w-4 h-4 ${likes.includes(currentUser._id) && 'text-red-500 fill-red-500'}`} />
                            )}
                            <span className='capitalize'>{REACTION_LABELS[currentUserReaction] || 'Thích'}</span>
                        </button>
                    </div>

                    <button type='button' className='flex items-center gap-1 rounded-full px-2.5 py-1.5 cursor-pointer transition hover:bg-cyan-50 hover:text-cyan-700' onClick={() => setShowCommentModal(true)}>
                        <MessageCircle className='w-4 h-4' />
                        <span>{commentCount}</span>
                    </button>
                    <button type='button' className='flex items-center gap-1 rounded-full px-2.5 py-1.5 cursor-pointer transition hover:bg-cyan-50 hover:text-cyan-700' onClick={() => setShowShareModal(true)}>
                        <Share2 className='w-4 h-4' />
                        <span>{shares.length}</span>
                    </button>
                </div>

                {totalReactions > 0 && (
                    <button
                        type='button'
                        className='flex items-center gap-1 cursor-pointer hover:underline'
                        onClick={() => setShowReactionList(true)}
                    >
                        <span className='flex -space-x-1'>
                            {topReactions.map((type, idx) => (
                                <span key={type} className='text-sm bg-white rounded-full z-10' style={{ zIndex: 3 - idx }}>
                                    {REACTION_ICONS[type]}
                                </span>
                            ))}
                        </span>
                        <span>{totalReactions}</span>
                    </button>
                )}
            </div>

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                title='Xóa bài viết'
                message='Bạn có chắc chắn muốn xóa bài viết này không? Hành động này không thể hoàn tác.'
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
        </article>
    )
}

export default PostCard
