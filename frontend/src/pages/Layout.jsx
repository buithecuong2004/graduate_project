import { Menu, X } from 'lucide-react'     
import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Loading from '../components/Loading'
import Sidebar from '../components/Sidebar'
import { useSelector, useDispatch } from 'react-redux'
import StoryViewer from '../components/StoryViewer'
import { setViewStory, deleteStoryAction } from '../features/stories/storiesSlice'
import { useAuth } from '@clerk/clerk-react'

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
    <div className='w-full flex h-screen'>
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}/>
        <div className='flex-1 overflow-auto bg-slate-50 relative'>
            <Outlet/>
        </div>
        {
            sidebarOpen ? 
            <X className='absolute top-3 right-3 p-2 z-50 bg-white rounded-md shadow w-10 h-10 text-gray-600 sm:hidden' onClick={()=>setSidebarOpen(false)}/>
            :
            <Menu className='absolute top-3 right-3 p-2 z-50 bg-white rounded-md shadow w-10 h-10 text-gray-600 sm:hidden' onClick={()=>setSidebarOpen(true)}/>
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