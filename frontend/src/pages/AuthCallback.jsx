import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const AuthCallback = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { login } = useAuth()

    useEffect(() => {
        const token = searchParams.get('token')
        const error = searchParams.get('error')

        if (error) {
            console.error('OAuth error:', error)
            navigate('/', { replace: true })
            return
        }

        if (token) {
            login(token)
            navigate('/feed', { replace: true })
        } else {
            navigate('/', { replace: true })
        }
    }, [searchParams, login, navigate])

    return (
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_34rem),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_30rem),#f6f8fb]">
            <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-600 border-t-transparent"></div>
                <p className="text-lg font-bold text-cyan-700">Đang đăng nhập...</p>
            </div>
        </div>
    )
}

export default AuthCallback
