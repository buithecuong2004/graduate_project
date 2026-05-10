import React from 'react'
import { assets } from '../assets/assets'
import { Star } from 'lucide-react'

const Login = () => {

  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_BASEURL}/api/auth/google`
  }

  const handleFacebookLogin = () => {
    window.location.href = `${import.meta.env.VITE_BASEURL}/api/auth/facebook`
  }

  return (
    <div className='min-h-screen flex flex-col md:flex-row'>
        <img src={assets.bgImage} alt="" className='absolute top-0 left-0 -z-1 w-full h-full object-cover'/>

        <div className='flex-1 flex flex-col items-start justify-between p-6 md:p-10 lg:pl-40'>
            <img src={assets.logo} alt="Tarous Logo" className='h-12 object-contain'/>
            <div>
                <div className='flex items-center gap-3 mb-4 max-md:mt-10'>
                    <img src={assets.group_users} alt="" className='h-8 md:h-10'/>
                    <div>
                        <div className='flex'>
                            {Array(5).fill(0).map((_, i)=>(<Star key={i} className='size-4 md:size-4.5 text-transparent fill-amber-500'/>))}
                        </div>
                        <p>Used by 12k+ users</p>
                    </div>
                </div>
                <h1 className='text-3xl md:text-6xl md:pb-2 font-bold bg-linear-to-r from-indigo-950 to-indigo-800 bg-clip-text text-transparent'>More than just friends truly connect</h1>
                <p className='text-xl md:text-3xl text-indigo-900 max-w-72 md:max-w-md'>Connect with global community on Tarous</p>
            </div>
            <span className='md:h-10'></span>
        </div>

        <div className='flex-1 flex items-center justify-center p-6 sm:p-10'>
          <div className='w-full max-w-md'>
            {/* Login Card */}
            <div className='bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20'>
              <div className='text-center mb-8'>
                <h2 className='text-2xl font-bold text-gray-800 mb-2'>Chào mừng đến Tarous</h2>
                <p className='text-gray-500 text-sm'>Đăng nhập để kết bạn với mọi người trên khắp thế giới</p>
              </div>

              {/* Google Login Button */}
              <button
                id="login-google-btn"
                onClick={handleGoogleLogin}
                className='w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 hover:shadow-md active:scale-[0.98] transition-all duration-200 cursor-pointer mb-4 group'
              >
                <svg className='w-5 h-5' viewBox='0 0 24 24'>
                  <path fill='#4285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z'/>
                  <path fill='#34A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/>
                  <path fill='#FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'/>
                  <path fill='#EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/>
                </svg>
                <span className='text-gray-700 font-medium group-hover:text-gray-900'>Đăng nhập với Google</span>
              </button>

              {/* Facebook Login Button */}
              <button
                id="login-facebook-btn"
                onClick={handleFacebookLogin}
                className='w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-[#1877F2] rounded-xl hover:bg-[#166FE5] hover:shadow-md active:scale-[0.98] transition-all duration-200 cursor-pointer group'
              >
                <svg className='w-5 h-5' viewBox='0 0 24 24' fill='white'>
                  <path d='M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'/>
                </svg>
                <span className='text-white font-medium'>Đăng nhập với Facebook</span>
              </button>

              {/* Divider */}
              <div className='flex items-center gap-4 my-6'>
                <div className='flex-1 h-px bg-gray-200'></div>
                <span className='text-xs text-gray-400 font-medium'>HOẶC</span>
                <div className='flex-1 h-px bg-gray-200'></div>
              </div>

              {/* Terms */}
              <p className='text-center text-xs text-gray-400 leading-relaxed'>
                Bằng cách đăng nhập, bạn đồng ý với{' '}
                <span className='text-indigo-600 hover:underline cursor-pointer'>Điều khoản dịch vụ</span>
                {' '}và{' '}
                <span className='text-indigo-600 hover:underline cursor-pointer'>Chính sách bảo mật</span>
                {' '}của chúng tôi
              </p>
            </div>

            {/* Bottom decoration */}
            <div className='mt-6 text-center'>
              <p className='text-sm text-indigo-800/60'>🔒 An toàn & bảo mật với OAuth 2.0</p>
            </div>
          </div>
        </div>
    </div>
  )
}

export default Login