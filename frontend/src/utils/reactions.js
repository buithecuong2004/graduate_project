export const REACTION_ICONS = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  wow: '😲',
  sad: '😢',
  angry: '😡'
}

export const REACTION_LABELS = {
  like: 'Thích',
  love: 'Yêu thích',
  haha: 'Haha',
  wow: 'Wow',
  sad: 'Buồn',
  angry: 'Phẫn nộ'
}

export const REACTIONS = Object.keys(REACTION_ICONS).map(type => ({
  type,
  icon: REACTION_ICONS[type],
  label: REACTION_LABELS[type]
}))
