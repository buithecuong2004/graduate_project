import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ImagePlus, Sparkle, TextIcon, Upload, X } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import {
    addStoryLocal,
    setViewStory,
    fetchStories,
} from '../../features/stories/storiesSlice'
import api from '../../api/axios'

const BG_COLORS = ['#0f766e', '#0891b2', '#2563eb', '#7c3aed', '#f97316', '#e11d48']
const MAX_VIDEO_DURATION = 60
const MAX_VIDEO_SIZE_MB = 50

const StoryModal = ({ setShowModal }) => {
    const dispatch = useDispatch()
    const { getToken } = useAuth()
    const currentUser = useSelector((state) => state.user.value)

    const [mode, setMode] = useState('text')
    const [background, setBackground] = useState(BG_COLORS[0])
    const [text, setText] = useState('')
    const [media, setMedia] = useState(null)
    const [previewUrl, setPreviewUrl] = useState(null)
    const [isSaving, setIsSaving] = useState(false)

    // Ref để track blob URL — chỉ revoke nếu chưa được chuyển sang viewer
    const blobHandedOff = useRef(false)

    useEffect(() => {
        return () => {
            if (previewUrl && !blobHandedOff.current) {
                URL.revokeObjectURL(previewUrl)
            }
        }
    }, [previewUrl])

    const closeModal = () => setShowModal(false)

    const setPreviewFromFile = (file) => {
        if (previewUrl && !blobHandedOff.current) URL.revokeObjectURL(previewUrl)
        blobHandedOff.current = false
        setMedia(file)
        setPreviewUrl(URL.createObjectURL(file))
        setText('')
        setMode('media')
    }

    const clearMedia = () => {
        if (previewUrl && !blobHandedOff.current) URL.revokeObjectURL(previewUrl)
        blobHandedOff.current = false
        setMedia(null)
        setPreviewUrl(null)
    }

    const handleMediaUpload = (event) => {
        const file = event.target.files?.[0]
        if (!file) return

        if (file.type.startsWith('video')) {
            if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
                toast.error(`Video không được vượt quá ${MAX_VIDEO_SIZE_MB} MB`)
                clearMedia()
                return
            }

            const metadataUrl = URL.createObjectURL(file)
            const video = document.createElement('video')
            video.preload = 'metadata'
            video.onloadedmetadata = () => {
                URL.revokeObjectURL(metadataUrl)
                if (video.duration > MAX_VIDEO_DURATION) {
                    toast.error('Video không được dài quá 1 phút')
                    clearMedia()
                    return
                }
                setPreviewFromFile(file)
            }
            video.onerror = () => {
                URL.revokeObjectURL(metadataUrl)
                toast.error('Không thể đọc video này')
            }
            video.src = metadataUrl
            return
        }

        if (file.type.startsWith('image')) {
            setPreviewFromFile(file)
            return
        }

        toast.error('Vui lòng chọn ảnh hoặc video')
    }

    const handleCreateStory = () => {
        if (isSaving) return

        if (mode === 'media' && !media) {
            toast.error('Vui lòng chọn ảnh hoặc video')
            return
        }

        if (mode === 'text' && !text.trim()) {
            toast.error('Vui lòng nhập nội dung tin')
            return
        }

        const mediaType = mode === 'media'
            ? (media.type.startsWith('image') ? 'image' : 'video')
            : 'text'

        const capturedText = text.trim()
        const capturedBg = background
        const capturedBlobUrl = previewUrl   // blob URL để xem ngay
        const capturedMedia = media

        // ── Bước 1: Hiển thị story ngay lập tức với blob URL ──────────────
        // Tạo story "tạm" với ID giả để render StoryViewer ngay
        const tempStory = {
            _id: `temp_${Date.now()}`,
            _isUploading: true,          // flag để biết đang upload
            user: currentUser,
            media_type: mediaType,
            media_url: capturedBlobUrl,  // blob URL — phát ngay không cần CDN
            content: capturedText,
            background_color: capturedBg,
            createdAt: new Date().toISOString(),
            reactions: [],
        }

        if (capturedBlobUrl) {
            // Đánh dấu blob đã được dùng — không revoke khi modal đóng
            blobHandedOff.current = true
        }

        // Dispatch ngay lập tức, đóng modal
        dispatch(addStoryLocal(tempStory))
        dispatch(setViewStory(tempStory))
        closeModal()

        // ── Bước 2: Upload lên server ở background ──────────────────────────
        setIsSaving(true)
        const uploadInBackground = async () => {
            try {
                const formData = new FormData()
                formData.append('content', capturedText)
                formData.append('media_type', mediaType)
                formData.append('background_color', capturedBg)
                if (capturedMedia) formData.append('media', capturedMedia)

                const token = await getToken()
                const { data } = await api.post('/api/story/create', formData, {
                    headers: { Authorization: `Bearer ${token}` }
                })

                if (data.success) {
                    // Thay thế story tạm bằng story thực từ server
                    dispatch({ type: 'stories/replaceTempStory', payload: { tempId: tempStory._id, story: data.story } })
                    // Fetch lại để đồng bộ
                    dispatch(fetchStories(token))
                    toast.success('Tin đã được tạo')
                } else {
                    // Upload thất bại — xóa story tạm
                    dispatch({ type: 'stories/removeTempStory', payload: tempStory._id })
                    toast.error(data.message || 'Không thể tạo tin')
                }
            } catch (err) {
                dispatch({ type: 'stories/removeTempStory', payload: tempStory._id })
                toast.error(err.message || 'Không thể tạo tin')
            } finally {
                setIsSaving(false)
                // Revoke blob URL sau khi story thực đã lên (hoặc thất bại)
                if (capturedBlobUrl) {
                    setTimeout(() => URL.revokeObjectURL(capturedBlobUrl), 5000)
                }
            }
        }

        uploadInBackground()
    }

    return createPortal(
        <div className='fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm' role='dialog' aria-modal='true'>
            <div className='surface flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem]'>
                <header className='flex items-center justify-between border-b border-slate-200 px-6 py-5'>
                    <button type='button' onClick={closeModal} className='inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 cursor-pointer'>
                        <ArrowLeft className='size-5' />
                        Đóng
                    </button>
                    <div className='text-center'>
                        <p className='page-kicker'>Story</p>
                        <h2 className='mt-1 text-2xl font-black text-slate-950'>Tạo tin</h2>
                    </div>
                    <button type='button' onClick={closeModal} className='rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 cursor-pointer'>
                        <X className='size-6' />
                    </button>
                </header>

                <div className='grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[1.05fr_0.95fr]'>
                    <section className='flex items-center justify-center bg-slate-950 p-6'>
                        <div className='flex h-full max-h-[66vh] w-full max-w-[25rem] items-center justify-center rounded-[2rem] p-4 shadow-2xl' style={{ backgroundColor: background }}>
                            {mode === 'text' && (
                                <p className='w-full break-words text-center text-3xl font-black leading-tight text-white drop-shadow-sm'>
                                    {text.trim() || 'Bạn đang nghĩ gì?'}
                                </p>
                            )}

                            {mode === 'media' && previewUrl && (
                                media?.type.startsWith('image')
                                    ? <img src={previewUrl} alt='' className='max-h-full w-full rounded-[1.5rem] object-contain' />
                                    : <video src={previewUrl} controls className='max-h-full w-full rounded-[1.5rem] object-contain' />
                            )}

                            {mode === 'media' && !previewUrl && (
                                <div className='text-center text-white'>
                                    <ImagePlus className='mx-auto mb-3 size-12 opacity-80' />
                                    <p className='font-black'>Chọn ảnh hoặc video</p>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className='space-y-6 p-6'>
                        <div>
                            <p className='mb-3 text-sm font-black text-slate-700'>Kiểu tin</p>
                            <div className='grid grid-cols-2 gap-3'>
                                <button
                                    type='button'
                                    onClick={() => {
                                        clearMedia()
                                        setMode('text')
                                    }}
                                    className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition cursor-pointer ${mode === 'text' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                                >
                                    <TextIcon className='size-5' />
                                    Văn bản
                                </button>
                                <label className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition cursor-pointer ${mode === 'media' ? 'bg-cyan-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                                    <input onChange={handleMediaUpload} type='file' accept='image/*, video/*' className='hidden' />
                                    <Upload className='size-5' />
                                    Ảnh/Video
                                </label>
                            </div>
                        </div>

                        {mode === 'text' && (
                            <div>
                                <label className='mb-2 block text-sm font-black text-slate-700'>Nội dung</label>
                                <textarea
                                    value={text}
                                    onChange={(event) => setText(event.target.value)}
                                    placeholder='Bạn đang nghĩ gì?'
                                    className='input-modern min-h-36 resize-none px-4 py-3 text-sm'
                                    maxLength={220}
                                />
                                <p className='mt-1 text-right text-xs text-slate-400'>{text.length}/220</p>
                            </div>
                        )}

                        {mode === 'text' && (
                            <div>
                                <p className='mb-3 text-sm font-black text-slate-700'>Màu nền</p>
                                <div className='flex flex-wrap gap-3'>
                                    {BG_COLORS.map((color) => (
                                        <button
                                            key={color}
                                            type='button'
                                            onClick={() => setBackground(color)}
                                            className={`size-10 rounded-full border-4 transition cursor-pointer ${background === color ? 'border-slate-950 scale-105' : 'border-white shadow-md'}`}
                                            style={{ backgroundColor: color }}
                                            aria-label={`Chọn màu ${color}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {mode === 'media' && (
                            <div className='rounded-3xl border border-slate-200 bg-slate-50/80 p-4'>
                                <p className='font-black text-slate-950'>{media ? media.name : 'Chưa chọn tệp'}</p>
                                <p className='mt-1 text-sm text-slate-500'>Ảnh hoặc video tối đa 50MB. Video tối đa 1 phút.</p>
                            </div>
                        )}

                        <button
                            type='button'
                            onClick={handleCreateStory}
                            disabled={isSaving}
                            className='btn-primary w-full justify-center px-5 py-3 disabled:opacity-60 cursor-pointer'
                        >
                            <Sparkle className='size-5' />
                            {isSaving ? 'Đang tạo...' : 'Tạo tin'}
                        </button>
                    </section>
                </div>
            </div>
        </div>,
        document.body
    )
}

export default StoryModal
