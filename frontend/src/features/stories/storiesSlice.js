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
        toast.success('Đã xoá tin thành công')
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
            const story = action.payload
            if (!story?._id) return
            state.stories = [story, ...state.stories.filter(s => s._id !== story._id)]
        },
        deleteStoryLocal: (state, action) => {
            const storyId = action.payload
            state.stories = state.stories.filter(s => s._id !== storyId)
            if (state.viewStory?._id === storyId) state.viewStory = null
        },
        updateStoryReactionsLocal: (state, action) => {
            const { storyId, reactions } = action.payload
            const update = (story) => {
                if (story && Array.isArray(reactions)) story.reactions = reactions
            }
            update(state.stories.find(s => s._id === storyId))
            update(state.viewStory?._id === storyId ? state.viewStory : null)
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
                storiesSlice.caseReducers.deleteStoryLocal(state, action)
            })
    }
})

export const { setViewStory, addStoryLocal, deleteStoryLocal, updateStoryReactionsLocal } = storiesSlice.actions
export default storiesSlice.reducer
