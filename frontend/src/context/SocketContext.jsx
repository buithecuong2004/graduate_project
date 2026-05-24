// SocketContext.jsx
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const SocketContext = createContext(null)
const MAX_OPEN_CHAT_BOXES = 3

const getUserId = (userOrId) => userOrId?._id?.toString?.() || userOrId?.toString?.() || ''

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

    const openChatFromMessage = useCallback((message, currentUserId) => {
        if (!message || message.message_type === 'reaction' || message.message_type === 'call') return

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
        openChats, openChat, closeChat, openChatFromMessage,
    }), [closeChat, incomingCall, openChat, openChatFromMessage, openChats, socket])

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    )
}

export const useSocket = () => useContext(SocketContext)
