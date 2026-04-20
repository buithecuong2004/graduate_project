import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
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
} = messagesSlice.actions

export default messagesSlice.reducer