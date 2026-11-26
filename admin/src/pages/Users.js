import React, { useEffect, useState, useRef, useCallback } from 'react'
import Topbar from '../components/Topbar'
import { apiListUsers, apiCreateUser, apiPatchUser, apiDeleteUser, apiMe, apiAiStatus, apiAiUpdateSettings, apiAiAuditLogs } from '../api'
import { SparklesIcon } from '../components/CrmHrmsIcons'
import "./Users.css"

function getInitials(name = '', email = '') {
  const src = String(name || email || 'U').trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export default function Users() {
  const [isAdmin, setIsAdmin] = useState(false)

  // table & paging
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const totalPages = Math.max(1, Math.ceil((total || 0) / (limit || 1)))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // create form (React-controlled Jira modal)
  const [form, setForm] = useState({
    name: '',
    email: '',
    username: '',
    role: 'employee',
    department: '',
    position: '',
    password: ''
  })
  const [saving, setSaving] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // edit user (React-controlled Jira modal)
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    username: '',
    role: 'employee',
    department: '',
    position: ''
  })
  const [editSaving, setEditSaving] = useState(false)

  // reset password modal
  const [resetPwUser, setResetPwUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetSaving, setResetSaving] = useState(false)

  // Admin AI Platform Governance & Audit
  const [aiCfg, setAiCfg] = useState(null)
  const [aiLogs, setAiLogs] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)
  const [showAiLogs, setShowAiLogs] = useState(false)

  // toast
  const toastTimer = useRef(null)
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' })
  const showToast = useCallback((message, type = 'success') => {
    setToast({ open: true, type, message })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, open: false })), 3000)
  }, [])
  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(t => ({ ...t, open: false }))
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const loadAiGovernance = useCallback(async () => {
    setAiLoading(true)
    try {
      const [st, lg] = await Promise.all([apiAiStatus(), apiAiAuditLogs({ limit: 20 })])
      setAiCfg(st)
      setAiLogs(lg?.logs || [])
    } catch { }
    finally { setAiLoading(false) }
  }, [])

  const toggleAiEnabled = async () => {
    if (!aiCfg) return
    setAiSaving(true)
    try {
      const next = !aiCfg.dbEnabled
      const res = await apiAiUpdateSettings({ enabled: next })
      setAiCfg(res)
      showToast(`AI features ${next ? 'enabled' : 'disabled'}`, 'success')
      loadAiGovernance()
    } catch (err) {
      showToast(err?.message || 'Failed to update AI setting', 'error')
    } finally {
      setAiSaving(false)
    }
  }

  // role check
  useEffect(() => {
    (async () => {
      try {
        const me = await apiMe()
        const role = (me.me?.role || me.user?.role || "").toLowerCase()
        setIsAdmin(role === 'admin')
        if (role === 'admin') loadAiGovernance()
      } catch {
        setIsAdmin(false)
      }
    })()
  }, [loadAiGovernance])

  // data
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, total: t } = await apiListUsers({ page, limit, search })
      const list = Array.isArray(data) ? [...data].reverse() : []
      setRows(list)
      setTotal(t ?? list.length)
    } catch (err) {
      setRows([])
      setTotal(0)
      setError(err?.message || 'Failed to load users')
      showToast(err?.message || 'Failed to load users', 'error')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, showToast])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // Esc key closes open modal
  useEffect(() => {
    if (!showCreateModal && !editingUser && !resetPwUser) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowCreateModal(false)
        setEditingUser(null)
        setResetPwUser(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showCreateModal, editingUser, resetPwUser])

  const openEdit = (u) => {
    setEditingUser(u)
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      username: u.username || '',
      role: u.role || 'employee',
      department: u.department || '',
      position: u.position || ''
    })
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editingUser) return
    setEditSaving(true)
    try {
      await apiPatchUser(editingUser.id, editForm)
      showToast('User updated successfully', 'success')
      setEditingUser(null)
      await fetchUsers()
    } catch (err) {
      showToast(err?.message || 'Update failed', 'error')
    } finally {
      setEditSaving(false)
    }
  }

  const createUser = async (e) => {
    e.preventDefault()
    if (!form.password || form.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error')
      return
    }
    setSaving(true)
    try {
      await apiCreateUser(form)
      setForm({ name: '', email: '', username: '', role: 'employee', department: '', position: '', password: '' })
      setShowCreateModal(false)
      setPage(1)
      await fetchUsers()
      showToast('User created successfully', 'success')
    } catch (err) {
      showToast(err?.message || 'Create failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (id, is_active) => {
    try {
      await apiPatchUser(id, { is_active: !is_active })
      await fetchUsers()
    } catch (err) {
      showToast(err?.message || 'Update failed', 'error')
    }
  }

  const changeRole = async (id, role) => {
    try {
      await apiPatchUser(id, { role })
      await fetchUsers()
      showToast(`Role updated to ${role === 'admin' ? 'ZOR - A' : 'ZOR - E'}`, 'success')
    } catch (err) {
      showToast(err?.message || 'Role change failed', 'error')
    }
  }

  const submitResetPassword = async (e) => {
    e.preventDefault()
    if (!resetPwUser) return
    if (!newPassword || newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error')
      return
    }
    setResetSaving(true)
    try {
      await apiPatchUser(resetPwUser.id, { password: newPassword })
      showToast(`Password reset for ${resetPwUser.name}`, 'success')
      setResetPwUser(null)
      setNewPassword('')
    } catch (err) {
      showToast(err?.message || 'Reset failed', 'error')
    } finally {
      setResetSaving(false)
    }
  }

  const del = async (u) => {
    if (!window.confirm(`Delete user "${u.name}" (${u.email})? This action cannot be undone.`)) return
    try {
      await apiDeleteUser(u.id)
      showToast('User deleted', 'success')
      await fetchUsers()
    } catch (err) {
      showToast(err?.message || 'Delete failed', 'error')
    }
  }

  const visibleRows = rows.filter((u) => {
    if (roleFilter !== 'all' && String(u.role || 'employee').toLowerCase() !== roleFilter) return false
    if (statusFilter === 'active' && !u.is_active) return false
    if (statusFilter === 'inactive' && u.is_active) return false
    return true
  })

  const onlineCount = rows.filter((u) => u.is_online).length
  const adminCount = rows.filter((u) => String(u.role || '').toLowerCase() === 'admin').length
  const activeCount = rows.filter((u) => u.is_active).length

  return (
    <div className="usr-shell">
      <Topbar title="Users">
        {isAdmin && (
          <button
            type="button"
            className="usr-btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add User</span>
          </button>
        )}
      </Topbar>

      <div className="usr-page">

        {/* Jira KPI Summary Strip */}
        <div className="usr-kpi-grid">
          <div className="usr-kpi-card kpi-blue">
            <span className="usr-kpi-label">Total Accounts</span>
            <strong className="usr-kpi-val">{total}</strong>
            <span className="usr-kpi-sub">Workspace members</span>
          </div>
          <div className="usr-kpi-card kpi-green">
            <span className="usr-kpi-label">Active Accounts</span>
            <strong className="usr-kpi-val">{activeCount}</strong>
            <span className="usr-kpi-sub">On current page</span>
          </div>
          <div className="usr-kpi-card kpi-teal">
            <span className="usr-kpi-label">Online Now</span>
            <strong className="usr-kpi-val">{onlineCount}</strong>
            <span className="usr-kpi-sub">Live active sessions</span>
          </div>
          <div className="usr-kpi-card kpi-purple">
            <span className="usr-kpi-label">Administrators</span>
            <strong className="usr-kpi-val">{adminCount}</strong>
            <span className="usr-kpi-sub">ZOR - A privilege</span>
          </div>
        </div>

        {/* Jira Filter Toolbar */}
        <div className="usr-toolbar">
          <div className="usr-search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="uSearch"
              type="text"
              placeholder="Search by name, email, or username..."
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value) }}
            />
            {search && (
              <button
                type="button"
                className="usr-clear-search"
                onClick={() => { setPage(1); setSearch('') }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="usr-toolbar-filters">
            <select
              className="usr-filter-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
            >
              <option value="all">All Roles</option>
              <option value="admin">ZOR - A (Admin)</option>
              <option value="employee">ZOR - E (Employee)</option>
            </select>

            <select
              className="usr-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            <select
              className="usr-filter-select"
              value={limit}
              onChange={(e) => { setPage(1); setLimit(parseInt(e.target.value, 10) || 10) }}
              aria-label="Rows per page"
            >
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </div>
        </div>

        {error && <div className="usr-error-banner" role="alert">{error}</div>}

        {/* Users Table Card */}
        <div className="usr-table-card">
          <div className="usr-table-wrap">
            <table className="usr-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User &amp; Presence</th>
                  <th>Username</th>
                  <th>Department &amp; Role</th>
                  <th>Access Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="usr-loading-state">
                        <div className="loader_container">
                          <p className="loader_spinner"></p>
                          <p>Loading directory...</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="usr-empty-state">
                        <strong>No matching users found</strong>
                        <span>Try clearing filters or adding a new team member.</span>
                      </div>
                    </td>
                  </tr>
                ) : visibleRows.map((u) => {
                  const presenceClass =
                    u.effective_status === 'Available' ? 'available' :
                      u.effective_status === 'Away' ? 'away' :
                        u.effective_status === 'Busy' ? 'busy' :
                          u.effective_status === 'Do not disturb' ? 'dnd' : 'offline'
                  return (
                    <tr key={u.id}>
                      <td>
                        <span className="usr-id-chip">#{u.id}</span>
                      </td>
                      <td>
                        <div className="usr-user-cell">
                          <div className="usr-avatar">
                            {getInitials(u.name, u.email)}
                            <span className={`usr-presence-dot ${presenceClass}`} title={u.effective_status || 'Offline'} />
                          </div>
                          <div className="usr-user-meta">
                            <div className="usr-name-row">
                              <span className="usr-name">{u.name}</span>
                              <span className={`usr-presence-pill ${presenceClass}`}>
                                {u.effective_status || 'Offline'}
                              </span>
                            </div>
                            <span className="usr-email">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {u.username ? (
                          <code className="usr-username-tag">@{u.username}</code>
                        ) : (
                          <span className="usr-muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="usr-dept-cell">
                          {u.department && <span className="usr-dept-badge">{u.department}</span>}
                          <span className="usr-position">{u.position || (!u.department ? '—' : '')}</span>
                        </div>
                      </td>
                      <td>
                        <select
                          className={`usr-role-select ${u.role === 'admin' ? 'is-admin' : ''}`}
                          value={u.role}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          disabled={!isAdmin}
                        >
                          <option value="employee">ZOR - E</option>
                          <option value="admin">ZOR - A</option>
                        </select>
                      </td>
                      <td>
                        <label className="usr-toggle-wrap" title={u.is_active ? 'Deactivate user' : 'Activate user'}>
                          <span className="usr-switch">
                            <input
                              type="checkbox"
                              checked={!!u.is_active}
                              disabled={!isAdmin}
                              onChange={() => toggleActive(u.id, u.is_active)}
                            />
                            <span className="usr-slider" />
                          </span>
                          <span className={`usr-status-lozenge ${u.is_active ? 'active' : 'inactive'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </label>
                      </td>
                      <td>
                        <span className="usr-date">
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                        </span>
                      </td>
                      <td>
                        <div className="usr-row-actions">
                          <button
                            type="button"
                            className="usr-icon-btn"
                            onClick={() => openEdit(u)}
                            title="Edit user details"
                            aria-label={`Edit ${u.name}`}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                              <path
                                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="usr-text-btn"
                            onClick={() => { setResetPwUser(u); setNewPassword('') }}
                            title="Reset user password"
                          >
                            Reset PW
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              className="usr-icon-btn danger"
                              onClick={() => del(u)}
                              title="Delete user"
                              aria-label={`Delete ${u.name}`}
                            >
                              <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M9 3v1H4v2h16V4h-5V3H9zm-2 6v11a1 1 0 001 1h8a1 1 0 001-1V9H7zm2 2h2v9H9v-9zm4 0h2v9h-2v-9z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="usr-pagination">
            <span className="usr-page-info">
              Showing <strong>{visibleRows.length}</strong> of <strong>{total}</strong> users &bull; Page {page} of {totalPages}
            </span>
            <div className="usr-page-btns">
              <button type="button" className="usr-btn-subtle" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </button>
              <button type="button" className="usr-btn-subtle" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </div>

        {/* ZORVI AI Settings & Audit Governance (Jira Panel) */}
        {isAdmin && (
          <div className="usr-ai-card">
            <div className="usr-ai-header">
              <div className="usr-ai-title-row">
                <SparklesIcon size={24} />
                <div>
                  <h3 className="usr-ai-title">ZORVI AI Capabilities &amp; Audit Governance</h3>
                  <div className="usr-ai-meta">
                    {aiCfg ? (
                      <>
                        <span className={`usr-status-lozenge ${aiCfg.enabled ? 'active' : 'inactive'}`}>
                          {aiCfg.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span>
                          Engine: <strong>{aiCfg.providerConfigured ? `${aiCfg.provider} (${aiCfg.model})` : 'Deterministic Engine'}</strong>
                        </span>
                        {!aiCfg.envEnabled && (
                          <span className="usr-warn-badge">Blocked by AI_ENABLED=false</span>
                        )}
                      </>
                    ) : (
                      <span>Loading AI configuration...</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="usr-ai-controls">
                <button
                  type="button"
                  className="usr-btn-subtle"
                  onClick={() => setShowAiLogs((v) => !v)}
                >
                  {showAiLogs ? 'Hide Audit Log' : `Audit Log (${aiLogs.length})`}
                </button>
                <button
                  type="button"
                  className={aiCfg?.dbEnabled ? 'usr-btn-danger' : 'usr-btn-primary'}
                  disabled={aiSaving || aiLoading || !aiCfg || !aiCfg.envEnabled}
                  onClick={toggleAiEnabled}
                >
                  {aiSaving ? 'Saving...' : aiCfg?.dbEnabled ? 'Disable AI Features' : 'Enable AI Features'}
                </button>
              </div>
            </div>

            {showAiLogs && (
              <div className="usr-ai-logs-wrap">
                <table className="usr-table usr-audit-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>User</th>
                      <th>Feature</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Provider / Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: '#5e6c84', padding: '18px' }}>
                          No AI audit logs recorded yet.
                        </td>
                      </tr>
                    ) : aiLogs.map((l) => (
                      <tr key={l.id}>
                        <td className="usr-date">{new Date(l.created_at).toLocaleString()}</td>
                        <td>
                          <strong>{l.user_name || l.user_email || `#${l.user_id}`}</strong>{' '}
                          <span className="usr-muted">({l.user_role})</span>
                        </td>
                        <td><code className="usr-username-tag">{l.feature}</code></td>
                        <td><span className="usr-status-lozenge active">{l.action_status}</span></td>
                        <td>{l.entity_type ? `${l.entity_type} #${l.entity_id}` : '—'}</td>
                        <td className="usr-date">{l.provider} ({l.model})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CREATE USER MODAL (Scoped Jira Modal) */}
      {showCreateModal && (
        <div className="usr-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="usr-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create User">
            <div className="usr-modal-header">
              <div>
                <h4>Create Workspace User</h4>
                <span className="usr-modal-sub">Provision a new Zorvixe account and access role.</span>
              </div>
              <button type="button" className="usr-modal-close" onClick={() => setShowCreateModal(false)} aria-label="Close">×</button>
            </div>
            <form className="usr-modal-form" onSubmit={createUser}>
              <div className="usr-form-grid">
                <div className="usr-form-group">
                  <label htmlFor="uFullName">Full Name *</label>
                  <input
                    id="uFullName"
                    placeholder="e.g. Ananya Rao"
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    autoComplete="name"
                    autoFocus
                  />
                </div>
                <div className="usr-form-group">
                  <label htmlFor="uUserName">Username</label>
                  <input
                    id="uUserName"
                    placeholder="e.g. ananya"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    autoComplete="username"
                  />
                </div>
                <div className="usr-form-group">
                  <label htmlFor="uEmail">Email *</label>
                  <input
                    id="uEmail"
                    type="email"
                    placeholder="ananya@zorvixe.com"
                    required
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    autoComplete="email"
                  />
                </div>
                <div className="usr-form-group">
                  <label htmlFor="uRole">Role *</label>
                  <select
                    id="uRole"
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="employee">ZOR - E (Employee)</option>
                    <option value="admin">ZOR - A (Admin)</option>
                  </select>
                </div>
                <div className="usr-form-group">
                  <label htmlFor="uDepartment">Department</label>
                  <input
                    id="uDepartment"
                    placeholder="e.g. IT, Development, HR"
                    value={form.department}
                    onChange={e => setForm({ ...form, department: e.target.value })}
                    list="deptList"
                  />
                  <datalist id="deptList">
                    <option value="Development" />
                    <option value="IT" />
                    <option value="HR" />
                    <option value="Finance" />
                    <option value="Marketing" />
                    <option value="Sales" />
                    <option value="Operations" />
                    <option value="Design" />
                    <option value="Quality Assurance" />
                  </datalist>
                </div>
                <div className="usr-form-group">
                  <label htmlFor="uPosition">Position / Designation</label>
                  <input
                    id="uPosition"
                    placeholder="e.g. Software Engineer"
                    value={form.position}
                    onChange={e => setForm({ ...form, position: e.target.value })}
                  />
                </div>
              </div>
              <div className="usr-form-group">
                <label htmlFor="uPassword">Password *</label>
                <input
                  id="uPassword"
                  type="password"
                  placeholder="Minimum 6 characters"
                  required
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                />
              </div>
              <div className="usr-modal-actions">
                <button type="button" className="usr-btn-subtle" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="usr-btn-primary" disabled={saving}>
                  {saving ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="usr-modal-backdrop" onClick={() => setEditingUser(null)}>
          <div className="usr-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit User">
            <div className="usr-modal-header">
              <div>
                <h4>Edit User (#{editingUser.id})</h4>
                <span className="usr-modal-sub">{editingUser.email}</span>
              </div>
              <button type="button" className="usr-modal-close" onClick={() => setEditingUser(null)} aria-label="Close">×</button>
            </div>
            <form className="usr-modal-form" onSubmit={saveEdit}>
              <div className="usr-form-grid">
                <div className="usr-form-group">
                  <label>Full Name *</label>
                  <input
                    required
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className="usr-form-group">
                  <label>Username</label>
                  <input
                    value={editForm.username}
                    onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                  />
                </div>
                <div className="usr-form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div className="usr-form-group">
                  <label>Role *</label>
                  <select
                    value={editForm.role}
                    onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    <option value="employee">ZOR - E (Employee)</option>
                    <option value="admin">ZOR - A (Admin)</option>
                  </select>
                </div>
                <div className="usr-form-group">
                  <label>Department</label>
                  <input
                    placeholder="e.g. IT, Development, HR"
                    value={editForm.department}
                    onChange={e => setEditForm({ ...editForm, department: e.target.value })}
                    list="deptListEdit"
                  />
                  <datalist id="deptListEdit">
                    <option value="Development" />
                    <option value="IT" />
                    <option value="HR" />
                    <option value="Finance" />
                    <option value="Marketing" />
                    <option value="Sales" />
                    <option value="Operations" />
                    <option value="Design" />
                    <option value="Quality Assurance" />
                  </datalist>
                </div>
                <div className="usr-form-group">
                  <label>Position / Designation</label>
                  <input
                    placeholder="e.g. Software Engineer"
                    value={editForm.position}
                    onChange={e => setEditForm({ ...editForm, position: e.target.value })}
                  />
                </div>
              </div>
              <div className="usr-modal-actions">
                <button type="button" className="usr-btn-subtle" onClick={() => setEditingUser(null)}>Cancel</button>
                <button type="submit" className="usr-btn-primary" disabled={editSaving}>
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetPwUser && (
        <div className="usr-modal-backdrop" onClick={() => setResetPwUser(null)}>
          <div className="usr-modal-card usr-modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Reset Password">
            <div className="usr-modal-header">
              <div>
                <h4>Reset Password</h4>
                <span className="usr-modal-sub">{resetPwUser.name} ({resetPwUser.email})</span>
              </div>
              <button type="button" className="usr-modal-close" onClick={() => setResetPwUser(null)} aria-label="Close">×</button>
            </div>
            <form className="usr-modal-form" onSubmit={submitResetPassword}>
              <div className="usr-form-group">
                <label htmlFor="resetPwInput">New Password *</label>
                <input
                  id="resetPwInput"
                  type="password"
                  minLength={6}
                  required
                  autoFocus
                  placeholder="Enter new password (min 6 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="usr-modal-actions">
                <button type="button" className="usr-btn-subtle" onClick={() => setResetPwUser(null)}>Cancel</button>
                <button type="submit" className="usr-btn-primary" disabled={resetSaving}>
                  {resetSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`toastx ${toast.type} ${toast.open ? 'show' : ''}`} role="status" aria-live="polite">
        <div className="toastx-icon">
          {toast.type === 'success' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
          )}
        </div>
        <div className="toastx-body">
          <div className="toastx-title">{toast.type === 'success' ? 'Success' : 'Error'}</div>
          <div className="toastx-msg">{toast.message}</div>
        </div>
        <button type="button" className="toastx-close" onClick={hideToast} aria-label="Close">×</button>
      </div>
    </div>
  )
}
