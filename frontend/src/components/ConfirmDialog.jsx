import React from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle } from 'lucide-react'

const ConfirmDialog = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    isLoading = false,
    isDangerous = false,
    confirmLabel = 'Xóa',
    loadingLabel = 'Đang xóa...'
}) => {
    if (!isOpen) return null

    return createPortal(
        <div className='fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm'>
            <div className='surface w-full max-w-sm overflow-hidden rounded-[2rem]'>
                <div className={`flex items-start gap-4 p-6 ${isDangerous ? 'bg-red-50' : 'bg-slate-50'}`}>
                    <div className={`shrink-0 ${isDangerous ? 'text-red-600' : 'text-amber-600'}`}>
                        <AlertCircle className='size-6' />
                    </div>
                    <div className='flex-1'>
                        <h3 className='text-lg font-black text-slate-950'>{title}</h3>
                        <p className='mt-2 text-sm leading-6 text-slate-600'>{message}</p>
                    </div>
                </div>

                <div className='flex gap-3 border-t border-slate-200 p-6'>
                    <button
                        type='button'
                        onClick={onCancel}
                        disabled={isLoading}
                        className='btn-muted flex-1 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer'
                    >
                        Hủy
                    </button>
                    <button
                        type='button'
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`flex-1 rounded-full px-4 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
                            isDangerous
                                ? 'bg-red-600 hover:bg-red-700'
                                : 'bg-cyan-700 hover:bg-cyan-800'
                        }`}
                    >
                        {isLoading ? loadingLabel : confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

export default ConfirmDialog
