import React, { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useSocket } from '../context/SocketContext'
import { getPresenceStatus } from '../utils/presence'

const getDisplayName = (user) => user?.full_name || user?.username || 'Người dùng Tarous'
const getAvatarUrl = (user) => (
    user?.profile_picture ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName(user))}&background=0891b2&color=fff`
)

const ContactAvatar = ({ contact, now }) => {
    const presence = getPresenceStatus(contact, now)

    return (
        <span className='relative size-10 shrink-0'>
            <img src={getAvatarUrl(contact)} alt='' className='size-10 rounded-full object-cover' />
            {presence.isOnline ? (
                <span className='absolute bottom-0 right-0 size-3 rounded-full border-2 border-white bg-emerald-500' />
            ) : presence.label ? (
                <span className='absolute -bottom-1 left-1/2 min-w-max -translate-x-1/2 rounded-full border border-slate-100 bg-white px-1.5 text-[10px] font-black leading-4 text-emerald-700 shadow-sm whitespace-nowrap'>
                    {presence.label}
                </span>
            ) : null}
        </span>
    )
}

const RecentMessages = () => {
    const { connections } = useSelector((state) => state.connections)
    const currentUser = useSelector((state) => state.user.value)
    const { openChat } = useSocket()
    const [now, setNow] = useState(() => Date.now())
    const currentUserId = currentUser?._id?.toString?.() || ''

    const contacts = useMemo(() => (
        [...connections]
            .filter((contact) => contact?._id?.toString?.() !== currentUserId)
            .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), 'vi'))
    ), [connections, currentUserId])

    useEffect(() => {
        const intervalId = window.setInterval(() => setNow(Date.now()), 60 * 1000)
        return () => window.clearInterval(intervalId)
    }, [])

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

            <div className='flex flex-col'>
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
                        <ContactAvatar contact={contact} now={now} />
                        <p className='min-w-0 flex-1 truncate font-bold text-slate-900'>{getDisplayName(contact)}</p>
                    </button>
                ))}
            </div>
        </div>
    </>
  )
}

export default RecentMessages
