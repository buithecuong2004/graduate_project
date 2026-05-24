import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BriefcaseBusiness, Check, Clock, Home, MapPin, MessageSquare, UserCheck, UserMinus, UserPlus, UserRoundPen, Users, X } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useAuth } from '../context/AuthContext'
import { fetchConnections } from '../features/connections/connectionsSlice'
import api from '../api/axios'
import toast from 'react-hot-toast'
import localizeMessage from '../utils/localization'

const FRIEND_TABS = [
  {
    id: 'home',
    label: 'Trang chủ',
    Icon: Home,
    title: 'Những người bạn có thể biết',
    subtitle: 'Gợi ý kết nối mới dựa trên mạng lưới Tarous của bạn.'
  },
  {
    id: 'requests',
    label: 'Lời mời kết bạn',
    Icon: UserRoundPen,
    title: 'Lời mời kết bạn',
    subtitle: 'Chấp nhận hoặc từ chối những lời mời đang chờ xử lý.'
  },
  {
    id: 'followers',
    label: 'Người theo dõi',
    Icon: Users,
    title: 'Người theo dõi',
    subtitle: 'Những người đang theo dõi hoạt động công khai của bạn.'
  },
  {
    id: 'following',
    label: 'Đang theo dõi',
    Icon: UserCheck,
    title: 'Đang theo dõi',
    subtitle: 'Danh sách những người bạn đang theo dõi.'
  },
  {
    id: 'friends',
    label: 'Bạn bè',
    Icon: UserPlus,
    title: 'Bạn bè',
    subtitle: 'Những người đã kết nối bạn bè với bạn.'
  }
]

const FRIEND_TAB_IDS = new Set(FRIEND_TABS.map((tab) => tab.id))

const ACTION_STYLES = {
  primary: 'border border-cyan-100 bg-cyan-50 text-cyan-700 hover:bg-cyan-100',
  muted: 'border border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200',
  danger: 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
  success: 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  warning: 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
}

const EMPTY_STATE = {
  home: {
    title: 'Chưa có gợi ý mới',
    subtitle: 'Khi có người phù hợp để kết nối, họ sẽ xuất hiện tại đây.'
  },
  requests: {
    title: 'Chưa có lời mời kết bạn',
    subtitle: 'Những lời mời mới sẽ được đưa vào mục này.'
  },
  followers: {
    title: 'Chưa có người theo dõi',
    subtitle: 'Người theo dõi bạn sẽ được hiển thị tại đây.'
  },
  following: {
    title: 'Bạn chưa theo dõi ai',
    subtitle: 'Những người bạn theo dõi sẽ được lưu ở mục này.'
  },
  friends: {
    title: 'Chưa có bạn bè',
    subtitle: 'Khi lời mời được chấp nhận, bạn bè sẽ xuất hiện tại đây.'
  }
}

const getDisplayName = (user) => user?.full_name || user?.username || 'Người dùng Tarous'

