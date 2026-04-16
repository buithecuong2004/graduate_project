import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { ChevronLeft } from 'lucide-react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import PostCard from '../components/PostCard'
import Loading from '../components/Loading'

const PostDetail = () => {
    const { postId } = useParams()
    const { getToken } = useAuth()
    const navigate = useNavigate()
    const [post, setPost] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchPost()
    }, [postId])

    const fetchPost = async () => {
        try {
            setLoading(true)
            const token = await getToken()
            const { data } = await api.get(`/api/post/${postId}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (data.success) {
                setPost(data.post)
            } else {
                toast.error(data.message || 'Failed to load post')
            }
        } catch (error) {
            toast.error(error.message || 'Failed to load post')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return <Loading />
    }

    if (!post) {
        return (
            <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
                <div className='text-center'>
                    <h1 className='text-2xl font-bold text-gray-900 mb-4'>Post Not Found</h1>
                    <button
                        onClick={() => navigate('/')}
                        className='text-indigo-600 hover:text-indigo-700'
                    >
                        Go back to Feed
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className='min-h-screen bg-gray-50'>
            <div className='max-w-2xl mx-auto p-4'>
                <button
                    onClick={() => navigate(-1)}
                    className='flex items-center gap-2 text-indigo-600 hover:text-indigo-700 mb-4'
                >
                    <ChevronLeft className='w-5 h-5' />
                    Back
                </button>

                <div className='space-y-4'>
                    <PostCard post={post} onPostDeleted={() => navigate(-1)} />

                    {post.shared_from && (
                        <div className='bg-blue-50 border-l-4 border-blue-500 p-4 rounded'>
                            <p className='text-xs text-blue-600 font-semibold mb-2'>SHARED FROM</p>
                            <PostCard post={post.shared_from} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default PostDetail
