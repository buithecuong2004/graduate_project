import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { clearUser, fetchUser } from '../features/user/userSlice'

const AuthCallback = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const dispatch = useDispatch()
    const { login } = useAuth()

    useEffect(() => {
        const completeLogin = async (token) => {
            try {
                dispatch(clearUser())
                login(token)
                const user = await dispatch(fetchUser(token)).unwrap()
                navigate(user?.role === 'admin' ? '/admin' : '/feed', { replace: true })
            } catch (loginError) {
                console.error('Auth callback user fetch error:', loginError)
                navigate('/feed', { replace: true })
            }
        }

        const token = searchParams.get('token')
        const error = searchParams.get('error')

        if (error) {
            console.error('OAuth error:', error)
            navigate('/', { replace: true })
            return
        }

        if (token) {
            completeLogin(token)
        } else {
            navigate('/', { replace: true })
        }
    }, [searchParams, login, navigate, dispatch])

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
