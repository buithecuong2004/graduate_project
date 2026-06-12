import React, { useEffect, useRef, useState, useCallback } from 'react'
import { getVideoPoster } from '../../utils/video'

/**
 * VideoPlayer — phát video với retry tự động khi CDN chưa sẵn sàng.
 *
 * Khi mới upload lên ImageKit, file cần vài giây để propagate trên CDN.
 * Component này sẽ tự động retry load video cho đến khi sẵn sàng,
 * hiển thị spinner loading trong lúc chờ.
 */

const MAX_RETRIES = 10
const RETRY_DELAY = 1500 // ms — CDN ImageKit thường sẵn sàng sau 5-15s

// Blob URL (local preview) luôn available — không cần retry
const isBlobUrl = (url) => typeof url === 'string' && url.startsWith('blob:')

const VideoPlayer = ({
    src,
    className = '',
    controls = true,
    autoPlay = false,
    muted = false,
    playsInline = true,
    poster,
    onEnded,
    onTimeUpdate,
    onCanPlay,
}) => {
    const videoRef = useRef(null)
    const retryCountRef = useRef(0)
    const retryTimerRef = useRef(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isReady, setIsReady] = useState(false)

    // Thử load lại video
    const retryLoad = useCallback(() => {
        const video = videoRef.current
        if (!video || !src) return

        if (retryCountRef.current >= MAX_RETRIES) {
            setIsLoading(false)
            return
        }

        retryCountRef.current += 1
        console.log(`[VideoPlayer] Retry #${retryCountRef.current} loading: ${src}`)

        // Thêm cache-buster để bypass CDN cache trả 404
        const bustUrl = src.includes('?')
            ? `${src}&_t=${Date.now()}`
            : `${src}?_t=${Date.now()}`

        video.src = bustUrl
        video.load()
    }, [src])

    // Setup ban đầu khi src thay đổi
    useEffect(() => {
        const video = videoRef.current
        if (!video || !src) return

        // Reset state
        retryCountRef.current = 0
        setIsLoading(true)
        setIsReady(false)

        // Clear timer cũ
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = null
        }

        video.src = src
        video.load()

        return () => {
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current)
                retryTimerRef.current = null
            }
        }
    }, [src])

    const handleCanPlay = useCallback((e) => {
        setIsLoading(false)
        setIsReady(true)
        retryCountRef.current = 0

        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = null
        }

        if (autoPlay) {
            e.currentTarget.play().catch(() => {
                // Autoplay blocked — bình thường trên mobile
            })
        }

        onCanPlay?.(e)
    }, [autoPlay, onCanPlay])

    const handleError = useCallback(() => {
        // Blob URL lỗi — không cần retry (nếu lỗi là do format/codec)
        if (isBlobUrl(src)) {
            setIsLoading(false)
            return
        }
        // CDN URL chưa sẵn sàng — retry sau delay
        if (retryCountRef.current < MAX_RETRIES) {
            retryTimerRef.current = setTimeout(retryLoad, RETRY_DELAY)
        } else {
            setIsLoading(false)
        }
    }, [retryLoad, src])

    const handleWaiting = useCallback(() => {
        setIsLoading(true)
    }, [])

    const handlePlaying = useCallback(() => {
        setIsLoading(false)
        setIsReady(true)
    }, [])

    const resolvedPoster = poster || getVideoPoster(src)

    return (
        <div className={`relative bg-black ${className}`}>
            {isLoading && (
                <div className='absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 rounded-[inherit]'>
                    <div className='h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white' />
                    {retryCountRef.current > 0 && (
                        <p className='mt-3 text-white/70 text-xs'>Đang tải video...</p>
                    )}
                </div>
            )}
            <video
                ref={videoRef}
                controls={controls}
                muted={muted}
                playsInline={playsInline}
                poster={resolvedPoster}
                preload='auto'
                onCanPlay={handleCanPlay}
                onWaiting={handleWaiting}
                onPlaying={handlePlaying}
                onEnded={onEnded}
                onTimeUpdate={onTimeUpdate}
                onError={handleError}
                className='w-full h-full'
                style={{ display: 'block' }}
            />
        </div>
    )
}

export default VideoPlayer
