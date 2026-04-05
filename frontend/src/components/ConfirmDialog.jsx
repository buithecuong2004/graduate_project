import { AlertCircle, X } from 'lucide-react'
import React from 'react'

const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel, isLoading = false, isDangerous = false }) => {
    if (!isOpen) return null

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm'>
            <div className='bg-white rounded-lg shadow-lg max-w-sm w-full mx-4 overflow-hidden'>
                <div className={`flex items-start gap-4 p-6 ${isDangerous ? 'bg-red-50' : 'bg-slate-50'}`}>
                    <div className={`flex-shrink-0 ${isDangerous ? 'text-red-600' : 'text-amber-600'}`}>
                        <AlertCircle className='w-6 h-6' />
                    </div>
                    <div className='flex-1'>
                        <h3 className='text-lg font-semibold text-slate-900'>{title}</h3>
                        <p className='text-sm text-slate-600 mt-2'>{message}</p>
                    </div>
                </div>

                <div className='flex gap-3 p-6 border-t border-slate-200'>
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className='flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed'
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                            isDangerous
                                ? 'bg-red-600 hover:bg-red-700'
                                : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                    >
                        {isLoading ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ConfirmDialog
