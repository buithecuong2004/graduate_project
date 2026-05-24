import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { useSocket } from '../context/SocketContext'

const getDisplayName = (user) => user?.full_name || user?.username || 'Người dùng Tarous'
const getAvatarUrl = (user) => (
    user?.profile_picture ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName(user))}&background=0891b2&color=fff`
)

const RecentMessages = () => {
    const { connections } = useSelector((state) => state.connections)
    const { openChat } = useSocket()

    const contacts = useMemo(() => (
        [...connections].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), 'vi')).slice(0, 12)
    ), [connections])

    const handleOpenChat = (contact) => {
        openChat(contact, { replaceOldest: true })
    }

  return (
    <>
        <div className='surface max-w-xs rounded-[1.5rem] p-4 text-sm text-slate-800'>
            <div className='mb-4 flex items-center justify-between'>
                <h3 className='font-black text-slate-900'>Người liên hệ</h3>
                <span className='rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700'>{contacts.length}</span>
            </div>

            <div className='flex max-h-72 flex-col overflow-y-auto no-scrollbar'>
                {contacts.length === 0 ? (
                    <div className='py-8 text-center text-sm text-slate-500'>
                        Chưa có người liên hệ
                    </div>
                ) : contacts.map((contact) => (
                    <button
                        type='button'
                        key={contact._id}
                        onClick={() => handleOpenChat(contact)}
                        className='flex items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-slate-100'
                    >
                        <img src={getAvatarUrl(contact)} alt='' className='size-10 rounded-full object-cover' />
                        <p className='min-w-0 flex-1 truncate font-bold text-slate-900'>{getDisplayName(contact)}</p>
                    </button>
                ))}
            </div>
        </div>
    </>
  )
}

export default RecentMessages
