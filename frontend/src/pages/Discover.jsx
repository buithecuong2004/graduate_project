import React, { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import UserCard from '../components/UserCard'
import Loading from '../components/Loading'
import api from '../api/axios'
import { useAuth } from '@clerk/clerk-react'
import toast from 'react-hot-toast'
import { useDispatch } from 'react-redux'
import { fetchUser } from '../features/user/userSlice'

const Discover = () => {

  const dispatch = useDispatch()
  const [input, setInput] = useState('')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const { getToken } = useAuth()

  const [hasSearched, setHasSearched] = useState(false)

  const fetchUsers = async (searchInput = '') => {
    try {
      setUsers([])
      setLoading(true)
      const { data } = await api.post('/api/user/discover', {input: searchInput}, {
        headers: {Authorization: `Bearer ${await getToken()}`}
      })
      data.success ? setUsers(data.users) : toast.error(data.message)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (e) => {
    if (e.key === 'Enter') {
      if (!input.trim()) return
      setHasSearched(true)
      await fetchUsers(input.trim())
      setInput('')
    }
  }

  useEffect(()=>{
    getToken().then((token)=>{
      dispatch(fetchUser(token))
    })
    fetchUsers()
  },[])

  return (
    <div className='min-h-screen bg-linear-to-b from-slate-50 to-white'>
      <div className='max-w-6xl mx-auto p-6'>
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-slate-900 mb-2'>Discover People</h1>
          <p className='text-slate-600'>Connect with amazing people and grow your network</p>
        </div>

        <div className='mb-8 shadow-md rounded-md border border-slate-200/60 bg-white/80'>
          <div className='p-6'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5'/>
              <input type="text" name="" id="" placeholder='Search people by name, user, bio, or location...'
              className='pl-10 sm:pl-12 py-2 w-full border border-gray-300 rounded-md max-sm:text-sm'
              onChange={(e)=>setInput(e.target.value)} value={input} onKeyUp={handleSearch}
              />
            </div>
          </div>
        </div>

        <div className='flex flex-wrap gap-6'>
          {users.map((user)=>(
            <UserCard user={user} key={user._id}/>
          ))}
        </div>

        {!loading && hasSearched && users.length === 0 && (
          <div className='flex flex-col items-center justify-center py-16 text-slate-400'>
            <Search className='w-12 h-12 mb-3 opacity-30'/>
            <p className='text-lg font-medium'>No users found</p>
            <p className='text-sm'>Try searching with a different name, username, or location</p>
          </div>
        )}

        {
          loading && (<Loading height='60vh'/>)
        }

      </div>
    </div>
  )
}

export default Discover