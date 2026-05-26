import React from 'react'
import { CheckCircle2, FileWarning, XCircle } from 'lucide-react'
import {
  CardTitle,
  REPORT_STATUS_LABELS,
  StatusBadge,
  formatDate,
  shortText
} from '../../components/admin/adminShared'

const Reports = ({ actionId, onStatusChange, onUpdateReport, reports = [], status }) => (
  <section className='rounded-xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
    <div className='flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between'>
      <CardTitle icon={FileWarning} title='Kiem duyet bao cao' subtitle='Xem noi dung bi report, nguoi report va xu ly trang thai' />
      <select value={status} onChange={(event) => onStatusChange(event.target.value)} className='h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none'>
        <option value='pending'>Cho xu ly</option>
        <option value='approved'>Da duyet</option>
        <option value='rejected'>Tu choi</option>
        <option value='resolved'>Da xu ly</option>
        <option value='all'>Tat ca</option>
      </select>
    </div>

    <div className='divide-y divide-slate-100'>
      {reports.map((report) => {
        const post = report.target_id
        return (
          <article key={report._id} className='p-4 hover:bg-slate-50/50'>
            <div className='flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusBadge status='pending'>{report.reason}</StatusBadge>
                  <StatusBadge status={report.status}>{REPORT_STATUS_LABELS[report.status] || report.status}</StatusBadge>
                  <span className='text-xs font-bold text-slate-400'>{formatDate(report.createdAt)}</span>
                </div>
                <p className='mt-3 text-sm leading-6 text-slate-700'>{report.details || 'Khong co mo ta them.'}</p>
                <div className='mt-4 grid gap-3 lg:grid-cols-2'>
                  <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
                    <p className='text-xs font-black uppercase text-slate-500'>Nguoi bao cao</p>
                    <p className='mt-1 text-sm font-bold text-slate-950'>{report.reporter?.full_name || 'Khong ro'} - @{report.reporter?.username}</p>
                  </div>
                  <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
                    <p className='text-xs font-black uppercase text-slate-500'>Noi dung bi bao cao</p>
                    <p className='mt-1 text-sm font-bold text-slate-950'>{post?.user?.full_name || 'Khong ro'} - {formatDate(post?.createdAt)}</p>
                    <p className='mt-1 text-sm leading-6 text-slate-600'>{shortText(post?.content || 'Bai viet media', 190)}</p>
                  </div>
                </div>
              </div>
              {report.status === 'pending' && (
                <div className='flex flex-wrap gap-2 xl:justify-end'>
                  <button type='button' onClick={() => onUpdateReport(report._id, 'approve')} disabled={actionId === report._id} className='inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white cursor-pointer'>
                    <CheckCircle2 className='size-4' /> Duyet
                  </button>
                  <button type='button' onClick={() => onUpdateReport(report._id, 'reject')} disabled={actionId === report._id} className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 cursor-pointer'>
                    <XCircle className='size-4' /> Tu choi
                  </button>
                  <button type='button' onClick={() => onUpdateReport(report._id, 'resolve')} disabled={actionId === report._id} className='inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 cursor-pointer'>
                    Danh dau xong
                  </button>
                </div>
              )}
            </div>
          </article>
        )
      })}
      {reports.length === 0 && <p className='p-6 text-sm text-slate-500'>Khong co bao cao phu hop.</p>}
    </div>
  </section>
)

export default Reports
