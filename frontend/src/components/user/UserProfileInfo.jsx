import { Calendar, KeyRound, MapPin, PenBox, Verified } from 'lucide-react'
import moment from '../../utils/moment'
import React from 'react'

const UserProfileInfo = ({ user, posts, profileId, setShowEdit, setShowChangePassword }) => {
    return (
        <div className='relative bg-white px-5 pb-6 pt-4 sm:px-8'>
            <div className='flex flex-col gap-6 md:flex-row md:items-start'>
                <div className='-mt-20 size-32 rounded-full bg-white p-1 shadow-xl sm:size-36 md:-mt-16'>
                    <img src={user.profile_picture} alt='' className='h-full w-full rounded-full object-cover avatar-ring' />
                </div>

                <div className='min-w-0 flex-1'>
                    <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
                        <div className='min-w-0'>
                            <div className='flex items-center gap-2'>
                                <h1 className='truncate text-3xl font-black text-slate-950'>{user.full_name}</h1>
                                <Verified className='w-6 h-6 text-cyan-500 shrink-0' />
                            </div>
                            <p className='mt-1 text-slate-500'>{user.username ? `@${user.username}` : 'Thêm tên người dùng'}</p>
                        </div>
                        {!profileId && (
                            <div className='flex flex-wrap items-center gap-3'>
                                <button onClick={() => setShowChangePassword(true)} className='btn-muted px-4 py-2.5 cursor-pointer'>
                                    <KeyRound className='w-4 h-4' />
                                    Đổi mật khẩu
                                </button>
                                <button onClick={() => setShowEdit(true)} className='btn-muted px-4 py-2.5 cursor-pointer'>
                                    <PenBox className='w-4 h-4' />
                                    Chỉnh sửa
                                </button>
                            </div>
                        )}
                    </div>

                    <p className='mt-4 max-w-2xl text-sm leading-7 text-slate-700'>{user.bio}</p>

                    <div className='mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500'>
                        <span className='flex items-center gap-1.5'>
                            <MapPin className='w-4 h-4 text-cyan-600' />
                            {user.location ? user.location : 'Thêm vị trí'}
                        </span>
                        <span className='flex items-center gap-1.5'>
                            <Calendar className='w-4 h-4 text-cyan-600' />
                            Đã tham gia <span className='font-semibold text-slate-700'>{moment(user.createdAt).fromNow()}</span>
                        </span>
                    </div>

                    <div className='mt-6 grid max-w-lg grid-cols-3 gap-3'>
                        {[
                            [posts.length, 'Bài viết'],
                            [user.followers.length, 'Người theo dõi'],
                            [user.following.length, 'Đang theo dõi']
                        ].map(([value, label]) => (
                            <div key={label} className='rounded-2xl bg-slate-50 px-4 py-3 text-center'>
                                <p className='text-xl font-black text-slate-950'>{value}</p>
                                <p className='mt-1 text-xs font-semibold text-slate-500'>{label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default UserProfileInfo
