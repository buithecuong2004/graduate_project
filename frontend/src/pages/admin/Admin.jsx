import React, { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import AdminLayout from '../../components/admin/AdminLayout'
import { ADMIN_TABS, REPORT_ACTION_LABELS } from '../../components/admin/adminShared'
import { useAuth } from '../../context/AuthContext'
import { clearUser } from '../../features/user/userSlice'
import api from '../../api/axios'
import localizeMessage from '../../utils/localization'
import Overview from './Overview'
import Posts from './Posts'
import Reports from './Reports'
import Users from './Users'

const getActiveAdminTab = (pathname) => {
  if (pathname.startsWith('/admin/users')) return 'users'
  if (pathname.startsWith('/admin/posts')) return 'posts'
  if (pathname.startsWith('/admin/reports')) return 'reports'
  return 'overview'
}

const Admin = () => {
  const { getToken, logout } = useAuth()
  const currentUser = useSelector((state) => state.user.value)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const activeTab = getActiveAdminTab(pathname)
  const [dashboard, setDashboard] = useState(null)
  const [users, setUsers] = useState([])
  const [posts, setPosts] = useState([])
  const [reports, setReports] = useState([])
  const [growthDays, setGrowthDays] = useState(7)
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [userFilters, setUserFilters] = useState({ search: '' })
  const [postFilters, setPostFilters] = useState({ search: '', user: '', from: '', to: '', status: 'all' })
  const [reportStatus, setReportStatus] = useState('pending')
  const [refreshKey, setRefreshKey] = useState(0)

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
        params: { search: userFilters.search, limit: 50 }
      })
      if (data.success) setUsers(data.users)
      else toast.error(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setLoading(false)
    }
  }, [authHeaders, userFilters.search])

  const loadPosts = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/posts', {
        headers: await authHeaders(),
        params: { ...postFilters, limit: 50 }
      })
      if (data.success) setPosts(data.posts)
      else toast.error(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setLoading(false)
    }
  }, [authHeaders, postFilters])

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/reports', {
        headers: await authHeaders(),
        params: { status: reportStatus, limit: 50 }
      })
      if (data.success) setReports(data.reports)
      else toast.error(localizeMessage(data.message))
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setLoading(false)
    }
  }, [authHeaders, reportStatus])

  useEffect(() => {
    if (activeTab === 'overview') loadDashboard()
    if (activeTab === 'users') loadUsers()
    if (activeTab === 'posts') loadPosts()
    if (activeTab === 'reports') loadReports()
  }, [activeTab, loadDashboard, loadPosts, loadReports, loadUsers, refreshKey])

  const handleGlobalSearch = useCallback((event) => {
    event.preventDefault()
    const search = globalSearch.trim()

    if (activeTab === 'users') {
      setUserFilters({ search })
      setRefreshKey((value) => value + 1)
      return
    }

    if (activeTab === 'posts') {
      setPostFilters((filters) => ({ ...filters, search }))
      setRefreshKey((value) => value + 1)
      return
    }

    navigate('/admin/posts')
    setPostFilters((filters) => ({ ...filters, search }))
  }, [activeTab, globalSearch, navigate])

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
        toast.success('Da cap nhat nguoi dung')
      } else {
        toast.error(localizeMessage(data.message))
      }
    } catch (error) {
      toast.error(localizeMessage(error.message))
    } finally {
      setActionId('')
    }
  }, [authHeaders])

  const updatePostVisibility = useCallback(async (postId, isHidden) => {
    const reason = isHidden ? window.prompt('Ly do an bai viet', 'Vi pham quy dinh cong dong') : ''
    if (isHidden && reason === null) return

    setActionId(postId)
    try {
      const { data } = await api.patch(`/api/admin/posts/${postId}/visibility`, {
        is_hidden: isHidden,
        reason
      }, { headers: await authHeaders() })
      if (data.success) {
        setPosts((currentPosts) => currentPosts.map((post) => post._id === postId ? data.post : post))
        toast.success(isHidden ? 'Da an bai viet' : 'Da hien thi bai viet')
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
    if (!window.confirm('Xoa bai viet vi pham nay?')) return

    setActionId(postId)
    try {
      const { data } = await api.delete(`/api/admin/posts/${postId}`, { headers: await authHeaders() })
      if (data.success) {
        setPosts((currentPosts) => currentPosts.filter((post) => post._id !== postId))
        toast.success('Da xoa bai viet')
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
    const note = REPORT_ACTION_LABELS[action] || 'Da xu ly'
    setActionId(reportId)
    try {
      const { data } = await api.patch(`/api/admin/reports/${reportId}`, {
        action,
        resolution_note: note
      }, { headers: await authHeaders() })
      if (data.success) {
        setReports((currentReports) => currentReports.map((report) => report._id === reportId ? data.report : report))
        toast.success('Da cap nhat bao cao')
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

  const totals = dashboard?.totals || {}
  const topPosts = dashboard?.topPosts || []
  const growth = dashboard?.growth || { users: [], posts: [], comments: [], likes: [], shares: [] }

  return (
    <AdminLayout
      activeTab={activeTab}
      currentUser={currentUser}
      globalSearch={globalSearch}
      loading={loading}
      pendingReports={totals.pendingReports}
      onGlobalSearch={handleGlobalSearch}
      onGlobalSearchChange={setGlobalSearch}
      onLogout={handleLogout}
      onRefresh={refreshCurrentTab}
      tabs={ADMIN_TABS}
    >
      <Routes>
        <Route
          index
          element={(
            <Overview
              growth={growth}
              growthDays={growthDays}
              onGrowthDaysChange={setGrowthDays}
              onOpenReports={() => navigate('/admin/reports')}
              topPosts={topPosts}
              totals={totals}
            />
          )}
        />
        <Route
          path='users'
          element={(
            <Users
              actionId={actionId}
              filters={userFilters}
              onFilterChange={setUserFilters}
              onSearch={loadUsers}
              onUpdateUser={updateUser}
              users={users}
            />
          )}
        />
        <Route
          path='posts'
          element={(
            <Posts
              actionId={actionId}
              filters={postFilters}
              onDeletePost={deletePost}
              onFilterChange={setPostFilters}
              onSearch={loadPosts}
              onUpdateVisibility={updatePostVisibility}
              posts={posts}
            />
          )}
        />
        <Route
          path='reports'
          element={(
            <Reports
              actionId={actionId}
              onStatusChange={setReportStatus}
              onUpdateReport={updateReport}
              reports={reports}
              status={reportStatus}
            />
          )}
        />
        <Route path='*' element={<Navigate to='/admin' replace />} />
      </Routes>
    </AdminLayout>
  )
}

export default Admin
