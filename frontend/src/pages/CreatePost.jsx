import React, { useEffect, useState } from 'react'
import { Image, SendHorizonal, Sparkles, Video, X } from 'lucide-react'
import toast from 'react-hot-toast'
import localizeMessage from '../utils/localization'
import { useSelector } from 'react-redux'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { useLocation, useNavigate } from 'react-router-dom'
import SharedPostPreview from '../components/SharedPostPreview'

const CreatePost = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [content, setContent] = useState('')
  const [images, setImages] = useState([])
  const [video, setVideo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sharedPost, setSharedPost] = useState(null)

  const user = useSelector((state)=>state.user.value)
  const {getToken} = useAuth()

  useEffect(() => {
    if (location.state?.sharedPost) {
      setSharedPost(location.state.sharedPost)
      window.history.replaceState({}, document.title)
    }
  }, [location])

  const validateVideo = (file) => {
    const maxSize = 500 * 1024 * 1024
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/mpeg']

    if(!allowedTypes.includes(file.type)) {
      toast.error('Định dạng video không hợp lệ. Vui lòng dùng MP4, MOV, WebM hoặc MPEG.')
      return false
    }

    if(file.size > maxSize) {
      toast.error('Kích thước video phải nhỏ hơn 500MB.')
      return false
    }

    return true
  }

  const validateImages = (files) => {
    const maxSize = 10 * 1024 * 1024
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

    for(let file of files) {
      if(!allowedTypes.includes(file.type)) {
        toast.error('Định dạng hình ảnh không hợp lệ. Vui lòng dùng JPG, PNG, WebP hoặc GIF.')
        return false
      }
      if(file.size > maxSize) {
        toast.error('Mỗi hình ảnh phải nhỏ hơn 10MB.')
        return false
      }
    }

    return true
  }

  const handleVideoChange = (e) => {
    const file = e.target.files[0]
    if(!file) return

    if(images.length > 0) {
      toast.error('Không thể thêm video khi đã chọn hình ảnh.')
      e.target.value = ''
      return
    }

    if(validateVideo(file)) {
      setVideo(file)
    } else {
      e.target.value = ''
    }
  }

  const handleImagesChange = (e) => {
    const newFiles = Array.from(e.target.files)
    if(newFiles.length === 0) return

    if(video) {
      toast.error('Không thể thêm hình ảnh khi đã chọn video.')
      e.target.value = ''
      return
    }

    if(images.length + newFiles.length > 4) {
      toast.error('Tối đa 4 hình ảnh trên mỗi bài viết.')
      e.target.value = ''
      return
    }

    if(validateImages(newFiles)) {
      setImages([...images, ...newFiles])
      e.target.value = ''
    } else {
      e.target.value = ''
    }
  }

  const handleSubmit = async () => {
    const trimmedContent = content.trim()

    if(!images.length && !video && !trimmedContent) {
      throw new Error('Vui lòng thêm nội dung, hình ảnh hoặc video.')
    }

    if(video && trimmedContent.length === 0) {
      throw new Error('Vui lòng thêm một số văn bản với video của bạn.')
    }

    setLoading(true)

    let postType = 'text'
    if(video) {
      postType = trimmedContent ? 'text_with_video' : 'video'
    } else if(images.length) {
      postType = trimmedContent ? 'text_with_image' : 'image'
    }

    try {
      const formData = new FormData()
      formData.append('content', trimmedContent)
      formData.append('post_type', postType)
      if (sharedPost) formData.append('shared_from', sharedPost._id)
      images.forEach((image)=>formData.append('images', image))
      if(video) formData.append('video', video)

      const {data} = await api.post('/api/post/add', formData, {headers: {Authorization: `Bearer ${await getToken()}`}})

      if(data.success) {
        setContent('')
        setImages([])
        setVideo(null)
        setSharedPost(null)
        navigate('/feed')
        return
      }

      throw new Error(data.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='app-page min-h-full'>
      <div className='app-container'>
        <section className='mb-8 rounded-[2rem] surface p-6'>
          <p className='page-kicker'>Sáng tạo</p>
          <h1 className='page-title mt-2'>Tạo bài viết</h1>
          <p className='page-subtitle mt-3 max-w-2xl'>Chia sẻ suy nghĩ, hình ảnh hoặc video với mạng lưới của bạn.</p>
        </section>

        <div className='grid gap-6 lg:grid-cols-[minmax(0,42rem)_18rem]'>
          <form
            onSubmit={(e)=>{
              e.preventDefault()
              toast.promise(handleSubmit(), {
                loading: 'Đang tải lên...',
                success: 'Bài viết đã được thêm',
                error: (error) => localizeMessage(error.message) || 'Bài viết chưa được thêm'
              })
            }}
            className='surface rounded-[1.75rem] p-5 sm:p-7'
          >
            <div className='flex items-center gap-3'>
              <img src={user.profile_picture} alt='' className='size-12 rounded-full object-cover avatar-ring'/>
              <div>
                <h2 className='font-black text-slate-900'>{user.full_name}</h2>
                <p className='text-sm text-slate-500'>@{user.username}</p>
              </div>
            </div>

            {sharedPost && (
              <div className='mt-5 rounded-2xl border border-cyan-100 bg-cyan-50 p-4'>
                <p className='mb-3 text-xs font-black tracking-wide text-cyan-700'>CHIA SẺ TỪ</p>
                <SharedPostPreview post={sharedPost} />
              </div>
            )}

            <textarea
              className='input-modern mt-5 min-h-44 resize-none p-4 text-base leading-7 placeholder-slate-400'
              placeholder='Bạn đang nghĩ gì?'
              onChange={(e)=>setContent(e.target.value)}
              value={content}
            />

            {images.length > 0 && (
              <div className='mt-5'>
                <p className='mb-2 text-xs font-bold text-slate-500'>Hình ảnh ({images.length}/4)</p>
                <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                  {images.map((image,i)=>(
                    <div key={i} className='relative group overflow-hidden rounded-2xl'>
                      <img src={URL.createObjectURL(image)} alt='' className='h-28 w-full object-cover'/>
                      <button type='button' onClick={()=>setImages(images.filter((_,index)=>index !== i))} className='absolute inset-0 hidden items-center justify-center bg-black/45 group-hover:flex cursor-pointer'>
                        <X className='w-6 h-6 text-white'/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {video && (
              <div className='mt-5'>
                <p className='mb-2 text-xs font-bold text-slate-500'>Video ({(video.size / (1024 * 1024)).toFixed(2)}MB)</p>
                <div className='relative group overflow-hidden rounded-2xl bg-black'>
                  <video src={URL.createObjectURL(video)} className='max-h-64 w-full object-contain' />
                  <button type='button' onClick={()=>setVideo(null)} className='absolute inset-0 hidden items-center justify-center bg-black/45 group-hover:flex cursor-pointer'>
                    <X className='w-7 h-7 text-white'/>
                  </button>
                </div>
              </div>
            )}

            <div className='mt-6 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex items-center gap-2'>
                <label htmlFor='images' className={`btn-muted px-4 py-2.5 text-sm cursor-pointer ${video ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Image className='size-5'/>
                  Ảnh
                </label>
                <input type='file' id='images' accept='image/*' hidden multiple onChange={handleImagesChange} disabled={!!video}/>

                <label htmlFor='video' className={`btn-muted px-4 py-2.5 text-sm cursor-pointer ${images.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Video className='size-5'/>
                  Video
                </label>
                <input type='file' id='video' accept='video/*' hidden onChange={handleVideoChange} disabled={images.length > 0}/>
              </div>

              <button disabled={loading} type='submit' className='btn-primary px-6 py-3 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'>
                <SendHorizonal className='size-4'/>
                Đăng bài viết
              </button>
            </div>
          </form>

          <aside className='surface h-fit rounded-[1.75rem] p-5'>
            <div className='mb-4 flex size-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700'>
              <Sparkles className='size-6'/>
            </div>
            <h3 className='text-lg font-black text-slate-900'>Mẹo đăng bài</h3>
            <p className='mt-2 text-sm leading-6 text-slate-500'>Nội dung ngắn, ảnh rõ và lời mở đầu tự nhiên thường giúp bài viết dễ được tương tác hơn.</p>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default CreatePost
