import { Menu, X } from 'lucide-react'     
import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Loading from '../../components/user/Loading'
import Sidebar from '../../components/user/Sidebar'
import ChatDock from '../../components/user/ChatDock'
import { useSelector, useDispatch } from 'react-redux'
import StoryViewer from '../../components/user/StoryViewer'
import { setViewStory, deleteStoryAction } from '../../features/stories/storiesSlice'
import { useAuth } from '../../context/AuthContext'

const Layout = ({ onStartCall }) => {
    const user = useSelector((state)=>state.user.value)
    const viewStory = useSelector((state) => state.stories.viewStory)
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const dispatch = useDispatch()
    const { getToken } = useAuth()
    const { pathname } = useLocation()
    const isMessengerWindow = /^\/messages\/(?:group\/)?[^/]+$/.test(pathname)

    const handleDeleteStory = async (storyId) => {
        const token = await getToken()
        dispatch(deleteStoryAction({ storyId, token }))
    }

  return user ? (
    <div className='w-full flex h-screen bg-slate-100'>
        {!isMessengerWindow && <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}/>}
        <div className='flex-1 overflow-auto relative app-page'>
            <Outlet/>
        </div>
        {!isMessengerWindow && (
            sidebarOpen ? 
            <X className='absolute top-4 right-4 p-2 z-50 bg-white rounded-full shadow-lg w-11 h-11 text-slate-700 sm:hidden' onClick={()=>setSidebarOpen(false)}/>
            :
            <Menu className='absolute top-4 right-4 p-2 z-50 bg-white rounded-full shadow-lg w-11 h-11 text-slate-700 sm:hidden' onClick={()=>setSidebarOpen(true)}/>
        )}
        {viewStory && (
            <StoryViewer 
                viewStory={viewStory} 
                setViewStory={(story) => dispatch(setViewStory(story))} 
                currentUser={user} 
                onDeleteStory={handleDeleteStory}
            />
        )}
        {!isMessengerWindow && <ChatDock onStartCall={onStartCall} />}
    </div>
  ) : (
    <Loading/>
  )
}

export default Layout
