import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flag, X } from 'lucide-react'
import { REPORT_REASON_OPTIONS } from '../../utils/reportReasons'

const DEFAULT_REASON = REPORT_REASON_OPTIONS[0]?.value || 'other'

const ReportPopover = ({
  description,
  isOpen,
  isSubmitting = false,
  onClose,
  onSubmit,
  position,
  title = 'Báo cáo vi phạm'
}) => {
  const [reason, setReason] = useState(DEFAULT_REASON)
  const [details, setDetails] = useState('')

  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmitting) onClose?.()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSubmitting, onClose])

  if (!isOpen || typeof document === 'undefined') return null

  const panelStyle = position
    ? { top: position.top, left: position.left }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (isSubmitting) return
    onSubmit?.({ reason, details: details.trim() })
  }

  return createPortal(
    <div className='fixed inset-0 z-[10000]'>
      <div className='absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]' onClick={() => !isSubmitting && onClose?.()} />
      <form
        onSubmit={handleSubmit}
        className='fixed w-[min(92vw,24rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl'
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='flex items-center gap-2 text-sm font-black text-slate-950'>
              <Flag className='size-4 text-amber-600' />
              {title}
            </p>
            {description && <p className='mt-1 text-xs leading-5 text-slate-500'>{description}</p>}
          </div>
          <button
            type='button'
            onClick={onClose}
            disabled={isSubmitting}
            className='rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50'
            title='Đóng'
          >
            <X className='size-4' />
          </button>
        </div>

        <label className='mt-4 block text-xs font-black uppercase text-slate-500' htmlFor='report-reason'>
          Nội dung báo cáo
        </label>
        <select
          id='report-reason'
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={isSubmitting}
          className='mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:opacity-60'
        >
          {REPORT_REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <label className='mt-4 block text-xs font-black uppercase text-slate-500' htmlFor='report-details'>
          Mô tả thêm
        </label>
        <textarea
          id='report-details'
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          disabled={isSubmitting}
          maxLength={1000}
          className='mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:opacity-60'
          placeholder='Nhập thông tin giúp quản trị viên kiểm tra nhanh hơn...'
        />

        <div className='mt-4 flex justify-end gap-2'>
          <button
            type='button'
            onClick={onClose}
            disabled={isSubmitting}
            className='rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50'
          >
            Hủy
          </button>
          <button
            type='submit'
            disabled={isSubmitting}
            className='inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60'
          >
            {isSubmitting && <span className='size-3 animate-spin rounded-full border-2 border-white border-t-transparent' />}
            Gửi báo cáo
          </button>
        </div>
      </form>
    </div>,
    document.body
  )
}

export default ReportPopover
