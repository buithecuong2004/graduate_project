import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import StoryModal from './StoryModal'
import { useAuth } from '@clerk/clerk-react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchStories, setViewStory } from '../features/stories/storiesSlice'
import moment from 'moment'

const StoriesBar = ({ refreshTrigger }) => {
    const [showModal, setShowModal] = useState(false)
    const { getToken } = useAuth()
    const dispatch = useDispatch()
    const { stories, loading } = useSelector(state => state.stories)
    const currentUser = useSelector(state => state.user.value)

    const [showLeftArrow, setShowLeftArrow] = useState(false)
    const [showRightArrow, setShowRightArrow] = useState(false)
    const scrollRef = useRef(null)

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
            setShowLeftArrow(scrollLeft > 0)
            setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5)
        }
    }

    const scroll = (direction) => {
        if (scrollRef.current) {
            const scrollAmount = 300
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            })
        }
    }

    useEffect(() => {
        checkScroll()
        window.addEventListener('resize', checkScroll)
        return () => window.removeEventListener('resize', checkScroll)
    }, [stories])

    useEffect(() => {
        const loadStories = async () => {
            const token = await getToken()
            dispatch(fetchStories(token))
        }
        loadStories()
    }, [dispatch, getToken, refreshTrigger])

    if (loading && stories.length === 0) return null

    return (
        <div className='relative group w-full max-w-2xl mx-auto'>
            {showLeftArrow && (
                <button
                    onClick={() => scroll('left')}
                    className='absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-30 bg-white border border-gray-200 text-slate-800 p-2.5 rounded-full shadow-xl hover:bg-gray-50 transition-all active:scale-90 cursor-pointer'
                >
                    <ChevronLeft size={20} strokeWidth={2.5} />
                </button>
            )}

            <div 
                ref={scrollRef}
                onScroll={checkScroll}
                className='flex items-center space-x-3 overflow-x-hidden no-scrollbar py-4 px-2 scroll-smooth'
            >
                {/* Create Story Button */}
                <div 
                    onClick={() => setShowModal(true)} 
                    className='min-w-[120px] max-w-[120px] h-[200px] bg-slate-50 rounded-xl shadow-sm border-2 border-dashed border-indigo-300 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all active:scale-95 shrink-0 group/add'
                >
                    <div className='size-14 rounded-full bg-indigo-600 flex items-center justify-center text-white mb-4 group-hover/add:scale-110 group-hover/add:bg-indigo-700 transition-all duration-300 shadow-md'>
                        <Plus size={32} strokeWidth={2.5}/>
                    </div>
                    <span className='text-sm font-bold text-indigo-900 group-hover/add:text-indigo-700 transition-colors'>Create story</span>
                </div>

                {/* Stories List */}
                <div className='flex items-center space-x-3'>
                    {
                        stories.map((story, index) => (
                            <div
                                onClick={() => dispatch(setViewStory(story))}
                                key={index}
                                className='relative rounded-xl shadow-md min-w-[120px] max-w-[120px] h-[200px] shrink-0 cursor-pointer hover:shadow-xl transition-all duration-300 bg-gradient-to-b from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-95 overflow-hidden group/card'
                            >
                                {/* User Info Overlay */}
                                <div className='absolute inset-0 z-20 p-3 flex flex-col justify-between pointer-events-none'>
                                    <img
                                        src={story.user?.profile_picture}
                                        alt=""
                                        className='size-9 rounded-full ring-2 ring-indigo-500 shadow-lg object-cover'
                                    />
                                    <p className='text-white text-xs font-bold truncate drop-shadow-md'>
                                        {story.user?.full_name}
                                    </p>
                                </div>

                                {/* Content/Media */}
                                <div className='absolute inset-0 z-10'>
                                    {story.media_type === 'text' ? (
                                        <div className='w-full h-full p-3 pt-14 flex items-start justify-start'>
                                            <p className='text-white text-xs font-medium line-clamp-4 leading-relaxed'>
                                                {story.content}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className='w-full h-full bg-black'>
                                            {story.media_type === "image" ? (
                                                <img
                                                    src={story.media_url}
                                                    alt=""
                                                    className='h-full w-full object-cover opacity-80 group-hover/card:scale-110 transition duration-700'
                                                />
                                            ) : (
                                                <video
                                                    src={story.media_url}
                                                    className='h-full w-full object-cover opacity-80 group-hover/card:scale-110 transition duration-700'
                                                />
                                            )}
                                            {/* Gradient overlay for text readability */}
                                            <div className='absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40' />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    }
                </div>
            </div>

            {showRightArrow && (
                <button
                    onClick={() => scroll('right')}
                    className='absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-30 bg-white border border-gray-200 text-slate-800 p-2.5 rounded-full shadow-xl hover:bg-gray-50 transition-all active:scale-90 cursor-pointer'
                >
                    <ChevronRight size={20} strokeWidth={2.5} />
                </button>
            )}

            {showModal && <StoryModal setShowModal={setShowModal} />}

        </div>
    )
}

export default StoriesBar