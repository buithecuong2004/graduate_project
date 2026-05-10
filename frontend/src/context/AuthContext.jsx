import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => localStorage.getItem('tarous_token'))
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [loading, setLoading] = useState(true)

    // Verify token on mount
    useEffect(() => {
        const verifyToken = async () => {
            const storedToken = localStorage.getItem('tarous_token')
            if (!storedToken) {
                setLoading(false)
                setIsAuthenticated(false)
                return
            }

            try {
                const { data } = await api.get('/api/auth/me', {
                    headers: { Authorization: `Bearer ${storedToken}` }
                })

                if (data.success) {
                    setToken(storedToken)
                    setIsAuthenticated(true)
                } else {
                    // Token invalid/expired — clear it
                    localStorage.removeItem('tarous_token')
                    setToken(null)
                    setIsAuthenticated(false)
                }
            } catch (error) {
                localStorage.removeItem('tarous_token')
                setToken(null)
                setIsAuthenticated(false)
            } finally {
                setLoading(false)
            }
        }

        verifyToken()
    }, [])

    // Login: save token and update state
    const login = useCallback((newToken) => {
        localStorage.setItem('tarous_token', newToken)
        setToken(newToken)
        setIsAuthenticated(true)
    }, [])

    // Logout: clear token and redirect
    const logout = useCallback(() => {
        localStorage.removeItem('tarous_token')
        setToken(null)
        setIsAuthenticated(false)
    }, [])

    // getToken: compatible with the old Clerk useAuth().getToken() pattern
    // Returns a promise so existing `await getToken()` calls still work
    const getToken = useCallback(async () => {
        return localStorage.getItem('tarous_token')
    }, [])

    return (
        <AuthContext.Provider value={{
            token,
            isAuthenticated,
            loading,
            login,
            logout,
            getToken
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}

export default AuthContext
