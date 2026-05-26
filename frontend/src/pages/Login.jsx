import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast'
import { assets } from '../assets/assets'
import { ArrowRight, CheckCircle2, KeyRound, Mail, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { clearUser, fetchUser, setUser } from '../features/user/userSlice'
import { ACCOUNT_LOCKED_CODE, ACCOUNT_LOCKED_MESSAGE, ACCOUNT_LOCKED_STORAGE_KEY, ACCOUNT_LOCKED_TOAST_ID } from '../utils/authMessages'
import localizeMessage from '../utils/localization'

const GoogleIcon = () => (
  <svg className='h-5 w-5' viewBox='0 0 24 24'>
    <path fill='#4285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z'/>
    <path fill='#34A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/>
    <path fill='#FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'/>
    <path fill='#EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/>
  </svg>
)

const initialForm = {
  email: '',
  fullName: '',
  otp: '',
  password: '',
  confirmPassword: '',
}

const Login = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const dispatch = useDispatch()
  const { login } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(initialForm)
  const [resetStep, setResetStep] = useState('email')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'
  const showPasswordFields = !isForgot || resetStep === 'reset'
  const showConfirmPassword = isRegister || (isForgot && resetStep === 'reset')
  const formTitle = isForgot ? 'Quên mật khẩu' : isRegister ? 'Đăng ký tài khoản' : 'Đăng nhập Tarous'
  const formDescription = isForgot
    ? resetStep === 'email'
      ? 'Nhập email tài khoản để nhận mã OTP đặt lại mật khẩu.'
      : 'Nhập mã OTP trong email và tạo mật khẩu mới cho tài khoản.'
    : isRegister
      ? 'Tạo tài khoản bằng email và mật khẩu để bắt đầu kết nối với mọi người.'
      : 'Nhập email và mật khẩu của tài khoản đã đăng ký để tiếp tục.'
  const submitLabel = isSubmitting
    ? 'Đang xử lý...'
    : isForgot
      ? resetStep === 'email' ? 'Gửi mã OTP' : 'Đổi mật khẩu'
      : isRegister ? 'Tạo tài khoản' : 'Đăng nhập'
  const passwordPlaceholder = mode === 'login' ? '********' : 'Ít nhất 6 ký tự'

  useEffect(() => {
    const storedAuthMessage = sessionStorage.getItem(ACCOUNT_LOCKED_STORAGE_KEY)
    if (storedAuthMessage) {
      sessionStorage.removeItem(ACCOUNT_LOCKED_STORAGE_KEY)
      toast.error(storedAuthMessage, { id: ACCOUNT_LOCKED_TOAST_ID })
      return
    }

    if (searchParams.get('error') === 'account_locked') {
      toast.error(ACCOUNT_LOCKED_MESSAGE, { id: ACCOUNT_LOCKED_TOAST_ID })
      navigate('/', { replace: true })
    }
  }, [navigate, searchParams])

  const updateField = (event) => {
    const { name, value } = event.target
    const nextValue = name === 'otp' ? value.replace(/\D/g, '').slice(0, 6) : value
    setForm((current) => ({ ...current, [name]: nextValue }))
  }

  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_BASEURL}/api/auth/google`
  }

  const handleFacebookLogin = () => {
    window.location.href = `${import.meta.env.VITE_BASEURL}/api/auth/facebook`
  }

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setForm(initialForm)
    setResetStep('email')
  }

  const openForgotPassword = () => {
    setMode('forgot')
    setResetStep('email')
    setForm((current) => ({ ...initialForm, email: current.email }))
  }

  const handlePasswordReset = async () => {
    try {
      setIsSubmitting(true)

      if (resetStep === 'email') {
        const { data } = await api.post('/api/auth/forgot-password', { email: form.email })
        if (!data.success) {
          toast.error(localizeMessage(data.message))
          return
        }

        toast.success(localizeMessage(data.message))
        setResetStep('reset')
        return
      }

      const { data } = await api.post('/api/auth/reset-password', {
        email: form.email,
        otp: form.otp,
        password: form.password,
        confirmPassword: form.confirmPassword,
      })

      if (!data.success) {
        toast.error(localizeMessage(data.message))
        return
      }

      toast.success(localizeMessage(data.message))
      setMode('login')
      setResetStep('email')
      setForm((current) => ({ ...initialForm, email: current.email }))
    } catch (error) {
      toast.error(localizeMessage(error.response?.data?.message || error.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResendOtp = async () => {
    if (isSubmitting) return

    try {
      setIsSubmitting(true)
      const { data } = await api.post('/api/auth/forgot-password', { email: form.email })
      if (!data.success) {
        toast.error(localizeMessage(data.message))
        return
      }

      toast.success(localizeMessage(data.message))
      setResetStep('reset')
    } catch (error) {
      toast.error(localizeMessage(error.response?.data?.message || error.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSubmitting) return

    if (isForgot) {
      await handlePasswordReset()
      return
    }

    try {
      setIsSubmitting(true)
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
      const payload = isRegister
        ? {
            email: form.email,
            full_name: form.fullName,
            password: form.password,
            confirmPassword: form.confirmPassword,
          }
        : {
            email: form.email,
            password: form.password,
          }

      const { data } = await api.post(endpoint, payload)
      if (!data.success) {
        toast.error(localizeMessage(data.message), data.code === ACCOUNT_LOCKED_CODE ? { id: ACCOUNT_LOCKED_TOAST_ID } : undefined)
        return
      }

      dispatch(clearUser())
      login(data.token)
      const user = data.user || await dispatch(fetchUser(data.token)).unwrap()
      if (data.user) dispatch(setUser(data.user))
      toast.success(localizeMessage(data.message))
      navigate(user?.role === 'admin' ? '/admin' : '/feed', { replace: true })
    } catch (error) {
      toast.error(localizeMessage(error.response?.data?.message || error.message))
    } finally {
      setIsSubmitting(false)
    }
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
            <span className='inline-flex items-center gap-2'><ShieldCheck className='size-4 text-cyan-300'/> Bảo mật bằng JWT</span>
            <span className='inline-flex items-center gap-2'><UsersRound className='size-4 text-emerald-300'/> Cộng đồng mở</span>
          </div>
        </section>

        <section className='flex items-center justify-center px-6 py-10 sm:px-10'>
          <div className='w-full max-w-md rounded-[2rem] border border-white/15 bg-white/95 p-6 text-slate-950 shadow-2xl backdrop-blur sm:p-8'>
            <div className='mb-7'>
              <div className='mb-5 flex items-center gap-3'>
                <img src={assets.group_users} alt='' className='h-11 w-auto'/>
                <div>
                  <p className='text-sm font-bold text-cyan-700'>Chào mừng đến Tarous</p>
                  <h2 className='text-3xl font-black'>{formTitle}</h2>
                </div>
              </div>
              <p className='text-sm leading-6 text-slate-500'>
                {formDescription}
              </p>
            </div>

            {!isForgot && (
              <div className='mb-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-sm font-bold'>
                <button
                  type='button'
                  onClick={() => switchMode('login')}
                  className={`rounded-xl px-3 py-2 transition ${mode === 'login' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Đăng nhập
                </button>
                <button
                  type='button'
                  onClick={() => switchMode('register')}
                  className={`rounded-xl px-3 py-2 transition ${isRegister ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Đăng ký
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className='space-y-3'>
              {isRegister && (
                <label className='block'>
                  <span className='mb-1.5 block text-sm font-bold text-slate-700'>Tên hiển thị</span>
                  <span className='flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-cyan-300'>
                    <UserRound className='size-5 text-slate-400'/>
                    <input
                      name='fullName'
                      value={form.fullName}
                      onChange={updateField}
                      autoComplete='name'
                      className='min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400'
                      placeholder='Nguyễn Văn A'
                    />
                  </span>
                </label>
              )}

              <label className='block'>
                <span className='mb-1.5 block text-sm font-bold text-slate-700'>Email</span>
                <span className='flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-cyan-300'>
                  <Mail className='size-5 text-slate-400'/>
                  <input
                    name='email'
                    type='email'
                    value={form.email}
                    onChange={updateField}
                    autoComplete='email'
                    disabled={isForgot && resetStep === 'reset'}
                    className='min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400 disabled:text-slate-500'
                    placeholder='you@example.com'
                  />
                </span>
              </label>

              {isForgot && resetStep === 'reset' && (
                <label className='block'>
                  <span className='mb-1.5 block text-sm font-bold text-slate-700'>Mã OTP</span>
                  <span className='flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-cyan-300'>
                    <ShieldCheck className='size-5 text-slate-400'/>
                    <input
                      name='otp'
                      type='text'
                      inputMode='numeric'
                      maxLength={6}
                      value={form.otp}
                      onChange={updateField}
                      autoComplete='one-time-code'
                      className='min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400'
                      placeholder='Nhập 6 chữ số'
                    />
                  </span>
                </label>
              )}

              {showPasswordFields && (
                <label className='block'>
                  <span className='mb-1.5 block text-sm font-bold text-slate-700'>{isForgot ? 'Mật khẩu mới' : 'Mật khẩu'}</span>
                  <span className='flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-cyan-300'>
                    <KeyRound className='size-5 text-slate-400'/>
                    <input
                      name='password'
                      type='password'
                      value={form.password}
                      onChange={updateField}
                      autoComplete={isRegister || isForgot ? 'new-password' : 'current-password'}
                      className='min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400'
                      placeholder={passwordPlaceholder}
                    />
                  </span>
                </label>
              )}

              {showConfirmPassword && (
                <label className='block'>
                  <span className='mb-1.5 block text-sm font-bold text-slate-700'>Xác thực mật khẩu</span>
                  <span className='flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-cyan-300'>
                    <KeyRound className='size-5 text-slate-400'/>
                    <input
                      name='confirmPassword'
                      type='password'
                      value={form.confirmPassword}
                      onChange={updateField}
                      autoComplete='new-password'
                      className='min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400'
                      placeholder='Nhập lại mật khẩu'
                    />
                  </span>
                </label>
              )}

              <button
                type='submit'
                disabled={isSubmitting}
                className='group mt-2 flex w-full items-center justify-between rounded-2xl bg-cyan-600 px-5 py-4 font-bold text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-70'
              >
                <span>{submitLabel}</span>
                <ArrowRight className='size-5 transition group-hover:translate-x-1'/>
              </button>
            </form>

            {mode === 'login' && (
              <div className='mt-4 flex justify-end'>
                <button
                  type='button'
                  onClick={openForgotPassword}
                  className='text-sm font-bold text-cyan-700 transition hover:text-cyan-900'
                >
                  Quên mật khẩu?
                </button>
              </div>
            )}

            {isForgot && (
              <div className='mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold'>
                <button
                  type='button'
                  onClick={() => switchMode('login')}
                  className='text-slate-500 transition hover:text-slate-800'
                >
                  Quay lại đăng nhập
                </button>
                {resetStep === 'reset' && (
                  <button
                    type='button'
                    onClick={handleResendOtp}
                    disabled={isSubmitting}
                    className='text-cyan-700 transition hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60'
                  >
                    Gửi lại mã OTP
                  </button>
                )}
              </div>
            )}

            {!isForgot && (
              <>
                <div className='my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-slate-400'>
                  <div className='h-px flex-1 bg-slate-200'/>
                  hoặc
                  <div className='h-px flex-1 bg-slate-200'/>
                </div>

                <div className='space-y-3'>
                  <button
                    id='login-google-btn'
                    type='button'
                    onClick={handleGoogleLogin}
                    className='group flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 font-bold text-slate-800 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/60'
                  >
                    <span className='flex items-center gap-3'><GoogleIcon/> Đăng nhập với Google</span>
                    <ArrowRight className='size-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-cyan-700'/>
                  </button>

                  <button
                    id='login-facebook-btn'
                    type='button'
                    onClick={handleFacebookLogin}
                    className='group flex w-full items-center justify-between rounded-2xl bg-[#1877F2] px-5 py-4 font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-[#166FE5]'
                  >
                    <span className='flex items-center gap-3'><span className='flex size-5 items-center justify-center rounded-full bg-white text-sm font-black text-[#1877F2]'>f</span> Đăng nhập với Facebook</span>
                    <ArrowRight className='size-5 transition group-hover:translate-x-1'/>
                  </button>
                </div>
              </>
            )}

            <div className='mt-7 rounded-2xl bg-slate-50 p-4'>
              {['Mật khẩu được băm trước khi lưu', 'Có thể dùng email để đăng nhập', 'OAuth vẫn hoạt động như trước'].map((text) => (
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
