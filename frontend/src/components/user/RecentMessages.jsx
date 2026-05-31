import React, { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, Plus, UsersRound, X } from 'lucide-react'
import { useSelector } from 'react-redux'
import { useSocket } from '../../context/SocketContext'
import { useAuth } from '../../context/AuthContext'
import { getPresenceStatus } from '../../utils/presence'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import localizeMessage from '../../utils/localization'

const getDisplayName = (user) => user?.full_name || user?.username || 'Người dùng Tarous'
const getAvatarUrl = (user) => (
    user?.profile_picture ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName(user))}&background=0891b2&color=fff`
)
const getGroupAvatarUrl = (group) => (
    group?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(group?.name || 'Group')}&background=0891b2&color=fff`
)
const getGroupId = (groupOrId) => groupOrId?._id?.toString?.() || groupOrId?.toString?.() || ''

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
    const { openChat, socket, socketRef } = useSocket()
    const { getToken } = useAuth()
    const [now, setNow] = useState(() => Date.now())
    const [groups, setGroups] = useState([])
    const [showCreateGroup, setShowCreateGroup] = useState(false)
    const [groupName, setGroupName] = useState('')
    const [selectedMemberIds, setSelectedMemberIds] = useState([])
    const [isCreatingGroup, setIsCreatingGroup] = useState(false)
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

    useEffect(() => {
        let cancelled = false

        const loadGroups = async () => {
            try {
                const token = await getToken()
                const { data } = await api.get('/api/group', {
                    headers: { Authorization: `Bearer ${token}` }
                })
                if (!cancelled && data.success) setGroups(data.groups || [])
            } catch (error) {
                if (!cancelled) console.error('group list error:', error)
            }
        }

        if (currentUserId) loadGroups()
        return () => { cancelled = true }
    }, [currentUserId, getToken])

    useEffect(() => {
        const activeSocket = socket || socketRef?.current
        if (!activeSocket) return undefined

        const upsertGroup = (group) => {
            if (!group?._id) return
            setGroups((currentGroups) => [
                group,
                ...currentGroups.filter((item) => item._id !== group._id)
            ])
        }

        const removeGroup = ({ groupId }) => {
            if (!groupId) return
            setGroups((currentGroups) => currentGroups.filter((group) => group._id !== groupId))
        }

        const upsertGroupFromMessage = (message) => {
            const groupId = getGroupId(message?.group_id)
            if (!groupId) return

            const messageGroup = typeof message.group_id === 'object' ? message.group_id : null
            setGroups((currentGroups) => {
                const existingGroup = currentGroups.find((group) => group._id === groupId)
                const nextGroup = {
                    ...(existingGroup || {}),
                    ...(messageGroup || {}),
                    _id: groupId,
                    latestMessage: message,
                }
                return [
                    nextGroup,
                    ...currentGroups.filter((group) => group._id !== groupId)
                ]
            })
        }

        activeSocket.on('group-chat-created', upsertGroup)
        activeSocket.on('group-chat-updated', upsertGroup)
        activeSocket.on('group-chat-removed', removeGroup)
        activeSocket.on('new-message', upsertGroupFromMessage)

        return () => {
            activeSocket.off('group-chat-created', upsertGroup)
            activeSocket.off('group-chat-updated', upsertGroup)
            activeSocket.off('group-chat-removed', removeGroup)
            activeSocket.off('new-message', upsertGroupFromMessage)
        }
    }, [socket, socketRef])

    const handleOpenChat = (contact) => {
        openChat(contact, { replaceOldest: true })
    }

    const handleOpenGroup = (group) => {
        openChat({ ...group, type: 'group', groupId: group._id }, { replaceOldest: true })
    }

    const toggleSelectedMember = (memberId) => {
        setSelectedMemberIds((ids) => (
            ids.includes(memberId)
                ? ids.filter((id) => id !== memberId)
                : [...ids, memberId]
        ))
    }

    const closeCreateGroup = () => {
        if (isCreatingGroup) return
        setShowCreateGroup(false)
        setGroupName('')
        setSelectedMemberIds([])
    }

    const handleCreateGroup = async (event) => {
        event.preventDefault()
        if (isCreatingGroup) return

        const nextName = groupName.trim()
        if (!nextName) {
            toast.error('Vui lòng đặt tên nhóm')
            return
        }
        if (selectedMemberIds.length === 0) {
            toast.error('Chọn ít nhất một người liên hệ')
            return
        }

        try {
            setIsCreatingGroup(true)
            const token = await getToken()
            const { data } = await api.post('/api/group', {
                name: nextName,
                member_ids: selectedMemberIds
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!data.success) throw new Error(data.message)

            setGroups((currentGroups) => [
                data.group,
                ...currentGroups.filter((group) => group._id !== data.group._id)
            ])
            setGroupName('')
            setSelectedMemberIds([])
            setShowCreateGroup(false)
            handleOpenGroup(data.group)
        } catch (error) {
            toast.error(localizeMessage(error.message))
        } finally {
            setIsCreatingGroup(false)
        }
    }

  return (
    <>
        <div className='surface max-w-xs rounded-[1.5rem] p-4 text-sm text-slate-800'>
            <div className='mb-4 flex items-center justify-between'>
                <h3 className='font-black text-slate-900'>Người liên hệ</h3>
                <div className='flex items-center gap-2'>
                    <span className='rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700'>{contacts.length}</span>
                    <button
                        type='button'
                        onClick={() => setShowCreateGroup(true)}
                        className='group relative flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-cyan-50 hover:text-cyan-700'
                    >
                        <Plus className='size-4' />
                        <span className='pointer-events-none absolute right-0 top-full z-20 mt-2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100'>
                            Tạo nhóm chat
                        </span>
                    </button>
                </div>
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

            <div className='mt-5 border-t border-slate-200 pt-4'>
                <div className='mb-2 flex items-center justify-between'>
                    <h4 className='font-black text-slate-500'>Nhóm chat</h4>
                    {groups.length > 0 && (
                        <span className='rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-500'>{groups.length}</span>
                    )}
                </div>
                {groups.length === 0 ? (
                    <div className='rounded-2xl bg-slate-50 px-3 py-5 text-center text-xs font-bold text-slate-400'>
                        Chưa tham gia nhóm nào
                    </div>
                ) : (
                    <div className='flex flex-col'>
                        {groups.map((group) => (
                            <button
                                key={group._id}
                                type='button'
                                onClick={() => handleOpenGroup(group)}
                                className='flex items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-slate-100'
                            >
                                <span className='relative size-10 shrink-0'>
                                    <img src={getGroupAvatarUrl(group)} alt='' className='size-10 rounded-full object-cover' />
                                    <span className='absolute bottom-0 right-0 size-3 rounded-full border-2 border-white bg-emerald-500' />
                                </span>
                                <p className='min-w-0 flex-1 truncate font-bold text-slate-900'>{group.name}</p>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {showCreateGroup && (
            <div className='fixed inset-0 z-[220] flex items-end justify-center bg-slate-950/60 px-3 backdrop-blur-sm sm:items-center'>
                <form onSubmit={handleCreateGroup} className='surface flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] sm:rounded-[2rem]'>
                    <div className='flex items-center justify-between border-b border-slate-200 px-5 py-4'>
                        <div>
                            <p className='page-kicker'>Nhóm chat</p>
                            <h2 className='mt-1 text-xl font-black text-slate-950'>Tạo nhóm mới</h2>
                        </div>
                        <button
                            type='button'
                            onClick={closeCreateGroup}
                            className='rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950'
                        >
                            <X className='size-5' />
                        </button>
                    </div>

                    <div className='space-y-4 overflow-y-auto p-5'>
                        <input
                            value={groupName}
                            onChange={(event) => setGroupName(event.target.value)}
                            className='input-modern px-4 py-3 text-sm font-bold'
                            placeholder='Tên nhóm chat'
                            maxLength={80}
                        />

                        <div>
                            <div className='mb-2 flex items-center justify-between'>
                                <p className='text-sm font-black text-slate-900'>Thêm người liên hệ</p>
                                <span className='text-xs font-bold text-slate-400'>{selectedMemberIds.length} đã chọn</span>
                            </div>
                            <div className='max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 p-2'>
                                {contacts.length === 0 ? (
                                    <div className='py-8 text-center text-sm text-slate-500'>Chưa có người liên hệ</div>
                                ) : contacts.map((contact) => (
                                    <label key={contact._id} className='flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50'>
                                        <input
                                            type='checkbox'
                                            checked={selectedMemberIds.includes(contact._id)}
                                            onChange={() => toggleSelectedMember(contact._id)}
                                            className='size-4 accent-cyan-700'
                                        />
                                        <img src={getAvatarUrl(contact)} alt='' className='size-10 rounded-full object-cover' />
                                        <span className='min-w-0 flex-1 truncate font-bold text-slate-900'>{getDisplayName(contact)}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className='flex gap-2 border-t border-slate-200 p-4'>
                        <button type='button' onClick={closeCreateGroup} className='btn-muted flex-1 px-4 py-2.5 text-sm'>Hủy</button>
                        <button type='submit' disabled={isCreatingGroup} className='btn-primary flex-1 px-4 py-2.5 text-sm disabled:opacity-60'>
                            {isCreatingGroup ? <LoaderCircle className='size-4 animate-spin' /> : <UsersRound className='size-4' />}
                            Tạo nhóm
                        </button>
                    </div>
                </form>
            </div>
        )}
    </>
  )
}

export default RecentMessages
