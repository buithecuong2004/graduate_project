import React, { useState, useEffect } from 'react'
import { Image, X, Video } from 'lucide-react'
import toast from 'react-hot-toast'
import localizeMessage from '../utils/localization'
import { useSelector } from 'react-redux'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { useNavigate, useLocation } from 'react-router-dom'
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

  // Get shared post from location state
  useEffect(() => {
    if (location.state?.sharedPost) {
      setSharedPost(location.state.sharedPost)
      // Clear the location state to avoid reusing it
      window.history.replaceState({}, document.title)
    }
  }, [location])

  const validateVideo = (file) => {
    const maxSize = 500 * 1024 * 1024; // 500MB
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/mpeg']

    if(!allowedTypes.includes(file.type)) {
      toast.error('Định dạng video không hợp lệ. Vui lòng sử dụng MP4, MOV, WebM hoặc MPEG')
      return false
    }

    if(file.size > maxSize) {
      toast.error('Kích thước video phải nhỏ hơn 500MB')
      return false
    }

    return true
  }

  const validateImages = (files) => {
    const maxSize = 10 * 1024 * 1024; // 10MB per image
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

    for(let file of files) {
      if(!allowedTypes.includes(file.type)) {
        toast.error('Định dạng hình ảnh không hợp lệ. Vui lòng sử dụng JPG, PNG, WebP hoặc GIF')
        return false
      }
      if(file.size > maxSize) {
        toast.error('Mỗi hình ảnh phải nhỏ hơn 10MB')
        return false
      }
    }

    return true
  }

  const handleVideoChange = (e) => {
    const file = e.target.files[0]
    if(!file) return

    if(images.length > 0) {
      toast.error('Không thể thêm video khi đã chọn hình ảnh')
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
      toast.error('Không thể thêm hình ảnh khi đã chọn video')
      e.target.value = ''
      return
    }

    if(images.length + newFiles.length > 4) {
      toast.error('Tối đa 4 hình ảnh trên mỗi bài viết')
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
    if(!images.length && !video && !content) {
      return toast.error('Vui lòng thêm nội dung, hình ảnh hoặc video')
    }

    if(video && content.length === 0) {
      return toast.error('Vui lòng thêm một số văn bản với video của bạn')
    }

    setLoading(true)

    let postType = 'text'
    if(video) {
      postType = content ? 'text_with_video' : 'video'
    } else if(images.length) {
      postType = content ? 'text_with_image' : 'image'
    }

    try {
      const formData = new FormData()
      formData.append('content', content)
      formData.append('post_type', postType)
      if (sharedPost) {
        formData.append('shared_from', sharedPost._id)
      }

      if(images.length) {
        images.forEach((image)=>{
          formData.append('images', image)
        })
      }

      if(video) {
        formData.append('video', video)
      }

      const {data} = await api.post('/api/post/add', formData, {headers: {Authorization: `Bearer ${await getToken()}`}})

      if(data.success) {
        setContent('')
        setImages([])
        setVideo(null)
        setSharedPost(null)
        navigate('/')
      } else {
        console.log(data.message)
        throw new Error(data.message)
      }
    } catch (error) {
        console.log(error.message)
        toast.error(localizeMessage(error.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='min-h-screen bg-linear-to-b from-slate-50 to-white'>
      <div className='max-w-6xl mx-auto p-6'>
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-slate-900 mb-2'>Tạo Bài Viết</h1>
          <p className='text-slate-600'>Chia sẻ suy nghĩ của bạn với thế giới</p>
        </div>

        <div className='max-w-xl bg-white p-4 sm:p-8 sm:pb-3 rounded-xl shadow-md space-y-4'>
          <div className='flex items-center gap-3'>
            <img src={user.profile_picture} alt="" className='w-12 h-12 rounded-full shadow'/>
            <div>
              <h2 className='font-semibold'>{user.full_name}</h2>
              <p className='text-sm text-gray-500'>@{user.username}</p>
            </div>
          </div>

          {sharedPost && (
            <div className='bg-blue-50 border-l-4 border-blue-500 p-4 rounded'>
              <p className='text-xs text-blue-600 font-semibold mb-3'>CHIA SẺ TỪ</p>
              <SharedPostPreview post={sharedPost} />
            </div>
          )}

          
          <textarea name="" id="" className='w-full resize-none max-h-20 mt-4 text-sm outline-none placeholder-gray-400' placeholder="Có gì đang xảy ra"
          onChange={(e)=>setContent(e.target.value)} value={content}/>

          {
            images.length > 0 && <div className='flex flex-wrap gap-2 mt-4'>
              <p className='text-xs text-gray-500 w-full'>Hình ảnh ({images.length}/4)</p>
              {images.map((image,i)=>(
                <div key={i} className='relative group'>
                  <img src={URL.createObjectURL(image)} alt="" className='h-20 rounded-md'/>
                  <div onClick={()=>setImages(images.filter((_,index)=>index !== i))} className='absolute hidden group-hover:flex justify-center items-center top-0 right-0 bottom-0 left-0 bg-black/40 rounded-md cursor-pointer'>
                    <X className='w-6 h-6 text-white'/>
                  </div>
                </div>
              ))}
            </div>
          }

          {
            video && <div className='flex flex-wrap gap-2 mt-4'>
              <p className='text-xs text-gray-500 w-full'>Video (tối đa 500MB)</p>
              <div className='relative group'>
                <video src={URL.createObjectURL(video)} className='h-20 rounded-md' />
                <div onClick={()=>setVideo(null)} className='absolute hidden group-hover:flex justify-center items-center top-0 right-0 bottom-0 left-0 bg-black/40 rounded-md cursor-pointer'>
                  <X className='w-6 h-6 text-white'/>
                </div>
              </div>
              <p className='text-xs text-gray-500 w-full'>{(video.size / (1024 * 1024)).toFixed(2)}MB</p>
            </div>
          }

          <div className='flex items-center justify-between pt-3 border-t border-gray-300'>
            <div className='flex items-center gap-2'>
              <label htmlFor="images" className={`flex items-center gap-2 text-sm transition cursor-pointer ${video ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700'}`} title={video ? 'Xóa video để thêm hình ảnh' : 'Tối đa 4 hình ảnh, 10MB mỗi cái'}>
                <Image className='size-6'/>
              </label>
              <input type="file" id='images' accept='image/*' hidden multiple onChange={handleImagesChange} disabled={!!video}/>

              <label htmlFor="video" className={`flex items-center gap-2 text-sm transition cursor-pointer ${images.length > 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700'}`} title={images.length > 0 ? 'Xóa hình ảnh để thêm video' : 'Video tối đa 500MB'}>
                <Video className='size-6'/>
              </label>
              <input type="file" id='video' accept='video/*' hidden onChange={handleVideoChange} disabled={images.length > 0}/>
            </div>

            <button disabled={loading} onClick={()=>toast.promise(
              handleSubmit(),
              {
                loading: 'đang tải lên...',
                success: <p>Bài viết đã được thêm</p>,
                error: <p>Bài viết chưa được thêm</p>
              }
            )}
             className='text-sm bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-95 transition text-white font-medium px-8 py-2 rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'>
              Đăng Bài Viết
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreatePost