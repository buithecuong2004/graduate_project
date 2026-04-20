import React from 'react'
import { createPortal } from 'react-dom'
import { X, BadgeCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { REACTION_ICONS } from './ReactionPicker'

const ReactionListModal = ({ isOpen, onClose, reactions = [] }) => {
  const navigate = useNavigate()

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">Reactions</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1 p-4">
          {reactions.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No reactions yet.</div>
          ) : (
            <div className="space-y-4">
              {reactions.map((reaction, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition"
                  onClick={() => {
                    onClose()
                    navigate(`/profile/${reaction.user._id}`)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img 
                        src={reaction.user?.profile_picture || 'https://via.placeholder.com/40'} 
                        alt="" 
                        className="w-10 h-10 rounded-full object-cover shadow-sm"
                      />
                      <div className="absolute -bottom-1 -right-1 text-sm bg-white rounded-full leading-none shadow-sm">
                        {REACTION_ICONS[reaction.type]}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-1">
                        {reaction.user?.full_name}
                        <BadgeCheck className="w-3.5 h-3.5 text-blue-500" />
                      </div>
                      <div className="text-xs text-gray-500">@{reaction.user?.username}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ReactionListModal;
