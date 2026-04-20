import { BadgeCheck, X, Trash2, SendHorizonal, SmilePlus } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ConfirmDialog from './ConfirmDialog'
import { useAuth } from '@clerk/clerk-react'
import { useDispatch } from 'react-redux'
import { setNewMessageTrigger } from '../features/messages/messagesSlice'
import api from '../api/axios'
import ReactionPicker, { REACTION_ICONS } from './ReactionPicker'
import ReactionListModal from './ReactionListModal'
import toast from 'react-hot-toast'

const StoryViewer = ({viewStory, setViewStory, currentUser, onDeleteStory}) => {

    const [progress, setProgress] = useState(0)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const isOwner = viewStory?.user?._id === currentUser?._id
    
    const { getToken } = useAuth()
    const dispatch = useDispatch()
    const [replyText, setReplyText] = useState('')
    const [isReplying, setIsReplying] = useState(false)
    const [showReactionMenu, setShowReactionMenu] = useState(false)
    const [reactions, setReactions] = useState(viewStory?.reactions || [])
    const [showReactionList, setShowReactionList] = useState(false)

    useEffect(() => {
        setReactions(viewStory?.reactions || [])
        setReplyText('')
        setShowReactionMenu(false)
    }, [viewStory])

    useEffect(()=>{
        let timer, progressInterval;

        if(viewStory && viewStory.media_type !== 'video') {
            setProgress(0)

            const duration = 10000;
            const setTime = 100;
            let elapsed = 0;

           progressInterval = setInterval(()=>{
                elapsed += setTime;
                setProgress((elapsed / duration));
            }, setTime)

            timer = setTimeout(()=>{
                setViewStory(null)
            }, duration)
        }

        return ()=>{
            clearTimeout(timer);
            clearInterval(progressInterval);
        }

    }, [viewStory, setViewStory])

    const handleClose = () => {
        setViewStory(null)
    }

    const handleReact = async (type) => {
        try {
            const token = await getToken()
            const { data } = await api.post('/api/story/react', { storyId: viewStory._id, reactionType: type }, { headers: { Authorization: `Bearer ${token}` } })
            if(data.success) {
                setReactions(data.reactions)
                setShowReactionMenu(false)
            } else toast.error(data.message)
        } catch(e) { toast.error(e.message) }
    }

    const handleReply = async () => {
        if(!replyText.trim()) return;
        try {
            setIsReplying(true)
            const token = await getToken()
            const { data } = await api.post('/api/story/reply', { storyId: viewStory._id, text: replyText }, { headers: { Authorization: `Bearer ${token}` } })
            if(data.success) {
                toast.success('Reply sent')
                setReplyText('')
                dispatch(setNewMessageTrigger(Date.now()))
                handleClose()
            } else toast.error(data.message)
        } catch(e) { toast.error(e.message) }
        finally { setIsReplying(false) }
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
                    <img src={viewStory.media_url} alt="" className='max-w-full max-h-screen object-contain'/>
                );
             case 'video':
                return (
                    <video onEnded={()=>setViewStory(null)} src={viewStory.media_url} className='max-w-full max-h-full object-contain' controls autoPlay/>
                )
             case 'text':
                return (
                    <div className='w-full h-full flex items-center justify-center p-8 text-white text-2xl text-center'>
                        {viewStory.content}
                    </div>
                )
             default:
                return null;
        }
    }

    // Reaction calculation
    const reactionCounts = reactions.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
    }, {});
    const topReactions = Object.entries(reactionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(entry => entry[0]);

    const currentUserReactionObj = reactions.find(r => (r.user?._id || r.user) === currentUser?._id);
    const currentUserReaction = currentUserReactionObj ? currentUserReactionObj.type : null;

  return createPortal(
    <div className='fixed inset-0 h-screen bg-black bg-opacity-90 z-[110] flex items-center justify-center'
    style={{backgroundColor: viewStory.media_type === 'text' ? viewStory.background_color : '#000000'}}
    onClick={() => setShowReactionMenu(false)}
    >
        <div className='absolute top-0 left-0 w-full h-1 bg-gray-700'>
            <div className='h-full bg-white transition-all duration-100 ease-linear' style={{width: `${progress * 100}%`}}>

            </div>
        </div>
        <div className='absolute top-4 left-4 flex items-center space-x-3 p-2 px-2 sm:p-4 sm:px-5 backdrop-blur-2xl rounded bg-black/50 z-10'>
            <img src={viewStory.user?.profile_picture} alt="" className='size-7 sm:size-8 rounded-full object-cover border border-white'/>
            <div className='text-white font-medium flex items-center gap-1.5'>
                <span>{viewStory.user?.full_name}</span>
                <BadgeCheck size={18}/>
            </div>
        </div>
        <div className='absolute top-4 right-4 flex items-center gap-2 z-10'>
            {isOwner && (
                <button
                    onClick={handleDeleteClick}
                    disabled={isDeleting}
                    className='text-white hover:text-red-500 transition disabled:opacity-50 p-2'
                    title='Delete story'
                >
                    <Trash2 className='w-6 h-6'/>
                </button>
            )}
            <button onClick={handleClose} className='text-white p-2 focus:outline-none'>
                <X className='w-8 h-8 hover:scale-110 transition cursor-pointer'/>
            </button>
        </div>

        <div className='max-w-[100vw] max-h-[100vh] flex items-center justify-center relative' onClick={e => e.stopPropagation()}>
            {renderContent()}
        </div>

        {/* Reactions Display (Owner view) */}
        {isOwner && topReactions.length > 0 && (
            <div 
                className='absolute bottom-6 right-6 flex items-center bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 cursor-pointer hover:bg-black/60 transition z-50'
                onClick={(e) => { e.stopPropagation(); setShowReactionList(true) }}
            >
                <div className="flex -space-x-1">
                    {topReactions.map((type, idx) => (
                        <span key={type} className="text-sm bg-white rounded-full z-10" style={{zIndex: 3-idx}}>
                            {REACTION_ICONS[type]}
                        </span>
                    ))}
                </div>
                <span className='text-white text-xs font-medium ml-2'>{reactions.length}</span>
            </div>
        )}

        {/* Story Bottom Actions (Reply & React) */}
        {!isOwner && (
            <div className='absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 flex gap-3 items-center z-10' onClick={e => e.stopPropagation()}>
                <div className='flex-1 relative'>
                    <input 
                        type="text" 
                        placeholder='Reply to story...'
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleReply()}
                        className='w-full bg-black/40 backdrop-blur-md text-white placeholder-gray-300 border border-white/30 rounded-full px-4 py-2.5 outline-none focus:border-white/70 transition'
                    />
                    <button 
                        onClick={handleReply}
                        disabled={!replyText.trim() || isReplying}
                        className='absolute right-2 top-1/2 -translate-y-1/2 text-white p-1 rounded-full hover:bg-white/20 disabled:opacity-50 transition'
                    >
                        <SendHorizonal size={18} />
                    </button>
                </div>
                
                <div className='relative'>
                    <button 
                        onClick={() => setShowReactionMenu(!showReactionMenu)}
                        className={`p-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/30 hover:bg-white/20 transition ${currentUserReaction ? 'text-2xl leading-none px-2 py-1' : 'text-white'}`}
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

        <ConfirmDialog
            isOpen={showDeleteConfirm}
            title="Delete Story"
            message="Are you sure you want to delete this story? This action cannot be undone."
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
    </div>,
    document.body
  );
}

export default StoryViewer