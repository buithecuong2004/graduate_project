import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../api/axios'

const initialState = {
    posts: [],
    loading: false,
    hasMore: true,
    page: 1,
}

export const fetchPosts = createAsyncThunk('posts/fetchPosts', async ({ token, page = 1, limit = 10 }) => {
    const { data } = await api.get('/api/post/feed', {
        headers: { Authorization: `Bearer ${token}` },
        params: { page, limit }
    })
    return {
        posts: data.success ? data.posts : [],
        hasMore: data.hasMore !== false,
        page
    }
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
        incrementPage: (state) => {
            state.page += 1
        },
        resetPage: (state) => {
            state.page = 1
            state.posts = []
            state.hasMore = true
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchPosts.pending, (state) => {
                state.loading = true
            })
            .addCase(fetchPosts.fulfilled, (state, action) => {
                const { posts, hasMore, page } = action.payload
                if (page === 1) {
                    state.posts = posts
                } else {
                    state.posts = [...state.posts, ...posts]
                }
                state.hasMore = hasMore
                state.page = page
                state.loading = false
            })
    }
})

export const { deletePost, addPost, updateCommentCount, incrementPage, resetPage } = postSlice.actions

export default postSlice.reducer