import React, { useState } from 'react'
import { CheckCircle2, Eye, FileWarning, XCircle } from 'lucide-react'
import AdminPagination from '../../components/admin/AdminPagination'
import PostPreviewModal from '../../components/admin/PostPreviewModal'
import { getReportReasonLabel } from '../../utils/reportReasons'
import {
  CardTitle,
  REPORT_CATEGORY_LABELS,
  REPORT_CATEGORY_OPTIONS,
  REPORT_STATUS_LABELS,
  StatusBadge,
  formatDate,
  shortText
} from '../../components/admin/adminShared'

const getTarget = (report) => report.target || report.target_id || {}

const getReportMessageMedia = (report) => {
  if (report?.target_type !== 'message') return []
  const target = getTarget(report)
  const targetUrls = Array.isArray(target?.media_urls) ? target.media_urls.filter(Boolean) : []
  if (targetUrls.length > 0) return targetUrls
  return Array.isArray(report?.target_snapshot?.media_urls) ? report.target_snapshot.media_urls.filter(Boolean) : []
}

const getReportMessageType = (report) => {
  const target = getTarget(report)
  return target?.message_type || report?.target_snapshot?.message_type || 'text'
}

const getAudioSourceType = (url = '') => {
  const cleanUrl = url.split('?')[0].toLowerCase()
  if (cleanUrl.endsWith('.m4a') || cleanUrl.endsWith('.mp4')) return 'audio/mp4'
  if (cleanUrl.endsWith('.ogg') || cleanUrl.endsWith('.oga')) return 'audio/ogg'
  if (cleanUrl.endsWith('.wav')) return 'audio/wav'
  if (cleanUrl.endsWith('.mp3')) return 'audio/mpeg'
  if (cleanUrl.endsWith('.aac')) return 'audio/aac'
  return 'audio/webm'
}

const getPersonLine = (user) => {
  if (!user) return 'Không rõ'
  return `${user.full_name || 'Không rõ'}${user.username ? ` - @${user.username}` : ''}`
}

const getMessageLabel = (message, report) => {
  const mediaUrls = getReportMessageMedia(report)
  const messageType = getReportMessageType(report)
  const snapshot = report?.target_snapshot || {}

  if (!message && !snapshot.text && mediaUrls.length === 0) return 'Tin nhắn không còn tồn tại.'
  if (message?.text || snapshot.text) return message?.text || snapshot.text
  if (messageType === 'voice') return 'Tin nhắn thoại'
  if (mediaUrls.length > 0 && messageType?.includes('video')) return `Tin nhắn video (${mediaUrls.length} tệp)`
  if (mediaUrls.length > 0 && messageType?.includes('image')) return `Tin nhắn ảnh (${mediaUrls.length} tệp)`
  if (mediaUrls.length > 0) return `Tin nhắn đa phương tiện (${mediaUrls.length} tệp)`
  if (message?.shared_post_id || snapshot.shared_post_id) return 'Tin nhắn chia sẻ bài viết'
  if (message?.is_deleted) return 'Tin nhắn đã bị xóa.'
  return 'Tin nhắn không có nội dung chữ.'
}

const getReportPost = (report) => {
  const target = getTarget(report)
  if (report.target_type === 'post' && target?._id) return target
  if (report.target_type === 'comment' && target?.post?._id) return target.post
  if (report.target_type === 'message' && target?.shared_post_id?._id) return target.shared_post_id
  return null
}

const getTargetInfo = (report) => {
  const target = getTarget(report)

  if (report.target_type === 'post') {
    return {
      title: 'Bài viết bị báo cáo',
      owner: getPersonLine(target?.user),
      meta: formatDate(target?.createdAt),
      body: shortText(target?.content || 'Bài viết đa phương tiện', 220)
    }
  }

  if (report.target_type === 'comment') {
    return {
      title: 'Bình luận bị báo cáo',
      owner: getPersonLine(target?.user),
      meta: target?.post ? `Trong bài viết của ${target.post.user?.full_name || 'không rõ'}` : 'Bài viết gốc không còn tồn tại',
      body: shortText(target?.content || 'Bình luận không còn nội dung', 220)
    }
  }

  if (report.target_type === 'message') {
    return {
      title: 'Tin nhắn bị báo cáo',
      owner: `${getPersonLine(target?.from_user_id)} -> ${getPersonLine(target?.to_user_id)}`,
      meta: formatDate(target?.createdAt || report?.target_snapshot?.createdAt),
      body: shortText(getMessageLabel(target, report), 220)
    }
  }

  if (report.target_type === 'user') {
    return {
      title: 'Người dùng bị báo cáo',
      owner: getPersonLine(target),
      meta: target?.account_status ? `Trạng thái: ${target.account_status}` : '',
      body: target?.email || 'Không có email'
    }
  }

  return {
    title: 'Nội dung bị báo cáo',
    owner: 'Không rõ',
    meta: '',
    body: 'Không có dữ liệu.'
  }
}

