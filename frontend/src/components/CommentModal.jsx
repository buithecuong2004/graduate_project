import React, { useState, useEffect } from 'react'
import { X, Heart, ChevronDown, ChevronUp, SmilePlus } from 'lucide-react'
import moment from 'moment'
import { useSelector } from 'react-redux'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import toast from 'react-hot-toast'
import ConfirmDialog from './ConfirmDialog'
import ReactionPicker, { REACTION_ICONS } from './ReactionPicker'
import ReactionListModal from './ReactionListModal'

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
    const commentsRef = React.useRef(null)
    const currentUser = useSelector((state) => state.user.value)
    const { getToken } = useAuth()
    const navigate = useNavigate()
    const [showReactionListMsg, setShowReactionListMsg] = useState(null)

    useEffect(() => {
        if (isOpen && post?._id) {
            setCommentPage(1)
            setComments([])
            setHasMoreComments(true)
            fetchComments()
        }
    }, [isOpen, post?._id])

    const fetchComments = async (pageNum = 1) => {
        try {
            if (pageNum === 1) setIsLoadingComments(true)
            else setIsLoadingMore(true)
            
            const token = await getToken()
            const { data } = await api.get(`/api/post/comment/${post._id}`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { page: pageNum, limit: 10 }
            })
            
            if (data.success) {
                if (pageNum === 1) {
                    setComments(data.comments)
                } else {
                    setComments(prev => [...prev, ...data.comments])
                }
                setHasMoreComments(data.hasMore !== false)
                setCommentPage(pageNum)
                const total = data.comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0)
                if (onTotalCount) onTotalCount(total)
            }
        } catch (error) {
            console.log('Error fetching comments:', error)
            toast.error('Failed to load comments')
        } finally {
            setIsLoadingComments(false)
            setIsLoadingMore(false)
        }
    }

    const handleCommentsScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target
        if (scrollHeight - scrollTop - clientHeight < 200 && hasMoreComments && !isLoadingMore && !isLoadingComments) {
            fetchComments(commentPage + 1)
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
                if(onCommentAdded) onCommentAdded()
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
                setReplies(prev => ({
                    ...prev,
                    [commentId]: [data.reply, ...(prev[commentId] || [])]
                }))
                
                setComments(prev =>
                    prev.map(c =>
                        c._id === commentId
                            ? { ...c, replies: [data.reply, ...(c.replies || [])] }
                            : c
                    )
                )
                
                setReplyCommentId(null)
                setReplyText('')
                toast.success('Reply added')
                if(onReplyAdded) onReplyAdded()
                if(onCountChange) onCountChange(1)
            }
        } catch (error) {
            console.log('Error adding reply:', error)
            toast.error('Failed to add reply')
        } finally {
            setIsLoading(false)
        }
    }

    const handleLikeComment = async (commentId) => {
        const alreadyLiked = comments.find(c => c._id === commentId)?.likes_count?.includes(currentUser._id)

        // Optimistic update ngay lập tức, không chờ API
        setComments(prev =>
            prev.map(c =>
                c._id === commentId
                    ? {
                        ...c,
                        likes_count: alreadyLiked
                            ? c.likes_count.filter(id => id !== currentUser._id)
                            : [...(c.likes_count || []), currentUser._id]
                      }
                    : c
            )
        )

        try {
            const token = await getToken()
            await api.post(
                '/api/post/comment/like',
                { commentId },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            // Không sync lại từ server — optimistic đã đúng
        } catch (error) {
            // Rollback về trạng thái cũ nếu API lỗi
            setComments(prev =>
                prev.map(c =>
                    c._id === commentId
                        ? {
                            ...c,
                            likes_count: alreadyLiked
                                ? [...(c.likes_count || []), currentUser._id]
                                : c.likes_count.filter(id => id !== currentUser._id)
                          }
                        : c
                )
            )
            toast.error('Failed to like comment')
        }
    }

    const handleReactComment = async (commentId, type) => {
        try {
            const token = await getToken()
            const { data } = await api.post(
                '/api/post/comment/react',
                { commentId, reactionType: type },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (data.success) {
                setComments(prev =>
                    prev.map(c => c._id === commentId ? { 
                        ...c, 
                        reactions: data.reactions,
                        likes_count: c.likes_count?.filter(id => id !== currentUser._id) || []
                    } : c)
                )
            }
        } catch (error) {
            toast.error('Failed to react')
        }
    }

    const handleLikeReply = async (replyId, commentId) => {
        const alreadyLiked = replies[commentId]?.find(r => r._id === replyId)?.likes_count?.includes(currentUser._id)

        // Optimistic update ngay lập tức, không chờ API
        setReplies(prev => ({
            ...prev,
            [commentId]: (prev[commentId] || []).map(r =>
                r._id === replyId
                    ? {
                        ...r,
                        likes_count: alreadyLiked
                            ? r.likes_count.filter(id => id !== currentUser._id)
                            : [...(r.likes_count || []), currentUser._id]
                      }
                    : r
            )
        }))

        try {
            const token = await getToken()
            await api.post(
                '/api/post/comment/like',
                { commentId: replyId },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            // Không sync lại từ server — optimistic đã đúng
        } catch (error) {
            // Rollback về trạng thái cũ nếu API lỗi
            setReplies(prev => ({
                ...prev,
                [commentId]: (prev[commentId] || []).map(r =>
                    r._id === replyId
                        ? {
                            ...r,
                            likes_count: alreadyLiked
                                ? [...(r.likes_count || []), currentUser._id]
                                : r.likes_count.filter(id => id !== currentUser._id)
                          }
                        : r
                )
            }))
            toast.error('Failed to like reply')
        }
    }

    const handleReactReply = async (replyId, commentId, type) => {
        try {
            const token = await getToken()
            const { data } = await api.post(
                '/api/post/comment/react',
                { commentId: replyId, reactionType: type },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (data.success) {
                setReplies(prev => ({
                    ...prev,
                    [commentId]: (prev[commentId] || []).map(r => r._id === replyId ? { 
                        ...r, 
                        reactions: data.reactions,
                        likes_count: r.likes_count?.filter(id => id !== currentUser._id) || []
                    } : r)
                }))
            }
        } catch (error) {
            toast.error('Failed to react')
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
                    setComments(prev => prev.filter(c => c._id !== deleteTarget.id))
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
                    setComments(prev =>
                        prev.map(c =>
                            c._id === deleteTarget.commentId
                                ? { ...c, replies: c.replies.filter(r => r._id !== deleteTarget.id) }
                                : c
                        )
                    )
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
                    className='w-10 h-10 rounded-full cursor-pointer hover:opacity-80 flex-shrink-0'
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
                        
                        <div className='relative group/reaction pb-2 mb-[-8px] pt-2 mt-[-8px]'>
                            <button
                                className='flex items-center gap-1 hover:text-indigo-600 text-gray-400'
                            >
                                <SmilePlus className={`w-4 h-4 ${comment.reactions?.some(r => (r.user?._id || r.user) === currentUser?._id) ? 'text-indigo-600' : ''}`} />
                            </button>
                            {/* Hover Reaction Picker */}
                            <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 invisible group-hover/reaction:opacity-100 group-hover/reaction:visible transition-all duration-200 z-50'>
                                <ReactionPicker 
                                    onReact={(type) => isReply ? handleReactReply(comment._id, comment.parent_comment_id, type) : handleReactComment(comment._id, type)} 
                                    currentReaction={comment.reactions?.find(r => (r.user?._id || r.user) === currentUser?._id)?.type}
                                />
                            </div>
                        </div>

                        {!isReply && (
                            <button
                                onClick={() => setReplyCommentId(comment._id)}
                                className='hover:text-indigo-600 font-medium'
                            >
                                Reply
                            </button>
                        )}
                        
                        {/* Reaction Display */}
                        {comment.reactions && comment.reactions.length > 0 && (
                            <div 
                                className='flex items-center cursor-pointer hover:underline text-gray-500'
                                onClick={() => setShowReactionListMsg(comment)}
                            >
                                <div className="flex -space-x-1 mr-1">
                                    {Object.entries(
                                        comment.reactions.reduce((acc, r) => {
                                            acc[r.type] = (acc[r.type] || 0) + 1;
                                            return acc;
                                        }, {})
                                    ).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type], idx) => (
                                        <span key={type} className="text-[12px] bg-white rounded-full z-10" style={{zIndex: 3-idx}}>
                                            {REACTION_ICONS[type]}
                                        </span>
                                    ))}
                                </div>
                                <span>{comment.reactions.length}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )

    if (!isOpen || !post) return null

    return (
        <div className='fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
            <div className='bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[90vh] flex flex-col'>
                {/* Header */}
                <div className='flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0'>
                    <h2 className='text-xl font-semibold'>Post of {post.user.full_name}</h2>
                    <button
                        onClick={onClose}
                        className='text-gray-400 hover:text-gray-600 p-1'
                    >
                        <X className='w-6 h-6' />
                    </button>
                </div>

                {/* Main Content Area - Two Column */}
                <div className='flex flex-col md:flex-row flex-1 min-h-0'>
                    {/* Post Content - Left Side (40%) */}
                    <div className='w-full md:w-2/5 border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto p-6 flex flex-col md:max-h-full max-h-[35vh]'>
                        {/* Post Header */}
                        <div className='flex gap-4 mb-4 cursor-pointer'
                            onClick={() => {
                                navigate(`/profile/${post.user._id}`)
                                onClose()
                            }}
                        >
                            <img src={post.user.profile_picture} alt="" className='w-12 h-12 rounded-full hover:opacity-80 flex-shrink-0' />
                            <div>
                                <h3 className='font-semibold hover:text-indigo-600'>{post.user.full_name}</h3>
                                <p className='text-sm text-gray-500'>@{post.user.username}</p>
                            </div>
                        </div>

                        {/* Post Content */}
                        {post.content && (
                            <p className='text-gray-800 mb-4 whitespace-pre-line text-sm leading-relaxed'>{post.content}</p>
                        )}

                        {/* Post Video */}
                        {post.video_url && (
                            <video src={post.video_url} controls className='w-full max-h-64 object-contain rounded-lg bg-black mb-4' />
                        )}

                        {/* Post Images */}
                        {post.image_urls && post.image_urls.length > 0 && (
                            <div className={`grid gap-2 mb-4 ${post.image_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                {post.image_urls.map((img, idx) => (
                                    <img key={idx} src={img} alt="" className='w-full h-auto max-h-64 object-cover rounded-lg' />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Comments Section - Right Side (60%) */}
                    <div className='w-full md:w-3/5 flex flex-col min-h-0'>
                        {/* Comments List */}
                        <div className='flex-1 overflow-y-auto px-6 py-4' ref={commentsRef} onScroll={handleCommentsScroll}>
                            {isLoadingComments ? (
                                <div className='flex justify-center items-center h-32'>
                                    <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600'></div>
                                </div>
                            ) : comments.length === 0 ? (
                                <p className='text-center text-gray-500 py-8 text-sm'>No comments yet. Be the first!</p>
                            ) : (
                                <div className='space-y-4'>
                                    {comments.map((comment) => (
                                        <div key={comment._id}>
                                            <CommentItem comment={comment} />
                                            
                                            {/* Reply Input */}
                                            {replyCommentId === comment._id && (
                                                <form onSubmit={(e) => handleAddReply(e, comment._id)} className='mt-3 ml-6 border-l-2 border-indigo-200 pl-4'>
                                                    <div className='flex gap-2'>
                                                        <img src={currentUser?.profile_picture} alt="" className='w-8 h-8 rounded-full flex-shrink-0' />
                                                        <div className='flex-1'>
                                                            <textarea
                                                                value={replyText}
                                                                onChange={(e) => setReplyText(e.target.value)}
                                                                placeholder='Write a reply...'
                                                                className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-none text-sm'
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
                                                                    className='px-3 py-1 text-gray-600 rounded hover:bg-gray-100 text-xs'
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    type='submit'
                                                                    disabled={isLoading || !replyText.trim()}
                                                                    className='px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50'
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
                                                        className='flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 mb-3'
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

                                    {isLoadingMore && (
                                        <div className='flex justify-center py-4'>
                                            <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600'></div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Comment Input */}
                        <div className='border-t border-gray-200 p-4 flex-shrink-0'>
                            <form onSubmit={handleAddComment} className='flex gap-3'>
                                <img
                                    src={currentUser?.profile_picture}
                                    alt=""
                                    className='w-8 h-8 rounded-full flex-shrink-0'
                                />
                                <div className='flex-1'>
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder='Add a comment...'
                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-none text-sm'
                                        rows="2"
                                        disabled={isLoading}
                                    />
                                    <div className='flex justify-end mt-2'>
                                        <button
                                            type='submit'
                                            disabled={isLoading || !newComment.trim()}
                                            className='px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium'
                                        >
                                            {isLoading ? 'Posting...' : 'Post'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
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

            <ReactionListModal 
                isOpen={!!showReactionListMsg}
                onClose={() => setShowReactionListMsg(null)}
                reactions={showReactionListMsg?.reactions || []}
            />
        </div>
    )
}

export default CommentModal