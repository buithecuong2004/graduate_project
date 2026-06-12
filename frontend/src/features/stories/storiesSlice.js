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
        },
        // Thay story tạm (đang upload) bằng story thực từ server
        replaceTempStory: (state, action) => {
            const { tempId, story } = action.payload
            if (!story?._id) return

            // Thay trong danh sách stories
            const idx = state.stories.findIndex(s => s._id === tempId)
            if (idx !== -1) {
                state.stories[idx] = story
            } else {
                state.stories = [story, ...state.stories.filter(s => s._id !== story._id)]
            }

            // Nếu đang xem story tạm → cập nhật sang story thực
            // Giữ lại blob URL làm media_url để không bị giật hình,
            // fetchStories ở background sẽ cập nhật về CDN URL sau
            if (state.viewStory?._id === tempId) {
                const blobUrl = state.viewStory.media_url
                state.viewStory = {
                    ...story,
                    // Giữ blob URL nếu story đang phát (CDN chưa sẵn sàng)
                    media_url: blobUrl?.startsWith('blob:') ? blobUrl : story.media_url,
                    _blobFallback: blobUrl?.startsWith('blob:') ? blobUrl : undefined,
                    _cdnUrl: story.media_url,
                }
            }
        },
        // Xóa story tạm khi upload thất bại
        removeTempStory: (state, action) => {
            const tempId = action.payload
            state.stories = state.stories.filter(s => s._id !== tempId)
            if (state.viewStory?._id === tempId) state.viewStory = null
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchStories.pending, (state) => {
                state.loading = true
            })
            .addCase(fetchStories.fulfilled, (state, action) => {
                // Giữ lại stories tạm đang upload (không có trong server response)
                const tempStories = state.stories.filter(s => s._isUploading)
                state.stories = [
                    ...tempStories,
                    ...action.payload.filter(s => !tempStories.find(t => t._id === s._id))
                ]
                state.loading = false

                // Nếu đang xem story có blob fallback, cập nhật CDN URL khi fetch xong
                if (state.viewStory?._cdnUrl) {
                    const fresh = action.payload.find(s => s._id === state.viewStory._id)
                    if (fresh) {
                        state.viewStory = fresh
                    }
                }
            })
            .addCase(fetchStories.rejected, (state) => {
                state.loading = false
            })
            .addCase(deleteStoryAction.fulfilled, (state, action) => {
                storiesSlice.caseReducers.deleteStoryLocal(state, action)
            })
    }
})

export const {
    setViewStory,
    addStoryLocal,
    deleteStoryLocal,
    updateStoryReactionsLocal,
    replaceTempStory,
    removeTempStory,
} = storiesSlice.actions

export default storiesSlice.reducer
