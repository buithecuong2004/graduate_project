/* eslint-disable react-refresh/only-export-components */
// SocketContext.jsx
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const SocketContext = createContext(null)
const MAX_OPEN_CHAT_BOXES = 3

const getUserId = (userOrId) => {
    if (userOrId?.type === 'group') return userOrId.groupId?.toString?.() || userOrId._id?.toString?.() || ''
    return userOrId?._id?.toString?.() || userOrId?.toString?.() || ''
}

export const SocketProvider = ({ children }) => {
    const socketRef = useRef(null)
    const [socket, setSocket] = useState(null)
    const [incomingCall, setIncomingCall] = useState(null)
    const [openChats, setOpenChats] = useState([])

    const openChat = useCallback((contact, options = {}) => {
        const contactId = getUserId(contact)
        if (!contactId) return

        setOpenChats((currentChats) => {
            const existingIndex = currentChats.findIndex((chat) => getUserId(chat) === contactId)
            if (existingIndex !== -1) {
                const nextChats = [...currentChats]
                nextChats[existingIndex] = typeof contact === 'object'
                    ? { ...(typeof nextChats[existingIndex] === 'object' ? nextChats[existingIndex] : {}), ...contact }
                    : nextChats[existingIndex]
                return nextChats
            }

            const nextChats = [...currentChats, contact]
            return options.replaceOldest && nextChats.length > MAX_OPEN_CHAT_BOXES
                ? nextChats.slice(nextChats.length - MAX_OPEN_CHAT_BOXES)
                : nextChats.slice(0, MAX_OPEN_CHAT_BOXES)
        })
    }, [])

    const closeChat = useCallback((contactId) => {
        setOpenChats((currentChats) => currentChats.filter((chat) => getUserId(chat) !== contactId))
    }, [])

    const clearOpenChats = useCallback(() => {
        setOpenChats([])
    }, [])

    const openChatFromMessage = useCallback((message, currentUserId) => {
        if (!message || message.message_type === 'reaction' || message.message_type === 'call') return

        if (message.group_id) {
            const group = typeof message.group_id === 'object'
                ? message.group_id
                : { _id: message.group_id }
            const groupId = group?._id?.toString?.() || group?.toString?.() || ''
            if (!groupId) return

            openChat({
                ...group,
                type: 'group',
                groupId,
                full_name: group.name || 'Nhóm chat',
                profile_picture: group.avatar_url || '',
            }, { replaceOldest: true })
            return
        }

        const currentId = getUserId(currentUserId)
        const fromId = getUserId(message.from_user_id)
        const contact = fromId === currentId ? message.to_user_id : message.from_user_id
        const contactId = getUserId(contact)

        if (!contactId || contactId === currentId) return
        openChat(contact, { replaceOldest: true })
    }, [openChat])

    const value = useMemo(() => ({
        socketRef, socket, setSocket,
        incomingCall, setIncomingCall,
        openChats, openChat, closeChat, clearOpenChats, openChatFromMessage,
    }), [clearOpenChats, closeChat, incomingCall, openChat, openChatFromMessage, openChats, socket])

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    )
}

export const useSocket = () => useContext(SocketContext)
