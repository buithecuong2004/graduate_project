import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  CalendarDays,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  FileWarning,
  Gauge,
  Home,
  KeyRound,
  Lock,
  LogOut,
  MessageCircle,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Unlock,
  User,
  UserCog,
  Users,
  X,
  XCircle
} from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { assets } from '../../assets/assets'
import { useAuth } from '../../context/AuthContext'
import { clearUser, setUser } from '../../features/user/userSlice'
import api from '../../api/axios'
import localizeMessage from '../../utils/localization'
import { getReportReasonLabel } from '../../utils/reportReasons'
import AdminPagination from '../../components/admin/AdminPagination'
import PostPreviewModal from '../../components/admin/PostPreviewModal'

const ADMIN_TABS = [
  { id: 'overview', label: 'Tổng quan', Icon: Gauge },
  { id: 'users', label: 'Người dùng', Icon: Users },
  { id: 'posts', label: 'Bài viết', Icon: MessageCircle },
  { id: 'reports', label: 'Kiểm duyệt', Icon: FileWarning }
]

const REPORT_STATUS_LABELS = {
  pending: 'Chờ xử lý',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  resolved: 'Đã xử lý'
}

const REPORT_ACTION_LABELS = {
  approve: 'Duyệt',
  reject: 'Từ chối',
  resolve: 'Đánh dấu xong'
}

