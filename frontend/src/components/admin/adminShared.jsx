import React from 'react'
import {
  Activity,
  BarChart3,
  FileWarning,
  Gauge,
  MessageCircle,
  ThumbsUp,
  TrendingUp,
  Users
} from 'lucide-react'

export const ADMIN_TABS = [
  { id: 'overview', path: '/admin', label: 'Tong quan', Icon: Gauge },
  { id: 'users', path: '/admin/users', label: 'Nguoi dung', Icon: Users },
  { id: 'posts', path: '/admin/posts', label: 'Bai viet', Icon: MessageCircle },
  { id: 'reports', path: '/admin/reports', label: 'Kiem duyet', Icon: FileWarning }
]

export const REPORT_STATUS_LABELS = {
  pending: 'Cho xu ly',
  approved: 'Da duyet',
  rejected: 'Tu choi',
  resolved: 'Da xu ly'
}

export const REPORT_ACTION_LABELS = {
  approve: 'Duyet',
  reject: 'Tu choi',
  resolve: 'Danh dau xong'
}

export const CHART_TABS = [
  { id: 'users', label: 'Nguoi dung', metricLabel: 'Nguoi dung', color: '#0ea5e9', fill: 'adminChartBlue' },
  { id: 'posts', label: 'Bai dang', metricLabel: 'Bai dang', color: '#10b981', fill: 'adminChartGreen' },
  { id: 'comments', label: 'Binh luan', metricLabel: 'Binh luan', color: '#8b5cf6', fill: 'adminChartViolet' },
  { id: 'likes', label: 'Like', metricLabel: 'Like/Reactions', color: '#f43f5e', fill: 'adminChartRose' },
  { id: 'shares', label: 'Chia se', metricLabel: 'Chia se', color: '#f59e0b', fill: 'adminChartAmber' }
]

export const CHART_RANGE_OPTIONS = [
  { value: 1, label: '1 ngay' },
  { value: 7, label: '1 tuan' },
  { value: 30, label: '1 thang' },
  { value: 90, label: '3 thang' },
  { value: 180, label: '6 thang' },
  { value: 365, label: '1 nam' }
]

export const POST_STATUS_OPTIONS = [
  { value: 'all', label: 'Tat ca' },
  { value: 'visible', label: 'Dang hien thi' },
  { value: 'hidden', label: 'Da an' },
  { value: 'reported', label: 'Bi bao cao' }
]

export const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(value || 0)

export const formatDate = (value) => value ? new Date(value).toLocaleDateString('vi-VN') : '-'

export const formatChartDate = (value) => {
  if (!value) return '-'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}` : formatDate(value)
}

export const shortText = (value = '', max = 160) => value.length > max ? `${value.slice(0, max)}...` : value

const iconToneClasses = {
  cyan: 'bg-cyan-50 text-cyan-600 ring-cyan-100',
  blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100'
}

export const CardTitle = ({ icon: IconComponent = BarChart3, title, subtitle, action }) => (
  <div className='mb-5 flex items-start justify-between gap-4'>
    <div className='flex items-start gap-3'>
      <span className='flex size-10 items-center justify-center rounded-xl bg-slate-50 text-slate-900 ring-1 ring-slate-200'>
        {React.createElement(IconComponent, { className: 'size-5' })}
      </span>
      <div>
        <h2 className='text-sm font-black text-slate-950'>{title}</h2>
        {subtitle && <p className='mt-1 text-xs leading-5 text-slate-500'>{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
)

export const MetricCard = ({ label, value, note, icon: IconComponent = Activity, tone = 'cyan' }) => (
  <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
    <div className='flex items-start justify-between gap-3'>
      <span className={`flex size-10 items-center justify-center rounded-xl ring-1 ${iconToneClasses[tone] || iconToneClasses.cyan}`}>
        {React.createElement(IconComponent, { className: 'size-5' })}
      </span>
      <span className='rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700'>+2%</span>
    </div>
    <p className='mt-5 text-xs font-bold text-slate-500'>{label}</p>
    <div className='mt-2 flex items-end gap-2'>
      <p className='text-2xl font-black leading-none text-slate-950'>{formatNumber(value)}</p>
      {note && <p className='text-xs font-semibold text-slate-500'>{note}</p>}
    </div>
  </div>
)

export const StatusBadge = ({ status, children }) => {
  const classes = {
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    locked: 'bg-rose-50 text-rose-700 ring-rose-100',
    hidden: 'bg-slate-100 text-slate-700 ring-slate-200',
    pending: 'bg-amber-50 text-amber-700 ring-amber-100',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-100',
    resolved: 'bg-blue-50 text-blue-700 ring-blue-100'
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ring-1 ${classes[status] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
      {children}
    </span>
  )
}

export const adminOverviewMetrics = [
  { key: 'users', label: 'Tong nguoi dung', icon: Users, tone: 'blue' },
  { key: 'posts', label: 'Tong bai dang', icon: MessageCircle, tone: 'cyan' },
  { key: 'comments', label: 'Tong binh luan', icon: Activity, tone: 'violet' },
  { key: 'likesReactions', label: 'Likes/Reactions', icon: ThumbsUp, tone: 'rose' },
  { key: 'reports', label: 'Bao cao vi pham', icon: FileWarning, tone: 'amber' },
  { key: 'newUsersThisWeek', label: 'User moi tuan nay', icon: TrendingUp, tone: 'emerald' }
]
