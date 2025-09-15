import React, { useEffect, useState, useRef } from 'react'
import Topbar from '../components/Topbar'
import { apiListUsers, apiCreateUser, apiPatchUser, apiDeleteUser, apiMe } from '../api'
import "./Users.css"

export default function Users() {
  const [isAdmin, setIsAdmin] = useState(false)

  // table & paging
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const totalPages = Math.ceil((total || 0) / (limit || 1))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // create form (modal)
  const [form, setForm] = useState({
    name: '',
    email: '',
    username: '',
    role: 'employee',
    password: ''
  })
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false) // React-controlled modal

  // toast
  const toastTimer = useRef(null)
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' })
  const showToast = (message, type = 'success') => {
    setToast({ open: true, type, message })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, open: false })), 3000)
  }
  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(t => ({ ...t, open: false }))
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // role (mirror Candidates page)
  useEffect(() => {
    (async () => {
      try {
        const me = await apiMe()
        const role = (me.me?.role || me.user?.role || "").toLowerCase()
        setIsAdmin(role === 'admin')
      } catch {
        setIsAdmin(false)
      }
    })()
  }, [])

  // data
  const fetchUsers = async () => {
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
  }
  useEffect(() => { fetchUsers() }, [page, limit, search])

  // modal controls (React-only -> no Bootstrap JS errors)
  const closeCreate = () => setShowForm(false)
  useEffect(() => {
    if (!showForm) return
    const onKey = (e) => { if (e.key === 'Escape') closeCreate() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showForm])

  // actions
  const createUser = async (e) => {
    e.preventDefault()
    if (!form.password || form.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error')
      return
    }
    setSaving(true)
    try {
      await apiCreateUser(form)
      setForm({ name: '', email: '', username: '', role: 'employee', password: '' })
      setShowForm(false);
      closeCreate()
      setPage(1)
      await fetchUsers()
      showToast('User created', 'success')
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
    } catch (err) {
      showToast(err?.message || 'Role change failed', 'error')
    }
  }

  const resetPassword = async (id) => {
    const pw = window.prompt('Enter new password (min 6 chars):')
    if (!pw || pw.length < 6) return
    try {
      await apiPatchUser(id, { password: pw })
      showToast('Password reset done', 'success')
    } catch (err) {
      showToast(err?.message || 'Reset failed', 'error')
    }
  }

  const del = async (id) => {
    if (!window.confirm('Delete this user?')) return
    try {
      await apiDeleteUser(id)
      showToast('User deleted', 'success')
      await fetchUsers()
    } catch (err) {
      showToast(err?.message || 'Delete failed', 'error')
    }
  }


  return (
    <div>
      <Topbar title="Users">
        <div>
          <input
            id='uSearch'
            className="input user_search"
            placeholder="Search name/email/username…"
            value={search}
            onChange={e => { setPage(1); setSearch(e.target.value) }}
          />
        </div>
        <select
          className="select user_selects"
          value={limit}
          onChange={e => { setPage(1); setLimit(parseInt(e.target.value) || 10) }}
        >
          {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {isAdmin && (
          <button className="btn btn-primary" data-bs-toggle="modal"
            data-bs-target="#create_user" onClick={() => setShowForm(v => !v)}>
            Add User
          </button>
        )}
      </Topbar>
      <div className="page-cand mt-2">
        {/* Optional error banner (like Candidates page) */}
        {error && <div className="alert error" style={{ margin: '8px 0' }}>{error}</div>}

        <div className="modal fade" id="create_user" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create User</h5>
                <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div className="modal-body">
                <form className="row" onSubmit={createUser}>
                  <div className="column">


                    <label htmlFor="uFullName" className="visually-hidden">Full name</label>
                    <input
                      id="uFullName"
                      className="input"
                      placeholder="Full name"
                      required
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      autoComplete="name"
                      autoFocus
                    />

                    <label htmlFor="uUserName" className="visually-hidden">Username</label>
                    <input
                      id="uUserName"
                      className="input"
                      placeholder="Username"
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      autoComplete="username"
                    />

                    <label htmlFor="uEmail" className="visually-hidden">Email</label>
                    <input
                      id="uEmail"
                      className="input"
                      type="email"
                      placeholder="Email"
                      required
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      autoComplete="email"
                    />

                    <label htmlFor="uPassword" className="visually-hidden">Password</label>
                    <input
                      id="uPassword"
                      className="input"
                      type="password"
                      placeholder="Password"
                      required
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      autoComplete="new-password"
                    />

                    <label htmlFor="uRole" className="visually-hidden">Role</label>
                    <select
                      id="uRole"
                      className="input"
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                    >
                      <option value="employee">ZOR -E</option>
                      <option value="admin">ZOR - A</option>
                    </select>
                  </div>

                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" className="btn btn-primary">Create</button>
                  </div>
                </form>
              </div>

            </div>
          </div>
        </div>


        {/* Users List */}
        <div className="card">
          <div className="table-wrap-cand">
            <table className="table-cand">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name / Email</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>



              <tbody>
                {loading ? (
                  <tr><td colSpan={7}>
                    <div className="loader_container">
                      <p className="loader_spinner"></p>
                      <p>Loading Users…</p>
                    </div></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7}>No users</td></tr>
                ) : rows.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>
                      <div>{u.name}</div>
                      <div className="small">{u.email}</div>
                    </td>
                    <td>{u.username || <span className="small">—</span>}</td>
                    <td>
                      <select className="select" value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                        <option value="employee">ZOR - E</option>
                        <option value="admin">ZOR - A</option>
                      </select>
                    </td>
                    <td>
                      <label className="small">
                        <input
                          type="checkbox"
                          checked={!!u.is_active}
                          onChange={() => toggleActive(u.id, u.is_active)}
                        /> active
                      </label>
                    </td>
                    <td className="small">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</td>
                    <td className="row-actions">
                      <button className="button ghost" onClick={() => resetPassword(u.id)}>Reset PW</button>
                      {isAdmin && (
                        <button className="buttondanger" onClick={() => del(u.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 3v1H4v2h16V4h-5V3H9zm-2 6v11a1 1 0 001 1h8a1 1 0 001-1V9H7zm2 2h2v9H9v-9zm4 0h2v9h-2v-9z" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button className="button ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <div className="small">Page {page} / {totalPages || 1}</div>
            <button className="button ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>

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
          <button className="toastx-close" onClick={hideToast} aria-label="Close">×</button>
        </div>
      </div>

    </div>
  )
} 