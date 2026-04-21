import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../api/axios'
import toast from 'react-hot-toast'

const initialState = {
    stories: [],
    loading: false,
    viewStory: null
}

export const fetchStories = createAsyncThunk('stories/fetchStories', async (token) => {
    const { data } = await api.post('/api/story/get', {}, {
        headers: { Authorization: `Bearer ${token}` }
    })
    return data.success ? data.stories : []
})

export const deleteStoryAction = createAsyncThunk('stories/deleteStory', async ({ storyId, token }, { dispatch }) => {
    const { data } = await api.post('/api/story/delete', { storyId }, {
        headers: { Authorization: `Bearer ${token}` }
    })
    if (data.success) {
        toast.success('Story deleted successfully')
        dispatch(setViewStory(null))
        return storyId
    } else {
        toast.error(data.message)
        throw new Error(data.message)
    }
})

export const createStoryAction = createAsyncThunk('stories/createStory', async ({ formData, token }, { dispatch }) => {
    const { data } = await api.post('/api/story/create', formData, {
        headers: { Authorization: `Bearer ${token}` }
    })
    if (data.success) {
        dispatch(fetchStories(token))
        return data.story
    } else {
        throw new Error(data.message)
    }
})

const storiesSlice = createSlice({
    name: 'stories',
    initialState,
    reducers: {
        setViewStory: (state, action) => {
            state.viewStory = action.payload
        },
        addStoryLocal: (state, action) => {
            state.stories = [action.payload, ...state.stories]
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchStories.pending, (state) => {
                state.loading = true
            })
            .addCase(fetchStories.fulfilled, (state, action) => {
                state.stories = action.payload
                state.loading = false
            })
            .addCase(fetchStories.rejected, (state) => {
                state.loading = false
            })
            .addCase(deleteStoryAction.fulfilled, (state, action) => {
                state.stories = state.stories.filter(s => s._id !== action.payload)
            })
    }
})

export const { setViewStory, addStoryLocal } = storiesSlice.actions
export default storiesSlice.reducer
