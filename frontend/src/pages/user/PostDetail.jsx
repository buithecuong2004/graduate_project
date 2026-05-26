import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ChevronLeft } from 'lucide-react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import localizeMessage from '../../utils/localization'
import PostCard from '../../components/user/PostCard'
import Loading from '../../components/user/Loading'

const PostDetail = () => {
    const { postId } = useParams()
    const { getToken } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [post, setPost] = useState(null)
    const [loading, setLoading] = useState(true)

    // Deep link from notification
    const autoOpenComments = location.state?.autoOpenComments
    const targetCommentId = location.state?.commentId

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
                toast.error(localizeMessage(data.message) || 'Không thể tải bài viết')
            }
        } catch (error) {
            toast.error(localizeMessage(error.message) || 'Không thể tải bài viết')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return <Loading />
    }

    if (!post) {
        return (
            <div className='app-page min-h-screen flex items-center justify-center'>
                <div className='text-center'>
                    <h1 className='text-2xl font-bold text-gray-900 mb-4'>Không tìm thấy Bài Viết</h1>
                    <button
                        onClick={() => navigate('/')}
                        className='text-cyan-700 hover:text-cyan-800'
                    >
                        Quay lại trang chủ
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className='app-page min-h-screen'>
            <div className='app-container max-w-2xl'>
                <button
                    onClick={() => navigate(-1)}
                    className='btn-muted mb-4 px-4 py-2.5 cursor-pointer'
                >
                    <ChevronLeft className='w-5 h-5' />
                    Quay lại
                </button>

                <div className='space-y-4'>
                    <PostCard 
                        post={post} 
                        onPostDeleted={() => navigate(-1)} 
                        autoOpenComments={autoOpenComments}
                        targetCommentId={targetCommentId}
                    />

                    {post.shared_from && (
                        <div className='bg-blue-50 border-l-4 border-blue-500 p-4 rounded'>
                            <p className='text-xs text-blue-600 font-semibold mb-2'>ĐÃ CHIA SẺ TỪ</p>
                            <PostCard post={post.shared_from} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default PostDetail
