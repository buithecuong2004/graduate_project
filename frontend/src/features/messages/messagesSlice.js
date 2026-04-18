import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../api/axios'

const initialState = {
    messages: [],
    newMessageTrigger: null, // ← thêm
}



export const fetchMessages = createAsyncThunk('messages/fetchMessages', async({token,userId})=>{
    const { data } = await api.post('/api/message/get', {to_user_id: userId}, {
        headers: {Authorization: `Bearer ${token}`}
    })
    return data.success ? data : null
})

const messagesSlice = createSlice({
    name: 'messages',
    initialState,
    reducers: {
        setMessages: (state, action)=>{
            state.messages = action.payload
        },
        addMessages: (state, action)=>{
            state.messages = [...state.messages, action.payload]
        },
        resetMessages: (state)=>{
            state.messages = []
        },
        setNewMessageTrigger: (state, action) => {
            state.newMessageTrigger = action.payload
        },
    },
    extraReducers: (builder) => {
        builder.addCase(fetchMessages.fulfilled, (state, action)=>{
            if(action.payload){
                state.messages = action.payload.messages
            }
        })
    }
})

export const {setMessages, addMessages, resetMessages, setNewMessageTrigger } = messagesSlice.actions

export default messagesSlice.reducer