import React from 'react'
import { assets } from '../assets/assets'
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'

const GoogleIcon = () => (
  <svg className='w-5 h-5' viewBox='0 0 24 24'>
    <path fill='#4285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z'/>
    <path fill='#34A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/>
    <path fill='#FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'/>
    <path fill='#EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/>
  </svg>
)

const Login = () => {

  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_BASEURL}/api/auth/google`
  }

  const handleFacebookLogin = () => {
    window.location.href = `${import.meta.env.VITE_BASEURL}/api/auth/facebook`
  }

  return (
    <main className='relative min-h-screen overflow-hidden bg-slate-950 text-white'>
      <img src={assets.bgImage} alt='' className='absolute inset-0 h-full w-full object-cover opacity-35'/>
      <div className='absolute inset-0 bg-[linear-gradient(120deg,rgba(2,6,23,0.96),rgba(8,47,73,0.78),rgba(15,23,42,0.9))]'/>

      <div className='relative z-10 grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]'>
        <section className='flex flex-col px-6 py-8 sm:px-10 lg:px-16 xl:px-24'>
          <div className='space-y-10 sm:space-y-12 lg:space-y-14'>
            <img src={assets.tarous_logo} alt='Tarous Logo' className='h-28 w-fit object-contain brightness-0 invert'/>
            <div className='max-w-2xl'>
              <h1 className='text-3xl font-black leading-[1.16] tracking-tight sm:text-5xl sm:leading-[1.14] lg:text-6xl lg:leading-[1.12]'>
              Gặp gỡ, chia sẻ và trò chuyện trong một không gian gọn đẹp.
              </h1>
              <p className='mt-6 max-w-xl text-base leading-8 text-slate-300 sm:text-lg'>
              Tarous gom bài viết, story, bạn bè và tin nhắn vào một trải nghiệm hiện đại, nhanh và dễ dùng trên mọi thiết bị.
              </p>
            </div>
          </div>

          <div className='mt-12 flex flex-wrap items-center gap-4 text-sm text-slate-300 sm:mt-14 lg:mt-16'>
            <span className='inline-flex items-center gap-2'><ShieldCheck className='size-4 text-cyan-300'/> OAuth 2.0</span>
            <span className='inline-flex items-center gap-2'><UsersRound className='size-4 text-emerald-300'/> Cộng đồng mở</span>
          </div>
        </section>

        <section className='flex items-center justify-center px-6 py-10 sm:px-10'>
          <div className='w-full max-w-md rounded-[2rem] border border-white/15 bg-white/95 p-6 text-slate-950 shadow-2xl backdrop-blur sm:p-8'>
            <div className='mb-8'>
              <div className='mb-5 flex items-center gap-3'>
                <img src={assets.group_users} alt='' className='h-11 w-auto'/>
                <div>
                  <p className='text-sm font-bold text-cyan-700'>Chào mừng trở lại</p>
                  <h2 className='text-3xl font-black'>Đăng nhập Tarous</h2>
                </div>
              </div>
              <p className='text-sm leading-6 text-slate-500'>
                Chọn một tài khoản để tiếp tục. Hồ sơ của bạn sẽ được đồng bộ tự động sau khi đăng nhập.
              </p>
            </div>

            <div className='space-y-3'>
              <button
                id='login-google-btn'
                onClick={handleGoogleLogin}
                className='group flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 font-bold text-slate-800 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/60'
              >
                <span className='flex items-center gap-3'><GoogleIcon/> Đăng nhập với Google</span>
                <ArrowRight className='size-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-cyan-700'/>
              </button>

              <button
                id='login-facebook-btn'
                onClick={handleFacebookLogin}
                className='group flex w-full items-center justify-between rounded-2xl bg-[#1877F2] px-5 py-4 font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-[#166FE5]'
              >
                <span className='flex items-center gap-3'><span className='flex size-5 items-center justify-center rounded-full bg-white text-sm font-black text-[#1877F2]'>f</span> Đăng nhập với Facebook</span>
                <ArrowRight className='size-5 transition group-hover:translate-x-1'/>
              </button>
            </div>

            <div className='mt-8 rounded-2xl bg-slate-50 p-4'>
              {['Không cần mật khẩu riêng', 'Dữ liệu đăng nhập được bảo vệ', 'Có thể dùng ngay sau xác thực'].map((text) => (
                <p key={text} className='flex items-center gap-2 py-1.5 text-sm text-slate-600'>
                  <CheckCircle2 className='size-4 text-emerald-500'/>
                  {text}
                </p>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default Login
