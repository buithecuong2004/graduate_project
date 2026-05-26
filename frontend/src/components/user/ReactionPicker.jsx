import React from 'react'
import { REACTIONS } from '../../utils/reactions'

const ReactionPicker = ({ onReact, currentReaction }) => {
  return (
    <div className="flex gap-2 p-2 bg-white rounded-full shadow-lg border border-gray-100" onClick={e => e.stopPropagation()}>
      {REACTIONS.map((reaction) => (
        <button
          key={reaction.type}
          onClick={(e) => {
             e.stopPropagation();
             onReact(reaction.type)
          }}
          className={`text-2xl hover:scale-125 transition-transform origin-bottom p-1 rounded-full ${currentReaction === reaction.type ? 'bg-cyan-50 scale-125 shadow-inner' : 'hover:bg-gray-50'}`}
          title={reaction.label}
        >
          {reaction.icon}
        </button>
      ))}
    </div>
  )
}

export default ReactionPicker;
