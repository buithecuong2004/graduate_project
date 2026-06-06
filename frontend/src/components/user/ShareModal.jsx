import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, CheckCircle2, MessageCircle, Repeat2, Search, Send, Users, X } from 'lucide-react'
import { useDispatch } from 'react-redux'
import { useAuth } from '../../context/AuthContext'
import { addPost } from '../../features/posts/postSlice'
import { setNewMessageTrigger } from '../../features/messages/messagesSlice'
import api from '../../api/axios'
import toast from 'react-hot-toast'

// ── Group avatar ────────────────────────────────────────────────────────────
const GroupAvatar = ({ group }) => {
    if (group?.avatar_url) {
        return <img src={group.avatar_url} alt='' className='size-11 rounded-full object-cover' />
    }
    const initials = (group?.name || 'G').slice(0, 2).toUpperCase()
    return (
        <div className='flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-indigo-600 text-sm font-black text-white'>
            {initials}
        </div>
    )
}

// ── Simple post card shown only in repost mode ──────────────────────────────
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

// ── Main component ──────────────────────────────────────────────────────────
const ShareModal = ({ isOpen, onClose, post, onShareAdded }) => {
    const [shareMode, setShareMode] = useState(null)
    const [activeTab, setActiveTab] = useState('friends') // 'friends' | 'groups'
    const [connections, setConnections] = useState([])
    const [groups, setGroups] = useState([])
    const [selectedUsers, setSelectedUsers] = useState([])
    const [selectedGroups, setSelectedGroups] = useState([])
    const [messageText, setMessageText] = useState('')
    const [captionText, setCaptionText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')

    const { getToken } = useAuth()
    const dispatch = useDispatch()

    const originalPostId = post?.shared_from?._id || post?._id
    const previewPost = post?.shared_from || post
    const postLink = post?._id ? `${window.location.origin}/post/${post._id}` : ''

    const fetchData = useCallback(async () => {
        try {
            const token = await getToken()
            const [connRes, groupRes] = await Promise.all([
                api.get('/api/user/connections', { headers: { Authorization: `Bearer ${token}` } }),
                api.get('/api/group', { headers: { Authorization: `Bearer ${token}` } })
            ])
            if (connRes.data.success) setConnections(connRes.data.connections || [])
            if (groupRes.data.success) setGroups(groupRes.data.groups || [])
        } catch (error) {
            toast.error(error.message || 'Không thể tải danh sách')
        }
    }, [getToken])

    useEffect(() => {
        if (isOpen && shareMode === 'message') fetchData()
    }, [fetchData, isOpen, shareMode])

    useEffect(() => {
        if (!isOpen) {
            setShareMode(null)
            setActiveTab('friends')
            setSelectedUsers([])
            setSelectedGroups([])
            setMessageText('')
            setCaptionText('')
            setSearchTerm('')
        }
    }, [isOpen])

    const filteredConnections = useMemo(() => {
        const kw = searchTerm.trim().toLowerCase()
        if (!kw) return connections
        return connections.filter(c => c.full_name?.toLowerCase().includes(kw) || c.username?.toLowerCase().includes(kw))
    }, [connections, searchTerm])

    const filteredGroups = useMemo(() => {
        const kw = searchTerm.trim().toLowerCase()
        if (!kw) return groups
        return groups.filter(g => g.name?.toLowerCase().includes(kw))
    }, [groups, searchTerm])

    const totalSelected = selectedUsers.length + selectedGroups.length

    const handleSelectUser = (id) => setSelectedUsers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
    const handleSelectGroup = (id) => setSelectedGroups(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

    const handleRepost = async () => {
        if (!originalPostId) return
        try {
            setIsLoading(true)
            const token = await getToken()
            await api.post('/api/post/share', { postId: originalPostId }, { headers: { Authorization: `Bearer ${token}` } })
            const formData = new FormData()
            formData.append('content', captionText.trim())
            formData.append('post_type', 'text')
            formData.append('shared_from', originalPostId)
            const { data } = await api.post('/api/post/add', formData, { headers: { Authorization: `Bearer ${token}` } })
            if (!data.success) { toast.error('Không thể tạo bài viết được chia sẻ'); return }
            if (data.post) dispatch(addPost(data.post))
            toast.success('Bài viết đã được chia sẻ')
            onShareAdded?.()
            onClose()
        } catch (error) {
            toast.error(error.message || 'Không thể chia sẻ bài viết')
        } finally { setIsLoading(false) }
    }

    const handleShareMessage = async () => {
        if (totalSelected === 0) { toast.error('Vui lòng chọn ít nhất một người hoặc nhóm'); return }
        try {
            setIsLoading(true)
            const token = await getToken()
            const fullMessage = messageText.trim() ? `${messageText.trim()}\n\n${postLink}` : postLink
            await api.post('/api/post/share', { postId: originalPostId }, { headers: { Authorization: `Bearer ${token}` } })
            const headers = { Authorization: `Bearer ${token}` }
            await Promise.all([
                ...selectedUsers.map(userId =>
                    api.post('/api/message/send', { to_user_id: userId, text: fullMessage, message_type: 'text', shared_post_id: post._id }, { headers })
                ),
                ...selectedGroups.map(groupId =>
                    api.post('/api/message/send', { group_id: groupId, text: fullMessage, message_type: 'text', shared_post_id: post._id }, { headers })
                )
            ])
            dispatch(setNewMessageTrigger(Date.now()))
            toast.success(`Đã gửi bài viết đến ${totalSelected} cuộc trò chuyện`)
            onShareAdded?.()
            onClose()
        } catch (error) {
            toast.error(error.message || 'Không thể chia sẻ qua tin nhắn')
        } finally { setIsLoading(false) }
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
                    {/* ── Mode picker ── */}
                    {!shareMode && (
                        <div className='grid gap-4'>
                            <button type='button' onClick={() => setShareMode('repost')}
                                className='group flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 text-left transition hover:border-cyan-200 hover:bg-cyan-50/60 cursor-pointer'>
                                <span className='flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white transition group-hover:bg-cyan-700'>
                                    <Repeat2 className='size-6' />
                                </span>
                                <span className='min-w-0'>
                                    <span className='block text-lg font-black text-slate-950'>Đăng lại bài viết</span>
                                    <span className='mt-1 block text-sm text-slate-500'>Chia sẻ lại bài viết này trên dòng thời gian của bạn.</span>
                                </span>
                            </button>
                            <button type='button' onClick={() => setShareMode('message')}
                                className='group flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 text-left transition hover:border-cyan-200 hover:bg-cyan-50/60 cursor-pointer'>
                                <span className='flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-700 text-white transition group-hover:bg-slate-950'>
                                    <MessageCircle className='size-6' />
                                </span>
                                <span className='min-w-0'>
                                    <span className='block text-lg font-black text-slate-950'>Gửi trong tin nhắn</span>
                                    <span className='mt-1 block text-sm text-slate-500'>Chia sẻ với bạn bè hoặc nhóm chat qua tin nhắn.</span>
                                </span>
                            </button>
                        </div>
                    )}

                    {/* ── Repost mode ── */}
                    {shareMode === 'repost' && (
                        <div className='grid gap-5 lg:grid-cols-[1fr_0.9fr]'>
                            <div className='space-y-4'>
                                <button type='button' onClick={() => setShareMode(null)} className='inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-cyan-700 cursor-pointer'>
                                    <ArrowLeft className='size-4' /> Quay lại
                                </button>
                                <div>
                                    <label className='mb-2 block text-sm font-bold text-slate-700'>Nội dung kèm theo</label>
                                    <textarea value={captionText} onChange={e => setCaptionText(e.target.value)}
                                        placeholder='Bạn muốn nói gì về bài viết này?' maxLength={500}
                                        className='input-modern min-h-36 resize-none px-4 py-3 text-sm' />
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

                    {/* ── Message mode ── */}
                    {shareMode === 'message' && (
                        <div className='grid gap-5 lg:grid-cols-[1fr_0.9fr]'>
                            <div className='space-y-4'>
                                <button type='button' onClick={() => setShareMode(null)} className='inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-cyan-700 cursor-pointer'>
                                    <ArrowLeft className='size-4' /> Quay lại
                                </button>

                                {/* Search */}
                                <div className='relative'>
                                    <Search className='pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400' />
                                    <input type='text' value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                        placeholder='Tìm bạn bè hoặc nhóm...' className='input-modern py-3 pl-12 pr-4' />
                                </div>

                                {/* Tabs: Friends / Groups */}
                                <div className='flex gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1'>
                                    {[
                                        { key: 'friends', label: 'Bạn bè', icon: <MessageCircle className='size-4' />, count: selectedUsers.length },
                                        { key: 'groups', label: 'Nhóm chat', icon: <Users className='size-4' />, count: selectedGroups.length }
                                    ].map(tab => (
                                        <button key={tab.key} type='button' onClick={() => setActiveTab(tab.key)}
                                            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition cursor-pointer ${activeTab === tab.key ? 'bg-white shadow-sm text-slate-950' : 'text-slate-500 hover:text-slate-700'}`}>
                                            {tab.icon}
                                            {tab.label}
                                            {tab.count > 0 && (
                                                <span className='flex size-5 items-center justify-center rounded-full bg-cyan-700 text-[10px] font-black text-white'>{tab.count}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                {/* List */}
                                <div className='max-h-60 overflow-y-auto rounded-3xl border border-slate-200 bg-white'>
                                    {activeTab === 'friends' ? (
                                        filteredConnections.length === 0 ? (
                                            <div className='px-5 py-10 text-center text-sm font-bold text-slate-500'>Không tìm thấy bạn bè phù hợp</div>
                                        ) : filteredConnections.map(conn => {
                                            const selected = selectedUsers.includes(conn._id)
                                            return (
                                                <button key={conn._id} type='button' onClick={() => handleSelectUser(conn._id)}
                                                    className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-cyan-50/60 cursor-pointer ${selected ? 'bg-cyan-50' : ''}`}>
                                                    <img src={conn.profile_picture} alt='' className='size-11 rounded-full object-cover avatar-ring' />
                                                    <span className='min-w-0 flex-1'>
                                                        <span className='block truncate font-black text-slate-950'>{conn.full_name}</span>
                                                        <span className='block truncate text-sm text-slate-500'>@{conn.username}</span>
                                                    </span>
                                                    {selected && <CheckCircle2 className='size-6 text-cyan-700 shrink-0' />}
                                                </button>
                                            )
                                        })
                                    ) : (
                                        filteredGroups.length === 0 ? (
                                            <div className='px-5 py-10 text-center text-sm font-bold text-slate-500'>Bạn chưa có nhóm chat nào</div>
                                        ) : filteredGroups.map(group => {
                                            const selected = selectedGroups.includes(group._id)
                                            return (
                                                <button key={group._id} type='button' onClick={() => handleSelectGroup(group._id)}
                                                    className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-cyan-50/60 cursor-pointer ${selected ? 'bg-cyan-50' : ''}`}>
                                                    <GroupAvatar group={group} />
                                                    <span className='min-w-0 flex-1'>
                                                        <span className='block truncate font-black text-slate-950'>{group.name}</span>
                                                        <span className='block truncate text-sm text-slate-500'>{group.members?.length || 0} thành viên</span>
                                                    </span>
                                                    {selected && <CheckCircle2 className='size-6 text-cyan-700 shrink-0' />}
                                                </button>
                                            )
                                        })
                                    )}
                                </div>

                                <textarea value={messageText} onChange={e => setMessageText(e.target.value)}
                                    placeholder='Thêm lời nhắn...' className='input-modern min-h-24 resize-none px-4 py-3 text-sm' />

                                <button type='button' onClick={handleShareMessage} disabled={isLoading || totalSelected === 0}
                                    className='btn-primary w-full justify-center px-5 py-3 disabled:opacity-60 cursor-pointer'>
                                    <Send className='size-5' />
                                    {isLoading ? 'Đang gửi...' : `Gửi${totalSelected > 0 ? ` (${totalSelected})` : ''}`}
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
