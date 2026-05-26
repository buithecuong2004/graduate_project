import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import StoryModal from './StoryModal'
import { useAuth } from '../../context/AuthContext'
import { useDispatch, useSelector } from 'react-redux'
import { fetchStories, setViewStory } from '../../features/stories/storiesSlice'

const StoriesBar = ({ refreshTrigger }) => {
    const [showModal, setShowModal] = useState(false)
    const { getToken } = useAuth()
    const dispatch = useDispatch()
    const { stories, loading } = useSelector(state => state.stories)

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
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -280 : 280,
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
        <div className='relative group w-full'>
            {showLeftArrow && (
                <button
                    onClick={() => scroll('left')}
                    className='absolute left-0 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2.5 text-slate-700 shadow-xl transition hover:bg-slate-50 active:scale-90 cursor-pointer'
                >
                    <ChevronLeft size={20} strokeWidth={2.5} />
                </button>
            )}

            <div
                ref={scrollRef}
                onScroll={checkScroll}
                className='flex items-center gap-3 overflow-x-hidden no-scrollbar py-2 scroll-smooth'
            >
                <button
                    type='button'
                    onClick={() => setShowModal(true)}
                    className='group/add flex h-[190px] min-w-[118px] max-w-[118px] shrink-0 flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-cyan-300 bg-cyan-50/80 text-cyan-800 transition hover:border-cyan-500 hover:bg-cyan-100 active:scale-95 cursor-pointer'
                >
                    <span className='mb-3 flex size-14 items-center justify-center rounded-full bg-cyan-600 text-white shadow-lg shadow-cyan-600/25 transition group-hover/add:scale-110'>
                        <Plus size={30} strokeWidth={2.5}/>
                    </span>
                    <span className='text-sm font-black'>Tạo tin</span>
                </button>

                {stories.map((story) => (
                    <button
                        type='button'
                        onClick={() => dispatch(setViewStory(story))}
                        key={story._id}
                        className='group/card relative h-[190px] min-w-[118px] max-w-[118px] shrink-0 cursor-pointer overflow-hidden rounded-[1.35rem] bg-slate-900 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-xl active:scale-95'
                    >
                        <div className='absolute inset-0 z-10 bg-gradient-to-b from-black/45 via-black/5 to-black/65' />
                        {story.media_type === 'image' ? (
                            <img src={story.media_url} alt='' className='absolute inset-0 h-full w-full object-cover transition duration-700 group-hover/card:scale-110'/>
                        ) : story.media_type === 'video' ? (
                            <video src={story.media_url} className='absolute inset-0 h-full w-full object-cover transition duration-700 group-hover/card:scale-110'/>
                        ) : (
                            <div className='absolute inset-0 p-3 pt-14 text-xs font-semibold leading-relaxed text-white' style={{backgroundColor: story.background_color || '#0891b2'}}>
                                <p className='line-clamp-5'>{story.content}</p>
                            </div>
                        )}

                        <div className='absolute inset-0 z-20 flex flex-col justify-between p-3 pointer-events-none'>
                            <img
                                src={story.user?.profile_picture}
                                alt=''
                                className='size-10 rounded-full object-cover avatar-ring'
                            />
                            <p className='text-xs font-black text-white drop-shadow-md line-clamp-2'>
                                {story.user?.full_name}
                            </p>
                        </div>
                    </button>
                ))}
            </div>

            {showRightArrow && (
                <button
                    onClick={() => scroll('right')}
                    className='absolute right-0 top-1/2 z-30 translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2.5 text-slate-700 shadow-xl transition hover:bg-slate-50 active:scale-90 cursor-pointer'
                >
                    <ChevronRight size={20} strokeWidth={2.5} />
                </button>
            )}

            {showModal && <StoryModal setShowModal={setShowModal} />}
        </div>
    )
}

export default StoriesBar
