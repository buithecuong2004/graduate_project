import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../api/axios'

const initialState = {
    posts: [],
    loading: false,
}

export const fetchPosts = createAsyncThunk('posts/fetchPosts', async (token) => {
    const { data } = await api.get('/api/post/feed', {
        headers: { Authorization: `Bearer ${token}` }
    })
    return data.success ? data.posts : []
})

const postSlice = createSlice({
    name: 'posts',
    initialState,
    reducers: {
        deletePost: (state, action) => {
            state.posts = state.posts.filter(p => p._id !== action.payload)
        },
        addPost: (state, action) => {
            state.posts = [action.payload, ...state.posts]
        },
        updateCommentCount: (state, action) => {
            const { postId, count } = action.payload
            const post = state.posts.find(p => p._id === postId)
            if (post) post.total_comments_count = count
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchPosts.pending, (state) => {
                state.loading = true
            })
            .addCase(fetchPosts.fulfilled, (state, action) => {
                state.posts = action.payload
                state.loading = false
            })
    }
})

export const { deletePost, addPost, updateCommentCount } = postSlice.actions

export default postSlice.reducer