const ReportMessageMedia = ({ report }) => {
  const mediaUrls = getReportMessageMedia(report)
  if (mediaUrls.length === 0) return null

  const messageType = getReportMessageType(report)

  return (
    <div className='mt-3 grid gap-2 sm:grid-cols-2'>
      {mediaUrls.map((url, index) => {
        const isVoice = messageType === 'voice'
        const isVideo = !isVoice && (messageType?.includes('video') || /\.(mp4|webm|mov|ogg)$/i.test(url.split('?')[0]))

        if (isVoice) {
          return (
            <div key={url || index} className='rounded-xl border border-slate-200 bg-white p-3'>
              <p className='mb-2 text-xs font-black uppercase text-slate-500'>Ghi âm</p>
              <audio controls preload='metadata' className='h-9 w-full'>
                <source src={url} type={getAudioSourceType(url)} />
              </audio>
            </div>
          )
        }

        if (isVideo) {
          return <video key={url || index} src={url} controls className='max-h-64 w-full rounded-xl border border-slate-200 bg-black object-contain' />
        }

        return (
          <a key={url || index} href={url} target='_blank' rel='noreferrer' className='block'>
            <img src={url} alt='Nội dung tin nhắn bị báo cáo' className='max-h-64 w-full rounded-xl border border-slate-200 object-contain' />
          </a>
        )
      })}
    </div>
  )
}

const Reports = ({
  actionId,
  loading = false,
  onLimitChange,
  onPageChange,
  onStatusChange,
  onTypeChange,
  onUpdateReport,
  pagination,
  reports = [],
  status,
  type
}) => {
  const [previewPost, setPreviewPost] = useState(null)

  return (
    <>
      <section className='rounded-xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
        <div className='border-b border-slate-200 p-4'>
          <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
            <CardTitle icon={FileWarning} title='Kiểm duyệt báo cáo' subtitle='Báo cáo được phân theo bài viết, bình luận, tin nhắn và người dùng.' />
            <select value={status} onChange={(event) => onStatusChange(event.target.value)} className='h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none'>
              <option value='pending'>Chờ xử lý</option>
              <option value='approved'>Đã duyệt</option>
              <option value='rejected'>Từ chối</option>
              <option value='resolved'>Đã xử lý</option>
              <option value='all'>Tất cả</option>
            </select>
          </div>

          <div className='flex flex-wrap gap-2'>
            {REPORT_CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type='button'
                onClick={() => onTypeChange(option.value)}
                className={`rounded-lg px-3 py-2 text-xs font-black transition ${type === option.value ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className='divide-y divide-slate-100'>
          {reports.map((report) => {
            const targetInfo = getTargetInfo(report)
            const post = getReportPost(report)

            return (
              <article key={report._id} className='p-4 hover:bg-slate-50/50'>
                <div className='flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <StatusBadge status='pending'>{REPORT_CATEGORY_LABELS[report.target_type] || report.target_type}</StatusBadge>
                      <StatusBadge status='pending'>{getReportReasonLabel(report.reason)}</StatusBadge>
                      <StatusBadge status={report.status}>{REPORT_STATUS_LABELS[report.status] || report.status}</StatusBadge>
                      <span className='text-xs font-bold text-slate-400'>{formatDate(report.createdAt)}</span>
                    </div>

                    <p className='mt-3 text-sm leading-6 text-slate-700'>{report.details || 'Không có mô tả thêm.'}</p>

                    <div className='mt-4 grid gap-3 lg:grid-cols-2'>
                      <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
                        <p className='text-xs font-black uppercase text-slate-500'>Người báo cáo</p>
                        <p className='mt-1 text-sm font-bold text-slate-950'>{getPersonLine(report.reporter)}</p>
                      </div>
                      <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
                        <p className='text-xs font-black uppercase text-slate-500'>{targetInfo.title}</p>
                        <p className='mt-1 text-sm font-bold text-slate-950'>{targetInfo.owner}</p>
                        {targetInfo.meta && <p className='mt-1 text-xs font-semibold text-slate-500'>{targetInfo.meta}</p>}
                        <p className='mt-2 text-sm leading-6 text-slate-600'>{targetInfo.body}</p>
                        {report.target_type === 'message' && <ReportMessageMedia report={report} />}
                        {post && (
                          <button
                            type='button'
                            onClick={() => setPreviewPost(post)}
                            className='mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-700'
                          >
                            <Eye className='size-4' />
                            Xem bài viết
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {report.status === 'pending' && (
                    <div className='flex flex-wrap gap-2 xl:justify-end'>
                      <button type='button' onClick={() => onUpdateReport(report._id, 'approve')} disabled={actionId === report._id} className='inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white cursor-pointer disabled:opacity-60'>
                        <CheckCircle2 className='size-4' /> Duyệt
                      </button>
                      <button type='button' onClick={() => onUpdateReport(report._id, 'reject')} disabled={actionId === report._id} className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 cursor-pointer disabled:opacity-60'>
                        <XCircle className='size-4' /> Từ chối
                      </button>
                      <button type='button' onClick={() => onUpdateReport(report._id, 'resolve')} disabled={actionId === report._id} className='inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 cursor-pointer disabled:opacity-60'>
                        Đánh dấu xong
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
          {reports.length === 0 && <p className='p-6 text-sm text-slate-500'>Không có báo cáo phù hợp.</p>}
        </div>
        <AdminPagination
          disabled={loading}
          hasMore={pagination?.hasMore}
          limit={pagination?.limit}
          onLimitChange={onLimitChange}
          onPageChange={onPageChange}
          page={pagination?.page}
          total={pagination?.total}
        />
      </section>

      <PostPreviewModal post={previewPost} onClose={() => setPreviewPost(null)} />
    </>
  )
}

export default Reports
