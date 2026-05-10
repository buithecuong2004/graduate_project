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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-indigo-700 font-medium text-lg">Đang đăng nhập...</p>
            </div>
        </div>
    )
}

export default AuthCallback
