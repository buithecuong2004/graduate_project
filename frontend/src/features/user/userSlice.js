import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../api/axios'
import toast from 'react-hot-toast'

const initialState = {
    value: null
}

export const fetchUser = createAsyncThunk('user/fetchUser', async(token) => {
    const {data} = await api.get('/api/user/data', {
        headers: {Authorization: `Bearer ${token}`}
    })
    return data.success ? data.user : null
})

export const updateUser = createAsyncThunk('user/update', async({userData, token}, {rejectWithValue}) => {
    try {
        const {data} = await api.post('/api/user/update', userData, {
            headers: {Authorization: `Bearer ${token}`}
        })

        if(data.success){
            toast.success(data.message)
            return data.user
        }

        toast.error(data.message)
        return rejectWithValue(data.message)
    } catch (error) {
        const message = error.response?.data?.message || error.message
        toast.error(message)
        return rejectWithValue(message)
    }
})

const userSlice = createSlice({
    name: 'user',
    initialState,
    reducers: {
        setUser: (state, action) => {
            state.value = action.payload
        },
        clearUser: (state) => {
            state.value = null
        }
    },
    extraReducers: (builder)=>{
        builder.addCase(fetchUser.fulfilled, (state, action)=>{
            state.value = action.payload
        }).addCase(updateUser.fulfilled, (state, action)=>{
            state.value = action.payload
        })
    }
})

export const { clearUser, setUser } = userSlice.actions

export default userSlice.reducer
