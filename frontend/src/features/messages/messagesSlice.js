import { createAsyncThunk, createSlice, createSelector } from '@reduxjs/toolkit'
import api from '../../api/axios'

const initialState = {
    messages: [],
    newMessageTrigger: null,
}

export const fetchMessages = createAsyncThunk('messages/fetchMessages', async ({ token, userId }) => {
    const { data } = await api.post('/api/message/get', { to_user_id: userId }, {
        headers: { Authorization: `Bearer ${token}` }
    })
    return data.success ? data : null
})

const messagesSlice = createSlice({
    name: 'messages',
    initialState,
    reducers: {
        setMessages: (state, action) => {
            state.messages = action.payload
        },
        addMessages: (state, action) => {
            if (state.messages.some(message => message._id === action.payload._id)) return
            state.messages = [...state.messages, action.payload]
        },
        resetMessages: (state) => {
            state.messages = []
        },
        setNewMessageTrigger: (state, action) => {
            state.newMessageTrigger = action.payload
        },
        deleteMessageLocal: (state, action) => {
            const messageId = action.payload
            state.messages = state.messages.map(msg =>
                msg._id === messageId
                    ? { ...msg, is_deleted: true, text: '', media_urls: [] }
                    : msg
            )
        },
        editMessageLocal: (state, action) => {
            const { messageId, text } = action.payload
            state.messages = state.messages.map(msg =>
                msg._id === messageId
                    ? { ...msg, text, is_edited: true }
                    : msg
            )
        },
        updateMessageReactionsLocal: (state, action) => {
            const { messageId, reactions } = action.payload
            state.messages = state.messages.map(msg =>
                msg._id === messageId
                    ? { ...msg, reactions }
                    : msg
            )
        },
    },
    extraReducers: (builder) => {
        builder.addCase(fetchMessages.fulfilled, (state, action) => {
            if (action.payload) {
                state.messages = action.payload.messages
            }
        })
    }
})

export const {
    setMessages,
    addMessages,
    resetMessages,
    setNewMessageTrigger,
    deleteMessageLocal,
    editMessageLocal,
    updateMessageReactionsLocal,
} = messagesSlice.actions

export default messagesSlice.reducer

// Memoized selector: select messages relevant to a chat with `userId`
export const selectMessagesForChat = createSelector(
    (state) => state.messages.messages,
    (_, userId) => userId,
    (messages, userId) => {
        if (!messages || !userId) return []
        return messages.filter((m) => {
            const fromId = m.from_user_id?._id || m.from_user_id
            const toId = m.to_user_id?._id || m.to_user_id
            return String(fromId) === String(userId) || String(toId) === String(userId)
        })
    }
)
