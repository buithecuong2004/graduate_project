import React from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'


const Notification = ({ t, message }) => {
    const navigate = useNavigate()

    // Safety checks
    if (!message || !message.from_user_id) {
        console.error('❌ Invalid message structure:', message)
        return null
    }

    const sender = message.from_user_id
    const isPostLink = message.text?.includes('/post/')
    const isStoryReply = message.is_forwarded && message.forwarded_type === 'story'
    
    let messageText = 'Media';
    if (isPostLink) {
        messageText = '🔗 Shared a post with you';
    } else if (isStoryReply) {
        messageText = 'Replied to your story';
    } else if (message.text) {
        messageText = message.text.length > 30 ? message.text.slice(0, 30) + '...' : message.text;
    }

    console.log('✅ Notification rendering:', sender.full_name, messageText)

    return (
        <div className={`max-w-md w-full bg-white shadow-lg rounded-xl flex border border-gray-300 hover:scale-105 transition cursor-pointer`}>
            <div className='flex-1 p-4'>
                <div className='flex items-start'>
                    <img
                        src={sender.profile_picture || 'https://via.placeholder.com/40'}
                        alt={sender.full_name}
                        className='h-10 w-10 rounded-full flex-shrink-0 mt-0.5 object-cover'
                    />
                    <div className='ml-3 flex-1 min-w-0'>
                        <p className='text-sm font-medium text-gray-900 truncate'>
                            {sender.full_name || 'Unknown User'}
                        </p>
                        <p className='text-sm text-gray-500 truncate'>
                            {messageText}
                        </p>
                    </div>
                </div>
            </div>
            <div className='flex border-l border-gray-200'>
                <button onClick={() => {
                    console.log('Navigating to:', `/messages/${sender._id}`)
                    navigate(`/messages/${sender._id}`);
                    toast.dismiss(t.id)
                }}
                    className='p-4 text-indigo-600 font-semibold hover:bg-indigo-50 transition'
                >
                    Reply
                </button>
            </div>
        </div>
    )
}

export default Notification