const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(value || 0)
const formatPercent = (value) => {
  const numericValue = Number(value) || 0
  return `${numericValue >= 0 ? '+' : ''}${new Intl.NumberFormat('vi-VN').format(Math.round(numericValue))}%`
}
const formatDate = (value) => value ? new Date(value).toLocaleDateString('vi-VN') : '-'
const formatChartDate = (value) => {
  if (!value) return '-'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}` : formatDate(value)
}
const shortText = (value = '', max = 160) => value.length > max ? `${value.slice(0, max)}...` : value
const SEARCH_DEBOUNCE_MS = 5000
const DEFAULT_PAGINATION = { page: 1, limit: 10, total: 0, hasMore: false }

const getReportTarget = (report) => report?.target || report?.target_id
const getReportPreviewPost = (report) => {
  const target = getReportTarget(report)
  if (!target || typeof target !== 'object') return null

  if (report.target_type === 'post') return target
  if (report.target_type === 'comment') return target.post && typeof target.post === 'object' ? target.post : null
  if (report.target_type === 'message') return target.shared_post_id && typeof target.shared_post_id === 'object' ? target.shared_post_id : null
  if (target.content !== undefined || target.image_urls || target.video_url || target.shared_from) return target

  return null
}

const getPersonLine = (user) => {
  if (!user) return 'Không rõ'
  return `${user.full_name || 'Không rõ'}${user.username ? ` · @${user.username}` : ''}`
}

const getReportMessageMedia = (report) => {
  if (report?.target_type !== 'message') return []

  const target = getReportTarget(report)
  const targetUrls = Array.isArray(target?.media_urls) ? target.media_urls.filter(Boolean) : []
  if (targetUrls.length > 0) return targetUrls

  return Array.isArray(report?.target_snapshot?.media_urls)
    ? report.target_snapshot.media_urls.filter(Boolean)
    : []
}

const getReportMessageType = (report) => {
  const target = getReportTarget(report)
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

const getMessageReportLabel = (report) => {
  const target = getReportTarget(report)
  const snapshot = report?.target_snapshot || {}
  const messageType = getReportMessageType(report)
  const mediaUrls = getReportMessageMedia(report)
  const text = target?.text || snapshot.text || ''

  if (text) return text
  if (messageType === 'voice') return 'Tin nhắn thoại'
  if (mediaUrls.length > 0 && messageType?.includes('video')) return `Tin nhắn video (${mediaUrls.length} tệp)`
  if (mediaUrls.length > 0 && messageType?.includes('image')) return `Tin nhắn ảnh (${mediaUrls.length} tệp)`
  if (mediaUrls.length > 0) return `Tin nhắn media (${mediaUrls.length} tệp)`
  if (target?.shared_post_id || snapshot.shared_post_id) return 'Tin nhắn chia sẻ bài viết'
  if (target?.is_deleted) return 'Tin nhắn đã bị xóa'
  return 'Tin nhắn không có nội dung chữ'
}

const getReportTargetInfo = (report) => {
  const target = getReportTarget(report)

  if (report.target_type === 'post') {
    return {
      title: 'Bài viết bị báo cáo',
      owner: getPersonLine(target?.user),
      meta: formatDate(target?.createdAt),
      body: shortText(target?.content || 'Bài viết media', 190)
    }
  }

  if (report.target_type === 'comment') {
    return {
      title: 'Bình luận bị báo cáo',
      owner: getPersonLine(target?.user),
      meta: target?.post ? `Trong bài viết của ${target.post.user?.full_name || 'không rõ'}` : 'Bài viết gốc không còn tồn tại',
      body: shortText(target?.content || 'Bình luận không còn nội dung', 190)
    }
  }

  if (report.target_type === 'message') {
    return {
      title: 'Tin nhắn bị báo cáo',
      owner: `${getPersonLine(target?.from_user_id)} -> ${getPersonLine(target?.to_user_id)}`,
      meta: formatDate(target?.createdAt || report?.target_snapshot?.createdAt),
      body: shortText(getMessageReportLabel(report), 190)
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
    body: 'Không có dữ liệu'
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
          return (
            <video
              key={url || index}
              src={url}
              controls
              className='max-h-64 w-full rounded-xl border border-slate-200 bg-black object-contain'
            />
          )
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

const CHART_TABS = [
  { id: 'users', label: 'Người dùng', metricLabel: 'Người dùng', color: '#0ea5e9', fill: 'adminChartBlue' },
  { id: 'posts', label: 'Bài đăng', metricLabel: 'Bài đăng', color: '#10b981', fill: 'adminChartGreen' },
  { id: 'comments', label: 'Bình luận', metricLabel: 'Bình luận', color: '#8b5cf6', fill: 'adminChartViolet' },
  { id: 'likes', label: 'Like', metricLabel: 'Thích/Cảm xúc', color: '#f43f5e', fill: 'adminChartRose' },
  { id: 'shares', label: 'Chia sẻ', metricLabel: 'Chia sẻ', color: '#f59e0b', fill: 'adminChartAmber' }
]

const CHART_RANGE_OPTIONS = [
  { value: 1, label: '1 ngày' },
  { value: 7, label: '1 tuần' },
  { value: 30, label: '1 tháng' },
  { value: 90, label: '3 tháng' },
  { value: 180, label: '6 tháng' },
  { value: 365, label: '1 năm' }
]

const iconToneClasses = {
  cyan: 'bg-cyan-50 text-cyan-600 ring-cyan-100',
  blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100'
}

const percentToneClasses = {
  positive: 'bg-emerald-50 text-emerald-700',
  negative: 'bg-rose-50 text-rose-700',
  neutral: 'bg-slate-100 text-slate-600'
}

const CardTitle = ({ icon: IconComponent, title, subtitle, action }) => (
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

const MetricCard = ({ growth = 0, label, value, note, icon: IconComponent, tone = 'cyan' }) => {
  const numericGrowth = Number(growth) || 0
  const percentTone = numericGrowth < 0 ? 'negative' : numericGrowth === 0 ? 'neutral' : 'positive'

  return (
    <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
      <div className='flex items-start justify-between gap-3'>
        <span className={`flex size-10 items-center justify-center rounded-xl ring-1 ${iconToneClasses[tone]}`}>
          {React.createElement(IconComponent, { className: 'size-5' })}
        </span>
        <span className={`rounded-full px-2 py-1 text-[11px] font-black ${percentToneClasses[percentTone]}`}>
          {formatPercent(numericGrowth)}
        </span>
      </div>
      <p className='mt-5 text-xs font-bold text-slate-500'>{label}</p>
      <div className='mt-2 flex items-end gap-2'>
        <p className='text-2xl font-black leading-none text-slate-950'>{formatNumber(value)}</p>
        {note && <p className='text-xs font-semibold text-slate-500'>{note}</p>}
      </div>
    </div>
  )
}

const StatusBadge = ({ status, children }) => {
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

const GrowthChart = ({ growth = {}, rangeDays = 7, onRangeChange = () => { } }) => {
  const [activeMetric, setActiveMetric] = useState('users')
  const [hoverIndex, setHoverIndex] = useState(null)
  const activeConfig = CHART_TABS.find((tab) => tab.id === activeMetric) || CHART_TABS[0]
  const series = growth[activeMetric] || []
  const max = Math.max(...series.map((item) => item.count || 0), 1)
  const chartWidth = 640
  const chartHeight = 278
  const chartLeft = 48
  const chartRight = 22
  const chartTop = 24
  const chartBottom = 42
  const plotWidth = chartWidth - chartLeft - chartRight
  const plotHeight = chartHeight - chartTop - chartBottom
  const step = series.length > 1 ? plotWidth / (series.length - 1) : plotWidth
  const baseline = chartTop + plotHeight
  const points = series.map((item, index) => {
    const x = chartLeft + index * step
    const y = baseline - ((item.count || 0) / max) * plotHeight
    return { ...item, x, y }
  })
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = points.length
    ? `M ${chartLeft} ${baseline} L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${chartLeft + plotWidth} ${baseline} Z`
    : ''
  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null
  const xLabelIndexes = points.length > 1
    ? [...new Set([0, Math.floor((points.length - 1) * 0.25), Math.floor((points.length - 1) * 0.5), Math.floor((points.length - 1) * 0.75), points.length - 1])]
    : [0]
  const tooltipWidth = 160
  const tooltipHeight = 58
  const tooltipX = hoverPoint ? Math.min(Math.max(hoverPoint.x + 14, chartLeft), chartWidth - tooltipWidth - 8) : 0
  const tooltipY = hoverPoint ? Math.max(hoverPoint.y - tooltipHeight - 12, 8) : 0
  const hoverWidth = Math.max(step, 20)
  const hoverX = hoverPoint ? Math.min(Math.max(chartLeft, hoverPoint.x - hoverWidth / 2), chartLeft + plotWidth - hoverWidth) : chartLeft
  const handleChartHover = (event) => {
    if (!points.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const xInPlot = ((event.clientX - bounds.left) / bounds.width) * plotWidth
    const nextIndex = step > 0 ? Math.round(xInPlot / step) : 0
    setHoverIndex(Math.min(Math.max(nextIndex, 0), points.length - 1))
  }

  return (
    <section className='rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
      <CardTitle
        icon={BarChart3}
        title='Hiệu suất tăng trưởng'
        subtitle='Theo dõi số lượng từng loại theo khoảng thời gian đã chọn'
        action={(
          <select
            value={rangeDays}
            aria-label='Lọc thời gian biểu đồ'
            onChange={(event) => {
              setHoverIndex(null)
              onRangeChange(Number(event.target.value))
            }}
            className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 outline-none transition cursor-pointer hover:bg-slate-50 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
          >
            {CHART_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
      />

      <div className='mb-4 flex flex-wrap items-center gap-2'>
        <div className='inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white'>
          {CHART_TABS.map((tab) => {
            const isActive = activeMetric === tab.id
            return (
              <button
                key={tab.id}
                type='button'
                aria-pressed={isActive}
                onClick={() => {
                  setActiveMetric(tab.id)
                  setHoverIndex(null)
                }}
                className={`min-w-fit border-r border-slate-200 px-4 py-2 text-sm font-bold transition last:border-r-0 cursor-pointer ${isActive ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className='h-80 w-full overflow-visible' onMouseLeave={() => setHoverIndex(null)}>
        <defs>
          <linearGradient id='adminChartBlue' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='#0ea5e9' stopOpacity='0.26' />
            <stop offset='100%' stopColor='#0ea5e9' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='adminChartGreen' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='#10b981' stopOpacity='0.24' />
            <stop offset='100%' stopColor='#10b981' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='adminChartViolet' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='#8b5cf6' stopOpacity='0.24' />
            <stop offset='100%' stopColor='#8b5cf6' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='adminChartRose' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='#f43f5e' stopOpacity='0.24' />
            <stop offset='100%' stopColor='#f43f5e' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='adminChartAmber' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='#f59e0b' stopOpacity='0.24' />
            <stop offset='100%' stopColor='#f59e0b' stopOpacity='0' />
          </linearGradient>
          <filter id='adminChartShadow' x='-20%' y='-20%' width='140%' height='160%'>
            <feDropShadow dx='0' dy='8' stdDeviation='8' floodColor='#0f172a' floodOpacity='0.14' />
          </filter>
        </defs>

        {[0, 1, 2, 3, 4].map((line) => {
          const y = chartTop + (plotHeight / 4) * line
          const value = Math.round(max - (max / 4) * line)
          return (
            <g key={line}>
              <line x1={chartLeft} x2={chartLeft + plotWidth} y1={y} y2={y} stroke='#edf2f7' strokeWidth='1' />
              <text x={chartLeft - 12} y={y + 4} textAnchor='end' className='fill-slate-500 text-[11px] font-semibold'>{formatNumber(value)}</text>
            </g>
          )
        })}

        {hoverPoint && (
          <rect
            x={hoverX}
            y={chartTop}
            width={hoverWidth}
            height={plotHeight}
            fill={activeConfig.color}
            opacity='0.07'
            stroke={activeConfig.color}
            strokeOpacity='0.16'
          />
        )}

        {areaPath && <path d={areaPath} fill={`url(#${activeConfig.fill})`} />}
        {linePath && (
          <path
            d={linePath}
            fill='none'
            stroke={activeConfig.color}
            strokeWidth='2.5'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        )}

        <rect
          x={chartLeft}
          y={chartTop}
          width={plotWidth}
          height={plotHeight}
          fill='transparent'
          onMouseEnter={handleChartHover}
          onMouseMove={handleChartHover}
        />

        {xLabelIndexes.map((index) => {
          const point = points[index]
          return point ? (
            <text key={point.date} x={point.x} y={chartHeight - 10} textAnchor='middle' className='fill-slate-500 text-[11px] font-semibold'>
              {formatChartDate(point.date)}
            </text>
          ) : null
        })}

        {hoverPoint && (
          <g pointerEvents='none'>
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r='5' fill='white' stroke={activeConfig.color} strokeWidth='3' />
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx='8' fill='white' stroke='#e2e8f0' filter='url(#adminChartShadow)' />
            <text x={tooltipX + 12} y={tooltipY + 22} className='fill-slate-700 text-[11px] font-black'>
              {formatDate(hoverPoint.date)}
            </text>
            <text x={tooltipX + 12} y={tooltipY + 42} className='text-[12px] font-black' fill={activeConfig.color}>
              {activeConfig.metricLabel}: {formatNumber(hoverPoint.count)}
            </text>
          </g>
        )}
      </svg>
    </section>
  )
}

