import React from 'react'

export const REACTION_ICONS = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  wow: '😲',
  sad: '😢',
  angry: '😡'
}

export const REACTIONS = Object.keys(REACTION_ICONS).map(type => ({
  type,
  icon: REACTION_ICONS[type]
}))

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
          className={`text-2xl hover:scale-125 transition-transform origin-bottom p-1 rounded-full ${currentReaction === reaction.type ? 'bg-indigo-50 scale-125 shadow-inner' : 'hover:bg-gray-50'}`}
          title={reaction.type}
        >
          {reaction.icon}
        </button>
      ))}
    </div>
  )
}

export default ReactionPicker;
