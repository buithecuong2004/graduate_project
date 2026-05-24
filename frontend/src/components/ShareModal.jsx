import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, CheckCircle2, MessageCircle, Repeat2, Search, Send, X } from 'lucide-react'
import { useDispatch } from 'react-redux'
import { useAuth } from '../context/AuthContext'
import { addPost } from '../features/posts/postSlice'
import { setNewMessageTrigger } from '../features/messages/messagesSlice'
import api from '../api/axios'
import toast from 'react-hot-toast'

const SharePostPreview = ({ post }) => {
    const previewImage = post?.image_urls?.[0]

    return (
        <div className='rounded-3xl border border-slate-200 bg-slate-50/80 p-4'>
            <p className='text-xs font-black uppercase tracking-[0.22em] text-cyan-700'>Bài viết gốc</p>
            <div className='mt-3 flex items-center gap-3'>
                <img src={post?.user?.profile_picture} alt='' className='size-10 rounded-full object-cover avatar-ring' />
                <div className='min-w-0'>
                    <p className='truncate font-black text-slate-950'>{post?.user?.full_name}</p>
                    <p className='truncate text-sm text-slate-500'>@{post?.user?.username}</p>
                </div>
            </div>
            {post?.content && <p className='mt-4 line-clamp-4 whitespace-pre-line text-sm leading-6 text-slate-700'>{post.content}</p>}
            {previewImage && <img src={previewImage} alt='' className='mt-4 max-h-48 w-full rounded-2xl object-cover' />}
            {post?.video_url && <div className='mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white'>Có video đính kèm</div>}
        </div>
    )
}

