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
        updateUserPresence: (state, action) => {
            const { userId, isOnline, lastSeen } = action.payload
            if (!userId) return

            const updateGroup = (group = []) => {
                group.forEach((user) => {
                    if (user?._id?.toString?.() === userId.toString()) {
                        user.isOnline = isOnline
                        user.lastSeen = lastSeen
                    }
                })
            }

            updateGroup(state.connections)
            updateGroup(state.pendingConnections)
            updateGroup(state.followers)
            updateGroup(state.following)
        }
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

export const { updateUserPresence } = connectionsSlice.actions
export default connectionsSlice.reducer
