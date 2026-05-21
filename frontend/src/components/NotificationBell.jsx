import React, { useState } from 'react'
import { Bell } from 'lucide-react'
import { useSelector } from 'react-redux'
import NotificationModal from './NotificationModal'

const NotificationBell = () => {
    const [isOpen, setIsOpen] = useState(false)
    const unreadCount = useSelector(state => state.notifications.unreadCount)

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="relative p-2.5 text-slate-600 hover:text-cyan-700 hover:bg-cyan-50 rounded-full transition"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                )}
            </button>
            <NotificationModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    )
}

export default NotificationBell
