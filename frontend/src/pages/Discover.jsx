import React, { useEffect, useState } from 'react'
import { Search, UserRoundSearch } from 'lucide-react'
import UserCard from '../components/UserCard'
import Loading from '../components/Loading'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import localizeMessage from '../utils/localization'
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
      data.success ? setUsers(data.users) : toast.error(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (e) => {
    if (e.key === 'Enter') {
      setHasSearched(true)
      await fetchUsers(input.trim())
    }
  }

  useEffect(()=>{
    getToken().then((token)=>{
      dispatch(fetchUser(token))
    })
    fetchUsers()
  },[])

  return (
    <div className='app-page min-h-full'>
      <div className='app-container'>
        <section className='mb-8 rounded-[2rem] surface p-6'>
          <p className='page-kicker'>Khám phá</p>
          <h1 className='page-title mt-2'>Tìm người mới để kết nối</h1>
          <p className='page-subtitle mt-3 max-w-2xl'>Tìm theo tên, username, tiểu sử hoặc vị trí. Nhấn Enter để tìm kiếm.</p>

          <div className='relative mt-6'>
            <Search className='absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400'/>
            <input
              type='text'
              placeholder='Tìm kiếm mọi người...'
              className='input-modern py-4 pl-12 pr-4 text-base'
              onChange={(e)=>setInput(e.target.value)}
              value={input}
              onKeyUp={handleSearch}
            />
          </div>
        </section>

        {loading ? (
          <Loading height='50vh'/>
        ) : (
          <div className='grid gap-5 sm:grid-cols-2 xl:grid-cols-3'>
            {users.map((user)=>(
              <UserCard user={user} key={user._id}/>
            ))}
          </div>
        )}

        {!loading && hasSearched && users.length === 0 && (
          <div className='surface mt-6 flex flex-col items-center justify-center rounded-[2rem] py-16 text-center text-slate-500'>
            <UserRoundSearch className='w-12 h-12 mb-3 text-slate-300'/>
            <p className='text-lg font-black text-slate-900'>Không tìm thấy người dùng nào</p>
            <p className='mt-1 text-sm'>Thử tìm bằng tên, username hoặc vị trí khác.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Discover