const ShareModal = ({ isOpen, onClose, post, onShareAdded }) => {
    const [shareMode, setShareMode] = useState(null)
    const [connections, setConnections] = useState([])
    const [selectedUsers, setSelectedUsers] = useState([])
    const [messageText, setMessageText] = useState('')
    const [captionText, setCaptionText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')

    const { getToken } = useAuth()
    const dispatch = useDispatch()

    const originalPostId = post?.shared_from?._id || post?._id
    const previewPost = post?.shared_from || post
    const postLink = post?._id ? `${window.location.origin}/post/${post._id}` : ''

    const fetchConnections = useCallback(async () => {
        try {
            const token = await getToken()
            const { data } = await api.get('/api/user/connections', {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (data.success) setConnections(data.connections || [])
        } catch (error) {
            toast.error(error.message || 'Không thể tải danh sách bạn bè')
        }
    }, [getToken])

    useEffect(() => {
        if (isOpen && shareMode === 'message') fetchConnections()
    }, [fetchConnections, isOpen, shareMode])

    useEffect(() => {
        if (!isOpen) {
            setShareMode(null)
            setSelectedUsers([])
            setMessageText('')
            setCaptionText('')
            setSearchTerm('')
        }
    }, [isOpen])

    const filteredConnections = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase()
        if (!keyword) return connections

        return connections.filter((conn) =>
            conn.full_name?.toLowerCase().includes(keyword) ||
            conn.username?.toLowerCase().includes(keyword)
        )
    }, [connections, searchTerm])

    const handleSelectUser = (userId) => {
        setSelectedUsers((prev) =>
            prev.includes(userId)
                ? prev.filter((id) => id !== userId)
                : [...prev, userId]
        )
    }

    const handleRepost = async () => {
        if (!originalPostId) return

        try {
            setIsLoading(true)
            const token = await getToken()

            const shareResponse = await api.post('/api/post/share', { postId: originalPostId }, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!shareResponse.data.success) {
                toast.error('Không thể cập nhật lượt chia sẻ')
                return
            }

            const formData = new FormData()
            formData.append('content', captionText.trim())
            formData.append('post_type', 'text')
            formData.append('shared_from', originalPostId)

            const { data } = await api.post('/api/post/add', formData, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!data.success) {
                toast.error('Không thể tạo bài viết được chia sẻ')
                return
            }

            if (data.post) {
                dispatch(addPost(data.post))
            }
            toast.success('Bài viết đã được chia sẻ')
            onShareAdded?.()
            onClose()
        } catch (error) {
            toast.error(error.message || 'Không thể chia sẻ bài viết')
        } finally {
            setIsLoading(false)
        }
    }

    const handleShareMessage = async () => {
        if (selectedUsers.length === 0) {
            toast.error('Vui lòng chọn ít nhất một người')
            return
        }

        try {
            setIsLoading(true)
            const token = await getToken()
            const fullMessage = messageText.trim() ? `${messageText.trim()}\n\n${postLink}` : postLink

            await api.post('/api/post/share', { postId: originalPostId }, {
                headers: { Authorization: `Bearer ${token}` }
            })

            await Promise.all(selectedUsers.map((userId) =>
                api.post('/api/message/send',
                    {
                        to_user_id: userId,
                        text: fullMessage,
                        message_type: 'text',
                        shared_post_id: post._id
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                )
            ))

            dispatch(setNewMessageTrigger(Date.now()))
            toast.success('Đã gửi bài viết qua tin nhắn')
            onShareAdded?.()
            onClose()
        } catch (error) {
            toast.error(error.message || 'Không thể chia sẻ qua tin nhắn')
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen || !post) return null

    return createPortal(
        <div className='fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm' role='dialog' aria-modal='true'>
            <div className='surface flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem]'>
                <header className='flex items-center justify-between border-b border-slate-200 px-6 py-5'>
                    <div>
                        <p className='page-kicker'>Chia sẻ</p>
                        <h2 className='mt-1 text-2xl font-black text-slate-950'>Chia sẻ bài viết</h2>
                    </div>
                    <button type='button' onClick={onClose} className='rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 cursor-pointer'>
                        <X className='size-6' />
                    </button>
                </header>

                <div className='min-h-0 flex-1 overflow-y-auto p-5 sm:p-6'>
                    {!shareMode && (
                        <div className='grid gap-4'>
                            <button
                                type='button'
                                onClick={() => setShareMode('repost')}
                                className='group flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 text-left transition hover:border-cyan-200 hover:bg-cyan-50/60 cursor-pointer'
                            >
                                <span className='flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white transition group-hover:bg-cyan-700'>
                                    <Repeat2 className='size-6' />
                                </span>
                                <span className='min-w-0'>
                                    <span className='block text-lg font-black text-slate-950'>Đăng lại bài viết</span>
                                    <span className='mt-1 block text-sm text-slate-500'>Chia sẻ lại bài viết này trên dòng thời gian của bạn.</span>
                                </span>
                            </button>

                            <button
                                type='button'
                                onClick={() => setShareMode('message')}
                                className='group flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 text-left transition hover:border-cyan-200 hover:bg-cyan-50/60 cursor-pointer'
                            >
                                <span className='flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-700 text-white transition group-hover:bg-slate-950'>
                                    <MessageCircle className='size-6' />
                                </span>
                                <span className='min-w-0'>
                                    <span className='block text-lg font-black text-slate-950'>Gửi trong tin nhắn</span>
                                    <span className='mt-1 block text-sm text-slate-500'>Chia sẻ bài viết này với bạn bè qua trò chuyện riêng.</span>
                                </span>
                            </button>
                        </div>
                    )}

                    {shareMode === 'repost' && (
                        <div className='grid gap-5 lg:grid-cols-[1fr_0.9fr]'>
                            <div className='space-y-4'>
                                <button type='button' onClick={() => setShareMode(null)} className='inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-cyan-700 cursor-pointer'>
                                    <ArrowLeft className='size-4' />
                                    Quay lại
                                </button>
                                <div>
                                    <label className='mb-2 block text-sm font-bold text-slate-700'>Nội dung kèm theo</label>
                                    <textarea
                                        value={captionText}
                                        onChange={(event) => setCaptionText(event.target.value)}
                                        placeholder='Bạn muốn nói gì về bài viết này?'
                                        maxLength={500}
                                        className='input-modern min-h-36 resize-none px-4 py-3 text-sm'
                                    />
                                    <p className='mt-1 text-right text-xs text-slate-400'>{captionText.length}/500</p>
                                </div>
                                <button type='button' onClick={handleRepost} disabled={isLoading} className='btn-primary w-full justify-center px-5 py-3 disabled:opacity-60 cursor-pointer'>
                                    <Repeat2 className='size-5' />
                                    {isLoading ? 'Đang chia sẻ...' : 'Chia sẻ ngay'}
                                </button>
                            </div>
                            <SharePostPreview post={previewPost} />
                        </div>
                    )}

                    {shareMode === 'message' && (
                        <div className='grid gap-5 lg:grid-cols-[1fr_0.9fr]'>
                            <div className='space-y-4'>
                                <button type='button' onClick={() => setShareMode(null)} className='inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-cyan-700 cursor-pointer'>
                                    <ArrowLeft className='size-4' />
                                    Quay lại
                                </button>

                                <div className='relative'>
                                    <Search className='pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400' />
                                    <input
                                        type='text'
                                        value={searchTerm}
                                        onChange={(event) => setSearchTerm(event.target.value)}
                                        placeholder='Tìm bạn bè...'
                                        className='input-modern py-3 pl-12 pr-4'
                                    />
                                </div>

                                <div className='max-h-72 overflow-y-auto rounded-3xl border border-slate-200 bg-white'>
                                    {filteredConnections.length === 0 ? (
                                        <div className='px-5 py-10 text-center text-sm font-bold text-slate-500'>Không tìm thấy bạn bè phù hợp</div>
                                    ) : (
                                        filteredConnections.map((conn) => {
                                            const selected = selectedUsers.includes(conn._id)

                                            return (
                                                <button
                                                    key={conn._id}
                                                    type='button'
                                                    onClick={() => handleSelectUser(conn._id)}
                                                    className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-cyan-50/60 cursor-pointer ${selected ? 'bg-cyan-50' : ''}`}
                                                >
                                                    <img src={conn.profile_picture} alt='' className='size-11 rounded-full object-cover avatar-ring' />
                                                    <span className='min-w-0 flex-1'>
                                                        <span className='block truncate font-black text-slate-950'>{conn.full_name}</span>
                                                        <span className='block truncate text-sm text-slate-500'>@{conn.username}</span>
                                                    </span>
                                                    {selected && <CheckCircle2 className='size-6 text-cyan-700' />}
                                                </button>
                                            )
                                        })
                                    )}
                                </div>

                                <textarea
                                    value={messageText}
                                    onChange={(event) => setMessageText(event.target.value)}
                                    placeholder='Thêm lời nhắn...'
                                    className='input-modern min-h-24 resize-none px-4 py-3 text-sm'
                                />

                                <button
                                    type='button'
                                    onClick={handleShareMessage}
                                    disabled={isLoading || selectedUsers.length === 0}
                                    className='btn-primary w-full justify-center px-5 py-3 disabled:opacity-60 cursor-pointer'
                                >
                                    <Send className='size-5' />
                                    {isLoading ? 'Đang gửi...' : `Gửi${selectedUsers.length ? ` cho ${selectedUsers.length} người` : ''}`}
                                </button>
                            </div>

                            <div className='space-y-4'>
                                <SharePostPreview post={previewPost} />
                                <div className='rounded-3xl border border-slate-200 bg-slate-50/80 p-4'>
                                    <p className='text-xs font-black uppercase tracking-[0.22em] text-slate-500'>Đường dẫn</p>
                                    <p className='mt-2 break-all text-sm font-bold text-cyan-700'>{postLink}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}

export default ShareModal
