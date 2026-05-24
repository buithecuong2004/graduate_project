import React from 'react'
import { useSocket } from '../context/SocketContext'
import ChatBox from '../pages/ChatBox'

const getUserId = (userOrId) => userOrId?._id?.toString?.() || userOrId?.toString?.() || ''

const ChatDock = ({ onStartCall }) => {
  const { openChats, closeChat } = useSocket()

  if (!openChats.length) return null

  return (
    <div className='fixed bottom-0 right-5 z-[70] hidden items-end gap-4 xl:flex'>
      {openChats.map((contact) => {
        const contactId = getUserId(contact)
        if (!contactId) return null

        return (
          <ChatBox
            key={contactId}
            chatUserId={contactId}
            variant='mini'
            onStartCall={onStartCall}
            onClose={() => closeChat(contactId)}
          />
        )
      })}
    </div>
  )
}

export default ChatDock
