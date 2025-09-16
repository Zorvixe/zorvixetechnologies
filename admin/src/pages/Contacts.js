import React, { useEffect, useMemo, useState } from 'react'
import Topbar from '../components/Topbar'
import { apiListContacts, apiUpdateContact, apiDeleteContact, apiExportContactsCsv } from '../api'
import { useAuth } from '../auth'

import "./Contacts.css"

export default function Contacts() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [rows, setRows] = useState([])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [order, setOrder] = useState('DESC')
  const [sort, setSort] = useState('created_at')
  const totalPages = useMemo(() => Math.ceil((total || 0) / (limit || 1)), [total, limit])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data, total: t } = await apiListContacts({ page, limit, search, status, sort, order })
      setRows(data); setTotal(t)
    } finally { setLoading(false) }
  }
  useEffect(() => { fetchData() }, [page, limit, search, status, sort, order])

  const updateStatus = async (id, newStatus) => { await apiUpdateContact(id, { status: newStatus }); fetchData() }
  const del = async (id) => { if (!window.confirm('Delete this contact?')) return; await apiDeleteContact(id); fetchData() }

  const exportCsv = async () => {
    try {
      const blob = await apiExportContactsCsv({ search, status })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contacts-${Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      window.alert(e.message || 'Export failed')
    }
  }

  return (
    <div>
      <Topbar title="Contacts">
        <div className='contacts_topbar'>

          <div>
            <select className="select top_bar_selects" value={status} onChange={e => { setPage(1); setStatus(e.target.value) }}>
              <option value="">All</option>
              <option value="new">new</option>
              <option value="viewed">viewed</option>
              <option value="responded">responded</option>
              <option value="closed">closed</option>
            </select>
            <select className="select top_bar_selects" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="created_at">Created</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="status">Status</option>
            </select>
            <select className="select top_bar_selects" value={order} onChange={e => setOrder(e.target.value)}>
              <option value="DESC">Desc</option>
              <option value="ASC">Asc</option>
            </select>
            {isAdmin && <button className="button ghost" onClick={exportCsv}>Export CSV</button>}
          </div>
        </div>
      </Topbar>

      <div className="card">
        <div className="small" style={{ marginBottom: 8 }}>Total: {total}</div>
        <div className="table-wrap-cand">
          <table className="table-cand">
            <thead>
              <tr>
                <th>ID</th><th>Created</th><th>Name / Email / Phone</th><th>Subject</th><th>Message</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7">
                  <div className="loader_container">
                    <p className="loader_spinner"></p>
                    <p>Loading Contacts…</p>
                  </div>
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="7">No records</td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div className="small">{r.email} · {r.phone}</div>
                  </td>
                  <td>{r.subject}</td>
                  <td style={{ maxWidth: 360 }} className="small">{r.message}</td>
                  <td>
                    <select className="select" value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)}>
                      <option>new</option>
                      <option>viewed</option>
                      <option>responded</option>
                      <option>closed</option>
                    </select>
                  </td>
                  <td className="row-actions">
                    {isAdmin ? (
                      <button className="buttondanger" onClick={() => del(r.id)}> <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 3v1H4v2h16V4h-5V3H9zm-2 6v11a1 1 0 001 1h8a1 1 0 001-1V9H7zm2 2h2v9H9v-9zm4 0h2v9h-2v-9z" />
                      </svg></button>
                    ) : <span className="small">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button className="button ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <div className="small">Page {page} / {totalPages || 1}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="small">Per page</span>
            <select className="select" value={limit} onChange={e => { setPage(1); setLimit(parseInt(e.target.value) || 10) }}>
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="button ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  )
}
