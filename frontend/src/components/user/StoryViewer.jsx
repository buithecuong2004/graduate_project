import { BadgeCheck, ChevronLeft, ChevronRight, Plus, SendHorizonal, SmilePlus, Trash2, X } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import moment from '../../utils/moment'
import { createPortal } from 'react-dom'
import ConfirmDialog from './ConfirmDialog'
import { useAuth } from '../../context/AuthContext'
import { useDispatch, useSelector } from 'react-redux'
import { setNewMessageTrigger } from '../../features/messages/messagesSlice'
import api from '../../api/axios'
import ReactionPicker from './ReactionPicker'
import ReactionListModal from './ReactionListModal'
import StoryModal from './StoryModal'
import toast from 'react-hot-toast'
import { REACTION_ICONS } from '../../utils/reactions'

const STORY_DURATION = 10000

const getStoryUserId = (story) => story?.user?._id || story?.user

const getStoryUser = (story) => {
    if(story?.user && typeof story.user === 'object') return story.user
    return null
}

const getAvatarUrl = (user) => {
    if(user?.profile_picture) return user.profile_picture
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.full_name || user?.username || 'U')}&background=0891b2&color=fff`
}

const StoryViewer = ({viewStory, setViewStory, currentUser, onDeleteStory}) => {
    const stories = useSelector((state) => state.stories.stories)
    const [progress, setProgress] = useState(0)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showCreateStory, setShowCreateStory] = useState(false)

    const storyOwnerId = getStoryUserId(viewStory)
    const isOwner = storyOwnerId === currentUser?._id

    const { getToken } = useAuth()
    const dispatch = useDispatch()
    const [replyText, setReplyText] = useState('')
    const [isReplying, setIsReplying] = useState(false)
    const [showReactionMenu, setShowReactionMenu] = useState(false)
    const [reactions, setReactions] = useState(viewStory?.reactions || [])
    const [showReactionList, setShowReactionList] = useState(false)

    const storyGroups = useMemo(() => {
        const storyMap = new Map()

        ;[viewStory, ...stories].forEach((story) => {
            if(story?._id && !storyMap.has(story._id)) {
                storyMap.set(story._id, story)
            }
        })

        const groupMap = new Map()
        Array.from(storyMap.values()).forEach((story) => {
            const userId = getStoryUserId(story)
            if(!userId) return

            const storyUser = getStoryUser(story)
            const existingGroup = groupMap.get(userId)

            if(existingGroup) {
                existingGroup.stories.push(story)
                if(storyUser) existingGroup.user = {...existingGroup.user, ...storyUser}
            } else {
                groupMap.set(userId, {
                    userId,
                    user: storyUser || {_id: userId, full_name: 'User'},
                    stories: [story]
                })
            }
        })

        return Array.from(groupMap.values())
            .map((group) => {
                const sortedStories = [...group.stories].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                return {
                    ...group,
                    stories: sortedStories,
                    latestStory: sortedStories[0],
                    latestTime: new Date(sortedStories[0]?.createdAt || 0).getTime()
                }
            })
            .sort((a, b) => b.latestTime - a.latestTime)
    }, [stories, viewStory])

    const activeGroupIndex = useMemo(() => {
        if(!viewStory?._id) return -1
        return storyGroups.findIndex((group) => group.stories.some((story) => story._id === viewStory._id))
    }, [storyGroups, viewStory?._id])

    const activeGroup = activeGroupIndex >= 0 ? storyGroups[activeGroupIndex] : null
    const activeStoryIndex = activeGroup?.stories.findIndex((story) => story._id === viewStory?._id) ?? -1
    const canGoPrevUser = activeGroupIndex > 0
    const canGoNextUser = activeGroupIndex >= 0 && activeGroupIndex < storyGroups.length - 1

    const selectGroup = useCallback((groupIndex) => {
        const group = storyGroups[groupIndex]
        if(group?.stories?.[0]) {
            setViewStory(group.stories[0])
        }
    }, [setViewStory, storyGroups])

    const goToPrevUser = useCallback(() => {
        if(canGoPrevUser) selectGroup(activeGroupIndex - 1)
    }, [activeGroupIndex, canGoPrevUser, selectGroup])

    const goToNextUser = useCallback(() => {
        if(canGoNextUser) selectGroup(activeGroupIndex + 1)
    }, [activeGroupIndex, canGoNextUser, selectGroup])

    const goToNextStory = useCallback(() => {
        if(!activeGroup) return setViewStory(null)

        if(activeStoryIndex >= 0 && activeStoryIndex < activeGroup.stories.length - 1) {
            setViewStory(activeGroup.stories[activeStoryIndex + 1])
            return
        }

        if(canGoNextUser) {
            selectGroup(activeGroupIndex + 1)
            return
        }

        setViewStory(null)
    }, [activeGroup, activeGroupIndex, activeStoryIndex, canGoNextUser, selectGroup, setViewStory])

    const goToPrevStory = useCallback(() => {
        if(!activeGroup) return

        if(activeStoryIndex > 0) {
            setViewStory(activeGroup.stories[activeStoryIndex - 1])
            return
        }

        if(canGoPrevUser) {
            selectGroup(activeGroupIndex - 1)
        }
    }, [activeGroup, activeGroupIndex, activeStoryIndex, canGoPrevUser, selectGroup, setViewStory])

    useEffect(() => {
        setReactions(viewStory?.reactions || [])
        setReplyText('')
        setShowReactionMenu(false)
        setProgress(0)
    }, [viewStory])

    useEffect(() => {
        let timer
        let progressInterval

        if(viewStory && viewStory.media_type !== 'video') {
            setProgress(0)

            const tick = 100
            let elapsed = 0

            progressInterval = setInterval(() => {
                elapsed += tick
                setProgress(Math.min(elapsed / STORY_DURATION, 1))
            }, tick)

            timer = setTimeout(goToNextStory, STORY_DURATION)
        }

        return () => {
            clearTimeout(timer)
            clearInterval(progressInterval)
        }
    }, [goToNextStory, viewStory])

    const handleClose = () => {
        setViewStory(null)
    }

    const handleReact = async (type) => {
        try {
            const storyId = viewStory?._id
            if (!storyId) {
                return toast.error('Story ID not found')
            }
            const token = await getToken()
            const { data } = await api.post('/api/story/react', { storyId, reactionType: type }, { headers: { Authorization: `Bearer ${token}` } })
            if(data.success) {
                setReactions(data.reactions)
                setShowReactionMenu(false)
            } else {
                toast.error(data.message || 'Failed to react')
            }
        } catch(e) {
            console.error('React error:', e)
            toast.error('Something went wrong')
        }
    }

    const handleReply = async () => {
        if(!replyText.trim()) return
        try {
            setIsReplying(true)
            const token = await getToken()
            const { data } = await api.post('/api/story/reply', { storyId: viewStory._id, text: replyText }, { headers: { Authorization: `Bearer ${token}` } })
            if(data.success) {
                toast.success('Đã gửi trả lời')
                setReplyText('')
                dispatch(setNewMessageTrigger(Date.now()))
                handleClose()
            } else toast.error(data.message)
        } catch(e) {
            toast.error(e.message)
        } finally {
            setIsReplying(false)
        }
    }

    const handleDelete = async () => {
        try {
            setIsDeleting(true)
            await onDeleteStory(viewStory._id)
        } catch (error) {
            console.log(error)
        } finally {
            setIsDeleting(false)
        }
    }

    const handleDeleteClick = () => {
        setShowDeleteConfirm(true)
    }

    if(!viewStory) return null

    const renderContent = () => {
        switch(viewStory.media_type) {
            case 'image':
                return (
                    <img src={viewStory.media_url} alt="" className='h-full w-full object-contain bg-black'/>
                )
             case 'video':
                return (
                    <video
                        onEnded={goToNextStory}
                        onTimeUpdate={(e) => {
                            const video = e.currentTarget
                            if(video.duration) setProgress(video.currentTime / video.duration)
                        }}
                        src={viewStory.media_url}
                        className='h-full w-full object-contain bg-black'
                        autoPlay
                        playsInline
                    />
                )
             case 'text':
                return (
                    <div
                        className='w-full h-full flex items-center justify-center p-8 text-white text-2xl text-center overflow-y-auto'
                        style={{backgroundColor: viewStory.background_color || '#3A86FF'}}
                    >
                        <p className='whitespace-pre-wrap break-words'>{viewStory.content}</p>
                    </div>
                )
             default:
                return null
        }
    }

    const reactionCounts = reactions.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1
        return acc
    }, {})
    const topReactions = Object.entries(reactionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(entry => entry[0])

    const currentUserReactionObj = reactions.find(r => (r.user?._id || r.user) === currentUser?._id)
    const currentUserReaction = currentUserReactionObj ? currentUserReactionObj.type : null

  return createPortal(
    <div
        className='fixed inset-0 z-[110] h-screen bg-black text-white flex'
        onClick={() => setShowReactionMenu(false)}
    >
        <aside className='hidden md:flex w-[360px] lg:w-[420px] shrink-0 flex-col bg-white text-slate-950 border-r border-slate-200'>
            <div className='h-16 flex items-center gap-3 px-4 border-b border-slate-200'>
                <button
                    type='button'
                    onClick={handleClose}
                    className='size-11 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer'
                    aria-label='Đóng'
                >
                    <X className='size-6'/>
                </button>
                <h2 className='text-2xl font-bold'>Tin</h2>
            </div>

            <div className='p-4 border-b border-slate-100'>
                <button
                    type='button'
                    onClick={() => setShowCreateStory(true)}
                    className='group/create w-full flex items-center gap-4 rounded-xl p-3 hover:bg-slate-100 transition text-left cursor-pointer'
                >
                    <span className='size-14 rounded-full bg-cyan-50 ring-1 ring-cyan-100 flex items-center justify-center text-cyan-700 shrink-0 transition group-hover/create:bg-cyan-100'>
                        <Plus className='size-7'/>
                    </span>
                    <span>
                        <span className='block font-semibold text-slate-950'>Tạo tin</span>
                        <span className='block text-sm text-slate-500'>Chia sẻ ảnh, video hoặc viết gì đó</span>
                    </span>
                </button>
            </div>

            <div className='px-5 pt-5 pb-2'>
                <h3 className='text-lg font-bold'>Tất cả tin</h3>
            </div>

            <div className='flex-1 overflow-y-auto px-2 pb-6'>
                {storyGroups.map((group, index) => {
                    const isActive = index === activeGroupIndex
                    const isCurrentUser = group.userId === currentUser?._id
                    const displayName = isCurrentUser ? 'Tin của bạn' : (group.user?.full_name || group.user?.username || 'User')

                    return (
                        <button
                            type='button'
                            key={group.userId}
                            onClick={() => selectGroup(index)}
                            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition cursor-pointer ${isActive ? 'bg-cyan-50 ring-1 ring-cyan-100' : 'hover:bg-slate-100'}`}
                        >
                            <span className='size-16 rounded-full ring-2 ring-cyan-500 p-0.5 shrink-0 bg-white shadow-[0_0_0_4px_rgba(8,145,178,0.12)]'>
                                <img src={getAvatarUrl(group.user)} alt='' className='w-full h-full rounded-full object-cover'/>
                            </span>
                            <span className='min-w-0'>
                                <span className='block font-semibold text-slate-950 truncate'>{displayName}</span>
                                <span className='block text-sm text-slate-500 truncate'>
                                    {group.stories.length > 1 ? `${group.stories.length} tin · ` : ''}{moment(group.latestStory?.createdAt).fromNow()}
                                </span>
                            </span>
                        </button>
                    )
                })}
            </div>
        </aside>

        <main className='relative flex-1 min-w-0 bg-black flex items-center justify-center overflow-hidden px-4 py-5 sm:px-16'>
            <button
                type='button'
                onClick={handleClose}
                className='md:hidden absolute top-4 left-4 z-50 size-11 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition cursor-pointer'
                aria-label='Đóng'
            >
                <X className='size-6'/>
            </button>

            {canGoPrevUser && (
                <button
                    type='button'
                    onClick={(e) => { e.stopPropagation(); goToPrevUser() }}
                    className='absolute left-4 lg:left-10 top-1/2 -translate-y-1/2 z-40 size-14 rounded-full bg-white/90 text-slate-700 hover:bg-white flex items-center justify-center shadow-xl transition active:scale-95 cursor-pointer'
                    aria-label='Tin trước'
                >
                    <ChevronLeft className='size-8'/>
                </button>
            )}

            {canGoNextUser && (
                <button
                    type='button'
                    onClick={(e) => { e.stopPropagation(); goToNextUser() }}
                    className='absolute right-4 lg:right-10 top-1/2 -translate-y-1/2 z-40 size-14 rounded-full bg-white/90 text-slate-700 hover:bg-white flex items-center justify-center shadow-xl transition active:scale-95 cursor-pointer'
                    aria-label='Tin sau'
                >
                    <ChevronRight className='size-8'/>
                </button>
            )}

            <div
                className='relative z-10 h-full max-h-[calc(100vh-40px)] aspect-[9/16] max-w-[min(430px,calc(100vw-32px))] rounded-xl overflow-hidden bg-slate-950 shadow-2xl'
                onClick={e => e.stopPropagation()}
            >
                <div className='absolute top-0 left-0 right-0 z-40 flex gap-1 p-3'>
                    {(activeGroup?.stories || [viewStory]).map((story, index) => (
                        <div key={story._id} className='h-1 flex-1 rounded-full bg-white/35 overflow-hidden'>
                            <div
                                className='h-full bg-white transition-all duration-100 ease-linear'
                                style={{
                                    width: index < activeStoryIndex ? '100%' : index === activeStoryIndex ? `${progress * 100}%` : '0%'
                                }}
                            />
                        </div>
                    ))}
                </div>

                <div className='absolute top-6 left-4 right-4 flex items-center justify-between gap-3 z-50'>
                    <div className='flex items-center min-w-0 gap-3'>
                        <img src={getAvatarUrl(isOwner ? currentUser : getStoryUser(viewStory))} alt="" className='size-10 rounded-full object-cover border-2 border-cyan-200 shadow-[0_0_0_2px_rgba(8,145,178,0.55),0_10px_24px_rgba(0,0,0,0.25)] shrink-0'/>
                        <div className='min-w-0'>
                            <div className='text-white font-bold flex items-center gap-1.5 text-sm sm:text-base drop-shadow-md truncate'>
                                <span className='truncate'>{isOwner ? 'Tin của bạn' : (viewStory.user?.full_name || 'User')}</span>
                                <BadgeCheck size={16} className='text-blue-400 fill-white shrink-0'/>
                            </div>
                            <div className='text-white/90 text-[10px] sm:text-xs flex items-center gap-1 font-medium drop-shadow-md'>
                                <span>{moment(viewStory.createdAt).fromNow()}</span>
                                <span>·</span>
                                <span className='opacity-80'>{viewStory.media_type === 'text' ? 'Tin dạng văn bản' : 'Tin'}</span>
                            </div>
                        </div>
                    </div>

                    {isOwner && (
                        <button
                            type='button'
                            onClick={handleDeleteClick}
                            disabled={isDeleting}
                            className='text-white hover:text-red-400 transition disabled:opacity-50 p-2 cursor-pointer'
                            title='Xóa tin'
                        >
                            <Trash2 className='w-6 h-6'/>
                        </button>
                    )}
                </div>

                <button
                    type='button'
                    onClick={(e) => { e.stopPropagation(); goToPrevStory() }}
                    className='absolute inset-y-20 left-0 z-30 w-1/3 cursor-pointer'
                    aria-label='Story trước trong cùng người dùng'
                />
                <button
                    type='button'
                    onClick={(e) => { e.stopPropagation(); goToNextStory() }}
                    className='absolute inset-y-20 right-0 z-30 w-1/3 cursor-pointer'
                    aria-label='Story sau trong cùng người dùng'
                />

                <div className='h-full w-full'>
                    {renderContent()}
                </div>

                {isOwner && topReactions.length > 0 && (
                    <button
                        type='button'
                        className='absolute bottom-5 right-5 flex items-center bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 cursor-pointer hover:bg-black/60 transition z-50'
                        onClick={(e) => { e.stopPropagation(); setShowReactionList(true) }}
                    >
                        <span className='flex -space-x-1'>
                            {topReactions.map((type, idx) => (
                                <span key={type} className='text-sm bg-white rounded-full z-10' style={{zIndex: 3-idx}}>
                                    {REACTION_ICONS[type]}
                                </span>
                            ))}
                        </span>
                        <span className='text-white text-xs font-medium ml-2'>{reactions.length}</span>
                    </button>
                )}

                {!isOwner && (
                    <div className='absolute bottom-5 left-0 right-0 px-4 flex gap-3 items-center z-50' onClick={e => e.stopPropagation()}>
                        <div className='flex-1 relative'>
                            <input
                                type='text'
                                placeholder='Trả lời tin...'
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleReply()}
                                className='w-full bg-black/45 backdrop-blur-md text-white placeholder-gray-300 border border-white/40 rounded-full px-4 py-2.5 pr-10 outline-none focus:border-white/80 transition'
                            />
                            <button
                                type='button'
                                onClick={handleReply}
                                disabled={!replyText.trim() || isReplying}
                                className='absolute right-2 top-1/2 -translate-y-1/2 text-white p-1 rounded-full hover:bg-white/20 disabled:opacity-50 transition cursor-pointer'
                            >
                                <SendHorizonal size={18} />
                            </button>
                        </div>

                        <div className='relative'>
                            <button
                                type='button'
                                onClick={() => setShowReactionMenu(!showReactionMenu)}
                                className={`p-2.5 rounded-full bg-black/45 backdrop-blur-md border border-white/40 hover:bg-white/20 transition cursor-pointer ${currentUserReaction ? 'text-2xl leading-none px-2 py-1' : 'text-white'}`}
                            >
                                {currentUserReaction ? REACTION_ICONS[currentUserReaction] : <SmilePlus size={22} />}
                            </button>
                            {showReactionMenu && (
                                <div className='absolute bottom-full right-0 mb-3 origin-bottom-right z-50'>
                                    <ReactionPicker onReact={handleReact} currentReaction={currentUserReaction} />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </main>

        <ConfirmDialog
            isOpen={showDeleteConfirm}
            title='Xóa tin'
            message='Bạn có chắc chắn muốn xóa tin này? Hành động này không thể hoàn tác.'
            isDangerous={true}
            isLoading={isDeleting}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
        />

        <ReactionListModal
            isOpen={showReactionList}
            onClose={() => setShowReactionList(false)}
            reactions={reactions}
        />

        {showCreateStory && <StoryModal setShowModal={setShowCreateStory} />}
    </div>,
    document.body
  )
}

export default StoryViewer