const Admin = () => {
  const { getToken, logout } = useAuth()
  const currentUser = useSelector((state) => state.user.value)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboard, setDashboard] = useState(null)
  const [users, setUsers] = useState([])
  const [posts, setPosts] = useState([])
  const [reports, setReports] = useState([])
  const [previewPost, setPreviewPost] = useState(null)
  const [growthDays, setGrowthDays] = useState(7)
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [globalSearchTouched, setGlobalSearchTouched] = useState(false)
  const [userFilters, setUserFilters] = useState({ search: '' })
  const [postFilters, setPostFilters] = useState({ search: '', user: '', from: '', to: '', status: 'all' })
  const [appliedUserSearch, setAppliedUserSearch] = useState('')
  const [appliedPostSearch, setAppliedPostSearch] = useState('')
  const [appliedPostUser, setAppliedPostUser] = useState('')
  const [userSearchTouched, setUserSearchTouched] = useState(false)
  const [postSearchTouched, setPostSearchTouched] = useState(false)
  const [reportStatus, setReportStatus] = useState('pending')
  const [userPagination, setUserPagination] = useState(DEFAULT_PAGINATION)
  const [postPagination, setPostPagination] = useState(DEFAULT_PAGINATION)
  const [reportPagination, setReportPagination] = useState(DEFAULT_PAGINATION)
  const [refreshKey, setRefreshKey] = useState(0)
  const [hideModal, setHideModal] = useState({ open: false, postId: null, reason: '', description: '' })
  const hideDescRef = useRef(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState('password')
  const [passwordForm, setPasswordForm] = useState({ current: '', newPwd: '', confirm: '' })
  const [showPasswords, setShowPasswords] = useState({ current: false, newPwd: false, confirm: false })
  const [profileForm, setProfileForm] = useState({ fullName: '', avatarFile: null, avatarPreview: '' })
  const [settingsLoading, setSettingsLoading] = useState(false)
  const avatarInputRef = useRef(null)

  const activeTabInfo = ADMIN_TABS.find((tab) => tab.id === activeTab) || ADMIN_TABS[0]

  const authHeaders = useCallback(async () => ({
    Authorization: `Bearer ${await getToken()}`
  }), [getToken])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/dashboard', {
        headers: await authHeaders(),
        params: { growthDays }
      })
      if (data.success) setDashboard(data.dashboard)
      else toast.error(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setLoading(false)
    }
  }, [authHeaders, growthDays])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/users', {
        headers: await authHeaders(),
        params: {
          search: appliedUserSearch,
          page: userPagination.page,
          limit: userPagination.limit
        }
      })
      if (data.success) {
        setUsers(Array.isArray(data.users) ? data.users : [])
        setUserPagination((current) => ({
          ...current,
          page: data.page || current.page,
          total: data.total || 0,
          hasMore: !!data.hasMore
        }))
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setLoading(false)
    }
  }, [appliedUserSearch, authHeaders, userPagination.limit, userPagination.page])

  const loadPosts = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/posts', {
        headers: await authHeaders(),
        params: {
          search: appliedPostSearch,
          user: appliedPostUser,
          from: postFilters.from,
          to: postFilters.to,
          status: postFilters.status,
          page: postPagination.page,
          limit: postPagination.limit
        }
      })
      if (data.success) {
        setPosts(Array.isArray(data.posts) ? data.posts : [])
        setPostPagination((current) => ({
          ...current,
          page: data.page || current.page,
          total: data.total || 0,
          hasMore: !!data.hasMore
        }))
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setLoading(false)
    }
  }, [appliedPostSearch, appliedPostUser, authHeaders, postFilters.from, postFilters.status, postFilters.to, postPagination.limit, postPagination.page])

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/reports', {
        headers: await authHeaders(),
        params: {
          status: reportStatus,
          page: reportPagination.page,
          limit: reportPagination.limit
        }
      })
      if (data.success) {
        setReports(Array.isArray(data.reports) ? data.reports : [])
        setReportPagination((current) => ({
          ...current,
          page: data.page || current.page,
          total: data.total || 0,
          hasMore: !!data.hasMore
        }))
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setLoading(false)
    }
  }, [authHeaders, reportPagination.limit, reportPagination.page, reportStatus])

  useEffect(() => {
    if (activeTab === 'overview') loadDashboard()
    if (activeTab === 'users') loadUsers()
    if (activeTab === 'posts') loadPosts()
    if (activeTab === 'reports') loadReports()
  }, [activeTab, loadDashboard, loadPosts, loadReports, loadUsers, refreshKey])

  const totals = dashboard?.totals || {}
  const growthPercent = totals.growthPercent || {}
  const topPosts = dashboard?.topPosts || []
  const growth = dashboard?.growth || { users: [], posts: [], comments: [], likes: [], shares: [] }

  const postStatusOptions = useMemo(() => [
    { value: 'all', label: 'Tất cả' },
    { value: 'visible', label: 'Đang hiển thị' },
    { value: 'hidden', label: 'Đã ẩn' },
    { value: 'reported', label: 'Bị báo cáo' }
  ], [])

  const applyGlobalSearch = useCallback((searchValue) => {
    const search = searchValue.trim()

    if (activeTab === 'users') {
      setUserFilters({ search })
      setAppliedUserSearch(search)
      setUserPagination((current) => ({ ...current, page: 1 }))
      return
    }

    if (activeTab === 'posts') {
      setPostFilters((filters) => ({ ...filters, search }))
      setAppliedPostSearch(search)
      setPostPagination((current) => ({ ...current, page: 1 }))
      return
    }

    if (activeTab === 'overview' && search) {
      setActiveTab('posts')
      setPostFilters((filters) => ({ ...filters, search }))
      setAppliedPostSearch(search)
      setPostPagination((current) => ({ ...current, page: 1 }))
    }
  }, [activeTab])

  useEffect(() => {
    if (!userSearchTouched) return undefined

    const timer = window.setTimeout(() => {
      setAppliedUserSearch(userFilters.search.trim())
      setUserPagination((current) => current.page === 1 ? current : { ...current, page: 1 })
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [userFilters.search, userSearchTouched])

  useEffect(() => {
    if (!postSearchTouched) return undefined

    const timer = window.setTimeout(() => {
      setAppliedPostSearch(postFilters.search.trim())
      setAppliedPostUser(postFilters.user.trim())
      setPostPagination((current) => current.page === 1 ? current : { ...current, page: 1 })
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [postFilters.search, postFilters.user, postSearchTouched])

  useEffect(() => {
    if (!globalSearchTouched) return undefined

    const timer = window.setTimeout(() => {
      applyGlobalSearch(globalSearch)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [applyGlobalSearch, globalSearch, globalSearchTouched])

  const handleGlobalSearch = useCallback((event) => {
    event.preventDefault()
    setGlobalSearchTouched(true)
    applyGlobalSearch(globalSearch)
  }, [applyGlobalSearch, globalSearch])

  const openSettings = useCallback(() => {
    setPasswordForm({ current: '', newPwd: '', confirm: '' })
    setShowPasswords({ current: false, newPwd: false, confirm: false })
    setProfileForm({ fullName: currentUser?.full_name || '', avatarFile: null, avatarPreview: '' })
    setSettingsTab('password')
    setSettingsOpen(true)
  }, [currentUser])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    if (profileForm.avatarPreview) URL.revokeObjectURL(profileForm.avatarPreview)
  }, [profileForm.avatarPreview])

  const handleAvatarSelect = useCallback((event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (profileForm.avatarPreview) URL.revokeObjectURL(profileForm.avatarPreview)
    setProfileForm((current) => ({ ...current, avatarFile: file, avatarPreview: URL.createObjectURL(file) }))
  }, [profileForm.avatarPreview])

  const submitChangePassword = useCallback(async () => {
    const { current, newPwd, confirm } = passwordForm
    if (!current) return toast.error('Vui lòng nhập mật khẩu hiện tại')
    if (newPwd.length < 6) return toast.error('Mật khẩu mới phải có ít nhất 6 ký tự')
    if (newPwd !== confirm) return toast.error('Xác nhận mật khẩu không khớp')
    if (current === newPwd) return toast.error('Mật khẩu mới phải khác mật khẩu hiện tại')

    setSettingsLoading(true)
    try {
      const { data } = await api.post('/api/user/change-password', {
        currentPassword: current,
        newPassword: newPwd,
        confirmPassword: confirm
      }, { headers: await authHeaders() })
      if (data.success) {
        toast.success(data.message || 'Đổi mật khẩu thành công')
        setPasswordForm({ current: '', newPwd: '', confirm: '' })
        setShowPasswords({ current: false, newPwd: false, confirm: false })
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setSettingsLoading(false)
    }
  }, [authHeaders, passwordForm])

  const submitUpdateProfile = useCallback(async () => {
    const trimmedName = profileForm.fullName.trim()
    if (!trimmedName) return toast.error('Tên không được để trống')

    setSettingsLoading(true)
    try {
      const formData = new FormData()
      formData.append('full_name', trimmedName)
      if (profileForm.avatarFile) formData.append('profile', profileForm.avatarFile)

      const { data } = await api.post('/api/user/update', formData, {
        headers: { ...(await authHeaders()), 'Content-Type': 'multipart/form-data' }
      })
      if (data.success) {
        dispatch(setUser(data.user))
        toast.success(data.message || 'Cập nhật hồ sơ thành công')
        if (profileForm.avatarPreview) URL.revokeObjectURL(profileForm.avatarPreview)
        setProfileForm({ fullName: data.user.full_name || '', avatarFile: null, avatarPreview: '' })
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setSettingsLoading(false)
    }
  }, [authHeaders, dispatch, profileForm])

  const handleLogout = useCallback(() => {
    logout()
    dispatch(clearUser())
    navigate('/', { replace: true })
  }, [dispatch, logout, navigate])

  const refreshCurrentTab = useCallback(() => {
    setRefreshKey((value) => value + 1)
  }, [])

  const updateUser = useCallback(async (userId, payload) => {
    setActionId(userId)
    try {
      const { data } = await api.patch(`/api/admin/users/${userId}`, payload, { headers: await authHeaders() })
      if (data.success) {
        setUsers((currentUsers) => currentUsers.map((user) => user._id === userId ? data.user : user))
        toast.success('Đã cập nhật người dùng')
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setActionId('')
    }
  }, [authHeaders])

  const openHideModal = useCallback((postId) => {
    setHideModal({ open: true, postId, reason: '', description: '' })
  }, [])

  const closeHideModal = useCallback(() => {
    setHideModal({ open: false, postId: null, reason: '', description: '' })
  }, [])

  const confirmHidePost = useCallback(async () => {
    const { postId, reason, description } = hideModal
    if (!postId || !reason) {
      toast.error('Vui lòng chọn lý do ẩn bài viết')
      return
    }
    closeHideModal()

    const fullReason = description.trim() ? `${reason}: ${description.trim()}` : reason

    setActionId(postId)
    try {
      const { data } = await api.patch(`/api/admin/posts/${postId}/visibility`, {
        is_hidden: true,
        reason: fullReason
      }, { headers: await authHeaders() })
      if (data.success) {
        setPosts((currentPosts) => currentPosts.map((post) => post._id === postId ? data.post : post))
        toast.success('Đã ẩn bài viết')
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setActionId('')
    }
  }, [authHeaders, closeHideModal, hideModal])

  const unhidePost = useCallback(async (postId) => {
    setActionId(postId)
    try {
      const { data } = await api.patch(`/api/admin/posts/${postId}/visibility`, {
        is_hidden: false,
        reason: ''
      }, { headers: await authHeaders() })
      if (data.success) {
        setPosts((currentPosts) => currentPosts.map((post) => post._id === postId ? data.post : post))
        toast.success('Đã hiển thị bài viết')
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setActionId('')
    }
  }, [authHeaders])

  const deletePost = useCallback(async (postId) => {
    if (!window.confirm('Xóa bài viết vi phạm này?')) return

    setActionId(postId)
    try {
      const { data } = await api.delete(`/api/admin/posts/${postId}`, { headers: await authHeaders() })
      if (data.success) {
        setPosts((currentPosts) => currentPosts.filter((post) => post._id !== postId))
        toast.success('Đã xóa bài viết')
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setActionId('')
    }
  }, [authHeaders])

  const updateReport = useCallback(async (reportId, action) => {
    const note = REPORT_ACTION_LABELS[action] || 'Đã xử lý'
    setActionId(reportId)
    try {
      const { data } = await api.patch(`/api/admin/reports/${reportId}`, {
        action,
        resolution_note: note
      }, { headers: await authHeaders() })
      if (data.success) {
        setReports((currentReports) => currentReports.map((report) => report._id === reportId ? data.report : report))
        toast.success('Đã cập nhật báo cáo')
        if (action === 'approve') setRefreshKey((value) => value + 1)
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setActionId('')
    }
  }, [authHeaders])

  return (
    <div className='h-screen w-full overflow-hidden bg-[#fbfcfd] text-slate-950'>
      <div className='flex h-full w-full overflow-hidden bg-white'>
        <aside className='fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white lg:flex lg:flex-col'>
          <div className='flex h-16 items-center gap-3 border-b border-slate-200 px-5'>
            <img src={assets.logo_icon || assets.tarous_logo} alt='' className='size-8 object-contain' />
            <div>
              <p className='text-sm font-black leading-none text-slate-950'>Tarous Admin</p>
              <p className='mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400'>Bảng điều khiển</p>
            </div>
          </div>

          <nav className='flex-1 space-y-1.5 px-4 py-5'>
            {ADMIN_TABS.map((tab) => {
              const TabIcon = tab.Icon
              const isActive = activeTab === tab.id

              return (
                <button
                  key={tab.id}
                  type='button'
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-bold transition cursor-pointer ${isActive
                      ? 'bg-slate-100 text-slate-950 shadow-sm ring-1 ring-slate-200/70'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                >
                  <TabIcon className='size-4' />
                  <span className='flex-1'>{tab.label}</span>
                  {tab.id === 'reports' && totals.pendingReports > 0 && (
                    <span className='rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700'>{formatNumber(totals.pendingReports)}</span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className='border-t border-slate-200 p-4'>
            <div className='mb-3 flex min-w-0 items-center gap-3'>
              <img src={currentUser?.profile_picture || assets.sample_profile} alt='' className='size-10 rounded-full object-cover ring-1 ring-slate-200' />
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-black text-slate-950'>{currentUser?.full_name || 'Quản trị viên'}</p>
                <p className='truncate text-xs text-slate-500'>@{currentUser?.username || 'admin'}</p>
              </div>
              <button type='button' onClick={openSettings} className='flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 cursor-pointer' title='Cài đặt'>
                <Settings className='size-4' />
              </button>
            </div>
            <button type='button' onClick={handleLogout} className='flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 cursor-pointer'>
              <LogOut className='size-4' />
              Đăng xuất
            </button>
          </div>
        </aside>

        <main className='h-screen min-w-0 flex-1 overflow-y-auto bg-[#fbfcfd] lg:ml-72'>
          <header className='sticky top-0 z-20 flex h-auto flex-col gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:h-16 md:flex-row md:items-center md:px-5'>
            <div className='flex min-w-0 items-center gap-3'>
              <span className='flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800'>
                {React.createElement(activeTabInfo.Icon, { className: 'size-4' })}
              </span>
              <div className='min-w-0'>
                <p className='truncate text-sm font-black text-slate-950'>{activeTabInfo.label}</p>
                <p className='truncate text-xs text-slate-500'>Quản lý dữ liệu, kiểm duyệt và vận hành hệ thống</p>
              </div>
            </div>

            <form onSubmit={handleGlobalSearch} className='relative min-w-0 flex-1 md:mx-auto md:max-w-xl'>
              <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
              <input
                value={globalSearch}
                onChange={(event) => {
                  setGlobalSearchTouched(true)
                  setGlobalSearch(event.target.value)
                }}
                className='h-10 w-full rounded-full border border-slate-200 bg-white pl-10 pr-14 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
                placeholder='Tìm nội dung, người dùng, bài viết'
              />
              <span className='absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-400 sm:block'>Enter</span>
            </form>

            <div className='flex items-center gap-2'>
              <button type='button' onClick={refreshCurrentTab} className='flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 cursor-pointer' title='Làm mới'>
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <div className='hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 xl:flex'>
                <CalendarDays className='size-4' />
                {new Date().toLocaleDateString('vi-VN')}
              </div>
            </div>
          </header>

          <div className='border-b border-slate-200 bg-white px-4 py-3 md:hidden'>
            <div className='flex gap-2 overflow-x-auto'>
              {ADMIN_TABS.map((tab) => {
                const TabIcon = tab.Icon
                return (
                  <button
                    key={tab.id}
                    type='button'
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-w-fit items-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition cursor-pointer ${activeTab === tab.id ? 'bg-slate-100 text-slate-950 ring-1 ring-slate-200' : 'bg-slate-50 text-slate-600'}`}
                  >
                    <TabIcon className='size-4' />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {loading && (
            <div className='pointer-events-none fixed right-5 top-20 z-50 flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white/95 shadow-lg backdrop-blur' role='status' aria-label='Đang tải'>
              <span className='size-5 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500' />
            </div>
          )}

          <div className='p-4 pb-10 md:p-6'>

            {activeTab === 'overview' && (
              <div className='space-y-5'>
                <section className='grid gap-3 sm:grid-cols-2 xl:grid-cols-6'>
                  <MetricCard label='Tổng người dùng' value={totals.users} icon={Users} tone='blue' growth={growthPercent.users} />
                  <MetricCard label='Tổng bài đăng' value={totals.posts} icon={MessageCircle} tone='cyan' growth={growthPercent.posts} />
                  <MetricCard label='Tổng bình luận' value={totals.comments} icon={Activity} tone='violet' growth={growthPercent.comments} />
                  <MetricCard label='Thích/Cảm xúc' value={totals.likesReactions} icon={ThumbsUp} tone='rose' growth={growthPercent.likesReactions} />
                  <MetricCard label='Báo cáo vi phạm' value={totals.reports} icon={FileWarning} tone='amber' note={`${formatNumber(totals.pendingReports)} chờ`} growth={growthPercent.reports} />
                  <MetricCard label='Người dùng mới hôm nay' value={totals.newUsersToday} icon={TrendingUp} tone='emerald' note={`${formatNumber(totals.newUsersThisWeek)} tuần này`} growth={growthPercent.newUsersToday ?? growthPercent.newUsersThisWeek} />
                </section>

                <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]'>
                  <GrowthChart growth={growth} rangeDays={growthDays} onRangeChange={setGrowthDays} />

                  <section className='rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
                    <CardTitle icon={Target} title='Báo cáo cần xử lý' subtitle='Ưu tiên xử lý nội dung đang bị report' />
                    <div className='space-y-3'>
                      <div className='rounded-xl border border-amber-100 bg-amber-50 p-4'>
                        <p className='text-xs font-black uppercase text-amber-700'>Đang chờ</p>
                        <p className='mt-2 text-3xl font-black text-slate-950'>{formatNumber(totals.pendingReports)}</p>
                        <button type='button' onClick={() => setActiveTab('reports')} className='mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white cursor-pointer'>
                          Mở kiểm duyệt
                        </button>
                      </div>
                      <div className='rounded-xl border border-slate-200 p-4'>
                        <p className='text-sm font-black text-slate-950'>Tương tác bài viết</p>
                        <div className='mt-3 grid grid-cols-2 gap-3 text-sm'>
                          <div>
                            <p className='text-xs text-slate-500'>Reactions</p>
                            <p className='font-black'>{formatNumber(totals.postReactions)}</p>
                          </div>
                          <div>
                            <p className='text-xs text-slate-500'>Shares</p>
                            <p className='font-black'>{formatNumber(totals.shares)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <section className='rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
                  <CardTitle icon={Sparkles} title='Top bài viết tương tác cao' subtitle='Các bài viết có tổng tương tác tốt nhất gần đây' />
                  <div className='flex gap-4 overflow-x-auto pb-1'>
                    {topPosts.map((post) => (
                      <article key={post._id} className='min-w-[17rem] rounded-xl border border-slate-200 bg-white p-4'>
                        <div className='mb-3 flex items-center justify-between gap-3'>
                          <p className='text-xs font-bold text-slate-500'>{formatDate(post.createdAt)}</p>
                          <StatusBadge status={post.pending_reports_count > 0 ? 'pending' : 'approved'}>
                            {post.pending_reports_count > 0 ? 'Có report' : 'Ổn định'}
                          </StatusBadge>
                        </div>
                        <h3 className='line-clamp-2 min-h-10 text-sm font-black leading-5 text-slate-950'>{shortText(post.content || 'Bài viết media', 90)}</h3>
                        <div className='mt-5 grid grid-cols-3 gap-3 text-center text-xs'>
                          <div className='rounded-lg bg-rose-50 p-2 text-rose-700'>
                            <ThumbsUp className='mx-auto mb-1 size-4' />
                            <p className='font-black'>{formatNumber(post.reactions_count + post.old_likes_count)}</p>
                            <p>Thích</p>
                          </div>
                          <div className='rounded-lg bg-cyan-50 p-2 text-cyan-700'>
                            <MessageCircle className='mx-auto mb-1 size-4' />
                            <p className='font-black'>{formatNumber(post.comments_count)}</p>
                            <p>Bình luận</p>
                          </div>
                          <div className='rounded-lg bg-emerald-50 p-2 text-emerald-700'>
                            <Target className='mx-auto mb-1 size-4' />
                            <p className='font-black'>{formatNumber(post.total_interactions)}</p>
                            <p>Tổng</p>
                          </div>
                        </div>
                        <button type='button' onClick={() => setPreviewPost(post)} className='mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-700 transition hover:bg-cyan-100'>
                          <Eye className='size-4' />
                          Xem bài viết
                        </button>
                      </article>
                    ))}
                    {topPosts.length === 0 && <p className='text-sm text-slate-500'>Chưa có dữ liệu.</p>}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'users' && (
              <section className='rounded-xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
                <div className='flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center'>
                  <div className='relative flex-1'>
                    <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
                    <input
                      value={userFilters.search}
                      onChange={(event) => {
                        setUserSearchTouched(true)
                        setUserFilters({ search: event.target.value })
                      }}
                      className='h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
                      placeholder='Tìm theo tên, username hoặc email'
                    />
                  </div>
                  <button
                    type='button'
                    onClick={() => {
                      setAppliedUserSearch(userFilters.search.trim())
                      setUserPagination((current) => ({ ...current, page: 1 }))
                      setRefreshKey((value) => value + 1)
                    }}
                    className='rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-black text-white cursor-pointer'
                  >
                    Tìm kiếm
                  </button>
                </div>

                <div className='overflow-x-auto'>
                  <table className='w-full min-w-[860px] text-left text-sm'>
                    <thead className='bg-slate-50 text-xs uppercase text-slate-500'>
                      <tr>
                        <th className='px-4 py-3'>Người dùng</th>
                        <th className='px-4 py-3'>Trạng thái online</th>
                        <th className='px-4 py-3'>Vai trò</th>
                        <th className='px-4 py-3'>Tài khoản</th>
                        <th className='px-4 py-3'>Ngày tạo</th>
                        <th className='px-4 py-3 text-right'>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-slate-100'>
                      {users.map((user) => (
                        <tr key={user._id} className='align-top hover:bg-slate-50/60'>
                          <td className='px-4 py-3'>
                            <div className='flex items-center gap-3'>
                              <img src={user.profile_picture || assets.sample_profile} alt='' className='size-10 rounded-full object-cover ring-1 ring-slate-200' />
                              <div>
                                <p className='font-black text-slate-950'>{user.full_name}</p>
                                <p className='text-xs text-slate-500'>@{user.username} · {user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className='px-4 py-3'>
                            <StatusBadge status={user.isOnline ? 'approved' : 'hidden'}>
                              {user.isOnline ? 'Online' : 'Offline'}
                            </StatusBadge>
                          </td>
                          <td className='px-4 py-3'>
                            <select
                              value={user.role || 'user'}
                              disabled={actionId === user._id}
                              onChange={(event) => updateUser(user._id, { role: event.target.value })}
                              className='h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none'
                            >
                              <option value='user'>Người dùng</option>
                              <option value='admin'>Quản trị viên</option>
                            </select>
                          </td>
                          <td className='px-4 py-3'>
                            <StatusBadge status={user.account_status === 'locked' ? 'locked' : 'active'}>
                              {user.account_status === 'locked' ? 'Đã khóa' : 'Hoạt động'}
                            </StatusBadge>
                          </td>
                          <td className='px-4 py-3 text-slate-500'>{formatDate(user.createdAt)}</td>
                          <td className='px-4 py-3 text-right'>
                            {user.account_status === 'locked' ? (
                              <button type='button' onClick={() => updateUser(user._id, { account_status: 'active' })} disabled={actionId === user._id} className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 cursor-pointer'>
                                <Unlock className='size-4' /> Mở khóa
                              </button>
                            ) : (
                              <button type='button' onClick={() => updateUser(user._id, { account_status: 'locked', locked_reason: 'Khóa bởi quản trị viên' })} disabled={actionId === user._id} className='inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 cursor-pointer'>
                                <Lock className='size-4' /> Khóa
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <AdminPagination
                  disabled={loading}
                  hasMore={userPagination.hasMore}
                  limit={userPagination.limit}
                  onLimitChange={(limit) => setUserPagination((current) => ({ ...current, limit, page: 1 }))}
                  onPageChange={(page) => setUserPagination((current) => ({ ...current, page }))}
                  page={userPagination.page}
                  total={userPagination.total}
                />
              </section>
            )}

            {activeTab === 'posts' && (
              <section className='rounded-xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
                <div className='grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[1fr_1fr_9rem_9rem_11rem_auto]'>
                  <input value={postFilters.search} onChange={(event) => { setPostSearchTouched(true); setPostFilters((filters) => ({ ...filters, search: event.target.value })) }} className='h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100' placeholder='Tìm nội dung' />
                  <input value={postFilters.user} onChange={(event) => { setPostSearchTouched(true); setPostFilters((filters) => ({ ...filters, user: event.target.value })) }} className='h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100' placeholder='Lọc theo user' />
                  <input type='date' value={postFilters.from} onChange={(event) => { setPostFilters((filters) => ({ ...filters, from: event.target.value })); setPostPagination((current) => ({ ...current, page: 1 })) }} className='h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none' />
                  <input type='date' value={postFilters.to} onChange={(event) => { setPostFilters((filters) => ({ ...filters, to: event.target.value })); setPostPagination((current) => ({ ...current, page: 1 })) }} className='h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none' />
                  <select value={postFilters.status} onChange={(event) => { setPostFilters((filters) => ({ ...filters, status: event.target.value })); setPostPagination((current) => ({ ...current, page: 1 })) }} className='h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none'>
                    {postStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <button
                    type='button'
                    onClick={() => {
                      setAppliedPostSearch(postFilters.search.trim())
                      setAppliedPostUser(postFilters.user.trim())
                      setPostPagination((current) => ({ ...current, page: 1 }))
                      setRefreshKey((value) => value + 1)
                    }}
                    className='rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-black text-white cursor-pointer'
                  >
                    Lọc
                  </button>
                </div>

                <div className='divide-y divide-slate-100'>
                  {posts.map((post) => (
                    <article key={post._id} onClick={() => setPreviewPost(post)} className='p-4 hover:bg-slate-50/50 cursor-pointer'>
                      <div className='flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'>
                        <div className='min-w-0 flex-1'>
                          <div className='flex flex-wrap items-center gap-3'>
                            <img src={post.user?.profile_picture || assets.sample_profile} alt='' className='size-10 rounded-full object-cover ring-1 ring-slate-200' />
                            <div className='min-w-0'>
                              <p className='truncate font-black text-slate-950'>{post.user?.full_name || 'Không rõ'}</p>
                              <p className='text-xs text-slate-500'>@{post.user?.username} · {formatDate(post.createdAt)}</p>
                            </div>
                            <StatusBadge status={post.is_hidden ? 'hidden' : 'active'}>
                              {post.is_hidden ? 'Đã ẩn' : 'Đang hiển thị'}
                            </StatusBadge>
                          </div>
                          <p className='mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700'>{shortText(post.content || 'Bài viết media', 280)}</p>
                          <div className='mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500'>
                            <span>{formatNumber(post.comments_count)} bình luận</span>
                            <span>{formatNumber(post.old_likes_count + post.reactions_count)} thích/cảm xúc</span>
                            <span>{formatNumber(post.shares_count)} chia sẻ</span>
                            <span className={post.pending_reports_count > 0 ? 'text-amber-700' : ''}>{formatNumber(post.reports_count)} báo cáo</span>
                          </div>
                        </div>
                        <div className='flex flex-wrap gap-2 xl:justify-end'>
                          <button type='button' onClick={(event) => { event.stopPropagation(); post.is_hidden ? unhidePost(post._id) : openHideModal(post._id) }} disabled={actionId === post._id} className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 cursor-pointer'>
                            {post.is_hidden ? <Eye className='size-4' /> : <EyeOff className='size-4' />}
                            {post.is_hidden ? 'Hiển thị' : 'Ẩn'}
                          </button>
                          <button type='button' onClick={(event) => { event.stopPropagation(); deletePost(post._id) }} disabled={actionId === post._id} className='inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 cursor-pointer'>
                            <Trash2 className='size-4' />
                            Xóa
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {posts.length === 0 && <p className='p-6 text-sm text-slate-500'>Không có bài viết phù hợp.</p>}
                </div>

                <AdminPagination
                  disabled={loading}
                  hasMore={postPagination.hasMore}
                  limit={postPagination.limit}
                  onLimitChange={(limit) => setPostPagination((current) => ({ ...current, limit, page: 1 }))}
                  onPageChange={(page) => setPostPagination((current) => ({ ...current, page }))}
                  page={postPagination.page}
                  total={postPagination.total}
                />
              </section>
            )}

            {activeTab === 'reports' && (
              <section className='rounded-xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
                <div className='flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between'>
                  <CardTitle icon={FileWarning} title='Kiểm duyệt báo cáo' subtitle='Xem nội dung bị report, người report và xử lý trạng thái' />
                  <select
                    value={reportStatus}
                    onChange={(event) => {
                      setReportStatus(event.target.value)
                      setReportPagination((current) => ({ ...current, page: 1 }))
                    }}
                    className='h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none'
                  >
                    <option value='pending'>Chờ xử lý</option>
                    <option value='approved'>Đã duyệt</option>
                    <option value='rejected'>Từ chối</option>
                    <option value='resolved'>Đã xử lý</option>
                    <option value='all'>Tất cả</option>
                  </select>
                </div>

                <div className='divide-y divide-slate-100'>
                  {reports.map((report) => {
                    const post = getReportPreviewPost(report)
                    const targetInfo = getReportTargetInfo(report)
                    return (
                      <article key={report._id} className='p-4 hover:bg-slate-50/50'>
                        <div className='flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'>
                          <div className='min-w-0 flex-1'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <StatusBadge status='pending'>{getReportReasonLabel(report.reason)}</StatusBadge>
                              <StatusBadge status={report.status}>{REPORT_STATUS_LABELS[report.status] || report.status}</StatusBadge>
                              <span className='text-xs font-bold text-slate-400'>{formatDate(report.createdAt)}</span>
                            </div>
                            <p className='mt-3 text-sm leading-6 text-slate-700'>{report.details || 'Không có mô tả thêm.'}</p>
                            <div className='mt-4 grid gap-3 lg:grid-cols-2'>
                              <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
                                <p className='text-xs font-black uppercase text-slate-500'>Người báo cáo</p>
                                <p className='mt-1 text-sm font-bold text-slate-950'>{report.reporter?.full_name || 'Không rõ'} · @{report.reporter?.username}</p>
                              </div>
                              <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
                                <p className='text-xs font-black uppercase text-slate-500'>{targetInfo.title}</p>
                                <p className='mt-1 text-sm font-bold text-slate-950'>{targetInfo.owner}</p>
                                {targetInfo.meta && <p className='mt-1 text-xs font-semibold text-slate-500'>{targetInfo.meta}</p>}
                                <p className='mt-1 text-sm leading-6 text-slate-600'>{targetInfo.body}</p>
                                {report.target_type === 'message' && <ReportMessageMedia report={report} />}
                                {post && (
                                  <button type='button' onClick={() => setPreviewPost(post)} className='mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-700 transition hover:bg-cyan-100'>
                                    <Eye className='size-4' />
                                    Xem bài viết
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          {report.status === 'pending' && (
                            <div className='flex flex-wrap gap-2 xl:justify-end'>
                              <button type='button' onClick={() => updateReport(report._id, 'approve')} disabled={actionId === report._id} className='inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white cursor-pointer'>
                                <CheckCircle2 className='size-4' /> Duyệt
                              </button>
                              <button type='button' onClick={() => updateReport(report._id, 'reject')} disabled={actionId === report._id} className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 cursor-pointer'>
                                <XCircle className='size-4' /> Từ chối
                              </button>
                              <button type='button' onClick={() => updateReport(report._id, 'resolve')} disabled={actionId === report._id} className='inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 cursor-pointer'>
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
                  hasMore={reportPagination.hasMore}
                  limit={reportPagination.limit}
                  onLimitChange={(limit) => setReportPagination((current) => ({ ...current, limit, page: 1 }))}
                  onPageChange={(page) => setReportPagination((current) => ({ ...current, page }))}
                  page={reportPagination.page}
                  total={reportPagination.total}
                />
              </section>
            )}
          </div>
        </main>
      </div>
      <PostPreviewModal post={previewPost} onClose={() => setPreviewPost(null)} />

      {hideModal.open && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center' onClick={closeHideModal}>
          <div className='absolute inset-0 bg-slate-950/40 backdrop-blur-sm' style={{ animation: 'adminFadeIn 0.18s ease-out' }} />
          <div
            className='relative z-10 mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl'
            style={{ animation: 'adminSlideUp 0.22s ease-out' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className='flex items-center justify-between border-b border-slate-200 px-5 py-4'>
              <div className='flex items-center gap-3'>
                <span className='flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600'>
                  <EyeOff className='size-4' />
                </span>
                <div>
                  <p className='text-sm font-black text-slate-950'>Ẩn bài viết</p>
                  <p className='text-xs text-slate-500'>Chọn lý do và mô tả chi tiết</p>
                </div>
              </div>
              <button type='button' onClick={closeHideModal} className='flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 cursor-pointer'>
                <X className='size-4' />
              </button>
            </div>

            <div className='px-5 py-4'>
              <label className='mb-2.5 block text-xs font-black uppercase tracking-wide text-slate-500'>Lý do ẩn bài viết</label>
              <div className='space-y-1'>
                {['Spam', 'Quấy rối', 'Ngôn từ thù ghét', 'Bạo lực hoặc đe dọa', 'Nội dung nhạy cảm', 'Lừa đảo', 'Khác'].map((option) => {
                  const isSelected = hideModal.reason === option
                  return (
                    <button
                      key={option}
                      type='button'
                      onClick={() => setHideModal((current) => ({ ...current, reason: option }))}
                      className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-bold transition cursor-pointer ${isSelected
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                          : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span className={`flex size-[18px] items-center justify-center rounded-full border-2 transition ${isSelected ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                        }`}>
                        {isSelected && <span className='block size-2 rounded-full bg-white' />}
                      </span>
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className='border-t border-slate-100 px-5 py-4'>
              <label className='mb-2 block text-xs font-black uppercase tracking-wide text-slate-500'>Mô tả thêm <span className='font-semibold normal-case text-slate-400'>(không bắt buộc)</span></label>
              <textarea
                ref={hideDescRef}
                value={hideModal.description}
                onChange={(event) => setHideModal((current) => ({ ...current, description: event.target.value }))}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); confirmHidePost() } }}
                rows={3}
                className='w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-4 focus:ring-amber-100'
                placeholder='Nhập mô tả chi tiết lý do ẩn bài viết...'
              />
            </div>

            <div className='flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4'>
              <button type='button' onClick={closeHideModal} className='rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 cursor-pointer'>
                Hủy
              </button>
              <button
                type='button'
                onClick={confirmHidePost}
                disabled={!hideModal.reason}
                className={`rounded-lg px-5 py-2.5 text-sm font-black text-white shadow-sm transition cursor-pointer ${hideModal.reason
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-slate-300 cursor-not-allowed'
                  }`}
              >
                Xác nhận ẩn
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center' onClick={closeSettings}>
          <div className='absolute inset-0 bg-slate-950/40 backdrop-blur-sm' style={{ animation: 'adminFadeIn 0.18s ease-out' }} />
          <div
            className='relative z-10 mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl'
            style={{ animation: 'adminSlideUp 0.22s ease-out' }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <div className='flex items-center justify-between border-b border-slate-200 px-5 py-4'>
              <div className='flex items-center gap-3'>
                <span className='flex size-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600'>
                  <Settings className='size-4 animate-[spin_8s_linear_infinite]' />
                </span>
                <div>
                  <p className='text-sm font-black text-slate-950'>Cấu hình tài khoản</p>
                  <p className='text-xs text-slate-500'>Đổi mật khẩu hoặc cập nhật hồ sơ cá nhân</p>
                </div>
              </div>
              <button type='button' onClick={closeSettings} className='flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 cursor-pointer'>
                <X className='size-4' />
              </button>
            </div>

            {/* Tabs Selector */}
            <div className='flex border-b border-slate-100 bg-slate-50/50 p-1'>
              <button
                type='button'
                onClick={() => setSettingsTab('password')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-black transition cursor-pointer ${settingsTab === 'password'
                    ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/50'
                    : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                <KeyRound className='size-3.5' />
                Đổi mật khẩu
              </button>
              <button
                type='button'
                onClick={() => setSettingsTab('profile')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-black transition cursor-pointer ${settingsTab === 'profile'
                    ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/50'
                    : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                <User className='size-3.5' />
                Cập nhật hồ sơ
              </button>
            </div>

            {/* Forms Content */}
            {settingsTab === 'password' ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  submitChangePassword()
                }}
                className='space-y-4 px-5 py-4'
              >
                <div>
                  <label className='mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500'>Mật khẩu cũ</label>
                  <div className='relative'>
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={passwordForm.current}
                      onChange={(event) => setPasswordForm((current) => ({ ...current, current: event.target.value }))}
                      className='h-11 w-full rounded-lg border border-slate-200 bg-white pl-4 pr-10 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
                      placeholder='Nhập mật khẩu hiện tại...'
                    />
                    <button
                      type='button'
                      onClick={() => setShowPasswords((current) => ({ ...current, current: !current.current }))}
                      className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer'
                    >
                      {showPasswords.current ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className='mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500'>Mật khẩu mới</label>
                  <div className='relative'>
                    <input
                      type={showPasswords.newPwd ? 'text' : 'password'}
                      value={passwordForm.newPwd}
                      onChange={(event) => setPasswordForm((current) => ({ ...current, newPwd: event.target.value }))}
                      className='h-11 w-full rounded-lg border border-slate-200 bg-white pl-4 pr-10 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
                      placeholder='Tối thiểu 6 ký tự...'
                    />
                    <button
                      type='button'
                      onClick={() => setShowPasswords((current) => ({ ...current, newPwd: !current.newPwd }))}
                      className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer'
                    >
                      {showPasswords.newPwd ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className='mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500'>Xác nhận mật khẩu mới</label>
                  <div className='relative'>
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwordForm.confirm}
                      onChange={(event) => setPasswordForm((current) => ({ ...current, confirm: event.target.value }))}
                      className='h-11 w-full rounded-lg border border-slate-200 bg-white pl-4 pr-10 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
                      placeholder='Nhập lại mật khẩu mới...'
                    />
                    <button
                      type='button'
                      onClick={() => setShowPasswords((current) => ({ ...current, confirm: !current.confirm }))}
                      className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer'
                    >
                      {showPasswords.confirm ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
                    </button>
                  </div>
                </div>

                <div className='flex items-center justify-end gap-3 border-t border-slate-100 pt-4 mt-2'>
                  <button type='button' onClick={closeSettings} className='rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 cursor-pointer'>
                    Hủy
                  </button>
                  <button
                    type='submit'
                    disabled={settingsLoading}
                    className='flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-cyan-600 disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer'
                  >
                    {settingsLoading && <span className='size-4 animate-spin rounded-full border-2 border-white border-t-transparent' />}
                    Cập nhật
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  submitUpdateProfile()
                }}
                className='space-y-4 px-5 py-4'
              >
                <div className='flex flex-col items-center justify-center py-2'>
                  <div className='group relative cursor-pointer' onClick={() => avatarInputRef.current?.click()}>
                    <img
                      src={profileForm.avatarPreview || currentUser?.profile_picture || assets.sample_profile}
                      alt=''
                      className='size-24 rounded-full border border-slate-200 object-cover shadow-sm transition group-hover:opacity-80 ring-4 ring-cyan-50'
                    />
                    <div className='absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/20 opacity-0 transition group-hover:opacity-100'>
                      <Camera className='size-6 text-white' />
                    </div>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type='file'
                    accept='image/*'
                    onChange={handleAvatarSelect}
                    className='hidden'
                  />
                  <p className='mt-2 text-xs font-bold text-slate-400'>Nhấp để đổi ảnh đại diện</p>
                </div>

                <div>
                  <label className='mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500'>Tên hiển thị</label>
                  <input
                    type='text'
                    value={profileForm.fullName}
                    onChange={(event) => setProfileForm((current) => ({ ...current, fullName: event.target.value }))}
                    className='h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
                    placeholder='Nhập tên hiển thị mới...'
                  />
                </div>

                <div className='flex items-center justify-end gap-3 border-t border-slate-100 pt-4 mt-2'>
                  <button type='button' onClick={closeSettings} className='rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 cursor-pointer'>
                    Hủy
                  </button>
                  <button
                    type='submit'
                    disabled={settingsLoading}
                    className='flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-cyan-600 disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer'
                  >
                    {settingsLoading && <span className='size-4 animate-spin rounded-full border-2 border-white border-t-transparent' />}
                    Lưu thay đổi
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes adminFadeIn {
          from { opacity: 0 }
          to { opacity: 1 }
        }
        @keyframes adminSlideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97) }
          to { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
    </div>
  )
}

export default Admin
