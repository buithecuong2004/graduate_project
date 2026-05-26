import React, { useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import localizeMessage from '../../utils/localization'

const initialPasswordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
}

const ChangePasswordModal = ({setShowChangePassword}) => {
    const {getToken} = useAuth()
    const [isChangingPassword, setIsChangingPassword] = useState(false)
    const [passwordForm, setPasswordForm] = useState(initialPasswordForm)

    const handlePasswordFieldChange = (e) => {
        const {name, value} = e.target
        setPasswordForm((current) => ({...current, [name]: value}))
    }

    const handleChangePassword = async(e) => {
        e.preventDefault()
        if(isChangingPassword) return

        setIsChangingPassword(true)
        try {
            const token = await getToken()
            const {data} = await api.post('/api/user/change-password', passwordForm, {
                headers: {Authorization: `Bearer ${token}`}
            })

            if(!data.success) {
                toast.error(localizeMessage(data.message))
                return
            }

            toast.success(localizeMessage(data.message))
            setPasswordForm(initialPasswordForm)
            setShowChangePassword(false)
        } catch (error) {
            toast.error(localizeMessage(error.response?.data?.message || error.message))
        } finally {
            setIsChangingPassword(false)
        }
    }

    return (
        <div className='fixed inset-0 z-[140] h-screen overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm'>
            <div className='mx-auto flex min-h-full max-w-xl items-center justify-center'>
                <form onSubmit={handleChangePassword} className='surface w-full overflow-hidden rounded-[2rem]'>
                    <div className='flex items-center justify-between border-b border-slate-200 px-6 py-5'>
                        <div className='flex items-center gap-3'>
                            <span className='flex size-11 items-center justify-center rounded-full bg-cyan-50 text-cyan-700'>
                                <KeyRound className='size-5'/>
                            </span>
                            <div>
                                <p className='page-kicker'>Bảo mật</p>
                                <h1 className='mt-1 text-2xl font-black text-slate-900'>Đổi mật khẩu</h1>
                            </div>
                        </div>
                        <button type='button' onClick={()=>setShowChangePassword(false)} className='rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer'>
                            <X className='size-5'/>
                        </button>
                    </div>

                    <div className='space-y-4 p-6'>
                        <div>
                            <label className='mb-1.5 block text-sm font-bold text-slate-700'>Mật khẩu hiện tại</label>
                            <input
                                name='currentPassword'
                                type='password'
                                className='input-modern px-4 py-3'
                                placeholder='********'
                                autoComplete='current-password'
                                onChange={handlePasswordFieldChange}
                                value={passwordForm.currentPassword}
                            />
                        </div>
                        <div>
                            <label className='mb-1.5 block text-sm font-bold text-slate-700'>Mật khẩu mới</label>
                            <input
                                name='newPassword'
                                type='password'
                                className='input-modern px-4 py-3'
                                placeholder='Ít nhất 6 ký tự'
                                autoComplete='new-password'
                                onChange={handlePasswordFieldChange}
                                value={passwordForm.newPassword}
                            />
                        </div>
                        <div>
                            <label className='mb-1.5 block text-sm font-bold text-slate-700'>Xác thực mật khẩu</label>
                            <input
                                name='confirmPassword'
                                type='password'
                                className='input-modern px-4 py-3'
                                placeholder='Nhập lại mật khẩu'
                                autoComplete='new-password'
                                onChange={handlePasswordFieldChange}
                                value={passwordForm.confirmPassword}
                            />
                        </div>
                    </div>

                    <div className='flex justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-6 py-5'>
                        <button onClick={()=>setShowChangePassword(false)} type='button' disabled={isChangingPassword} className='btn-muted px-5 py-2.5 cursor-pointer disabled:opacity-60'>
                            Hủy
                        </button>
                        <button type='submit' disabled={isChangingPassword} className='btn-primary px-6 py-2.5 cursor-pointer disabled:opacity-60'>
                            <KeyRound className='size-4'/>
                            {isChangingPassword ? 'Đang đổi...' : 'Đổi mật khẩu'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default ChangePasswordModal