const getAvatarUrl = (user) => (
  user?.profile_picture ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName(user))}&background=0891b2&color=fff`
)

const getFollowerCount = (user) => {
  if (Array.isArray(user?.followers)) return user.followers.length
  return Number(user?.followers_count || 0)
}

const getMetaText = (user, tabId) => {
  if (tabId === 'home') {
    const followerCount = getFollowerCount(user)
    if (followerCount > 0) return `Có ${followerCount} người theo dõi`
  }

  if (user?.username) return `@${user.username}`
  if (user?.location) return user.location
  return ''
}

const getUserId = (user) => user?._id?.toString?.() || user?._id || ''

const FriendCard = React.memo(function FriendCard({ user, tabId, actions, previewActions = [], onOpenProfile }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const closePreviewTimerRef = useRef(null)
  const displayName = getDisplayName(user)
  const metaText = getMetaText(user, tabId)
  const followerCount = getFollowerCount(user)
  const shouldShowPreview = tabId === 'home'

  const openProfile = useCallback(() => {
    onOpenProfile(user._id)
  }, [onOpenProfile, user._id])

  const handleCardKeyDown = (event) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openProfile()
    }
  }

  const clearClosePreviewTimer = useCallback(() => {
    if (closePreviewTimerRef.current) {
      clearTimeout(closePreviewTimerRef.current)
      closePreviewTimerRef.current = null
    }
  }, [])

  const openPreview = useCallback(() => {
    if (!shouldShowPreview) return
    clearClosePreviewTimer()
    setIsPreviewOpen(true)
  }, [clearClosePreviewTimer, shouldShowPreview])

  const scheduleClosePreview = useCallback(() => {
    clearClosePreviewTimer()
    closePreviewTimerRef.current = setTimeout(() => {
      setIsPreviewOpen(false)
      closePreviewTimerRef.current = null
    }, 220)
  }, [clearClosePreviewTimer])

  useEffect(() => clearClosePreviewTimer, [clearClosePreviewTimer])

  return (
    <article
      role='button'
      tabIndex={0}
      onClick={openProfile}
      onKeyDown={handleCardKeyDown}
      className='group relative rounded-2xl border border-slate-200 bg-white shadow-sm outline-none transition hover:z-[100] hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-xl focus-within:z-[100] focus-visible:ring-4 focus-visible:ring-cyan-100 cursor-pointer'
    >
      <div className='aspect-[4/3] overflow-hidden rounded-t-2xl bg-slate-100'>
        <img
          src={getAvatarUrl(user)}
          alt={displayName}
          className='h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]'
          onError={(event) => {
            event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0891b2&color=fff`
          }}
        />
      </div>

      <div className='p-4'>
        <div
          className='relative inline-block max-w-full'
          onMouseEnter={openPreview}
          onMouseLeave={scheduleClosePreview}
          onFocus={openPreview}
          onBlur={scheduleClosePreview}
        >
          <button
            type='button'
            onClick={(event) => {
              event.stopPropagation()
              openProfile()
            }}
            className='block max-w-full truncate text-left text-base font-black text-slate-950 underline-offset-2 transition hover:text-cyan-700 hover:underline'
          >
            {displayName}
          </button>

          {shouldShowPreview && isPreviewOpen && (
            <div
              className='absolute left-0 bottom-[calc(100%+0.5rem)] z-[200] w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xl shadow-slate-900/20'
              onMouseEnter={clearClosePreviewTimer}
              onMouseLeave={scheduleClosePreview}
              onClick={(event) => event.stopPropagation()}
            >
              <div className='absolute left-0 top-full h-3 w-full' />
              <div className='flex gap-4'>
                <img
                  src={getAvatarUrl(user)}
                  alt={displayName}
                  className='h-24 w-24 shrink-0 rounded-full object-cover ring-1 ring-slate-200'
                  onError={(event) => {
                    event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0891b2&color=fff`
                  }}
                />

                <div className='min-w-0 flex-1'>
                  <div className='flex items-start gap-3'>
                    <button
                      type='button'
                      onClick={openProfile}
                      className='min-w-0 flex-1 truncate text-left text-xl font-black text-slate-950 transition hover:text-cyan-700'
                    >
                      {displayName}
                    </button>
                    <button
                      type='button'
                      aria-label='Đóng'
                      onClick={(event) => {
                        event.stopPropagation()
                        setIsPreviewOpen(false)
                      }}
                      className='flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200'
                    >
                      <X className='h-5 w-5' />
                    </button>
                  </div>

                  <div className='mt-3 space-y-2 text-sm leading-5 text-slate-700'>
                    {user?.bio && (
                      <div className='flex gap-3'>
                        <BriefcaseBusiness className='mt-0.5 h-5 w-5 shrink-0 text-slate-400' />
                        <p className='line-clamp-2'>{user.bio}</p>
                      </div>
                    )}
                    {user?.location && (
                      <div className='flex gap-3'>
                        <MapPin className='mt-0.5 h-5 w-5 shrink-0 text-slate-400' />
                        <p className='line-clamp-2'>{user.location}</p>
                      </div>
                    )}
                    <div className='flex gap-3'>
                      <Users className='mt-0.5 h-5 w-5 shrink-0 text-slate-400' />
                      <p>
                        {user?.username ? `@${user.username} · ` : ''}
                        Có {followerCount} người theo dõi
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className='mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3'>
                {previewActions.map((action) => {
                  const ActionIcon = action.Icon

                  return (
                    <button
                      key={action.label}
                      type='button'
                      disabled={action.disabled}
                      onClick={(event) => {
                        event.stopPropagation()
                        action.onClick()
                      }}
                      className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${ACTION_STYLES[action.variant] || ACTION_STYLES.muted}`}
                    >
                      {ActionIcon && <ActionIcon className='h-4 w-4' />}
                      {action.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className='mt-1 min-h-5 text-sm text-slate-500'>
          {metaText && <p className='truncate'>{metaText}</p>}
        </div>

        {user?.bio && (
          <p className='mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600'>
            {user.bio}
          </p>
        )}

        {actions.length > 0 && (
          <div className='mt-4 flex flex-col gap-2'>
            {actions.map((action) => {
              const ActionIcon = action.Icon

              return (
                <button
                  key={action.label}
                  type='button'
                  disabled={action.disabled}
                  onClick={(event) => {
                    event.stopPropagation()
                    action.onClick()
                  }}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${ACTION_STYLES[action.variant] || ACTION_STYLES.muted}`}
                >
                  {ActionIcon && <ActionIcon className='h-4 w-4' />}
                  {action.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
})

const LoadingCards = () => (
  <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'>
    {Array.from({ length: 10 }).map((_, index) => (
      <div key={index} className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='aspect-[4/3] animate-pulse bg-slate-200' />
        <div className='space-y-3 p-4'>
          <div className='h-4 w-2/3 animate-pulse rounded-full bg-slate-200' />
          <div className='h-3 w-1/2 animate-pulse rounded-full bg-slate-100' />
          <div className='h-10 animate-pulse rounded-xl bg-slate-100' />
          <div className='h-10 animate-pulse rounded-xl bg-slate-100' />
        </div>
      </div>
    ))}
  </div>
)

const Connections = () => {
  const [suggestedUsers, setSuggestedUsers] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const dispatch = useDispatch()

  const { connections, pendingConnections, followers, following } = useSelector((state) => state.connections)
  const requestedTab = searchParams.get('tab') || 'home'
  const currentTab = FRIEND_TAB_IDS.has(requestedTab) ? requestedTab : 'home'

  const refreshConnections = useCallback(async () => {
    dispatch(fetchConnections(await getToken()))
  }, [dispatch, getToken])

  const fetchSuggestedUsers = useCallback(async () => {
    try {
      setSuggestionsLoading(true)
      const { data } = await api.post('/api/user/discover', { input: '' }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      data.success ? setSuggestedUsers(data.users || []) : toast.error(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setSuggestionsLoading(false)
    }
  }, [getToken])

  const updateSuggestedUser = useCallback((userId, patch) => {
    setSuggestedUsers((users) => users.map((user) => (
      user._id === userId ? { ...user, ...patch } : user
    )))
  }, [])

  const hideSuggestedUser = useCallback((userId) => {
    setSuggestedUsers((users) => users.filter((user) => user._id !== userId))
  }, [])

  const openProfile = useCallback((userId) => {
    navigate(`/profile/${userId}`)
  }, [navigate])

  const sendConnectionRequest = useCallback(async (userId) => {
    try {
      const { data } = await api.post('/api/user/send-connection-request', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })

      if (data.success) {
        toast.success(localizeMessage(data.message))
        updateSuggestedUser(userId, { connectionStatus: 'pending_sent', isFollowing: true })
        refreshConnections()
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }, [getToken, refreshConnections, updateSuggestedUser])

  const followUser = useCallback(async (userId) => {
    try {
      const { data } = await api.post('/api/user/follow', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })

      if (data.success) {
        toast.success(localizeMessage(data.message))
        updateSuggestedUser(userId, { isFollowing: true })
        refreshConnections()
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }, [getToken, refreshConnections, updateSuggestedUser])

  const cancelConnectionRequest = useCallback(async (userId) => {
    try {
      const { data } = await api.post('/api/user/cancel-connection-request', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })

      if (data.success) {
        toast.success(localizeMessage(data.message))
        updateSuggestedUser(userId, { connectionStatus: 'none' })
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }, [getToken, updateSuggestedUser])

  const handleUnFollow = useCallback(async (userId) => {
    try {
      const { data } = await api.post('/api/user/unfollow', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      data.success ? (toast.success(localizeMessage(data.message)), refreshConnections()) : toast.error(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }, [getToken, refreshConnections])

  const declineConnection = useCallback(async (userId) => {
    try {
      const { data } = await api.post('/api/user/decline', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })

      if (data.success) {
        toast.success(localizeMessage(data.message))
        refreshConnections()
        hideSuggestedUser(userId)
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }, [getToken, hideSuggestedUser, refreshConnections])

  const acceptConnection = useCallback(async (userId) => {
    try {
      const { data } = await api.post('/api/user/accept', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })

      if (data.success) {
        toast.success(localizeMessage(data.message))
        refreshConnections()
        updateSuggestedUser(userId, { connectionStatus: 'connected', isConnected: true })
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }, [getToken, refreshConnections, updateSuggestedUser])

  const removeConnection = useCallback(async (userId) => {
    try {
      const { data } = await api.post('/api/user/remove-connection', { id: userId }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      data.success ? (toast.success(localizeMessage(data.message)), refreshConnections()) : toast.error(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    }
  }, [getToken, refreshConnections])

  useEffect(() => {
    refreshConnections()
    fetchSuggestedUsers()
  }, [fetchSuggestedUsers, refreshConnections, location.state?.refresh])

  useEffect(() => {
    setShowAllSuggestions(false)
  }, [currentTab])

  const tabs = useMemo(() => [
    {
      ...FRIEND_TABS[0],
      value: suggestedUsers.filter((user) => {
        const userId = getUserId(user)
        const connectionStatus = user.connectionStatus || (user.isConnected ? 'connected' : 'none')
        const isAlreadyFriend = connections.some((connection) => getUserId(connection) === userId)

        return userId && !user.isConnected && connectionStatus !== 'connected' && !isAlreadyFriend
      })
    },
    { ...FRIEND_TABS[1], value: pendingConnections, count: pendingConnections.length },
    { ...FRIEND_TABS[2], value: followers, count: followers.length },
    { ...FRIEND_TABS[3], value: following, count: following.length },
    { ...FRIEND_TABS[4], value: connections, count: connections.length }
  ], [connections, followers, following, pendingConnections, suggestedUsers])

  const activeTab = tabs.find((tab) => tab.id === currentTab) || tabs[0]
  const activeData = activeTab.value || []
  const visibleData = currentTab === 'home' && !showAllSuggestions ? activeData.slice(0, 10) : activeData
  const canShowAll = currentTab === 'home' && activeData.length > visibleData.length
  const emptyState = EMPTY_STATE[currentTab] || EMPTY_STATE.home

  const getActionsForUser = useCallback((user) => {
    if (currentTab === 'home') {
      const status = user.connectionStatus || (user.isConnected ? 'connected' : 'none')
      const hideAction = {
        label: 'Gỡ',
        Icon: X,
        variant: 'muted',
        onClick: () => hideSuggestedUser(user._id)
      }

      if (status === 'connected') {
        return [
          { label: 'Nhắn tin', Icon: MessageSquare, variant: 'primary', onClick: () => navigate(`/messages/${user._id}`) },
          hideAction
        ]
      }

      if (status === 'pending_sent') {
        return [
          { label: 'Hủy lời mời', Icon: Clock, variant: 'warning', onClick: () => cancelConnectionRequest(user._id) },
          hideAction
        ]
      }

      if (status === 'pending_received') {
        return [
          { label: 'Chấp nhận', Icon: Check, variant: 'success', onClick: () => acceptConnection(user._id) },
          hideAction
        ]
      }

      return [
        { label: 'Thêm bạn bè', Icon: UserPlus, variant: 'primary', onClick: () => sendConnectionRequest(user._id) },
        hideAction
      ]
    }

    if (currentTab === 'requests') {
      return [
        { label: 'Chấp nhận', Icon: Check, variant: 'success', onClick: () => acceptConnection(user._id) },
        { label: 'Từ chối', Icon: X, variant: 'danger', onClick: () => declineConnection(user._id) }
      ]
    }

    if (currentTab === 'following') {
      return [
        { label: 'Bỏ theo dõi', Icon: UserMinus, variant: 'warning', onClick: () => handleUnFollow(user._id) }
      ]
    }

    if (currentTab === 'friends') {
      return [
        { label: 'Tin nhắn', Icon: MessageSquare, variant: 'primary', onClick: () => navigate(`/messages/${user._id}`) },
        { label: 'Hủy kết bạn', Icon: X, variant: 'danger', onClick: () => removeConnection(user._id) }
      ]
    }

    return []
  }, [
    acceptConnection,
    cancelConnectionRequest,
    currentTab,
    declineConnection,
    handleUnFollow,
    hideSuggestedUser,
    navigate,
    removeConnection,
    sendConnectionRequest
  ])

  const getPreviewActionsForUser = useCallback((user) => {
    if (currentTab !== 'home') return []

    const status = user.connectionStatus || (user.isConnected ? 'connected' : 'none')
    const friendAction = status === 'pending_sent'
      ? { label: 'Hủy lời mời', Icon: Clock, variant: 'warning', onClick: () => cancelConnectionRequest(user._id) }
      : status === 'pending_received'
        ? { label: 'Chấp nhận', Icon: Check, variant: 'success', onClick: () => acceptConnection(user._id) }
        : { label: 'Thêm bạn bè', Icon: UserPlus, variant: 'primary', onClick: () => sendConnectionRequest(user._id) }

    return [
      { label: 'Nhắn tin', Icon: MessageSquare, variant: 'muted', onClick: () => navigate(`/messages/${user._id}`) },
      friendAction,
      user.isFollowing
        ? { label: 'Đang theo dõi', Icon: UserCheck, variant: 'muted', disabled: true, onClick: () => {} }
        : { label: 'Theo dõi', Icon: UserPlus, variant: 'primary', onClick: () => followUser(user._id) }
    ]
  }, [
    acceptConnection,
    cancelConnectionRequest,
    currentTab,
    followUser,
    navigate,
    sendConnectionRequest
  ])

  return (
    <div className='min-h-full bg-slate-50/70'>
      <div className='w-full px-4 py-5 sm:px-6 lg:px-8'>
        <nav className='mb-5 flex gap-2 overflow-x-auto pb-1 sm:hidden'>
          {tabs.map((tab) => {
            const TabIcon = tab.Icon
            const isActive = currentTab === tab.id

            return (
              <button
                key={tab.id}
                type='button'
                onClick={() => setSearchParams({ tab: tab.id })}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition ${
                  isActive ? 'bg-cyan-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                <TabIcon className='h-4 w-4' />
                {tab.label}
              </button>
            )
          })}
        </nav>

        <section className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <p className='page-kicker'>Bạn bè</p>
            <h1 className='mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl'>
              {activeTab.title}
            </h1>
            <p className='mt-1 max-w-2xl text-sm leading-6 text-slate-500'>
              {activeTab.subtitle}
            </p>
          </div>

          {canShowAll && (
            <button
              type='button'
              onClick={() => setShowAllSuggestions(true)}
              className='self-start rounded-full px-4 py-2 text-sm font-black text-cyan-700 transition hover:bg-cyan-50 sm:self-auto'
            >
              Xem tất cả
            </button>
          )}
        </section>

        {currentTab === 'home' && suggestionsLoading ? (
          <LoadingCards />
        ) : visibleData.length === 0 ? (
          <div className='flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/80 p-10 text-center'>
            <Users className='mb-3 h-10 w-10 text-slate-300' />
            <p className='text-lg font-black text-slate-950'>{emptyState.title}</p>
            <p className='mt-1 max-w-md text-sm leading-6 text-slate-500'>{emptyState.subtitle}</p>
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'>
            {visibleData.map((user) => (
              <FriendCard
                key={user._id}
                user={user}
                tabId={currentTab}
                actions={getActionsForUser(user)}
                previewActions={getPreviewActionsForUser(user)}
                onOpenProfile={openProfile}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Connections
