"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Topbar from "../components/Topbar"
import {
  apiListClients,
  apiListClientProjects,
  apiListPaymentLinks,
  apiDeletePaymentLink,
  apiTogglePaymentLink, // project-wide enable/disable (kept)
  apiMe,
  // ✅ new imports that use the request() wrapper (Bearer token)
  apiUpdatePaymentLinkMeta,
  apiRegeneratePaymentLink,
  apiListLinkSubmissions,
  apiCreatePaymentLinkWithMeta,
  downloadPaymentReceipt,

} from "../api"




// ---- Helpers ----
function maskUrl(url = "") {
  try {
    const u = new URL(url)
    const host = u.host
    let path = (u.pathname || "/").replace(/\/+$/, "") || "/"
    if (path.length <= 10) return `${host}${path}`
    const start = path.slice(0, 6)
    const end = path.slice(-6)
    return `${host}${start}…${end}`
  } catch {
    return url.length > 24 ? `${url.slice(0, 12)}…${url.slice(-8)}` : url
  }
}

function toInputDateTime(value) {
  if (!value) return ""
  const d = new Date(value)
  const pad = (n) => String(n).padStart(2, "0")
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

export default function Payments() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)

  // Clients cache for the create modal
  const [clients, setClients] = useState([])

  // Projects with links
  const [rows, setRows] = useState([]) // [{ client, project, linksByKind }]
  const [linksLoadingId, setLinksLoadingId] = useState(null)

  // Project links modal
  const [view, setView] = useState(null) // { client, project, linksByKind }
  const modalTimer = useRef(null)

  // Link details modal (submissions)
  const [linkDetails, setLinkDetails] = useState(null) // { link, submissions, loading }

  // Create-link modal
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createProjects, setCreateProjects] = useState([])
  const [createProjectMeta, setCreateProjectMeta] = useState(null)
  const [createForm, setCreateForm] = useState({
    clientId: "",
    projectId: "",
    kind: "project",
    amount: "",
    expires_at: "",
  })

  // Toast
  const toastTimer = useRef(null)
  const [toast, setToast] = useState({ open: false, type: "success", message: "" })
  const showToast = (message, type = "success") => {
    setToast({ open: true, type, message })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000)
  }

  useEffect(() => {
    ; (async () => {
      try {
        const me = await apiMe()
        const role = (me.me?.role || me.user?.role || "").toLowerCase()
        setIsAdmin(role === "admin")

        const cRes = await apiListClients()
        const clientList = cRes.clients || []
        setClients(clientList)

        const rowsAcc = []
        for (const c of clientList) {
          const pRes = await apiListClientProjects(c.id)
          const projects = pRes.projects || []
          for (const p of projects) {
            const allowed = role === "admin" || p?.my_perms?.can_manage_payments
            if (!allowed) continue

            const linksRes = await apiListPaymentLinks(p.id)
            const links = linksRes.links || []

            const byKind = { project: [], registration: [] }
            links.forEach((item) => {
              const norm = {
                id: item.id,
                url: item.url || item.link,
                token: item.token,
                active: !!item.active,
                kind: (item.payment_kind || item.kind || "project").toLowerCase(),
                created_at: item.created_at,
                expires_at: item.expires_at,
                amount: item.amount ?? null,
                status: item.status || null,
              }
              byKind[norm.kind === "registration" ? "registration" : "project"].push(norm)
            })

            rowsAcc.push({ client: c, project: p, linksByKind: byKind })
          }
        }
        setRows(rowsAcc)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      if (modalTimer.current) clearTimeout(modalTimer.current)
    }
  }, [])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      const key = row.client.id
      if (!map.has(key)) map.set(key, { client: row.client, projects: [] })
      map.get(key).projects.push(row)
    }
    return Array.from(map.values())
  }, [rows])

  async function refreshProjectLinks(targetRow) {
    if (!targetRow) return
    try {
      setLinksLoadingId(targetRow.project.id)
      const linksRes = await apiListPaymentLinks(targetRow.project.id)
      const links = linksRes.links || []
      const byKind = { project: [], registration: [] }
      links.forEach((item) => {
        const norm = {
          id: item.id,
          url: item.url || item.link,
          token: item.token,
          active: !!item.active,
          kind: (item.payment_kind || item.kind || "project").toLowerCase(),
          created_at: item.created_at,
          expires_at: item.expires_at,
          amount: item.amount ?? null,
          status: item.status || null,
        }
        byKind[norm.kind === "registration" ? "registration" : "project"].push(norm)
      })

      setRows((prev) =>
        prev.map((r) =>
          r.project.id === targetRow.project.id ? { ...r, linksByKind: byKind } : r
        )
      )
      setView((prev) => (prev && prev.project.id === targetRow.project.id ? { ...prev, linksByKind: byKind } : prev))
    } catch (e) {
      showToast(e.message, "error")
    } finally {
      setLinksLoadingId(null)
    }
  }

  async function handleDownloadReceipt(id) {
    try {
      const { blob, filename } = await downloadPaymentReceipt(id); // <-- use filename from API
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `payment-receipt-${id}`; // no hardcoded .pdf
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  }



  async function createLink(project, kind) {
    // legacy quick-create (no modal)
    try {
      await apiCreatePaymentLinkWithMeta(project.id, { kind, amount: null })
      showToast("Payment link created", "success")
      await refreshProjectLinks({ project })
    } catch (e) {
      showToast(e.message, "error")
    }
  }

  // Per-link enable/disable
  async function toggleOneLink(link, active) {
    try {
      await apiUpdatePaymentLinkMeta(link.id, { active })
      showToast(active ? "Link enabled" : "Link disabled", "success")
      if (view) await refreshProjectLinks(view)
    } catch (e) {
      showToast(e.message, "error")
    }
  }

  // Per-link save amount/expiry
  async function saveMeta(link, edited) {
    try {
      const patch = {}
      if (edited.amount !== undefined) patch.amount = Number(edited.amount) || 0
      if (edited.expires_at !== undefined && edited.expires_at) {
        patch.expires_at = new Date(edited.expires_at).toISOString()
      }
      await apiUpdatePaymentLinkMeta(link.id, patch)
      showToast("Link updated", "success")
      if (view) await refreshProjectLinks(view)
    } catch (e) {
      showToast(e.message, "error")
    }
  }

  // Regenerate (reactivate + new expiry)
  async function regenerate(link) {
    try {
      await apiRegeneratePaymentLink(link.id)
      showToast("Link regenerated", "success")
      if (view) await refreshProjectLinks(view)
    } catch (e) {
      showToast(e.message, "error")
    }
  }

  // Open link details (submissions & files)
  async function openLinkDetails(link) {
    try {
      setLinkDetails({ link, submissions: [], loading: true })
      const data = await apiListLinkSubmissions(link.id)
      setLinkDetails({ link, submissions: data.submissions || [], loading: false })
    } catch (e) {
      setLinkDetails({ link, submissions: [], loading: false })
      showToast(e.message, "error")
    }
  }

  // ---------- Create-link modal helpers ----------
  async function loadCreateProjects(clientId) {
    setCreateProjects([])
    setCreateProjectMeta(null)
    setCreateForm((f) => ({ ...f, projectId: "" }))
    if (!clientId) return
    try {
      const res = await apiListClientProjects(clientId)
      const projects = (res.projects || []).filter(
        (p) => isAdmin || p?.my_perms?.can_manage_payments
      )
      setCreateProjects(projects)
    } catch (e) {
      showToast(e.message, "error")
    }
  }

  function onChangeCreate(field, value) {
    setCreateForm((f) => ({ ...f, [field]: value }))
    if (field === "clientId") {
      loadCreateProjects(Number(value))
    }
    if (field === "projectId") {
      const p = createProjects.find((x) => String(x.id) === String(value))
      if (p) {
        setCreateProjectMeta({
          projectName: p.name,
          projectCode: p.code,
          projectType: p.type === "other" && p.other_type ? `other / ${p.other_type}` : p.type,
        })
      } else {
        setCreateProjectMeta(null)
      }
    }
  }

  async function submitCreate() {
    const { clientId, projectId, kind, amount, expires_at } = createForm
    if (!clientId || !projectId || !kind) return showToast("Please select client, project and kind", "error")
    const amt = Number(amount)
    if (!(amt > 0)) return showToast("Enter a valid amount (> 0)", "error")
    if (!expires_at) return showToast("Please select an expiry", "error")

    try {
      setCreateLoading(true)
      const createRes = await apiCreatePaymentLinkWithMeta(Number(projectId), { kind, amount: amt })
      const token = createRes?.token

      await refreshProjectLinks({ project: { id: Number(projectId) } })

      if (token && expires_at) {
        const linksRes = await apiListPaymentLinks(Number(projectId))
        const found = (linksRes.links || []).find((l) => l.token === token)
        if (found) {
          await apiUpdatePaymentLinkMeta(found.id, { expires_at: new Date(expires_at).toISOString() })
        }
      }

      await refreshProjectLinks({ project: { id: Number(projectId) } })
      setCreateOpen(false)
      setCreateForm({ clientId: "", projectId: "", kind: "project", amount: "", expires_at: "" })
      setCreateProjects([])
      setCreateProjectMeta(null)
      showToast("Payment link created", "success")
    } catch (e) {
      showToast(e.message, "error")
    } finally {
      setCreateLoading(false)
    }
  }

  if (loading) return <div className="loader_container">
    <p className="loader_spinner"></p>
    <p>Loading Payments…</p>
  </div>
  if (error) return <div className="center error">{error}</div>

  if (!rows.length) {
    return (
      <div>
        <Topbar title="Payments">
          {isAdmin && (
            <button className="primary" onClick={() => setCreateOpen(true)}>New payment link</button>
          )}
        </Topbar>
        <div className="card">
          <div className="center muted">No payment links you can view. (Either you don’t have access or no links exist yet.)</div>
        </div>

        {createOpen && (
          <CreateLinkModal
            open
            onClose={() => setCreateOpen(false)}
            clients={clients}
            projects={createProjects}
            form={createForm}
            onChange={onChangeCreate}
            projectMeta={createProjectMeta}
            submitting={createLoading}
            onSubmit={submitCreate}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <Topbar title="Payments">
        {isAdmin && (
          <button className="primary" onClick={() => setCreateOpen(true)}>New payment link</button>
        )}
      </Topbar>

      {grouped.map(({ client, projects }) => (
        <div className="card" key={client.id} style={{ marginBottom: 16 }}>
          <div className="table-wrap-cand">
            <div className="table-title">
              <strong>Client:</strong> {client.name} <span className="muted small">({client.email})</span>
            </div>

            <table className="table-cand">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Links</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((row) => (
                  <tr key={row.project.id}>
                    <td>{row.project.name}</td>
                    <td className="small muted">{row.project.code}</td>
                    <td>
                      {row.project.type}
                      {row.project.type === "other" && row.project.other_type ? ` / ${row.project.other_type}` : ""}
                    </td>
                    <td>
                      <div className="small">
                        <strong>Project:</strong> {row.linksByKind.project.length}&nbsp;|&nbsp;
                        <strong>Registration:</strong> {row.linksByKind.registration.length}
                      </div>
                    </td>
                    <td className="row-actions">
                      <button
                        className="buttoneye"
                        title="View links"
                        aria-label="View links"
                        onClick={() => setView(row)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 5c-7.633 0-11 7-11 7s3.367 7 11 7 11-7 11-7-3.367-7-11-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z" />
                        </svg>
                      </button>
                      <button
                        className="button ghost"
                        title="Refresh links"
                        onClick={() => refreshProjectLinks(row)}
                        disabled={linksLoadingId === row.project.id}
                      >
                        {linksLoadingId === row.project.id ? "Refreshing…" : "Refresh"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        </div>
      ))}

      {/* Project's Links Modal */}
      {view && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {view.client.name} — {view.project.name} (Links)
                </h5>
                <button type="button" className="btn-close" onClick={() => setView(null)} />
              </div>

              <div className="modal-body">
                {(isAdmin || view.project?.my_perms?.can_manage_payments) ? (
                  <>
                    <div className="payment_row">
                      <div className="payment_buttons" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="primary" onClick={() => createLink(view.project, "project")}>Create Project Link</button>
                        <button className="primary" onClick={() => createLink(view.project, "registration")}>Create Registration Link</button>
                        <button className="secondary" onClick={() => apiTogglePaymentLink(view.project.id, true).then(() => refreshProjectLinks(view))}>Enable all</button>
                        <button className="secondary" onClick={() => apiTogglePaymentLink(view.project.id, false).then(() => refreshProjectLinks(view))}>Disable all</button>
                      </div>
                    </div>
                    <div className="muted small" style={{ marginTop: 6 }}>
                      Set <b>Amount</b> & <b>Expiry</b> per link. Use <b>Regenerate</b> to reactivate an expired/disabled link.
                    </div>
                  </>
                ) : (
                  <div className="muted">You don’t have permission to modify links for this project.</div>
                )}

                <hr />

                {/* Two columns: project & registration links */}
                <div className="links-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {/* Project Links */}
                  <div>
                    <h5 style={{ margin: "0 0 8px" }}>Project Links</h5>
                    <LinkList
                      kindLabel="project"
                      items={view.linksByKind.project}
                      canEdit={isAdmin || view.project?.my_perms?.can_manage_payments}
                      onCopy={(url) => { navigator.clipboard.writeText(url); showToast("Link copied") }}
                      onDelete={async (id) => {
                        if (!window.confirm("Delete this link?")) return
                        try { await apiDeletePaymentLink(id); await refreshProjectLinks(view); showToast("Link deleted") }
                        catch (e) { showToast(e.message, "error") }
                      }}
                      onToggle={toggleOneLink}
                      onSaveMeta={saveMeta}
                      onRegenerate={regenerate}
                      onOpenDetails={openLinkDetails}
                    />
                  </div>

                  {/* Registration Links */}
                  <div>
                    <h5 style={{ margin: "0 0 8px" }}>Registration Links</h5>
                    <LinkList
                      kindLabel="registration"
                      items={view.linksByKind.registration}
                      canEdit={isAdmin || view.project?.my_perms?.can_manage_payments}
                      onCopy={(url) => { navigator.clipboard.writeText(url); showToast("Link copied") }}
                      onDelete={async (id) => {
                        if (!window.confirm("Delete this link?")) return
                        try { await apiDeletePaymentLink(id); await refreshProjectLinks(view); showToast("Link deleted") }
                        catch (e) { showToast(e.message, "error") }
                      }}
                      onToggle={toggleOneLink}
                      onSaveMeta={saveMeta}
                      onRegenerate={regenerate}
                      onOpenDetails={openLinkDetails}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setView(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Details (submissions) */}
      {linkDetails && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Link Details</h5>
                <button type="button" className="btn-close" onClick={() => setLinkDetails(null)} />
              </div>
              <div className="modal-body">
                <div className="small muted" style={{ marginBottom: 8 }}>
                  <b>URL:</b> {maskUrl(linkDetails.link.url)} &nbsp;|&nbsp;
                  <b>Status:</b>{" "}
                  {!linkDetails.link.active ? "Disabled" :
                    (linkDetails.link.expires_at && new Date(linkDetails.link.expires_at) < new Date()) ? "Expired" : "Active"}
                </div>

                {linkDetails.loading ? (
                  <div className="loader_container">
                    <p className="loader_spinner"></p>
                    <p>Loading Submissions…</p>
                  </div>
                ) : !linkDetails.submissions.length ? (
                  <div className="muted">No submissions yet.</div>
                ) : (
                  <div className="table-wrap-cand">
                    <table className="table-cand">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Files</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linkDetails.submissions.map((s) => {
                          const files = s.files || s.receipts || (s.receipt_url ? [s.receipt_url] : [])
                          return (
                            <tr key={s.id || s._id}>
                              <td>{new Date(s.created_at || s.createdAt).toLocaleString()}</td>
                              <td>Rs. {Number(s.amount || 0).toLocaleString()}</td>
                              <td>
                                <span className={`badge ${String(s.status || "pending").toLowerCase()}`}>
                                  {String(s.status || "pending")}
                                </span>
                              </td>
                              <td>
                                {!files?.length ? (
                                  <span className="small muted">—</span>
                                ) : (
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {/* Keep public link(s) to open/preview if you like */}
                                    {files.map((url, idx) => (
                                      <a
                                        key={idx}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        download
                                        className="button ghost"
                                        title="Open file"
                                      >
                                        Open {idx + 1}
                                      </a>
                                    ))}

                                    {/* Secure, admin-only download (streams via /api/admin/payment-registrations/:id/receipt) */}
                                    {isAdmin && (
                                      <button
                                        className="button ghost"
                                        onClick={() => handleDownloadReceipt(s.id)}
                                        title="Admin download"
                                      >
                                        Admin download
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>

                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setLinkDetails(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create-link modal */}
      {createOpen && (
        <CreateLinkModal
          open
          onClose={() => setCreateOpen(false)}
          clients={clients}
          projects={createProjects}
          form={createForm}
          onChange={onChangeCreate}
          projectMeta={createProjectMeta}
          submitting={createLoading}
          onSubmit={submitCreate}
        />
      )}

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
        <button className="toastx-close" onClick={() => setToast((t) => ({ ...t, open: false }))} aria-label="Close">×</button>
      </div>

      {/* Toast */}

    </div>
  )
}

/** Create-link modal component */
function CreateLinkModal({
  open,
  onClose,
  clients,
  projects,
  form,
  onChange,
  projectMeta,
  submitting,
  onSubmit,
}) {
  if (!open) return null
  return (
    <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Create Payment Link</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="muted small">Client</label>
                <select
                  className="input"
                  value={form.clientId}
                  onChange={(e) => onChange("clientId", e.target.value)}
                >
                  <option value="">Select client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="muted small">Project</label>
                <select
                  className="input"
                  value={form.projectId}
                  onChange={(e) => onChange("projectId", e.target.value)}
                  disabled={!form.clientId}
                >
                  <option value="">Select project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {p.code}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="muted small">Payment kind</label>
                <select
                  className="input"
                  value={form.kind}
                  onChange={(e) => onChange("kind", e.target.value)}
                >
                  <option value="project">Project</option>
                  <option value="registration">Registration</option>
                </select>
              </div>

              <div>
                <label className="muted small">Amount (Rs.)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={form.amount}
                  onChange={(e) => onChange("amount", e.target.value)}
                  placeholder="e.g. 5001"
                />
              </div>

              <div>
                <label className="muted small">Expiry</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => onChange("expires_at", e.target.value)}
                />
              </div>
            </div>

            {/* Project summary */}
            {projectMeta && (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-content">
                  <div className="small muted" style={{ marginBottom: 6 }}>Project details</div>
                  <div className="details-grid-improved" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div><strong>Name:</strong> {projectMeta.projectName}</div>
                    <div><strong>Code:</strong> {projectMeta.projectCode}</div>
                    <div><strong>Type:</strong> {projectMeta.projectType}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="muted small" style={{ marginTop: 8 }}>
              The link will be created for the selected project. Amount and expiry are stored per-link.
            </div>
          </div>
          <div className="modal-footer">
            <button className="button ghost" onClick={onClose} disabled={submitting}>Cancel</button>
            <button className="primary" onClick={onSubmit} disabled={submitting}>
              {submitting ? "Creating…" : "Create link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Small subcomponent to render & edit a list of links of one kind */
/** Small subcomponent to render & edit a list of links of one kind (Link ID only + separator line) */
function LinkList({
  kindLabel,
  items,
  canEdit,
  onCopy,
  onDelete,
  onToggle,
  onSaveMeta,
  onRegenerate,
  onOpenDetails,
}) {
  const [drafts, setDrafts] = useState({}) // { [linkId]: { amount, expires_at } }

  return (
    <div className="link-list">
      {!items.length ? (
        <div className="muted">No {kindLabel} links.</div>
      ) : (
        items.map((l) => {
          const draft = drafts[l.id] || {
            amount: l.amount ?? "",
            expires_at: toInputDateTime(l.expires_at),
          }
          const expired = l.expires_at && new Date(l.expires_at) < new Date()
          const status = !l.active ? "Disabled" : expired ? "Expired" : "Active"

          return (
            <div key={l.id} style={{ marginBottom: 10 }}>
              {/* Top row: Link ID + status + actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div><strong>Link ID:</strong> {l.id}</div>
                  <span className={`badge ${status.toLowerCase()}`}>{status}</span>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="secondary" title="Copy full URL" onClick={() => onCopy(l.url)}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>


                  </button>

                  <button className="buttoneye" title="View submissions" onClick={() => onOpenDetails(l)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 5c-7.633 0-11 7-11 7s3.367 7 11 7 11-7 11-7-3.367-7-11-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z" />
                    </svg>
                  </button>

                  {canEdit && (
                    <>
                      <button className="button ghost" onClick={() => onToggle(l, !l.active)}>
                        {l.active ? "Disable" : "Enable"}
                      </button>
                      <button className="button ghost" onClick={() => onRegenerate(l)}>Regenerate</button>
                      <button className="buttondanger" onClick={() => onDelete(l.id)}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 3v1H4v2h16V4h-5V3H9zm-2 6v11a1 1 0 001 1h8a1 1 0 001-1V9H7zm2 2h2v9H9v-9zm4 0h2v9h-2v-9z" />
                      </svg></button>
                    </>
                  )}
                </div>
              </div>

              {/* Editor (unchanged) */}
              {canEdit && (
                <div style={{ display: "grid", gridTemplateColumns: "160px 220px auto", gap: 8, marginTop: 6 }}>
                  <div className="small">
                    <div className="muted">Amount (Rs.)</div>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={draft.amount}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [l.id]: { ...draft, amount: e.target.value } }))
                      }
                    />
                  </div>

                  <div className="small">
                    <div className="muted">Expiry</div>
                    <input
                      className="input"
                      type="datetime-local"
                      value={draft.expires_at}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [l.id]: { ...draft, expires_at: e.target.value } }))
                      }
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
                    <button className="primary" onClick={() => onSaveMeta(l, drafts[l.id] || {})}>Save</button>
                  </div>
                </div>
              )}

              {/* separator line after each link */}
              <div style={{ height: 1, background: "var(--border, #eee)", marginTop: 10 }} />
            </div>
          )
        })
      )}
    </div>
  )
}

