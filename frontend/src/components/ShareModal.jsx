import React, { useState, useEffect } from 'react'
import { X, Send } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { addPost } from '../features/posts/postSlice'
import api from '../api/axios'
import toast from 'react-hot-toast'

const ShareModal = ({ isOpen, onClose, post, onShareAdded }) => {
    const [shareMode, setShareMode] = useState(null) // 'repost' or 'message'
    const [connections, setConnections] = useState([])
    const [selectedUsers, setSelectedUsers] = useState([])
    const [messageText, setMessageText] = useState('')
    const [captionText, setCaptionText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    
    const { getToken } = useAuth()
    const dispatch = useDispatch()
    const currentUser = useSelector((state) => state.user.value)
    const navigate = useNavigate()

    // Fetch connections khi mở modal
    useEffect(() => {
        if (isOpen && shareMode === 'message') {
            fetchConnections()
        }
    }, [isOpen, shareMode])

    const fetchConnections = async () => {
        try {
            const token = await getToken()
            const { data } = await api.get('/api/user/connections', {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (data.success) {
                setConnections(data.connections || [])
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    const handleSelectUser = (userId) => {
        setSelectedUsers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        )
    }

    const handleRepost = async () => {
        try {
            setIsLoading(true)
            const token = await getToken()
            
            // First, increment share count on original post
            const shareResponse = await api.post('/api/post/share', { postId: post._id }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            
            if (!shareResponse.data.success) {
                toast.error('Failed to increment share count')
                setIsLoading(false)
                return
            }

            // Then post the new shared post
            const formData = new FormData()
            formData.append('content', captionText)
            formData.append('post_type', 'text')
            formData.append('shared_from', post._id)

            const { data } = await api.post('/api/post/add', formData, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (data.success) {
                // Add new post to Redux store immediately
                if (data.post) {
                    dispatch(addPost(data.post))
                }
                
                toast.success('Post shared successfully!')
                onShareAdded && onShareAdded()
                onClose()
                setCaptionText('')
            } else {
                toast.error('Failed to create shared post')
            }
        } catch (error) {
            console.error('Share error:', error)
            toast.error(error.message || 'Failed to share post')
        } finally {
            setIsLoading(false)
        }
    }

    const handleShareMessage = async () => {
        if (selectedUsers.length === 0) {
            toast.error('Please select at least one person')
            return
        }

        try {
            setIsLoading(true)
            const token = await getToken()
            
            const shareLink = `${window.location.origin}/post/${post._id}`
            const fullMessage = messageText 
                ? `${messageText}\n\n${shareLink}`
                : shareLink

            // Increment share count
            await api.post('/api/post/share', { postId: post._id }, {
                headers: { Authorization: `Bearer ${token}` }
            })

            // Send message to each selected user
            await Promise.all(
                selectedUsers.map(userId =>
                    api.post('/api/message/send',
                        {
                            to_user_id: userId,
                            text: fullMessage,
                            message_type: 'text',
                            shared_post_id: post._id
                        },
                        { headers: { Authorization: `Bearer ${token}` } }
                    )
                )
            )

            toast.success('Shared to selected users')
            onShareAdded && onShareAdded()
            onClose()
            setSelectedUsers([])
            setMessageText('')
        } catch (error) {
            toast.error(error.message || 'Failed to share message')
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen || !post) return null

    const filteredConnections = connections.filter(conn =>
        conn.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conn.username.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className='fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50'>
            <div className='bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto'>
                {/* Header */}
                <div className='flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white'>
                    <h2 className='text-lg font-semibold'>Share Post</h2>
                    <button
                        onClick={onClose}
                        className='text-gray-400 hover:text-gray-600 transition'
                    >
                        <X className='w-5 h-5' />
                    </button>
                </div>

                {/* Content */}
                {!shareMode ? (
                    // Main share options
                    <div className='p-4 space-y-3'>
                        <button
                            onClick={() => setShareMode('repost')}
                            className='w-full p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-left'
                        >
                            <div className='font-semibold text-gray-900'>Share as Post</div>
                            <div className='text-sm text-gray-600'>Post this on your timeline with your own caption</div>
                        </button>
                        <button
                            onClick={() => setShareMode('message')}
                            className='w-full p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-left'
                        >
                            <div className='font-semibold text-gray-900'>Send in Message</div>
                            <div className='text-sm text-gray-600'>Share this post with your connections via message</div>
                        </button>
                    </div>
                ) : shareMode === 'repost' ? (
                    // Repost option with caption
                    <div className='p-4 space-y-4'>
                        <div>
                            <label className='text-sm font-semibold text-gray-700 block mb-2'>Add Caption (Optional)</label>
                            <textarea
                                value={captionText}
                                onChange={(e) => setCaptionText(e.target.value)}
                                placeholder="What's on your mind?"
                                rows='3'
                                className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
                            />
                            <p className='text-xs text-gray-500 mt-1'>{captionText.length}/500</p>
                        </div>

                        <div className='bg-gray-50 p-3 rounded-lg text-sm text-gray-700 border border-gray-200'>
                            <p className='font-semibold mb-2'>Original Post Preview</p>
                            <p className='text-xs text-gray-600 mb-2'>By <span className='font-semibold'>{post.user.full_name}</span></p>
                            <p className='line-clamp-3 text-gray-800'>{post.content}</p>
                        </div>

                        <div className='space-y-2'>
                            <button
                                onClick={handleRepost}
                                disabled={isLoading}
                                className='w-full p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50'
                            >
                                {isLoading ? 'Sharing...' : 'Share Now'}
                            </button>
                            <button
                                onClick={() => {
                                    setShareMode(null)
                                    setCaptionText('')
                                }}
                                className='w-full p-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition'
                            >
                                Back
                            </button>
                        </div>
                    </div>
                ) : (
                    // Message share option
                    <div className='p-4 space-y-4'>
                        {/* Search */}
                        <div>
                            <input
                                type='text'
                                placeholder='Search connections...'
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>

                        {/* Connections List */}
                        <div className='max-h-48 overflow-y-auto border border-gray-200 rounded-lg'>
                            {filteredConnections.length === 0 ? (
                                <div className='p-4 text-center text-gray-500 text-sm'>
                                    No connections found
                                </div>
                            ) : (
                                filteredConnections.map(conn => (
                                    <label
                                        key={conn._id}
                                        className='flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0'
                                    >
                                        <input
                                            type='checkbox'
                                            checked={selectedUsers.includes(conn._id)}
                                            onChange={() => handleSelectUser(conn._id)}
                                            className='w-4 h-4 rounded cursor-pointer'
                                        />
                                        <img
                                            src={conn.profile_picture}
                                            alt={conn.full_name}
                                            className='w-8 h-8 rounded-full'
                                        />
                                        <div className='flex-1'>
                                            <div className='font-semibold text-sm'>{conn.full_name}</div>
                                            <div className='text-xs text-gray-600'>@{conn.username}</div>
                                        </div>
                                    </label>
                                ))
                            )}
                        </div>

                        {selectedUsers.length > 0 && (
                            <div className='text-sm text-gray-600'>
                                {selectedUsers.length} person(s) selected
                            </div>
                        )}

                        {/* Message Input */}
                        <textarea
                            placeholder='Add a message (optional)'
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            rows='3'
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
                        />

                        {/* Post Preview */}
                        <div className='bg-gray-50 p-3 rounded-lg text-sm'>
                            <p className='font-semibold text-gray-700 mb-2'>Post Link:</p>
                            <p className='text-indigo-600 break-all text-xs'>{window.location.origin}/post/{post._id}</p>
                        </div>

                        {/* Actions */}
                        <div className='space-y-2'>
                            <button
                                onClick={handleShareMessage}
                                disabled={isLoading || selectedUsers.length === 0}
                                className='w-full p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
                            >
                                <Send className='w-4 h-4' />
                                Send
                            </button>
                            <button
                                onClick={() => setShareMode(null)}
                                className='w-full p-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition'
                            >
                                Back
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ShareModal