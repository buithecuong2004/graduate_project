import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { formatNumber } from './adminShared'

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50]

const AdminPagination = ({
  disabled = false,
  hasMore = false,
  limit = 10,
  onLimitChange,
  onPageChange,
  page = 1,
  total = 0
}) => {
  const totalPages = Math.max(1, Math.ceil((total || 0) / limit))
  const currentPage = Math.min(Math.max(page, 1), totalPages)
  const from = total === 0 ? 0 : (currentPage - 1) * limit + 1
  const to = Math.min(currentPage * limit, total)
  const canGoBack = currentPage > 1 && !disabled
  const canGoNext = (hasMore || currentPage < totalPages) && !disabled

  const goToPage = (nextPage) => {
    const boundedPage = Math.min(Math.max(nextPage, 1), totalPages)
    if (boundedPage !== currentPage) onPageChange?.(boundedPage)
  }

  return (
    <div className='flex flex-col gap-3 border-t border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between'>
      <div className='flex flex-wrap items-center gap-3 text-sm text-slate-500'>
        <span className='font-semibold'>
          Hiển thị {formatNumber(from)}-{formatNumber(to)} / {formatNumber(total)}
        </span>
        <label className='flex items-center gap-2 font-semibold'>
          <span>Mỗi trang</span>
          <select
            value={limit}
            disabled={disabled}
            onChange={(event) => onLimitChange?.(Number(event.target.value))}
            className='h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-800 outline-none disabled:opacity-60'
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <div className='flex items-center gap-2'>
        <button
          type='button'
          onClick={() => goToPage(1)}
          disabled={!canGoBack}
          className='flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
          title='Trang đầu'
        >
          <ChevronsLeft className='size-4' />
        </button>
        <button
          type='button'
          onClick={() => goToPage(currentPage - 1)}
          disabled={!canGoBack}
          className='flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
          title='Trang trước'
        >
          <ChevronLeft className='size-4' />
        </button>
        <span className='min-w-24 text-center text-sm font-black text-slate-700'>
          {formatNumber(currentPage)} / {formatNumber(totalPages)}
        </span>
        <button
          type='button'
          onClick={() => goToPage(currentPage + 1)}
          disabled={!canGoNext}
          className='flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
          title='Trang sau'
        >
          <ChevronRight className='size-4' />
        </button>
        <button
          type='button'
          onClick={() => goToPage(totalPages)}
          disabled={!canGoNext}
          className='flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
          title='Trang cuối'
        >
          <ChevronsRight className='size-4' />
        </button>
      </div>
    </div>
  )
}

export default AdminPagination
