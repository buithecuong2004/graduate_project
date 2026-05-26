import React from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { REACTION_ICONS } from '../../utils/reactions'

const ReactionListModal = ({ isOpen, onClose, reactions = [] }) => {
  const navigate = useNavigate()

  if (!isOpen) return null

  return createPortal(
    <div className='fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm' onClick={onClose}>
      <div className='surface flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-[2rem]' onClick={e => e.stopPropagation()}>
        <div className='flex items-center justify-between border-b border-slate-200 px-5 py-4'>
          <div>
            <p className='page-kicker'>Tương tác</p>
            <h2 className='mt-1 text-xl font-black text-slate-950'>Cảm xúc</h2>
          </div>
          <button onClick={onClose} className='rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 cursor-pointer'>
            <X className='size-6' />
          </button>
        </div>

        <div className='flex-1 overflow-y-auto p-4'>
          {reactions.length === 0 ? (
            <div className='py-10 text-center text-sm font-bold text-slate-500'>Chưa có cảm xúc nào.</div>
          ) : (
            <div className='space-y-2'>
              {reactions.map((reaction, index) => {
                const user = reaction.user
                const userId = user?._id || user

                return (
                  <button
                    type='button'
                    key={`${userId || 'reaction'}-${index}`}
                    className='flex w-full cursor-pointer items-center justify-between rounded-2xl p-3 text-left transition hover:bg-cyan-50/70'
                    onClick={() => {
                      onClose()
                      if (userId) navigate(`/profile/${userId}`)
                    }}
                  >
                    <span className='flex min-w-0 items-center gap-3'>
                      <span className='relative shrink-0'>
                        <img
                          src={user?.profile_picture || 'https://via.placeholder.com/40'}
                          alt=''
                          className='size-11 rounded-full object-cover avatar-ring'
                        />
                        <span className='absolute -bottom-1 -right-1 rounded-full bg-white text-sm leading-none shadow-sm'>
                          {REACTION_ICONS[reaction.type]}
                        </span>
                      </span>
                      <span className='min-w-0'>
                        <span className='flex items-center gap-1 text-sm font-black text-slate-950'>
                          <span className='truncate'>{user?.full_name || 'Người dùng'}</span>
                          <BadgeCheck className='size-3.5 shrink-0 text-cyan-500' />
                        </span>
                        <span className='block truncate text-xs text-slate-500'>@{user?.username || 'user'}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ReactionListModal
