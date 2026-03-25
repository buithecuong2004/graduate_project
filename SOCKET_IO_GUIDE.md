# Socket.io Real-Time Comments Guide

## Installation (Frontend)

```bash
npm install socket.io-client
```

## Frontend Usage Example

```javascript
import io from 'socket.io-client'

// Connect to socket
const socket = io('http://localhost:4000')

// Join a post room when viewing a post
socket.emit('join-post', postId)

// Listen for new comments
socket.on('comment-added', (data) => {
    console.log('New comment:', data.comment)
    // Add the comment to your UI
})

// Listen for deleted comments
socket.on('comment-deleted', (data) => {
    console.log('Comment deleted:', data.commentId)
    // Remove comment from UI
})

// Listen for comment likes
socket.on('comment-liked', (data) => {
    console.log('Comment liked:', data.commentId, data.likes_count)
    // Update likes count in UI
})

// Leave room when navigating away
socket.emit('leave-post', postId)

// Disconnect
socket.disconnect()
```

## Real-Time Events

### 1. Comment Added
**Event:** `comment-added`
```javascript
{
    comment: { _id, user, content, likes_count, createdAt, updatedAt },
    postId
}
```

### 2. Comment Deleted
**Event:** `comment-deleted`
```javascript
{
    commentId,
    postId
}
```

### 3. Comment Liked/Unliked
**Event:** `comment-liked`
```javascript
{
    commentId,
    postId,
    liked: true/false,
    likes_count: number
}
```

## Backend Events Emitted

All events are broadcast to a post-specific room: `post-{postId}`
- Adding a comment → `io.to('post-{postId}').emit('comment-added', data)`
- Deleting a comment → `io.to('post-{postId}').emit('comment-deleted', data)`
- Liking a comment → `io.to('post-{postId}').emit('comment-liked', data)`
