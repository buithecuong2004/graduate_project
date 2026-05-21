import { Menu, X } from 'lucide-react'     
import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Loading from '../components/Loading'
import Sidebar from '../components/Sidebar'
import { useSelector, useDispatch } from 'react-redux'
import StoryViewer from '../components/StoryViewer'
import { setViewStory, deleteStoryAction } from '../features/stories/storiesSlice'
import { useAuth } from '../context/AuthContext'

const Layout = () => {
    const user = useSelector((state)=>state.user.value)
    const viewStory = useSelector((state) => state.stories.viewStory)
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const dispatch = useDispatch()
    const { getToken } = useAuth()

    const handleDeleteStory = async (storyId) => {
        const token = await getToken()
        dispatch(deleteStoryAction({ storyId, token }))
    }

  return user ? (
    <div className='w-full flex h-screen bg-slate-100'>
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}/>
        <div className='flex-1 overflow-auto relative app-page'>
            <Outlet/>
        </div>
        {
            sidebarOpen ? 
            <X className='absolute top-4 right-4 p-2 z-50 bg-white rounded-full shadow-lg w-11 h-11 text-slate-700 sm:hidden' onClick={()=>setSidebarOpen(false)}/>
            :
            <Menu className='absolute top-4 right-4 p-2 z-50 bg-white rounded-full shadow-lg w-11 h-11 text-slate-700 sm:hidden' onClick={()=>setSidebarOpen(true)}/>
        }
        {viewStory && (
            <StoryViewer 
                viewStory={viewStory} 
                setViewStory={(story) => dispatch(setViewStory(story))} 
                currentUser={user} 
                onDeleteStory={handleDeleteStory}
            />
        )}
    </div>
  ) : (
    <Loading/>
  )
}

export default Layout
