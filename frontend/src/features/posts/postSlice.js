import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../api/axios'

const initialState = {
    posts: [],
    suggestedPosts: [],
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
        hasMore: data.success ? data.hasMore !== false : false,
        page,
        suggestedPosts: data.suggestedPosts || []
    }
})

const postSlice = createSlice({
    name: 'posts',
    initialState,
    reducers: {
        deletePost: (state, action) => {
            state.posts = state.posts.filter(p => p._id !== action.payload)
            state.suggestedPosts = state.suggestedPosts.filter(p => p._id !== action.payload)
        },
        addPost: (state, action) => {
            const post = action.payload
            if (!post?._id) return
            state.posts = [post, ...state.posts.filter(p => p._id !== post._id)]
            state.suggestedPosts = state.suggestedPosts.filter(p => p._id !== post._id)
        },
        upsertPost: (state, action) => {
            const post = action.payload
            if (!post?._id) return

            const index = state.posts.findIndex(p => p._id === post._id)
            if (index === -1) state.posts.unshift(post)
            else state.posts[index] = { ...state.posts[index], ...post }

            state.suggestedPosts = state.suggestedPosts.filter(p => p._id !== post._id)
        },
        updateCommentCount: (state, action) => {
            const { postId, count } = action.payload
            const update = (post) => {
                if (post) post.total_comments_count = Math.max(0, count)
            }
            update(state.posts.find(p => p._id === postId))
            update(state.suggestedPosts.find(p => p._id === postId))
        },
        updatePostReactions: (state, action) => {
            const { postId, reactions, likes_count } = action.payload
            const update = (post) => {
                if (!post) return
                if (Array.isArray(reactions)) post.reactions = reactions
                if (Array.isArray(likes_count)) post.likes_count = likes_count
            }
            update(state.posts.find(p => p._id === postId))
            update(state.suggestedPosts.find(p => p._id === postId))
        },
        updatePostShares: (state, action) => {
            const { postId, shares_count } = action.payload
            const update = (post) => {
                if (post && Array.isArray(shares_count)) post.shares_count = shares_count
            }
            update(state.posts.find(p => p._id === postId))
            update(state.suggestedPosts.find(p => p._id === postId))
        },
        incrementPage: (state) => {
            state.page += 1
        },
        resetPage: (state) => {
            state.page = 1
            state.posts = []
            state.hasMore = true
            state.suggestedPosts = []
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchPosts.pending, (state) => {
                state.loading = true
            })
            .addCase(fetchPosts.fulfilled, (state, action) => {
                const { posts, hasMore, page, suggestedPosts } = action.payload
                if (page === 1) {
                    state.posts = posts
                    state.suggestedPosts = suggestedPosts || []
                } else {
                    const existingIds = new Set(state.posts.map(p => p._id))
                    const uniqueNewPosts = posts.filter(p => !existingIds.has(p._id))
                    state.posts = [...state.posts, ...uniqueNewPosts]
                }
                state.hasMore = hasMore
                state.page = page
                state.loading = false
            })
            .addCase(fetchPosts.rejected, (state) => {
                state.loading = false
                state.hasMore = false
            })
    }
})

export const {
    deletePost,
    addPost,
    upsertPost,
    updateCommentCount,
    updatePostReactions,
    updatePostShares,
    incrementPage,
    resetPage
} = postSlice.actions

export default postSlice.reducer
