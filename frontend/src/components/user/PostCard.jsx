import { BadgeCheck, EyeOff, Flag, MessageCircle, MoreVertical, Share2, ThumbsUp, Trash2 } from 'lucide-react'
import moment from '../../utils/moment'
import React, { useCallback, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { updateCommentCount } from '../../features/posts/postSlice'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import localizeMessage from '../../utils/localization'
import ConfirmDialog from './ConfirmDialog'
import CommentModal from './CommentModal'
import ShareModal from './ShareModal'
import ReactionPicker from './ReactionPicker'
import ReactionListModal from './ReactionListModal'
import { REACTION_ICONS, REACTION_LABELS } from '../../utils/reactions'
import { REPORT_REASON_OPTIONS } from '../../utils/reportReasons'
import VideoPlayer from './VideoPlayer'

// Module-level set so view signals are deduplicated across re-renders
const viewedPostIds = new Set()

const withHashtags = (content = '') => content.replace(/(#\w+)/g, '<span class="text-cyan-700 font-semibold">$1</span>')

const PostCard = ({ post, onPostDeleted, autoOpenComments, targetCommentId }) => {

    const postWithHashtags = withHashtags(post.content)
    const [likes, setLikes] = useState(Array.isArray(post.likes_count) ? post.likes_count : [])
    const [reactions, setReactions] = useState(post.reactions || [])
    const [shares, setShares] = useState(post.shares_count || [])
    const [commentCount, setCommentCount] = useState(post.total_comments_count ?? post.comments?.length ?? 0)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showCommentModal, setShowCommentModal] = useState(autoOpenComments || false)
    const [showShareModal, setShowShareModal] = useState(false)
    const [showReactionList, setShowReactionList] = useState(false)
    const [showReportForm, setShowReportForm] = useState(false)
    const [showPostMenu, setShowPostMenu] = useState(false)
    const [isLocallyHidden, setIsLocallyHidden] = useState(false)
    const [reportReason, setReportReason] = useState('spam')
    const [reportDetails, setReportDetails] = useState('')
    const [isReporting, setIsReporting] = useState(false)
    const [isHiding, setIsHiding] = useState(false)
    const onPostDeletedRef = useRef(onPostDeleted)
    const postMenuRef = useRef(null)

    useEffect(() => {
        if (autoOpenComments) setShowCommentModal(true)
    }, [autoOpenComments])

    const currentUser = useSelector((state) => state.user.value)
    const dispatch = useDispatch()

    const { getToken } = useAuth()
    const { socketRef, socket } = useSocket()
    const navigate = useNavigate()
    const isOwner = post.user._id === currentUser._id
    const articleRef = useRef(null)

    // ── View tracking ──────────────────────────────────────────────
    useEffect(() => {
        if (isOwner || !post._id || viewedPostIds.has(post._id)) return
        const el = articleRef.current
        if (!el) return

        let timer = null
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    timer = setTimeout(async () => {
                        if (viewedPostIds.has(post._id)) return
                        viewedPostIds.add(post._id)
                        try {
                            const token = await getToken()
                            await api.post('/api/post/view', { postId: post._id }, {
                                headers: { Authorization: `Bearer ${token}` }
                            })
                        } catch {
                            // Non-critical — ignore errors
                        }
                    }, 1500)
                } else {
                    clearTimeout(timer)
                }
            },
            { threshold: 0.5 }
        )

        observer.observe(el)
        return () => {
            observer.disconnect()
            clearTimeout(timer)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [post._id, isOwner])

    useEffect(() => {
        onPostDeletedRef.current = onPostDeleted
    }, [onPostDeleted])

    useEffect(() => {
        if (!showPostMenu) return undefined

        const handlePointerDown = (event) => {
            if (!postMenuRef.current?.contains(event.target)) setShowPostMenu(false)
        }

        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [showPostMenu])

    const setSyncedCommentCount = useCallback((count) => {
        const nextCount = Math.max(0, count)
        setCommentCount(nextCount)
        dispatch(updateCommentCount({ postId: post._id, count: nextCount }))
    }, [dispatch, post._id])

    const incrementSyncedCommentCount = useCallback((delta = 1) => {
        setCommentCount((currentCount) => {
            const nextCount = Math.max(0, currentCount + delta)
            dispatch(updateCommentCount({ postId: post._id, count: nextCount }))
            return nextCount
        })
    }, [dispatch, post._id])

    const handleCommentAdded = useCallback(() => {
        incrementSyncedCommentCount(1)
    }, [incrementSyncedCommentCount])

    useEffect(() => {
        setLikes(Array.isArray(post.likes_count) ? post.likes_count : [])
        setReactions(post.reactions || [])
        setShares(post.shares_count || [])
        setCommentCount(post.total_comments_count ?? post.comments?.length ?? 0)
    }, [post._id, post.likes_count, post.reactions, post.shares_count, post.total_comments_count, post.comments?.length])

    useEffect(() => {
        const activeSocket = socket || socketRef?.current
        if (!activeSocket || !post?._id) return undefined

        const postId = post._id.toString()
        activeSocket.emit('join-post', postId)

        const isCurrentPost = (payload) => payload?.postId?.toString?.() === postId || payload?.postId === postId

        const handleReactionUpdated = (payload) => {
            if (!isCurrentPost(payload)) return
            if (Array.isArray(payload.reactions)) setReactions(payload.reactions)
            if (Array.isArray(payload.likes_count)) setLikes(payload.likes_count)
        }

        const handleCommentCountUpdated = (payload) => {
            if (!isCurrentPost(payload) || !Number.isFinite(payload.totalCommentsCount)) return
            setSyncedCommentCount(payload.totalCommentsCount)
        }

        const handleShareUpdated = (payload) => {
            if (!isCurrentPost(payload) || !Array.isArray(payload.shares_count)) return
            setShares(payload.shares_count)
        }

        const handlePostDeleted = (payload) => {
            if (isCurrentPost(payload)) onPostDeletedRef.current?.(postId)
        }

        activeSocket.on('post-reaction-updated', handleReactionUpdated)
        activeSocket.on('post-comment-created', handleCommentCountUpdated)
        activeSocket.on('post-reply-created', handleCommentCountUpdated)
        activeSocket.on('post-comment-deleted', handleCommentCountUpdated)
        activeSocket.on('post-reply-deleted', handleCommentCountUpdated)
        activeSocket.on('post-share-updated', handleShareUpdated)
        activeSocket.on('post-deleted', handlePostDeleted)

        return () => {
            activeSocket.emit('leave-post', postId)
            activeSocket.off('post-reaction-updated', handleReactionUpdated)
            activeSocket.off('post-comment-created', handleCommentCountUpdated)
            activeSocket.off('post-reply-created', handleCommentCountUpdated)
            activeSocket.off('post-comment-deleted', handleCommentCountUpdated)
            activeSocket.off('post-reply-deleted', handleCommentCountUpdated)
            activeSocket.off('post-share-updated', handleShareUpdated)
            activeSocket.off('post-deleted', handlePostDeleted)
        }
    }, [post?._id, setSyncedCommentCount, socket, socketRef])

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

    const handleReportPost = async (e) => {
        e.preventDefault()

        try {
            setIsReporting(true)
            const token = await getToken()
            const { data } = await api.post(
                `/api/report/post/${post._id}`,
                { reason: reportReason, details: reportDetails.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            )

            if (data.success) {
                toast.success(data.message === 'Report already pending' ? 'Bạn đã báo cáo bài viết này' : 'Đã gửi báo cáo')
                setShowReportForm(false)
                setReportDetails('')
                setReportReason('spam')
            } else {
                toast.error(localizeMessage(data.message))
            }
        } catch (error) {
            toast.error(localizeMessage(error.message))
        } finally {
            setIsReporting(false)
        }
    }

    const handleHidePost = async () => {
        try {
            setShowPostMenu(false)
            setIsHiding(true)
            const token = await getToken()
            const { data } = await api.post('/api/post/hide', { postId: post._id }, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (data.success) {
                toast.success('Đã ẩn bài viết')
                setIsLocallyHidden(true)
                onPostDeleted?.(post._id)
            } else {
                toast.error(localizeMessage(data.message))
            }
        } catch (error) {
            toast.error(localizeMessage(error.message))
        } finally {
            setIsHiding(false)
        }
    }

    if (isLocallyHidden) return null

    return (
        <article ref={articleRef} className='surface w-full max-w-2xl rounded-[1.6rem] p-4 space-y-4 sm:p-5'>
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
                <div ref={postMenuRef} className='relative shrink-0'>
                    <button
                        type='button'
                        onClick={() => setShowPostMenu((value) => !value)}
                        className='rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
                        title='Tác vụ bài viết'
                    >
                        <MoreVertical className='w-5 h-5' />
                    </button>
                    {showPostMenu && (
                        <div className='absolute right-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl'>
                            {!isOwner && (
                                <button
                                    type='button'
                                    onClick={() => {
                                        setShowPostMenu(false)
                                        setShowReportForm(true)
                                    }}
                                    className='flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-slate-700 transition hover:bg-amber-50 hover:text-amber-700'
                                >
                                    <Flag className='size-4' />
                                    Báo cáo
                                </button>
                            )}
                            <button
                                type='button'
                                onClick={handleHidePost}
                                disabled={isHiding}
                                className='flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50'
                            >
                                <EyeOff className='size-4' />
                                Ẩn bài viết
                            </button>
                            {isOwner && (
                                <button
                                    type='button'
                                    onClick={() => {
                                        setShowPostMenu(false)
                                        setShowDeleteConfirm(true)
                                    }}
                                    disabled={isDeleting}
                                    className='flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50'
                                >
                                    <Trash2 className='size-4' />
                                    Xóa bài viết
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {post.content && <div className='text-slate-800 text-[15px] leading-7 whitespace-pre-line' dangerouslySetInnerHTML={{ __html: postWithHashtags }} />}

            {post.video_url && (
                <VideoPlayer
                    src={post.video_url}
                    controls
                    className='w-full rounded-2xl overflow-hidden bg-black'
                />
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
                        <VideoPlayer
                            src={post.shared_from.video_url}
                            controls
                            className='w-full rounded-2xl overflow-hidden bg-black mt-2'
                        />
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

            {showReportForm && (
                <form onSubmit={handleReportPost} className='border-t border-slate-200 pt-4'>
                    <div className='grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-start'>
                        <select
                            value={reportReason}
                            onChange={(e) => setReportReason(e.target.value)}
                            className='h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none'
                            disabled={isReporting}
                        >
                            {REPORT_REASON_OPTIONS.map((reason) => (
                                <option key={reason.value} value={reason.value}>{reason.label}</option>
                            ))}
                        </select>
                        <textarea
                            value={reportDetails}
                            onChange={(e) => setReportDetails(e.target.value)}
                            className='input-modern min-h-11 resize-none px-4 py-3 text-sm'
                            placeholder='Mô tả thêm nếu cần'
                            disabled={isReporting}
                        />
                        <div className='flex gap-2'>
                            <button type='button' onClick={() => setShowReportForm(false)} className='btn-muted px-4 py-2.5 text-sm cursor-pointer' disabled={isReporting}>Hủy</button>
                            <button type='submit' className='btn-primary px-4 py-2.5 text-sm cursor-pointer disabled:opacity-50' disabled={isReporting}>
                                <Flag className='size-4' />
                                Gửi
                            </button>
                        </div>
                    </div>
                </form>
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
                                <ThumbsUp className={`w-4 h-4 ${likes.includes(currentUser._id) ? 'text-cyan-700 fill-cyan-700' : ''}`} />
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
                    onCommentAdded={handleCommentAdded}
                    onReplyAdded={handleCommentAdded}
                    onTotalCount={setSyncedCommentCount}
                    onCountChange={incrementSyncedCommentCount}
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
