"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import Topbar from "../components/Topbar"
import {
  apiListClients,
  apiCreateClient,
  apiListClientProjects,
  apiCreateProject,
  apiPatchProject,
  apiDeleteProject,
  apiListProjectMembers,
  apiAddProjectMember,
  apiPatchProjectMember,
  apiRemoveProjectMember,
  apiListUsers,
  apiPatchClient,
  apiDeleteClient,
  apiMe,
} from "../api"

import ProjectComments from "../components/ProjectComments"

import "./Clients.css"

export default function Clients() {
  const [isAdmin, setIsAdmin] = useState(false)

  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [epForm, setEpForm] = useState({
    id: null,
    name: "",
    status: "new",
    type: "web_development",
    other_type: "",
    description: "",
  });

  // Open edit modal from Project Details
  function openEditFromProjectView(p) {
    setEpForm({
      id: p.id,
      name: p.name || "",
      status: p.status || "new",
      type: p.type || "web_development",
      other_type: p.other_type || "",
      description: p.description || "",
    });
    setShowEditProjectModal(true);
  }

  // Save edits (includes type & description)
  async function saveProjectEdit(e) {
    e.preventDefault();
    try {
      const payload = {
        name: epForm.name,
        status: epForm.status,
        type: epForm.type,
        other_type: epForm.type === "other" ? (epForm.other_type || null) : null,
        description: epForm.description,
      };
      const r = await apiPatchProject(epForm.id, payload);
      setProjects(prev => prev.map(x => x.id === epForm.id ? { ...x, ...r.project } : x));
      setViewProject(prev => (prev && prev.id === epForm.id ? { ...prev, ...r.project } : prev));
      setShowEditProjectModal(false);
      showToast("Project updated", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // Clients pagination
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10
  const totalPages = Math.max(1, Math.ceil(clients.length / PAGE_SIZE))
  const pagedClients = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return clients.slice(start, start + PAGE_SIZE)
  }, [clients, page])

  // Create/edit client
  const [showCreateClient, setShowCreateClient] = useState(false)
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", company: "" })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", company: "" })

  // Selected client & projects
  const [selected, setSelected] = useState(null)
  const [projects, setProjects] = useState([])
  const [projLoading, setProjLoading] = useState(false)

  // Inline project edit
  const [projEditId, setProjEditId] = useState(null)
  const [projEditForm, setProjEditForm] = useState({ name: "", status: "new" })

  // New project (modal)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [np, setNp] = useState({ name: "", description: "", type: "web_development", other_type: "" })
  const showOther = np.type === "other"

  // Project details modal (view-only meta; no payments here)
  const [viewProject, setViewProject] = useState(null)

  // Members cache & access manager
  const [membersByProject, setMembersByProject] = useState({})
  const [users, setUsers] = useState([])
  const [memberLoading, setMemberLoading] = useState(false)
  const [accessProject, setAccessProject] = useState(null)
  const [addingMember, setAddingMember] = useState({ user_id: "", can_edit: false, can_manage_payments: false })

  // Toast
  const toastTimer = useRef(null)
  const [toast, setToast] = useState({ open: false, type: "success", message: "" })
  const showToast = (message, type = "success") => {
    setToast({ open: true, type, message })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000)
  }
  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast((t) => ({ ...t, open: false }))
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // Initial load
  useEffect(() => {
    ; (async () => {
      try {
        const r = await apiListClients()
        setClients(r.clients || [])
        const me = await apiMe()
        const role = (me.me?.role || me.user?.role || "").toLowerCase()
        setIsAdmin(role === "admin")
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Keep pagination valid
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [clients, page, totalPages])

  // Helpers
  async function refreshProjects(client) {
    if (!client) return
    setProjLoading(true)
    try {
      const r = await apiListClientProjects(client.id)
      setProjects(r.projects || [])
    } catch (e) {
      showToast(e.message, "error")
    } finally {
      setProjLoading(false)
    }
  }

  async function openClient(c) {
    setSelected(c)
    await refreshProjects(c)
    setMemberLoading(true)
    try {
      const u = await apiListUsers({ limit: 200 })
      setUsers(u.data || [])
    } catch {
      /* no-op */
    } finally {
      setMemberLoading(false)
    }
  }

  // Client CRUD
  async function createClient(e) {
    e.preventDefault()
    try {
      const r = await apiCreateClient(newClient)
      setClients((prev) => [r.client, ...prev])
      setNewClient({ name: "", email: "", phone: "", company: "" })
      setShowCreateClient(false)
      setPage(1)
      showToast("Client created", "success")
    } catch (e) { showToast(e.message, "error") }
  }

  function startEdit(c) {
    setEditingId(c.id)
    setEditForm({ name: c.name || "", email: c.email || "", phone: c.phone || "", company: c.company || "" })
  }
  async function saveEdit(id) {
    try {
      const r = await apiPatchClient(id, editForm)
      setClients((prev) => prev.map((x) => (x.id === id ? { ...x, ...r.client } : x)))
      setEditingId(null)
      showToast("Client updated", "success")
    } catch (e) { showToast(e.message, "error") }
  }

  async function delClient(id) {
    if (!window.confirm("Delete this client and ALL its projects?")) return
    try {
      await apiDeleteClient(id)
      setClients((prev) => prev.filter((c) => c.id !== id))
      if (selected?.id === id) {
        setSelected(null)
        setProjects([])
      }
      showToast("Client deleted", "success")
    } catch (e) { showToast(e.message, "error") }
  }

  // Project CRUD
  async function createProject(e) {
    e.preventDefault()
    try {
      const body = {
        client_id: selected.id,
        name: np.name,
        description: np.description,
        type: np.type,
        other_type: showOther ? np.other_type : "",
      }
      await apiCreateProject(body)
      setNp({ name: "", description: "", type: "web_development", other_type: "" })
      setShowCreateProject(false)
      await refreshProjects(selected)
      showToast("Project created", "success")
    } catch (e) { showToast(e.message, "error") }
  }

  function startEditProject(p) {
    setProjEditId(p.id)
    setProjEditForm({ name: p.name || "", status: p.status || "new" })
  }
  async function saveProjectInline(p) {
    try {
      const r = await apiPatchProject(p.id, { name: projEditForm.name, status: projEditForm.status })
      setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...r.project } : x)))
      setProjEditId(null)
      showToast("Project updated", "success")
    } catch (e) { showToast(e.message, "error") }
  }

  async function deleteProject(p) {
    if (!window.confirm("Delete this project?")) return
    try {
      await apiDeleteProject(p.id)
      setProjects((prev) => prev.filter((x) => x.id !== p.id))
      setMembersByProject((prev) => { const c = { ...prev }; delete c[p.id]; return c })
      showToast("Project deleted", "success")
    } catch (e) { showToast(e.message, "error") }
  }

  // Members
  async function refreshMembers(project) {
    try {
      const r = await apiListProjectMembers(project.id)
      setMembersByProject((prev) => ({ ...prev, [project.id]: r.members || [] }))
    } catch {
      setMembersByProject((prev) => ({ ...prev, [project.id]: [] }))
    }
  }

  // Access manager helpers
  const members = accessProject ? (membersByProject[accessProject.id] || []) : []
  const optimisticUpdate = (updater) => {
    if (!accessProject) return
    setMembersByProject((prev) => {
      const cur = prev[accessProject.id] || []
      return { ...prev, [accessProject.id]: cur.map(updater) }
    })
  }

  // Add to your component state
  const [activeTab, setActiveTab] = useState('details')
  const [currentUser, setCurrentUser] = useState({ id: null })

  // Get current user info when component mounts
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setCurrentUser(JSON.parse(userData))
    }
  }, [])

  if (loading) return (
    <div className="loader_container">
      <p className="loader_spinner"></p>
      <p>Loading clients…</p>
    </div>
  );

  if (error) return <div className="center error">{error}</div>

  return (
    <div>
      {!selected ? (
        <>
          <Topbar title="Clients">
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowCreateClient(true)}>
                New Client
              </button>
            )}
          </Topbar>

          {!clients.length ? (
            <div className="center muted">No clients yet. Click "New Client".</div>
          ) : (
            <div className="card">
              <div className="table-wrap-cand">
                <table className="table-cand">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name / Email</th>
                      <th>Phone</th>
                      <th>Company</th>
                      <th>Projects</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedClients.map((c) => (
                      <tr key={c.id}>
                        <td>{c.id}</td>
                        <td>
                          {editingId === c.id ? (
                            <div className="row">
                              <input
                                id={`editName-${c.id}`}
                                className="inputedit"
                                value={editForm.name}
                                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Name"
                                autoComplete="name"
                              />
                              <input
                                id={`editEmail-${c.id}`}
                                className="inputedit"
                                type="email"
                                value={editForm.email}
                                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                                placeholder="Email"
                                autoComplete="email"
                              />
                            </div>
                          ) : (
                            <>
                              <div style={{ fontWeight: 600 }}>{c.name}</div>
                              <div className="small">{c.email}</div>
                            </>
                          )}
                        </td>
                        <td>
                          {editingId === c.id ? (
                            <input
                              id={`editPhone-${c.id}`}
                              className="inputedit"
                              value={editForm.phone}
                              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                              placeholder="Phone"
                              autoComplete="tel"
                            />
                          ) : (c.phone || <span className="small">—</span>)}
                        </td>
                        <td>
                          {editingId === c.id ? (
                            <input
                              id={`editCompany-${c.id}`}
                              className="inputedit"
                              value={editForm.company}
                              onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))}
                              placeholder="Company"
                              autoComplete="organization"
                            />
                          ) : (c.company || <span className="small">—</span>)}
                        </td>
                        <td>{c.project_count || 0}</td>
                        <td className="row-actions">
                          {editingId === c.id ? (
                            <>
                              <button className="buttontick" onClick={() => saveEdit(c.id)}>✓</button>
                              <button className="buttondanger" onClick={() => setEditingId(null)}>✕</button>
                            </>
                          ) : (
                            <>
                              <button className="buttoneye" onClick={() => openClient(c)} title="View">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24"> <path d="M12 5c-7.633 0-11 7-11 7s3.367 7 11 7 11-7 11-7-3.367-7-11-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z" /> </svg>
                              </button>
                              {isAdmin && (
                                <>
                                  <button className="buttonedit" onClick={() => startEdit(c)} title="Edit"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24"> <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z" /> </svg></button>
                                  <button className="buttondanger" onClick={() => delClient(c.id)} title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24"> <path d="M9 3v1H4v2h16V4h-5V3H9zm-2 6v11a1 1 0 001 1h8a1 1 0 001-1V9H7zm2 2h2v9H9v-9zm4 0h2v9h-2v-9z" /> </svg></button>
                                </>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <button className="button ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <div className="small">Page {page} / {totalPages || 1}</div>
                <button className="button ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <Topbar title={`Client: ${selected.name}`}>
            <button className="secondary" onClick={() => { setSelected(null); setProjects([]) }}>Back</button>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowCreateProject(true)}>
                New Project
              </button>
            )}
          </Topbar>

          <div className="card">
            {projLoading ? (
              <div className="loader_container">
                <p className="loader_spinner"></p>
                <p>Loading Projects…</p>
              </div>
            ) : !projects.length ? (
              <div className="center muted">No projects yet.</div>
            ) : (
              <div className="table-wrap-cand">
                <table className="table-cand">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name / Code</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Access</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr key={p.id}>
                        <td>{p.id}</td>
                        <td>
                          {projEditId === p.id ? (
                            <input
                              className="inputedit"
                              value={projEditForm.name}
                              onChange={(e) => setProjEditForm((f) => ({ ...f, name: e.target.value }))}
                              placeholder="Project name"
                            />
                          ) : (
                            <>
                              <div style={{ fontWeight: 600 }}>{p.name}</div>
                              <div className="small muted">{p.code}</div>
                            </>
                          )}
                        </td>
                        <td>{p.type}{p.type === "other" && p.other_type ? ` / ${p.other_type}` : ""}</td>
                        <td>
                          {projEditId === p.id ? (
                            <select
                              className="inputedit"
                              value={projEditForm.status}
                              onChange={(e) => setProjEditForm((f) => ({ ...f, status: e.target.value }))}
                            >
                              <option value="new">new</option>
                              <option value="InProgress">InProgress</option>
                              <option value="completed">completed</option>
                              <option value="OnHold">OnHold</option>
                              <option value="cancelled">cancelled</option>
                            </select>
                          ) : (p.status)}
                        </td>
                        <td>
                          <button
                            className="button ghost"
                            onClick={async () => {
                              setAccessProject(p)
                              await refreshMembers(p)
                            }}
                          >
                            Manage Access
                          </button>
                        </td>
                        <td className="row-actions">
                          {projEditId === p.id ? (
                            <>
                              <button className="buttontick" onClick={() => saveProjectInline(p)}>✓</button>
                              <button className="buttondanger" onClick={() => setProjEditId(null)}>✕</button>
                            </>
                          ) : (
                            <>
                              <button className="buttoneye" title="View details" onClick={() => setViewProject(p)}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24"> <path d="M12 5c-7.633 0-11 7-11 7s3.367 7 11 7 11-7 11-7-3.367-7-11-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z" /> </svg></button>
                              <button className="buttonedit" title="Edit inline" onClick={() => startEditProject(p)}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24"> <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z" /> </svg></button>
                              {isAdmin && (
                                <button className="buttondanger" title="Delete" onClick={() => deleteProject(p)}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24"> <path d="M9 3v1H4v2h16V4h-5V3H9zm-2 6v11a1 1 0 001 1h8a1 1 0 001-1V9H7zm2 2h2v9H9v-9zm4 0h2v9h-2v-9z" /> </svg></button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Create Client Modal */}
      {showCreateClient && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content">
              <form onSubmit={createClient}>
                <div className="modal-header">
                  <h5 className="modal-title">Create Client</h5>
                  <button type="button" className="btn-close" onClick={() => setShowCreateClient(false)} />
                </div>
                <div className="modal-body">
                  <div className="form-row">
                    <label htmlFor="newClientName" className="visually-hidden">Client name</label>
                    <input
                      id="newClientName"
                      className="input"
                      required
                      placeholder="Client name"
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      autoComplete="name"
                    />
                    <label htmlFor="newClientEmail" className="visually-hidden">Email</label>
                    <input
                      id="newClientEmail"
                      className="input"
                      required
                      placeholder="Email"
                      type="email"
                      value={newClient.email}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      autoComplete="email"
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="newClientPhone" className="visually-hidden">Phone</label>
                    <input
                      id="newClientPhone"
                      className="input"
                      required
                      placeholder="Phone"
                      value={newClient.phone}
                      onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                      autoComplete="tel"
                    />
                    <label htmlFor="newClientCompany" className="visually-hidden">Company</label>
                    <input
                      id="newClientCompany"
                      className="input"
                      placeholder="Company"
                      value={newClient.company}
                      onChange={(e) => setNewClient({ ...newClient, company: e.target.value })}
                      autoComplete="organization"
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateClient(false)}>Cancel</button>
                  <button className="btn btn-primary" type="submit">Create</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateProject && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-md">
            <div className="modal-content">
              <form className="project-form" onSubmit={createProject}>
                <div className="modal-header">
                  <h5 className="modal-title">Create Project</h5>
                  <button type="button" className="btn-close" onClick={() => setShowCreateProject(false)} />
                </div>
                <div className="modal-body">
                  <div className="row">
                    <div className="grow">
                      <label htmlFor="npName" className="visually-hidden">Project name</label>
                      <input
                        id="npName"
                        className="input"
                        required
                        placeholder="Project name"
                        value={np.name}
                        onChange={(e) => setNp({ ...np, name: e.target.value })}
                        autoComplete="off"
                      />
                    </div>

                    <div className="grow">
                      <label htmlFor="npType" className="visually-hidden">Project type</label>
                      <select
                        id="npType"
                        className="input"
                        value={np.type}
                        onChange={(e) => setNp({ ...np, type: e.target.value })}
                      >
                        <option value="web_development">Web Development</option>
                        <option value="digital_marketing">Digital Marketing</option>
                        <option value="data_analytics">Data Analytics</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    {showOther && (
                      <div className="grow">
                        <label htmlFor="npOtherType" className="visually-hidden">Other type</label>
                        <input
                          id="npOtherType"
                          className="input"
                          placeholder="Other type…"
                          value={np.other_type}
                          onChange={(e) => setNp({ ...np, other_type: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                    )}
                  </div>

                  <div className="row">
                    <div className="grow">
                      <label htmlFor="npDesc" className="visually-hidden">Description</label>
                      <textarea
                        id="npDesc"
                        className="textarea_description project_desc"
                        placeholder="Project description"
                        value={np.description}
                        onChange={(e) => setNp({ ...np, description: e.target.value })}
                        autoComplete="off"
                        rows={5}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateProject(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Create</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Project Details Modal (view only; no payments) */}
      {viewProject && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Project Details</h5>
                <button type="button" className="btn-close" onClick={() => setViewProject(null)} />
              </div>
              <div className="modal-body">
                {/* Add tabs for Details and Comments */}
                <ul className="nav nav-tabs" role="tablist">
                  <li className="nav-item" role="presentation">
                    <button
                      className={`nav-link ${activeTab === 'details' ? 'active' : ''}`}
                      onClick={() => setActiveTab('details')}
                    >
                      Details
                    </button>
                  </li>
                  <li className="nav-item" role="presentation">
                    <button
                      className={`nav-link ${activeTab === 'comments' ? 'active' : ''}`}
                      onClick={() => setActiveTab('comments')}
                    >
                      Comments
                    </button>
                  </li>
                </ul>

                <div className="tab-content">
                  {activeTab === 'details' && (
                    <div className="tab-pane fade show active">
                      <div className="card project-detail hover-frame" style={{ marginTop: 8 }}>

                        {isAdmin && (
                          <div className="ticket-action-buttons in-modal">
                            <button
                              className="btn-link edit-btn"
                              title="Edit project"
                              onClick={() => openEditFromProjectView(viewProject)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path
                                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                            <button
                              className="btn-link delete-btn"
                              title="Delete project"
                              onClick={() => {
                                if (!window.confirm("Delete this project?")) return;
                                setViewProject(null);
                                deleteProject(viewProject);
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path
                                  d="M9 3v1H4v2h16V4h-5V3H9zm-2 6v11a1 1 0 001 1h8a1 1 0 001-1V9H7zm2 2h2v9H9v-9zm4 0h2v9h-2v-9z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                          </div>
                        )}



                        <table className="table meta-table" aria-label="Project meta">
                          <tbody>
                            <tr>
                              <th scope="row">Project Name</th>
                              <td>{viewProject.name || "—"}</td>
                              <th scope="row">Project ID</th>
                              <td><code>{viewProject.code || "—"}</code></td>
                            </tr>
                            <tr>
                              <th scope="row">Project Type</th>
                              <td>
                                {viewProject.type}
                                {viewProject.type === "other" && viewProject.other_type ? ` / ${viewProject.other_type}` : ""}
                              </td>
                              <th scope="row">Status</th>
                              <td>{viewProject.status || "—"}</td>
                            </tr>
                          </tbody>
                        </table>

                        <div className="section">
                          <h4 className="section-title">Description</h4>
                          <div style={{ whiteSpace: "pre-wrap" }}>
                            {viewProject.description || <span className="muted">No description</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeTab === 'comments' && (
                    <div className="tab-pane fade show active">
                      <ProjectComments
                        projectId={viewProject.id}
                        isAdmin={isAdmin}
                        currentUser={currentUser}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setViewProject(null)
                  setActiveTab('details') // Reset tab when closing
                }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showEditProjectModal && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered modal-xl">
            <div className="modal-content">
              <form className="project-form" onSubmit={saveProjectEdit}>
                <div className="modal-header">
                  <h5 className="modal-title">Edit Project</h5>
                  <button type="button" className="btn-close" onClick={() => setShowEditProjectModal(false)} />
                </div>
                <div className="modal-body">
                  <div className="row">
                    <div className="grow">
                      <label htmlFor="epName" className="visually-hidden">Project name</label>
                      <input
                        id="epName"
                        className="input"
                        required
                        placeholder="Project name"
                        value={epForm.name}
                        onChange={(e) => setEpForm({ ...epForm, name: e.target.value })}
                        autoComplete="off"
                      />
                    </div>

                    <div className="grow">
                      <label htmlFor="epStatus" className="visually-hidden">Status</label>
                      <select
                        id="epStatus"
                        className="input"
                        value={epForm.status}
                        onChange={(e) => setEpForm({ ...epForm, status: e.target.value })}
                      >
                        <option value="new">new</option>
                        <option value="InProgress">InProgress</option>
                        <option value="completed">completed</option>
                        <option value="OnHold">OnHold</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                    </div>
                    <div className="grow">
                      <label htmlFor="epType" className="visually-hidden">Type</label>
                      <select
                        id="epType"
                        className="input"
                        value={epForm.type}
                        onChange={(e) => setEpForm({ ...epForm, type: e.target.value })}
                      >
                        <option value="web_development">Web Development</option>
                        <option value="digital_marketing">Digital Marketing</option>
                        <option value="data_analytics">Data Analytics</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="row">


                    {epForm.type === "other" && (
                      <div className="grow">
                        <label htmlFor="epOtherType" className="visually-hidden">Other type</label>
                        <input
                          id="epOtherType"
                          className="input"
                          placeholder="Other type…"
                          value={epForm.other_type}
                          onChange={(e) => setEpForm({ ...epForm, other_type: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                    )}
                  </div>

                  <div className="row">
                    <div className="grow">
                      <label htmlFor="epDesc" className="visually-hidden">Description</label>
                      <textarea
                        id="epDesc"
                        className="textarea_description project_desc"
                        placeholder="Project description"
                        value={epForm.description}
                        onChange={(e) => setEpForm({ ...epForm, description: e.target.value })}
                        rows={5}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowEditProjectModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}


      {/* Access Manager Modal */}
      {accessProject && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Manage Access — {accessProject.name}</h5>
                <button type="button" className="btn-close" onClick={() => setAccessProject(null)} />
              </div>
              <div className="modal-body">
                <div className="table-responsive">
                  <table className="table table-members">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        {isAdmin && (
                          <th className="center-col">Can Edit</th>
                        )}
                        {isAdmin && (
                          <th className="center-col">Can Manage Payments</th>

                        )}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.user_id}>
                          <td>
                            <div className="m-name">{m.name}</div>
                            <div className="muted small">{m.email}</div>
                          </td>
                          <td>ZOR - {m.role ? m.role.charAt(0).toUpperCase() : ""}</td>
                          {isAdmin && (
                            <td className="center-col">
                              <input
                                type="checkbox"
                                checked={!!m.can_edit}
                                disabled={!isAdmin}
                                onChange={async (e) => {
                                  const next = e.target.checked
                                  optimisticUpdate((row) => row.user_id === m.user_id ? { ...row, can_edit: next } : row)
                                  try {
                                    await apiPatchProjectMember(accessProject.id, m.user_id, { can_edit: next })
                                    await refreshMembers(accessProject)
                                  } catch (err) {
                                    optimisticUpdate((row) => row.user_id === m.user_id ? { ...row, can_edit: !next } : row)
                                    showToast(err.message || "Failed to update", "error")
                                  }
                                }}
                              />
                            </td>
                          )}
                          {isAdmin && (
                            <td className="center-col">
                              <input
                                type="checkbox"
                                checked={!!m.can_manage_payments}
                                disabled={!isAdmin}
                                onChange={async (e) => {
                                  const next = e.target.checked
                                  optimisticUpdate((row) => row.user_id === m.user_id ? { ...row, can_manage_payments: next } : row)
                                  try {
                                    await apiPatchProjectMember(accessProject.id, m.user_id, { can_manage_payments: next })
                                    await refreshMembers(accessProject)
                                  } catch (err) {
                                    optimisticUpdate((row) => row.user_id === m.user_id ? { ...row, can_manage_payments: !next } : row)
                                    showToast(err.message || "Failed to update", "error")
                                  }
                                }}
                              />
                            </td>
                          )}
                          <td className="right-col">
                            <button
                              className="danger"
                              disabled={!isAdmin}
                              onClick={async () => {
                                if (!window.confirm("Remove member?")) return
                                try {
                                  await apiRemoveProjectMember(accessProject.id, m.user_id)
                                  await refreshMembers(accessProject)
                                } catch (err) {
                                  showToast(err.message, "error")
                                }
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      {members.length === 0 && (
                        <tr><td colSpan={5} className="muted">No members yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {isAdmin && (
                  <form
                    className="row add-member-row"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      try {
                        await apiAddProjectMember(accessProject.id, addingMember)
                        setAddingMember({ user_id: "", can_edit: false, can_manage_payments: false })
                        await refreshMembers(accessProject)
                        showToast("Project member added", "success")
                      } catch (err) {
                        showToast(err.message, "error")
                      }
                    }}
                  >
                    <div className="access_members_admin">
                      <select
                        className="input access_selection_input"
                        required
                        value={addingMember.user_id}
                        onChange={(e) => setAddingMember({ ...addingMember, user_id: Number(e.target.value) || "" })}
                      >
                        <option value="">Select user…</option>
                        {users.map((u) => (
                          <option value={u.id} key={u.id}>
                            {u.name} {u.email}
                          </option>
                        ))}
                      </select>

                      <div>
                        <label className="perm-toggle">
                          <input
                            type="checkbox"
                            checked={addingMember.can_edit}
                            onChange={(e) => setAddingMember({ ...addingMember, can_edit: e.target.checked })}
                          />
                          <span className="access_text">can edit</span>
                        </label>

                        <label className="perm-toggle">
                          <input
                            type="checkbox"
                            checked={addingMember.can_manage_payments}
                            onChange={(e) => setAddingMember({ ...addingMember, can_manage_payments: e.target.checked })}
                          />
                          <span className="access_text">can manage payments</span>
                        </label>

                        <button className="primary">Add member</button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAccessProject(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`toastx ${toast.type} ${toast.open ? "show" : ""}`} role="status" aria-live="polite">
        <div className="toastx-body">
          <div className="toastx-title">{toast.type === "success" ? "Success" : "Error"}</div>
          <div className="toastx-msg">{toast.message}</div>
        </div>
        <button className="toastx-close" onClick={hideToast} aria-label="Close">×</button>
      </div>
    </div>
  )
}
