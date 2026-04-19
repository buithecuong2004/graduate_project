import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../api/axios'

const initialState = {
    connections: [],
    pendingConnections: [],
    followers: [],
    following: []
}

export const fetchConnections = createAsyncThunk(
    'connections/fetchConnections',
    async (token, { rejectWithValue }) => {
        try {
            const { data } = await api.get('/api/user/connections', {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!data.success) {
                return rejectWithValue(data.message)
            }

            return data
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || error.message)
        }
    }
)

const connectionsSlice = createSlice({
    name: 'connections',
    initialState,
    reducers: {

    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchConnections.fulfilled, (state, action) => {
                state.connections = action.payload.connections
                state.pendingConnections = action.payload.pendingConnections
                state.followers = action.payload.followers
                state.following = action.payload.following
            })
            .addCase(fetchConnections.rejected, (state, action) => {
                console.error("Connections error:", action.payload)
                state.connections = []
                state.pendingConnections = []
            })
    }
})

export default connectionsSlice.reducer