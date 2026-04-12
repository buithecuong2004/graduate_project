import React, { useState, useEffect } from 'react'
import { X, Heart, ChevronDown, ChevronUp } from 'lucide-react'
import moment from 'moment'
import { useSelector } from 'react-redux'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import toast from 'react-hot-toast'
import ConfirmDialog from './ConfirmDialog'

const CommentModal = ({ isOpen, onClose, post, onCommentAdded, onReplyAdded, onTotalCount, onCountChange }) => {
    const [comments, setComments] = useState([])
    const [newComment, setNewComment] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingComments, setIsLoadingComments] = useState(false)
    const [expandedReplies, setExpandedReplies] = useState({})
    const [replyCommentId, setReplyCommentId] = useState(null)
    const [replyText, setReplyText] = useState('')
    const [replies, setReplies] = useState({})
    const [deleteTarget, setDeleteTarget] = useState(null) // { type: 'comment'|'reply', id, commentId? }
    const currentUser = useSelector((state) => state.user.value)
    const { getToken } = useAuth()
    const navigate = useNavigate()

    useEffect(() => {
        if (isOpen && post?._id) {
            fetchComments()
        }
    }, [isOpen, post?._id])

    const fetchComments = async () => {
        try {
            setIsLoadingComments(true)
            const token = await getToken()
            const { data } = await api.get(`/api/post/comment/${post._id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (data.success) {
                setComments(data.comments)
                const total = data.comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0)
                if (onTotalCount) onTotalCount(total)
            }
        } catch (error) {
            console.log('Error fetching comments:', error)
            toast.error('Failed to load comments')
        } finally {
            setIsLoadingComments(false)
        }
    }

    const fetchReplies = async (commentId) => {
        if (replies[commentId]) return

        try {
            const token = await getToken()
            const { data } = await api.get(`/api/post/reply/${commentId}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (data.success) {
                setReplies(prev => ({
                    ...prev,
                    [commentId]: data.replies
                }))
            }
        } catch (error) {
            console.log('Error fetching replies:', error)
        }
    }

    const toggleReplies = (commentId) => {
        setExpandedReplies(prev => ({
            ...prev,
            [commentId]: !prev[commentId]
        }))
        if (!expandedReplies[commentId]) {
            fetchReplies(commentId)
        }
    }

    const handleAddComment = async (e) => {
        e.preventDefault()
        if (!newComment.trim()) {
            toast.error('Comment cannot be empty')
            return
        }

        try {
            setIsLoading(true)
            const token = await getToken()
            const { data } = await api.post(
                '/api/post/comment/add',
                { postId: post._id, content: newComment },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (data.success) {
                setComments([data.comment, ...comments])
                setNewComment('')
                toast.success('Comment added')
                if(onCommentAdded) {
                    onCommentAdded()
                }
            }
        } catch (error) {
            console.log('Error adding comment:', error)
            toast.error('Failed to add comment')
        } finally {
            setIsLoading(false)
        }
    }

    const handleAddReply = async (e, commentId) => {
        e.preventDefault()
        if (!replyText.trim()) {
            toast.error('Reply cannot be empty')
            return
        }

        try {
            setIsLoading(true)
            const token = await getToken()
            const { data } = await api.post(
                '/api/post/reply/add',
                { commentId, content: replyText },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (data.success) {
                // Update replies state
                setReplies(prev => ({
                    ...prev,
                    [commentId]: [data.reply, ...(prev[commentId] || [])]
                }))
                
                // Also update the comments array to increment the replies count
                setComments(prev => prev.map(comment => {
                    if (comment._id === commentId) {
                        return {
                            ...comment,
                            replies: [...(comment.replies || []), data.reply._id]
                        }
                    }
                    return comment
                }))
                
                setReplyText('')
                setReplyCommentId(null)
                toast.success('Reply added')
                if (onReplyAdded) onReplyAdded()
            }
        } catch (error) {
            console.log('Error adding reply:', error)
            toast.error('Failed to add reply')
        } finally {
            setIsLoading(false)
        }
    }

    const handleLikeComment = async (commentId) => {
        try {
            const token = await getToken()
            const { data } = await api.post(
                '/api/post/comment/like',
                { commentId },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (data.success) {
                setComments(prev => prev.map(comment => {
                    if (comment._id !== commentId) return comment
                    const liked = comment.likes_count.includes(currentUser._id)
                    return {
                        ...comment,
                        likes_count: liked
                            ? comment.likes_count.filter(id => id !== currentUser._id)
                            : [...comment.likes_count, currentUser._id]
                    }
                }))
            }
        } catch (error) {
            toast.error('Failed to like comment')
        }
    }

    const handleLikeReply = async (replyId, commentId) => {
        try {
            const token = await getToken()
            const { data } = await api.post(
                '/api/post/comment/like',
                { commentId: replyId },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (data.success) {
                setReplies(prev => ({
                    ...prev,
                    [commentId]: (prev[commentId] || []).map(reply => {
                        if (reply._id !== replyId) return reply
                        const liked = reply.likes_count.includes(currentUser._id)
                        return {
                            ...reply,
                            likes_count: liked
                                ? reply.likes_count.filter(id => id !== currentUser._id)
                                : [...reply.likes_count, currentUser._id]
                        }
                    })
                }))
            }
        } catch (error) {
            toast.error('Failed to like reply')
        }
    }

    const handleDeleteComment = (commentId) => {
        setDeleteTarget({ type: 'comment', id: commentId })
    }

    const handleDeleteReply = (replyId, commentId) => {
        setDeleteTarget({ type: 'reply', id: replyId, commentId })
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
                    const deletedComment = comments.find(c => c._id === deleteTarget.id)
                    const replyCount = deletedComment?.replies?.length || 0
                    setComments(prev => prev.filter(c => c._id !== deleteTarget.id))
                    // Trừ: 1 comment + số reply của nó
                    if (onCountChange) onCountChange(-(1 + replyCount))
                    toast.success('Comment deleted')
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
                        [deleteTarget.commentId]: prev[deleteTarget.commentId].filter(r => r._id !== deleteTarget.id)
                    }))
                    setComments(prev => prev.map(comment => {
                        if (comment._id === deleteTarget.commentId) {
                            return { ...comment, replies: comment.replies.filter(r => r !== deleteTarget.id) }
                        }
                        return comment
                    }))
                    if (onCountChange) onCountChange(-1)
                    toast.success('Reply deleted')
                }
            }
        } catch (error) {
            toast.error('Failed to delete')
        } finally {
            setIsLoading(false)
            setDeleteTarget(null)
        }
    }

    const CommentItem = ({ comment, isReply = false }) => (
        <div className='border border-gray-200 rounded-lg p-4'>
            <div className='flex gap-3'>
                <img
                    src={comment.user?.profile_picture}
                    alt=""
                    className='w-10 h-10 rounded-full cursor-pointer hover:opacity-80'
                    onClick={() => {
                        navigate(`/profile/${comment.user?._id}`)
                        onClose()
                    }}
                />
                <div className='flex-1'>
                    <div className='flex items-center justify-between'>
                        <div
                            className='cursor-pointer hover:text-indigo-600'
                            onClick={() => {
                                navigate(`/profile/${comment.user?._id}`)
                                onClose()
                            }}
                        >
                            <h4 className='font-semibold text-sm'>{comment.user?.full_name}</h4>
                            <p className='text-xs text-gray-500'>@{comment.user?.username}</p>
                        </div>
                        {comment.user?._id === currentUser._id && (
                            <button
                                onClick={() => isReply ? handleDeleteReply(comment._id, comment.parent_comment_id) : handleDeleteComment(comment._id)}
                                className='text-xs text-red-500 hover:text-red-600'
                            >
                                Delete
                            </button>
                        )}
                    </div>
                    <p className='text-gray-800 text-sm mt-2'>{comment.content}</p>
                    <div className='flex items-center gap-4 mt-2 text-xs text-gray-500'>
                        <span>{moment(comment.createdAt).fromNow()}</span>
                        <button
                            onClick={() => isReply ? handleLikeReply(comment._id, comment.parent_comment_id) : handleLikeComment(comment._id)}
                            className='flex items-center gap-1 hover:text-indigo-600'
                        >
                            <Heart
                                className={`w-4 h-4 ${
                                    comment.likes_count?.includes(currentUser._id)
                                        ? 'text-red-500 fill-red-500'
                                        : ''
                                }`}
                            />
                            <span>{comment.likes_count?.length || 0}</span>
                        </button>
                        {!isReply && (
                            <button
                                onClick={() => setReplyCommentId(comment._id)}
                                className='hover:text-indigo-600'
                            >
                                Reply
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )

    if (!isOpen || !post) return null

    return (
        <div className='fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
            <div className='bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col'>
                {/* Header */}
                <div className='flex items-center justify-between p-6 border-b border-gray-200'>
                    <h2 className='text-xl font-semibold'>Post of {post.user.full_name}</h2>
                    <button
                        onClick={onClose}
                        className='text-gray-400 hover:text-gray-600 p-1'
                    >
                        <X className='w-6 h-6' />
                    </button>
                </div>

                {/* Post Content */}
                <div className='p-6 border-b border-gray-200'>
                    <div className='flex gap-4 mb-4 cursor-pointer'
                        onClick={() => {
                            navigate(`/profile/${post.user._id}`)
                            onClose()
                        }}
                    >
                        <img src={post.user.profile_picture} alt="" className='w-12 h-12 rounded-full hover:opacity-80' />
                        <div>
                            <h3 className='font-semibold hover:text-indigo-600'>{post.user.full_name}</h3>
                            <p className='text-sm text-gray-500'>@{post.user.username}</p>
                        </div>
                    </div>
                    {post.content && (
                        <p className='text-gray-800 mb-4 whitespace-pre-line'>{post.content}</p>
                    )}
                    {post.video_url && (
                        <video src={post.video_url} controls className='w-full h-auto rounded-lg bg-black mb-4' />
                    )}
                    {post.image_urls && post.image_urls.length > 0 && (
                        <div className='grid grid-cols-2 gap-2 mb-4'>
                            {post.image_urls.map((img, idx) => (
                                <img key={idx} src={img} alt="" className='w-full h-48 object-cover rounded-lg' />
                            ))}
                        </div>
                    )}
                </div>

                {/* Comments Section */}
                <div className='flex-1 overflow-y-auto px-6 py-4'>
                    {isLoadingComments ? (
                        <div className='flex justify-center items-center h-32'>
                            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600'></div>
                        </div>
                    ) : comments.length === 0 ? (
                        <p className='text-center text-gray-500 py-8'>No comments yet. Be the first to comment!</p>
                    ) : (
                        <div className='space-y-4'>
                            {comments.map((comment) => (
                                <div key={comment._id}>
                                    <CommentItem comment={comment} />
                                    
                                    {/* Reply Input */}
                                    {replyCommentId === comment._id && (
                                        <form onSubmit={(e) => handleAddReply(e, comment._id)} className='mt-3 ml-6 border-l-2 border-indigo-200 pl-4'>
                                            <div className='flex gap-2'>
                                                <img src={currentUser?.profile_picture} alt="" className='w-8 h-8 rounded-full' />
                                                <div className='flex-1'>
                                                    <textarea
                                                        value={replyText}
                                                        onChange={(e) => setReplyText(e.target.value)}
                                                        placeholder='Write a reply...'
                                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-none'
                                                        rows="2"
                                                        disabled={isLoading}
                                                    />
                                                    <div className='flex justify-end gap-2 mt-2'>
                                                        <button
                                                            type='button'
                                                            onClick={() => {
                                                                setReplyCommentId(null)
                                                                setReplyText('')
                                                            }}
                                                            className='px-3 py-1 text-gray-600 rounded hover:bg-gray-100'
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type='submit'
                                                            disabled={isLoading || !replyText.trim()}
                                                            className='px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50'
                                                        >
                                                            {isLoading ? 'Replying...' : 'Reply'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </form>
                                    )}

                                    {/* Replies Section */}
                                    {comment.replies && comment.replies.length > 0 && (
                                        <div className='mt-3 ml-6 border-l-2 border-gray-200 pl-4'>
                                            <button
                                                onClick={() => toggleReplies(comment._id)}
                                                className='flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 mb-3'
                                            >
                                                {expandedReplies[comment._id] ? (
                                                    <>
                                                        <ChevronUp className='w-4 h-4' />
                                                        Hide replies ({comment.replies.length})
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronDown className='w-4 h-4' />
                                                        Show replies ({comment.replies.length})
                                                    </>
                                                )}
                                            </button>

                                            {expandedReplies[comment._id] && replies[comment._id] && (
                                                <div className='space-y-3'>
                                                    {replies[comment._id].map((reply) => (
                                                        <CommentItem key={reply._id} comment={reply} isReply={true} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Comment Input */}
                <div className='border-t border-gray-200 p-4'>
                    <form onSubmit={handleAddComment} className='flex gap-3'>
                        <img
                            src={currentUser?.profile_picture}
                            alt=""
                            className='w-10 h-10 rounded-full'
                        />
                        <div className='flex-1'>
                            <textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder='Add a comment...'
                                className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-none'
                                rows="2"
                                disabled={isLoading}
                            />
                            <div className='flex justify-end mt-2'>
                                <button
                                    type='submit'
                                    disabled={isLoading || !newComment.trim()}
                                    className='px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium'
                                >
                                    {isLoading ? 'Posting...' : 'Post'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                title={deleteTarget?.type === 'reply' ? 'Delete Reply' : 'Delete Comment'}
                message={deleteTarget?.type === 'reply'
                    ? 'Are you sure you want to delete this reply? This action cannot be undone.'
                    : 'Are you sure you want to delete this comment? This action cannot be undone.'}
                isDangerous={true}
                isLoading={isLoading}
                onConfirm={handleConfirmDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    )
}

export default CommentModal