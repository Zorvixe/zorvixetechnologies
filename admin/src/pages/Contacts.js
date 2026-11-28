import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { apiListContacts, apiUpdateContact, apiDeleteContact, apiExportContactsCsv, apiCreateDeal, apiAiContactAssist } from '../api'
import AiInsightBox from '../components/AiInsightBox'
import RichTextEditor from '../components/RichTextEditor'
import { SparklesIcon } from '../components/CrmHrmsIcons'
import { useAuth } from '../auth'
import { showToast } from '../utils/toast'

import "./Contacts.css"

export default function Contacts() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const navigate = useNavigate()

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

  // AI Contact Assist
  const [contactAiOpen, setContactAiOpen] = useState(false)
  const [contactAiLoading, setContactAiLoading] = useState(false)
  const [contactAiErr, setContactAiErr] = useState('')
  const [contactAiData, setContactAiData] = useState(null)
  const [aiContact, setAiContact] = useState(null)

  const runContactAi = async (contact) => {
    setAiContact(contact)
    setContactAiOpen(true)
    setContactAiLoading(true)
    setContactAiErr('')
    try {
      const res = await apiAiContactAssist(contact.id)
      setContactAiData(res)
    } catch (err) {
      setContactAiErr(err?.message || 'Failed to analyze inquiry')
    } finally {
      setContactAiLoading(false)
    }
  }

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

  const convertToDeal = async (contact) => {
    try {
      await apiCreateDeal({
        title: `Opportunity: ${contact.subject || contact.name}`,
        contact_id: contact.id,
        value: 100000,
        stage: 'lead',
        description: `Inquiry from ${contact.name} (${contact.email}, ${contact.phone}): ${contact.message}`
      });
      showToast('Contact inquiry converted to a CRM Deal!', 'success');
      navigate('/crm');
    } catch (err) {
      showToast(err.message || 'Failed to create deal', 'error');
    }
  }

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
      showToast(e.message || 'Export failed', 'error')
    }
  }

  return (
    <div className="contacts-page">
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
        {contactAiOpen && (
          <AiInsightBox
            title={aiContact ? `ZORVI Contact Brief: ${aiContact.name}` : 'ZORVI Contact Brief'}
            loading={contactAiLoading}
            error={contactAiErr}
            uncertainty={contactAiData?.uncertainty}
            providerMeta={contactAiData?.meta}
            onRefresh={() => aiContact && runContactAi(aiContact)}
            onClose={() => setContactAiOpen(false)}
          >
            {contactAiData && (
              <div>
                <p style={{ margin: '0 0 6px' }}>{contactAiData.summary}</p>
                <div className="zx-ai-tags">
                  <span className={`zx-ai-tag ${contactAiData.urgency}`}>Urgency: {contactAiData.urgency}</span>
                </div>
                {contactAiData.followUpActions?.length > 0 && (
                  <ul className="zx-ai-list" style={{ fontSize: '12px', marginTop: '6px' }}>
                    {contactAiData.followUpActions.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
                {contactAiData.draftReply && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>Suggested Draft Reply (Copy / Review Before Sending):</div>
                    <RichTextEditor
                      readOnly
                      compact
                      disableAiAssist
                      minHeight="100px"
                      maxHeight="200px"
                      value={contactAiData.draftReply}
                    />
                  </div>
                )}
              </div>
            )}
          </AiInsightBox>
        )}
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
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="button ghost"
                        style={{ padding: '4px 8px', fontSize: '0.74rem', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => runContactAi(r)}
                        title="ZORVI Summary & Follow-up Draft"
                      >
                        <SparklesIcon size={12} color="#4c3fb6" /> ZORVI
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            className="button ghost"
                            style={{ padding: '4px 8px', fontSize: '0.74rem', height: 'auto', fontWeight: 700 }}
                            onClick={() => convertToDeal(r)}
                            title="Convert to CRM Deal"
                          >
                            + Deal
                          </button>
                          <button className="buttondanger" onClick={() => del(r.id)} title="Delete Contact">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 3v1H4v2h16V4h-5V3H9zm-2 6v11a1 1 0 001 1h8a1 1 0 001-1V9H7zm2 2h2v9H9v-9zm4 0h2v9h-2v-9z" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
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
