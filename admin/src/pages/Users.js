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
    department: '',
    position: '',
    password: ''
  })
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false) // React-controlled modal

  // edit user (modal)
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

  const closeEdit = () => {
    setEditingUser(null)
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editingUser) return
    setEditSaving(true)
    try {
      await apiPatchUser(editingUser.id, editForm)
      showToast('User updated successfully', 'success')
      closeEdit()
      await fetchUsers()
    } catch (err) {
      showToast(err?.message || 'Update failed', 'error')
    } finally {
      setEditSaving(false)
    }
  }

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

  // modal controls (React & Bootstrap)
  const closeCreate = () => {
    setShowForm(false)
    const modalEl = document.getElementById('create_user')
    if (modalEl) {
      if (window.bootstrap?.Modal) {
        const inst = window.bootstrap.Modal.getInstance(modalEl)
        if (inst) inst.hide()
      }
      const closeBtn = modalEl.querySelector('[data-bs-dismiss="modal"]')
      if (closeBtn) closeBtn.click()
    }
  }
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
      setForm({ name: '', email: '', username: '', role: 'employee', department: '', position: '', password: '' })
      setShowForm(false);
      closeCreate()
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

        <div className="modal fade" id="create_user" tabIndex="-1" aria-labelledby="createUserModalLabel" aria-hidden="true">
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <form className="modal-content" onSubmit={createUser}>
              <div className="modal-header">
                <h5 className="modal-title" id="createUserModalLabel">Create User</h5>
                <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>

              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label htmlFor="uFullName" className="form-label">Full Name</label>
                    <input
                      id="uFullName"
                      className="form-control"
                      placeholder="Full name"
                      required
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      autoComplete="name"
                      autoFocus
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label htmlFor="uUserName" className="form-label">Username</label>
                    <input
                      id="uUserName"
                      className="form-control"
                      placeholder="Username"
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      autoComplete="username"
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label htmlFor="uEmail" className="form-label">Email</label>
                    <input
                      id="uEmail"
                      className="form-control"
                      type="email"
                      placeholder="Email"
                      required
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      autoComplete="email"
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label htmlFor="uRole" className="form-label">Role</label>
                    <select
                      id="uRole"
                      className="form-select"
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                    >
                      <option value="employee">ZOR - E</option>
                      <option value="admin">ZOR - A</option>
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label htmlFor="uDepartment" className="form-label">Department</label>
                    <input
                      id="uDepartment"
                      className="form-control"
                      placeholder="e.g. IT, Development, HR, Sales"
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

                  <div className="col-12 col-md-6">
                    <label htmlFor="uPosition" className="form-label">Position / Designation</label>
                    <input
                      id="uPosition"
                      className="form-control"
                      placeholder="e.g. Software Engineer, Team Lead"
                      value={form.position}
                      onChange={e => setForm({ ...form, position: e.target.value })}
                    />
                  </div>

                  <div className="col-12">
                    <label htmlFor="uPassword" className="form-label">Password</label>
                    <input
                      id="uPassword"
                      className="form-control"
                      type="password"
                      placeholder="Password"
                      required
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>


        {/* Edit User Modal */}
        {editingUser && (
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1" aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
              <form className="modal-content" onSubmit={saveEdit}>
                <div className="modal-header">
                  <h5 className="modal-title">Edit User (#{editingUser.id})</h5>
                  <button type="button" className="btn-close" onClick={closeEdit} aria-label="Close"></button>
                </div>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="form-label">Full Name</label>
                      <input
                        className="form-control"
                        required
                        value={editForm.name}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label">Username</label>
                      <input
                        className="form-control"
                        value={editForm.username}
                        onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label">Email</label>
                      <input
                        type="email"
                        className="form-control"
                        required
                        value={editForm.email}
                        onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label">Role</label>
                      <select
                        className="form-select"
                        value={editForm.role}
                        onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                      >
                        <option value="employee">ZOR - E (Employee)</option>
                        <option value="admin">ZOR - A (Admin)</option>
                      </select>
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label">Department</label>
                      <input
                        className="form-control"
                        placeholder="e.g. IT, Development, HR, Sales"
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
                    <div className="col-12 col-md-6">
                      <label className="form-label">Position / Designation</label>
                      <input
                        className="form-control"
                        placeholder="e.g. Software Engineer, Team Lead"
                        value={editForm.position}
                        onChange={e => setEditForm({ ...editForm, position: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeEdit}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={editSaving}>
                    {editSaving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Users List */}
        <div className="table-wrap-cand">
          <table className="table-cand">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name / Email</th>
                <th>Username</th>
                <th>Department & Designation</th>
                <th>Role</th>
                <th>Active</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr><td colSpan={8}>
                  <div className="loader_container">
                    <p className="loader_spinner"></p>
                    <p>Loading Users…</p>
                  </div></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8}>No users</td></tr>
              ) : rows.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{u.name}</span>
                      <span
                        title={`Presence: ${u.effective_status || 'Offline'}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '1px 7px',
                          borderRadius: '999px',
                          background: u.is_online ? '#f0fdf4' : '#f1f5f9',
                          color:
                            u.effective_status === 'Available' ? '#15803d' :
                              u.effective_status === 'Away' ? '#b45309' :
                                u.effective_status === 'Busy' || u.effective_status === 'Do not disturb' ? '#b91c1c' :
                                  '#64748b',
                          border: '1px solid rgba(15, 23, 42, 0.08)'
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background:
                              u.effective_status === 'Available' ? '#36b37e' :
                                u.effective_status === 'Away' ? '#ffab00' :
                                  u.effective_status === 'Busy' ? '#ff5630' :
                                    u.effective_status === 'Do not disturb' ? '#bf2600' :
                                      '#94a3b8'
                          }}
                        />
                        {u.effective_status || 'Offline'}
                      </span>
                    </div>
                    <div className="small text-muted">{u.email}</div>
                  </td>
                  <td>{u.username || <span className="small text-muted">—</span>}</td>
                  <td>
                    {u.department ? (
                      <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', marginRight: 6 }}>
                        {u.department}
                      </span>
                    ) : null}
                    <div className="small" style={{ color: '#475569', marginTop: u.department ? 3 : 0 }}>
                      {u.position || (!u.department ? <span className="small text-muted">—</span> : '')}
                    </div>
                  </td>
                  <td>
                    <select className="select" value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                      <option value="employee">ZOR - E</option>
                      <option value="admin">ZOR - A</option>
                    </select>
                  </td>
                  <td>
                    <label className="small" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={!!u.is_active}
                        onChange={() => toggleActive(u.id, u.is_active)}
                      /> active
                    </label>
                  </td>
                  <td className="small">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</td>
                  <td className="row-actions">
                    <button className="button ghost" onClick={() => openEdit(u)} title="Edit user details"> <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z"
                        fill="currentColor"
                      />
                    </svg></button>
                    <button className="button ghost" onClick={() => resetPassword(u.id)}>Reset PW</button>
                    {isAdmin && (
                      <button className="buttondanger" onClick={() => del(u.id)} title="Delete user">
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