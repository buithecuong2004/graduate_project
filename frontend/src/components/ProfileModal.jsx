import React, { useState } from 'react'
import { Camera, ImagePlus, Pencil, X } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { updateUser } from '../features/user/userSlice'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const ProfileModal = ({setShowEdit, onUserUpdated}) => {
    const dispatch = useDispatch()
    const {getToken} = useAuth()
    const user = useSelector((state)=>state.user.value)

    const [isSaving, setIsSaving] = useState(false)
    const [editForm, setEditForm] = useState({
        username: user.username,
        bio: user.bio,
        location: user.location,
        profile_picture: null,
        cover_photo: null,
        full_name: user.full_name
    })

    const handleSaveProfile = async(e) => {
        e?.preventDefault()
        if(isSaving) return

        setIsSaving(true)
        try {
            const userData = new FormData()
            const {full_name, username, bio, location, profile_picture, cover_photo} = editForm

            userData.append('username', username)
            userData.append('bio', bio)
            userData.append('location', location)
            userData.append('full_name', full_name)
            profile_picture && userData.append('profile', profile_picture)
            cover_photo && userData.append('cover', cover_photo)

            const token = await getToken()
            const updatedUser = await dispatch(updateUser({userData, token})).unwrap()
            onUserUpdated?.(updatedUser)
            setShowEdit(false)
        } catch (error) {
            if(error instanceof Error) toast.error(error.message)
        } finally {
            setIsSaving(false)
        }
    }

    const profilePreview = editForm.profile_picture ? URL.createObjectURL(editForm.profile_picture) : user.profile_picture
    const coverPreview = editForm.cover_photo ? URL.createObjectURL(editForm.cover_photo) : user.cover_photo

  return (
    <div className='fixed inset-0 z-[140] h-screen overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm'>
        <div className='mx-auto flex min-h-full max-w-3xl items-center justify-center'>
            <form onSubmit={handleSaveProfile} className='surface w-full overflow-hidden rounded-[2rem]'>
                <div className='flex items-center justify-between border-b border-slate-200 px-6 py-5'>
                    <div>
                        <p className='page-kicker'>Hồ sơ</p>
                        <h1 className='mt-1 text-2xl font-black text-slate-900'>Chỉnh sửa hồ sơ</h1>
                    </div>
                    <button type='button' onClick={()=>setShowEdit(false)} className='rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer'>
                        <X className='size-5'/>
                    </button>
                </div>

                <div className='p-6'>
                    <label htmlFor='cover_photo' className='group/cover relative block h-48 cursor-pointer overflow-hidden rounded-[1.5rem] bg-[linear-gradient(135deg,#0f172a,#0e7490,#0f766e)]'>
                        {coverPreview && <img src={coverPreview} alt='' className='h-full w-full object-cover'/>}
                        <input hidden type='file' accept='image/*' id='cover_photo' onChange={(e)=>setEditForm({...editForm, cover_photo: e.target.files[0]})}/>
                        <div className='absolute inset-0 hidden items-center justify-center bg-black/35 text-white group-hover/cover:flex'>
                            <span className='flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 font-bold backdrop-blur'>
                                <ImagePlus className='size-5'/>
                                Đổi ảnh bìa
                            </span>
                        </div>
                    </label>

                    <div className='relative -mt-14 mb-6 flex items-end justify-between gap-4 px-4'>
                        <label htmlFor='profile_picture' className='group/profile relative block size-28 cursor-pointer rounded-full bg-white p-1 shadow-xl'>
                            <img src={profilePreview} alt='' className='h-full w-full rounded-full object-cover avatar-ring'/>
                            <input hidden type='file' accept='image/*' id='profile_picture' onChange={(e)=>setEditForm({...editForm, profile_picture: e.target.files[0]})}/>
                            <span className='absolute bottom-1 right-1 flex size-9 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg transition group-hover/profile:bg-cyan-700'>
                                <Camera className='size-4'/>
                            </span>
                        </label>
                        <p className='mb-3 hidden text-sm text-slate-500 sm:block'>Cập nhật thông tin cá nhân để bạn bè nhận ra bạn dễ hơn.</p>
                    </div>

                    <div className='grid gap-4 sm:grid-cols-2'>
                        <div>
                            <label className='mb-1.5 block text-sm font-bold text-slate-700'>Tên</label>
                            <input
                                type='text'
                                className='input-modern px-4 py-3'
                                placeholder='Nhập tên đầy đủ'
                                onChange={(e)=>setEditForm({...editForm, full_name: e.target.value})}
                                value={editForm.full_name}
                            />
                        </div>

                        <div>
                            <label className='mb-1.5 block text-sm font-bold text-slate-700'>Tên người dùng</label>
                            <input
                                type='text'
                                className='input-modern px-4 py-3'
                                placeholder='Nhập tên người dùng'
                                onChange={(e)=>setEditForm({...editForm, username: e.target.value})}
                                value={editForm.username}
                            />
                        </div>

                        <div className='sm:col-span-2'>
                            <label className='mb-1.5 block text-sm font-bold text-slate-700'>Tiểu sử</label>
                            <textarea
                                rows={4}
                                className='input-modern resize-none px-4 py-3'
                                placeholder='Viết vài dòng giới thiệu về bạn'
                                onChange={(e)=>setEditForm({...editForm, bio: e.target.value})}
                                value={editForm.bio}
                            />
                        </div>

                        <div className='sm:col-span-2'>
                            <label className='mb-1.5 block text-sm font-bold text-slate-700'>Vị trí</label>
                            <input
                                type='text'
                                className='input-modern px-4 py-3'
                                placeholder='Nhập vị trí'
                                onChange={(e)=>setEditForm({...editForm, location: e.target.value})}
                                value={editForm.location}
                            />
                        </div>
                    </div>
                </div>

                <div className='flex justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-6 py-5'>
                    <button onClick={()=>setShowEdit(false)} type='button' disabled={isSaving} className='btn-muted px-5 py-2.5 cursor-pointer disabled:opacity-60'>
                        Hủy
                    </button>
                    <button type='submit' disabled={isSaving} className='btn-primary px-6 py-2.5 cursor-pointer disabled:opacity-60'>
                        <Pencil className='size-4'/>
                        {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                </div>
            </form>
        </div>
    </div>
  )
}

export default ProfileModal
