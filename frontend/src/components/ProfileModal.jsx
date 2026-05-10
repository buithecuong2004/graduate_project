import React, { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { updateUser } from '../features/user/userSlice'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const ProfileModal = ({setShowEdit}) => {

    const dispatch = useDispatch()
    const {getToken} = useAuth()

    const user = useSelector((state)=>state.user.value)
    const [editForm, setEditForm] = useState({
        username: user.username,
        bio: user.bio,
        location: user.location,
        profile_picture: null,
        cover_photo: null,
        full_name: user.full_name
    })

    const handleSaveProfile = async(e) => {
        e.preventDefault();
        try {
            const userData = new FormData()
            const {full_name, username, bio, location, profile_picture, cover_photo} = editForm

            userData.append('username',username)
            userData.append('bio',bio)
            userData.append('location',location)
            userData.append('full_name',full_name)
            profile_picture && userData.append('profile', profile_picture)
            cover_photo && userData.append('cover', cover_photo)

            const token = await getToken()
            dispatch(updateUser({userData, token}))
            setShowEdit(false)
        } catch (error) {
            toast.error(error.message)
        }
    }

  return (
    <div className='fixed top-0 bottom-0 left-0 right-0 z-110 h-screen overflow-y-scroll bg-black/50'>
        <div className='max-w-2xl sm:py-6 mx-auto'>
            <div className='bg-white roundeed-lg shadow p-6'>
                <h1 className='text-2xl font-bold text-gray-900 mb-6'>Chỉnh sửa Hồ sơ</h1>
                <form className='space-y-4' onSubmit={e=>toast.promise(
                    handleSaveProfile(e), {loading: 'Đang lưu...'}
                )}>
                    <div className='flex flex-col items-start gap-3'>
                        <label htmlFor="profile_picture" className='block text-sm font-medium text-gray-700'>
                            Ảnh Đại Diện
                            <input hidden type="file" accept='image/*' id='profile_picture' className='w-full p-3 border border-gray-200 rounded-lg'
                            onChange={(e)=>setEditForm({...editForm, profile_picture: e.target.files[0]})}
                            />
                            <div className='group/profile relative'>
                                <img src={editForm.profile_picture ? URL.createObjectURL(editForm.profile_picture) : user.profile_picture} alt="" 
                                className='w-24 h-24 rounded-full object-cover mt-2'/>

                                <div className='absolute hidden group-hover/profile:flex top-0 left-0 right-0 bottom-0 bg-black/20 rounded-full items-center justify-center'>
                                    <Pencil className='w-5 h-5 text-white'/>
                                </div>
                            </div>
                        </label>
                    </div>

                    <div className='flex flex-col items-start gap-3'>
                        <label htmlFor="cover_photo" className='block text-sm font-medium text-gray-700 mb-1'>
                            Ảnh Bìa
                            <input hidden type="file" accept='image/*' id='cover_photo' className='w-full p-3 border border-gray-200 rounded-lg'
                            onChange={(e)=>setEditForm({...editForm, cover_photo: e.target.files[0]})}
                            />
                            <div className='group/cover relative'>
                                <img src={editForm.cover_photo ? URL.createObjectURL(editForm.cover_photo) : user.cover_photo} alt=""
                                className='w-80 h-40 rounded-lg bg-linear-to-r from-indigo-200 via-purple-200 to-pink-200 object-cover mt-2'
                                />
                                <div className='absolute hidden group-hover/cover:flex top-0 left-0 right-0 bottom-0 bg-black/20 rounded-lg items-center justify-center'>
                                    <Pencil className='w-5 h-5 text-white'/>
                                </div>
                            </div>
                        </label>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Tên
                        </label>
                        <input type="text" name="" id="" className='w-full p-3 border border-gray-200 rounded-lg' placeholder='Vui lòng nhập tên đầy đủ'
                        onChange={(e)=>setEditForm({...editForm, full_name: e.target.value})} value={editForm.full_name}/>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Tên người dùng
                        </label>
                        <input type="text" name="" id="" className='w-full p-3 border border-gray-200 rounded-lg' placeholder='Vui lòng nhập tên người dùng'
                        onChange={(e)=>setEditForm({...editForm, username: e.target.value})} value={editForm.username}/>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Tiểu sử
                        </label>
                        <textarea rows={3} className='w-full p-3 border border-gray-200 rounded-lg' placeholder='Vui lòng nhập tiểu sử của bạn'
                        onChange={(e)=>setEditForm({...editForm, bio: e.target.value})} value={editForm.bio}/>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Vị Trí
                        </label>
                        <input type="text" name="" id="" className='w-full p-3 border border-gray-200 rounded-lg' placeholder='Vui lòng nhập vị trí'
                        onChange={(e)=>setEditForm({...editForm, location: e.target.value})} value={editForm.location}/>
                    </div>

                    <div className='flex justify-end space-x-3 pt-6'>
                        <button onClick={()=>setShowEdit(false)} type='button' className='px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer'>Hủy</button>
                        <button type='submit' className='px-4 py-2 bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition cursor-pointer'>Lưu Thay đổi</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
  )
}

export default ProfileModal