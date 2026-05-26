import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, EyeOff, Flag, MessageCircle, MoreVertical, SendHorizonal, SmilePlus, Trash2, X } from 'lucide-react'
import moment from '../../utils/moment'
import { useSelector } from 'react-redux'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import ConfirmDialog from './ConfirmDialog'
import ReactionPicker from './ReactionPicker'
import ReactionListModal from './ReactionListModal'
import { REACTION_ICONS, REACTION_LABELS } from '../../utils/reactions'

const getReactionSummary = (reactions = []) => {
    const counts = reactions.reduce((acc, reaction) => {
        acc[reaction.type] = (acc[reaction.type] || 0) + 1
        return acc
    }, {})

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type]) => type)
}

const getId = (value) => value?._id?.toString?.() || value?.toString?.() || ''

const prependUniqueById = (items = [], item) => {
    const itemId = getId(item)
    if (!itemId) return items
    return items.some((currentItem) => getId(currentItem) === itemId)
        ? items
        : [item, ...items]
}

const CommentModal = ({ isOpen, onClose, post, onCommentAdded, onReplyAdded, onTotalCount, onCountChange }) => {
    const [comments, setComments] = useState([])
    const [newComment, setNewComment] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingComments, setIsLoadingComments] = useState(false)
    const [expandedReplies, setExpandedReplies] = useState({})
    const [replyCommentId, setReplyCommentId] = useState(null)
    const [replyText, setReplyText] = useState('')
    const [replies, setReplies] = useState({})
    const [deleteTarget, setDeleteTarget] = useState(null)
    const [commentPage, setCommentPage] = useState(1)
    const [hasMoreComments, setHasMoreComments] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [reactionMenuId, setReactionMenuId] = useState(null)
    const [showReactionListMsg, setShowReactionListMsg] = useState(null)
    const [openCommentMenuId, setOpenCommentMenuId] = useState(null)
    const [commentActionLoadingId, setCommentActionLoadingId] = useState('')

    const currentUser = useSelector((state) => state.user.value)
    const { getToken } = useAuth()
    const { socketRef, socket } = useSocket()
    const navigate = useNavigate()

    useEffect(() => {
        if (!openCommentMenuId) return undefined

        const closeMenu = () => setOpenCommentMenuId(null)
        document.addEventListener('click', closeMenu)
        return () => document.removeEventListener('click', closeMenu)
    }, [openCommentMenuId])

    const fetchComments = useCallback(async (pageNum = 1) => {
        try {
            if (pageNum === 1) setIsLoadingComments(true)
            else setIsLoadingMore(true)

            const token = await getToken()
            const { data } = await api.get(`/api/post/comment/${post._id}`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { page: pageNum, limit: 10 }
            })

            if (data.success) {
                setComments(pageNum === 1 ? data.comments : (prev) => [...prev, ...data.comments])
                setHasMoreComments(data.hasMore !== false)
                setCommentPage(pageNum)
                if (Number.isFinite(data.totalCommentsCount)) onTotalCount?.(data.totalCommentsCount)
            }
        } catch {
            toast.error('Không thể tải bình luận')
        } finally {
            setIsLoadingComments(false)
            setIsLoadingMore(false)
        }
    }, [getToken, onTotalCount, post?._id])

    useEffect(() => {
        if (isOpen && post?._id) {
            setCommentPage(1)
            setComments([])
            setHasMoreComments(true)
            fetchComments()
        }
    }, [fetchComments, isOpen, post?._id])

    useEffect(() => {
        const activeSocket = socket || socketRef?.current
        if (!isOpen || !activeSocket || !post?._id) return undefined

        const postId = post._id.toString()

        const isCurrentPost = (payload) => payload?.postId?.toString?.() === postId || payload?.postId === postId
        const isOwnAction = (payload) => getId(payload?.actorId) === getId(currentUser)

        const handleCommentCreated = (payload) => {
            if (!isCurrentPost(payload) || !payload.comment) return

            setComments((prev) => prependUniqueById(prev, payload.comment))

            if (!isOwnAction(payload)) onCountChange?.(1)
            if (Number.isFinite(payload.totalCommentsCount)) onTotalCount?.(payload.totalCommentsCount)
        }

        const handleReplyCreated = (payload) => {
            if (!isCurrentPost(payload) || !payload.reply || !payload.parentCommentId) return

            setComments((prev) => prev.map((comment) => {
                if (getId(comment) !== getId(payload.parentCommentId)) return comment
                const currentReplies = comment.replies || []
                const nextReplies = prependUniqueById(currentReplies, payload.reply)
                return nextReplies === currentReplies ? comment : { ...comment, replies: nextReplies }
            }))

            setReplies((prev) => {
                const currentReplies = prev[payload.parentCommentId] || []
                const nextReplies = prependUniqueById(currentReplies, payload.reply)
                if (nextReplies === currentReplies) return prev
                return {
                    ...prev,
                    [payload.parentCommentId]: nextReplies
                }
            })

            if (!isOwnAction(payload)) onCountChange?.(1)
            if (Number.isFinite(payload.totalCommentsCount)) onTotalCount?.(payload.totalCommentsCount)
        }

        const handleCommentDeleted = (payload) => {
            if (!isCurrentPost(payload)) return

            setComments((prev) => prev.filter((comment) => getId(comment) !== getId(payload.commentId)))
            setReplies((prev) => {
                const next = { ...prev }
                delete next[payload.commentId]
                return next
            })

            if (Number.isFinite(payload.totalCommentsCount)) onTotalCount?.(payload.totalCommentsCount)
        }

        const handleReplyDeleted = (payload) => {
            if (!isCurrentPost(payload) || !payload.parentCommentId) return

            setReplies((prev) => ({
                ...prev,
                [payload.parentCommentId]: (prev[payload.parentCommentId] || []).filter((reply) => getId(reply) !== getId(payload.replyId))
            }))
            setComments((prev) => prev.map((comment) => (
                getId(comment) === getId(payload.parentCommentId)
                    ? { ...comment, replies: (comment.replies || []).filter((reply) => getId(reply) !== getId(payload.replyId)) }
                    : comment
            )))

            if (Number.isFinite(payload.totalCommentsCount)) onTotalCount?.(payload.totalCommentsCount)
        }

        const handleCommentReactionUpdated = (payload) => {
            if (!isCurrentPost(payload) || !payload.commentId) return

            if (payload.parentCommentId) {
                setReplies((prev) => ({
                    ...prev,
                    [payload.parentCommentId]: (prev[payload.parentCommentId] || []).map((reply) => (
                        getId(reply) === getId(payload.commentId) ? { ...reply, reactions: payload.reactions || [] } : reply
                    ))
                }))
                return
            }

            setComments((prev) => prev.map((comment) => (
                getId(comment) === getId(payload.commentId) ? { ...comment, reactions: payload.reactions || [] } : comment
            )))
        }

        activeSocket.on('post-comment-created', handleCommentCreated)
        activeSocket.on('post-reply-created', handleReplyCreated)
        activeSocket.on('post-comment-deleted', handleCommentDeleted)
        activeSocket.on('post-reply-deleted', handleReplyDeleted)
        activeSocket.on('comment-reaction-updated', handleCommentReactionUpdated)

        return () => {
            activeSocket.off('post-comment-created', handleCommentCreated)
            activeSocket.off('post-reply-created', handleReplyCreated)
            activeSocket.off('post-comment-deleted', handleCommentDeleted)
            activeSocket.off('post-reply-deleted', handleReplyDeleted)
            activeSocket.off('comment-reaction-updated', handleCommentReactionUpdated)
        }
    }, [currentUser, isOpen, onCountChange, onTotalCount, post?._id, socket, socketRef])

    const fetchReplies = async (commentId) => {
        if (replies[commentId]) return

        try {
            const token = await getToken()
            const { data } = await api.get(`/api/post/reply/${commentId}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (data.success) {
                setReplies(prev => ({ ...prev, [commentId]: data.replies }))
            }
        } catch {
            toast.error('Không thể tải phản hồi')
        }
    }

    const toggleReplies = (commentId) => {
        setExpandedReplies(prev => ({ ...prev, [commentId]: !prev[commentId] }))
        if (!expandedReplies[commentId]) fetchReplies(commentId)
    }

    const handleCommentsScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target
        if (scrollHeight - scrollTop - clientHeight < 200 && hasMoreComments && !isLoadingMore && !isLoadingComments) {
            fetchComments(commentPage + 1)
        }
    }

    const handleAddComment = async (e) => {
        e.preventDefault()
        if (!newComment.trim()) return toast.error('Bình luận không thể để trống')

        try {
            setIsLoading(true)
            const token = await getToken()
            const { data } = await api.post(
                '/api/post/comment/add',
                { postId: post._id, content: newComment.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            )

            if (data.success) {
                setComments((prev) => prependUniqueById(prev, data.comment))
                setNewComment('')
                toast.success('Bình luận đã được thêm')
                if (Number.isFinite(data.totalCommentsCount)) onTotalCount?.(data.totalCommentsCount)
                else onCommentAdded?.()
            }
        } catch {
            toast.error('Không thể thêm bình luận')
        } finally {
            setIsLoading(false)
        }
    }

    const handleAddReply = async (e, commentId) => {
        e.preventDefault()
        if (!replyText.trim()) return toast.error('Phản hồi không thể để trống')

        try {
            setIsLoading(true)
            const token = await getToken()
            const { data } = await api.post(
                '/api/post/reply/add',
                { commentId, content: replyText.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            )

            if (data.success) {
                setReplies(prev => {
                    const currentReplies = prev[commentId] || []
                    const nextReplies = prependUniqueById(currentReplies, data.reply)
                    if (nextReplies === currentReplies) return prev
                    return {
                        ...prev,
                        [commentId]: nextReplies
                    }
                })
                setComments(prev => prev.map(c => (
                    getId(c) === getId(commentId)
                        ? { ...c, replies: prependUniqueById(c.replies || [], data.reply) }
                        : c
                )))
                setExpandedReplies(prev => ({ ...prev, [commentId]: true }))
                setReplyCommentId(null)
                setReplyText('')
                toast.success('Phản hồi đã được thêm')
                if (Number.isFinite(data.totalCommentsCount)) onTotalCount?.(data.totalCommentsCount)
                else onReplyAdded?.()
            }
        } catch {
            toast.error('Không thể thêm phản hồi')
        } finally {
            setIsLoading(false)
        }
    }

    const handleReactComment = async (commentId, type, isReply, parentCommentId) => {
        try {
            const token = await getToken()
            const { data } = await api.post(
                '/api/post/comment/react',
                { commentId, reactionType: type },
                { headers: { Authorization: `Bearer ${token}` } }
            )

            if (!data.success) return

            if (isReply) {
                setReplies(prev => ({
                    ...prev,
                    [parentCommentId]: (prev[parentCommentId] || []).map(reply => (
                        reply._id === commentId ? { ...reply, reactions: data.reactions } : reply
                    ))
                }))
            } else {
                setComments(prev => prev.map(comment => (
                    comment._id === commentId ? { ...comment, reactions: data.reactions } : comment
                )))
            }
            setReactionMenuId(null)
        } catch {
            toast.error('Không thể thả cảm xúc')
        }
    }

    const removeCommentFromView = (commentId, isReply, parentCommentId) => {
        if (isReply) {
            setReplies(prev => ({
                ...prev,
                [parentCommentId]: (prev[parentCommentId] || []).filter(reply => getId(reply) !== getId(commentId))
            }))
            setComments(prev => prev.map(comment => (
                getId(comment) === getId(parentCommentId)
                    ? { ...comment, replies: (comment.replies || []).filter(reply => getId(reply) !== getId(commentId)) }
                    : comment
            )))
            return
        }

        setComments(prev => prev.filter(comment => getId(comment) !== getId(commentId)))
        setReplies(prev => {
            const next = { ...prev }
            delete next[commentId]
            return next
        })
    }

    const handleHideComment = async (comment, isReply, parentCommentId) => {
        const commentId = getId(comment)
        if (!commentId) return

        try {
            setOpenCommentMenuId(null)
            setCommentActionLoadingId(commentId)
            const token = await getToken()
            const { data } = await api.post(
                '/api/post/comment/hide',
                { commentId },
                { headers: { Authorization: `Bearer ${token}` } }
            )

            if (data.success) {
                removeCommentFromView(commentId, isReply, parentCommentId)
                if (Number.isFinite(data.totalCommentsCount)) onTotalCount?.(data.totalCommentsCount)
                else onCountChange?.(-1)
                toast.success('Đã ẩn bình luận')
            } else {
                toast.error(data.message || 'Không thể ẩn bình luận')
            }
        } catch {
            toast.error('Không thể ẩn bình luận')
        } finally {
            setCommentActionLoadingId('')
        }
    }

    const handleReportComment = async (commentId) => {
        if (!commentId) return

        try {
            setOpenCommentMenuId(null)
            setCommentActionLoadingId(commentId)
            const token = await getToken()
            const { data } = await api.post(
                `/api/report/comment/${commentId}`,
                { reason: 'other', details: 'Báo cáo bình luận' },
                { headers: { Authorization: `Bearer ${token}` } }
            )

            if (data.success) {
                toast.success(data.message === 'Report already pending' ? 'Bạn đã báo cáo bình luận này' : 'Đã gửi báo cáo')
            } else {
                toast.error(data.message || 'Không thể gửi báo cáo')
            }
        } catch {
            toast.error('Không thể gửi báo cáo')
        } finally {
            setCommentActionLoadingId('')
        }
    }

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return

        try {
            setIsLoading(true)
            const token = await getToken()

            if (deleteTarget.type === 'comment') {
                const { data } = await api.post(
                    '/api/post/comment/delete',
                    { commentId: deleteTarget.id },
                    { headers: { Authorization: `Bearer ${token}` } }
                )
                if (data.success) {
                    setComments(prev => prev.filter(c => c._id !== deleteTarget.id))
                    toast.success('Đã xóa bình luận')
                }
            } else {
                const { data } = await api.post(
                    '/api/post/reply/delete',
                    { replyId: deleteTarget.id },
                    { headers: { Authorization: `Bearer ${token}` } }
                )
                if (data.success) {
                    setReplies(prev => ({
                        ...prev,
                        [deleteTarget.commentId]: (prev[deleteTarget.commentId] || []).filter(r => r._id !== deleteTarget.id)
                    }))
                    setComments(prev => prev.map(c => (
                        c._id === deleteTarget.commentId
                            ? { ...c, replies: (c.replies || []).filter(r => r._id !== deleteTarget.id) }
                            : c
                    )))
                    toast.success('Đã xóa phản hồi')
                }
            }
        } catch {
            toast.error('Không thể xóa')
        } finally {
            setIsLoading(false)
            setDeleteTarget(null)
        }
    }

    const openProfile = (userId) => {
        navigate(`/profile/${userId}`)
        onClose()
    }

    const CommentItem = ({ comment, isReply = false, parentCommentId = null }) => {
        const reactionMenuOpen = reactionMenuId === comment._id
        const reactions = comment.reactions || []
        const currentReaction = reactions.find(r => (r.user?._id || r.user) === currentUser?._id)?.type
        const topReactions = getReactionSummary(reactions)
        const canDelete = comment.user?._id === currentUser?._id
        const menuOpen = openCommentMenuId === comment._id
        const isActionLoading = commentActionLoadingId === comment._id

        return (
            <article className={`rounded-2xl border border-slate-200 bg-white p-4 ${isReply ? 'ml-8' : ''}`}>
                <div className='flex gap-3'>
                    <img
                        src={comment.user?.profile_picture}
                        alt=''
                        className='size-10 rounded-full object-cover avatar-ring cursor-pointer'
                        onClick={() => openProfile(comment.user?._id)}
                    />
                    <div className='min-w-0 flex-1'>
                        <div className='flex items-start justify-between gap-3'>
                            <button type='button' className='min-w-0 text-left cursor-pointer' onClick={() => openProfile(comment.user?._id)}>
                                <h4 className='truncate text-sm font-black text-slate-900 hover:text-cyan-700'>{comment.user?.full_name}</h4>
                                <p className='text-xs text-slate-500'>@{comment.user?.username}</p>
                            </button>
                            <div className='relative shrink-0' onClick={(event) => event.stopPropagation()}>
                                <button
                                    type='button'
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        setOpenCommentMenuId(menuOpen ? null : comment._id)
                                    }}
                                    className={`rounded-full p-1.5 transition cursor-pointer ${menuOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-900'}`}
                                    title='Tác vụ bình luận'
                                >
                                    <MoreVertical className='size-4'/>
                                </button>
                                {menuOpen && (
                                    <div className='absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl'>
                                        <button
                                            type='button'
                                            onClick={() => handleHideComment(comment, isReply, parentCommentId)}
                                            disabled={isActionLoading}
                                            className='flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50'
                                        >
                                            <EyeOff className='size-4'/>
                                            Ẩn bình luận
                                        </button>
                                        <button
                                            type='button'
                                            onClick={() => handleReportComment(comment._id)}
                                            disabled={isActionLoading}
                                            className='flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50'
                                        >
                                            <Flag className='size-4'/>
                                            Báo cáo
                                        </button>
                                        {canDelete && (
                                            <button
                                                type='button'
                                                onClick={() => {
                                                    setOpenCommentMenuId(null)
                                                    setDeleteTarget({ type: isReply ? 'reply' : 'comment', id: comment._id, commentId: parentCommentId })
                                                }}
                                                className='flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-rose-600 transition hover:bg-rose-50'
                                            >
                                                <Trash2 className='size-4'/>
                                                Xóa
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <p className='mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700'>{comment.content}</p>

                        <div className='mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500'>
                            <span>{moment(comment.createdAt).fromNow()}</span>

                            <div className='relative'>
                                <button
                                    type='button'
                                    onClick={() => setReactionMenuId(reactionMenuOpen ? null : comment._id)}
                                    className={`flex items-center gap-1 font-bold transition hover:text-cyan-700 cursor-pointer ${currentReaction ? 'text-cyan-700' : ''}`}
                                >
                                    <SmilePlus className='size-4'/>
                                    <span>{currentReaction ? REACTION_LABELS[currentReaction] : 'Cảm xúc'}</span>
                                </button>
                                {reactionMenuOpen && (
                                    <div className='absolute bottom-full left-0 z-50 mb-2'>
                                        <ReactionPicker
                                            onReact={(type) => handleReactComment(comment._id, type, isReply, parentCommentId)}
                                            currentReaction={currentReaction}
                                        />
                                    </div>
                                )}
                            </div>

                            {!isReply && (
                                <button type='button' onClick={() => setReplyCommentId(comment._id)} className='font-bold transition hover:text-cyan-700 cursor-pointer'>
                                    Phản hồi
                                </button>
                            )}

                            {reactions.length > 0 && (
                                <button
                                    type='button'
                                    className='flex items-center gap-1 hover:underline cursor-pointer'
                                    onClick={() => setShowReactionListMsg(comment)}
                                >
                                    <span className='flex -space-x-1'>
                                        {topReactions.map((type) => (
                                            <span key={type} className='rounded-full bg-white text-xs'>{REACTION_ICONS[type]}</span>
                                        ))}
                                    </span>
                                    <span>{reactions.length}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </article>
        )
    }

    if (!isOpen || !post) return null

    return createPortal(
        <div className='fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm'>
            <div className='surface flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem]'>
                <header className='flex items-center justify-between border-b border-slate-200 px-6 py-5'>
                    <div>
                        <p className='page-kicker'>Bình luận</p>
                        <h2 className='mt-1 text-2xl font-black text-slate-900'>Bài viết của {post.user.full_name}</h2>
                    </div>
                    <button onClick={onClose} className='rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer'>
                        <X className='size-6' />
                    </button>
                </header>

                <div className='flex min-h-0 flex-1 flex-col md:flex-row'>
                    <aside className='max-h-[34vh] w-full overflow-y-auto border-b border-slate-200 bg-slate-50/80 p-6 md:max-h-none md:w-2/5 md:border-b-0 md:border-r'>
                        <div className='mb-4 flex gap-4 cursor-pointer' onClick={() => openProfile(post.user._id)}>
                            <img src={post.user.profile_picture} alt='' className='size-12 rounded-full object-cover avatar-ring' />
                            <div>
                                <h3 className='font-black text-slate-900 hover:text-cyan-700'>{post.user.full_name}</h3>
                                <p className='text-sm text-slate-500'>@{post.user.username}</p>
                            </div>
                        </div>

                        {post.content && <p className='mb-4 whitespace-pre-line text-sm leading-7 text-slate-700'>{post.content}</p>}
                        {post.video_url && <video src={post.video_url} controls className='mb-4 w-full max-h-64 rounded-2xl bg-black object-contain' />}
                        {post.image_urls?.length > 0 && (
                            <div className={`grid gap-2 ${post.image_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                {post.image_urls.map((img, idx) => (
                                    <img key={idx} src={img} alt='' className='max-h-64 w-full rounded-2xl object-cover' />
                                ))}
                            </div>
                        )}
                    </aside>

                    <section className='flex min-h-0 flex-1 flex-col'>
                        <div className='flex-1 overflow-y-auto px-5 py-5' onScroll={handleCommentsScroll}>
                            {isLoadingComments ? (
                                <div className='flex h-48 items-center justify-center'>
                                    <div className='h-8 w-8 animate-spin rounded-full border-3 border-cyan-600 border-t-transparent'/>
                                </div>
                            ) : comments.length === 0 ? (
                                <div className='flex min-h-72 flex-col items-center justify-center rounded-3xl bg-slate-50 text-center'>
                                    <MessageCircle className='mb-3 size-10 text-slate-300'/>
                                    <p className='text-sm font-bold text-slate-500'>Chưa có bình luận. Hãy là người đầu tiên!</p>
                                </div>
                            ) : (
                                <div className='space-y-4'>
                                    {comments.map((comment) => (
                                        <div key={comment._id} className='space-y-3'>
                                            <CommentItem comment={comment} />

                                            {replyCommentId === comment._id && (
                                                <form onSubmit={(e) => handleAddReply(e, comment._id)} className='ml-8 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3'>
                                                    <textarea
                                                        value={replyText}
                                                        onChange={(e) => setReplyText(e.target.value)}
                                                        placeholder='Viết phản hồi...'
                                                        className='input-modern min-h-20 resize-none px-4 py-3 text-sm'
                                                        disabled={isLoading}
                                                    />
                                                    <div className='mt-2 flex justify-end gap-2'>
                                                        <button type='button' onClick={() => { setReplyCommentId(null); setReplyText('') }} className='btn-muted px-4 py-2 text-xs cursor-pointer'>Hủy</button>
                                                        <button type='submit' disabled={isLoading || !replyText.trim()} className='btn-primary px-4 py-2 text-xs disabled:opacity-50 cursor-pointer'>Phản hồi</button>
                                                    </div>
                                                </form>
                                            )}

                                            {comment.replies?.length > 0 && (
                                                <div className='ml-8'>
                                                    <button onClick={() => toggleReplies(comment._id)} className='mb-3 flex items-center gap-1 text-xs font-bold text-cyan-700 hover:text-cyan-800 cursor-pointer'>
                                                        {expandedReplies[comment._id] ? <ChevronUp className='size-4' /> : <ChevronDown className='size-4' />}
                                                        {expandedReplies[comment._id] ? 'Ẩn' : 'Hiện'} phản hồi ({comment.replies.length})
                                                    </button>
                                                    {expandedReplies[comment._id] && replies[comment._id] && (
                                                        <div className='space-y-3'>
                                                            {replies[comment._id].map((reply) => (
                                                                <CommentItem key={reply._id} comment={reply} isReply={true} parentCommentId={comment._id} />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {isLoadingMore && (
                                        <div className='flex justify-center py-4'>
                                            <div className='h-6 w-6 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent'/>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleAddComment} className='border-t border-slate-200 bg-slate-50/80 p-4'>
                            <div className='flex gap-3'>
                                <img src={currentUser?.profile_picture} alt='' className='size-10 rounded-full object-cover avatar-ring'/>
                                <div className='flex-1'>
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder='Thêm bình luận...'
                                        className='input-modern min-h-20 resize-none px-4 py-3 text-sm'
                                        disabled={isLoading}
                                    />
                                    <div className='mt-2 flex justify-end'>
                                        <button type='submit' disabled={isLoading || !newComment.trim()} className='btn-primary px-5 py-2.5 text-sm disabled:opacity-50 cursor-pointer'>
                                            <SendHorizonal className='size-4'/>
                                            Gửi
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </section>
                </div>
            </div>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                title={deleteTarget?.type === 'reply' ? 'Xóa phản hồi' : 'Xóa bình luận'}
                message='Bạn có chắc chắn muốn xóa nội dung này? Hành động này không thể hoàn tác.'
                isDangerous={true}
                isLoading={isLoading}
                onConfirm={handleConfirmDelete}
                onCancel={() => setDeleteTarget(null)}
            />

            <ReactionListModal
                isOpen={!!showReactionListMsg}
                onClose={() => setShowReactionListMsg(null)}
                reactions={showReactionListMsg?.reactions || []}
            />
        </div>,
        document.body
    )
}

export default CommentModal
