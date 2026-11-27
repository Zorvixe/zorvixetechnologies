import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import RichTextEditor from '../components/RichTextEditor';
import AiInsightBox from '../components/AiInsightBox';
import ProjectComments from '../components/ProjectComments';
import {
  apiListAllProjects,
  apiListClients,
  apiCreateProject,
  apiPatchProject,
  apiDeleteProject,
  apiListProjectMembers,
  apiAddProjectMember,
  apiPatchProjectMember,
  apiRemoveProjectMember,
  apiListUsers,
  apiMe,
  apiAiProjectSummary,
} from '../api';
import { renderSafeHtml, stripHtmlText } from '../utils/safeHtml';
import ZorviAiLogo from '../assets/zorvi_ai_logo.png';
import './Projects.css';

const STAGES = [
  { key: 'todo', label: 'To do', dbStatus: 'new', dotColor: '#1f2937', matches: ['new', 'todo', 'planned'] },
  { key: 'in_progress', label: 'In progress', dbStatus: 'InProgress', dotColor: '#2563eb', matches: ['inprogress', 'in_progress', 'ongoing', 'active'] },
  { key: 'in_review', label: 'In review', dbStatus: 'in_review', dotColor: '#d97706', matches: ['in_review', 'review', 'onhold', 'on_hold'] },
  { key: 'done', label: 'Done', dbStatus: 'completed', dotColor: '#16a34a', matches: ['completed', 'done', 'closed'] },
];

const AVATAR_PALETTE = [
  { bg: '#fde68a', fg: '#92400e' },
  { bg: '#bfdbfe', fg: '#1e3a8a' },
  { bg: '#fecdd3', fg: '#9f1239' },
  { bg: '#bbf7d0', fg: '#166534' },
  { bg: '#ddd6fe', fg: '#5b21b6' },
];

function getInitials(name = '', email = '') {
  const src = String(name || email || 'U').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function normalizeStageKey(status) {
  const s = String(status || 'new').toLowerCase().replace(/\s+/g, '');
  for (const st of STAGES) {
    if (st.matches.includes(s)) return st.key;
  }
  return 'todo';
}

function computeProgress(p) {
  const total = Number(p.tasks_total || 0);
  const done = Number(p.tasks_done || 0);
  if (total > 0) return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
  if (Number(p.progress || 0) > 0) return Math.min(100, Math.max(0, Number(p.progress)));
  return normalizeStageKey(p.status) === 'done' ? 100 : 0;
}

function formatShortDate(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function getCurrentQuarterLabel() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `Q${q} ${now.getFullYear()}`;
}

export default function Projects() {
  const { id: routeProjectId } = useParams();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // View & Filters
  const [viewMode, setViewMode] = useState('board'); // 'board' | 'list' | 'timeline'
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Drag & Drop state
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  // Detail modal
  const [detailProject, setDetailProject] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [aiData, setAiData] = useState(null);

  // Create / Edit Project Modal
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [projForm, setProjForm] = useState({
    client_id: '',
    name: '',
    type: 'web_development',
    other_type: '',
    status: 'new',
    priority: 'normal',
    due_date: '',
    tasks_total: 0,
    tasks_done: 0,
    progress: 0,
    description: '',
  });

  // Manage Access Modal
  const [accessProject, setAccessProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberCanEdit, setMemberCanEdit] = useState(false);
  const [memberCanPay, setMemberCanPay] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);

  // Toast
  const toastTimer = useRef(null);
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' });
  const showToast = useCallback((message, type = 'success') => {
    setToast({ open: true, type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, open: false })), 3000);
  }, []);
  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t => ({ ...t, open: false }));
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Click outside dropdown close
  useEffect(() => {
    const closeAll = () => {
      setOpenMenuId(null);
    };
    window.addEventListener('click', closeAll);
    return () => window.removeEventListener('click', closeAll);
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const me = await apiMe();
      const userObj = me?.me || me?.user || null;
      const admin = String(userObj?.role || '').toLowerCase() === 'admin';
      setCurrentUser(userObj);
      setIsAdmin(admin);

      const [projRes, clientRes, userRes] = await Promise.all([
        apiListAllProjects(),
        apiListClients().catch(() => ({ clients: [] })),
        admin ? apiListUsers({ page: 1, limit: 200 }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);

      const projList = projRes?.projects || [];
      setProjects(projList);
      setClients(clientRes?.clients || []);
      setAllUsers(userRes?.data || []);

      if (routeProjectId) {
        const match = projList.find((x) => String(x.id) === String(routeProjectId));
        if (match) setDetailProject(match);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load projects workspace');
    } finally {
      setLoading(false);
    }
  }, [routeProjectId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Esc key closes open modals
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setFormModalOpen(false);
        setAccessProject(null);
        setDetailProject(null);
        setFilterOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const canEdit = (p) => isAdmin || !!p?.my_perms?.can_edit;

  const openCreateModal = (defaultStageDbStatus = 'new') => {
    setEditingId(null);
    setProjForm({
      client_id: clients[0]?.id ? String(clients[0].id) : '',
      name: '',
      type: 'web_development',
      other_type: '',
      status: defaultStageDbStatus,
      priority: 'normal',
      due_date: '',
      tasks_total: 0,
      tasks_done: 0,
      progress: 0,
      description: '',
    });
    setFormModalOpen(true);
  };

  const openEditModal = (p) => {
    setEditingId(p.id);
    setProjForm({
      client_id: p.client_id ? String(p.client_id) : '',
      name: p.name || '',
      type: p.type || 'web_development',
      other_type: p.other_type || '',
      status: p.status || 'new',
      priority: p.priority || 'normal',
      due_date: p.due_date ? String(p.due_date).slice(0, 10) : '',
      tasks_total: Number(p.tasks_total || 0),
      tasks_done: Number(p.tasks_done || 0),
      progress: Number(p.progress || 0),
      description: p.description || '',
    });
    setFormModalOpen(true);
  };

  const saveProjectForm = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const totalT = Math.max(0, Number(projForm.tasks_total || 0));
      const doneT = Math.min(totalT || Number(projForm.tasks_done || 0), Math.max(0, Number(projForm.tasks_done || 0)));
      const computedPct = totalT > 0 ? Math.round((doneT / totalT) * 100) : Math.max(0, Math.min(100, Number(projForm.progress || 0)));

      if (editingId) {
        const res = await apiPatchProject(editingId, {
          name: projForm.name,
          type: projForm.type,
          other_type: projForm.type === 'other' ? projForm.other_type : '',
          status: projForm.status,
          priority: projForm.priority,
          due_date: projForm.due_date || null,
          tasks_total: totalT,
          tasks_done: doneT,
          progress: computedPct,
          description: projForm.description,
        });
        setProjects((prev) => prev.map((x) => (x.id === editingId ? { ...x, ...res.project } : x)));
        if (detailProject?.id === editingId) {
          setDetailProject((prev) => ({ ...prev, ...res.project }));
        }
        showToast('Project updated', 'success');
      } else {
        await apiCreateProject({
          client_id: Number(projForm.client_id),
          name: projForm.name,
          type: projForm.type,
          other_type: projForm.other_type,
          status: projForm.status,
          priority: projForm.priority,
          due_date: projForm.due_date || null,
          tasks_total: totalT,
          tasks_done: doneT,
          progress: computedPct,
          description: projForm.description,
        });
        showToast('Project created', 'success');
        await loadWorkspace();
      }
      setFormModalOpen(false);
    } catch (err) {
      showToast(err?.message || 'Failed to save project', 'error');
    } finally {
      setSaving(false);
    }
  };

  const moveProjectStage = async (project, targetDbStatus) => {
    if (!canEdit(project)) {
      showToast('Permission denied: Only Admins or editors can change stage', 'error');
      return;
    }
    const prevStatus = project.status;
    if (normalizeStageKey(prevStatus) === normalizeStageKey(targetDbStatus)) return;

    // Optimistic move
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status: targetDbStatus } : p)));
    if (detailProject?.id === project.id) {
      setDetailProject((prev) => ({ ...prev, status: targetDbStatus }));
    }

    try {
      const res = await apiPatchProject(project.id, { status: targetDbStatus });
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, ...res.project } : p)));
      showToast(`Moved to ${STAGES.find((s) => s.dbStatus === targetDbStatus)?.label || targetDbStatus}`, 'success');
    } catch (err) {
      // Rollback
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status: prevStatus } : p)));
      showToast(err?.message || 'Failed to update stage', 'error');
    }
  };

  const handleDeleteProject = async (p) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete project "${p.name}" (${p.code})?`)) return;
    try {
      await apiDeleteProject(p.id);
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
      if (detailProject?.id === p.id) setDetailProject(null);
      showToast('Project deleted', 'success');
    } catch (err) {
      showToast(err?.message || 'Delete failed', 'error');
    }
  };

  const openDetailModal = (p) => {
    setDetailProject(p);
    setAiOpen(false);
    setAiData(null);
    setAiErr('');
  };

  const runAiSummary = async (projectId) => {
    setAiOpen(true);
    setAiLoading(true);
    setAiErr('');
    try {
      const res = await apiAiProjectSummary(projectId);
      setAiData(res);
    } catch (err) {
      setAiErr(err?.message || 'Failed to summarize project');
    } finally {
      setAiLoading(false);
    }
  };

  // Manage Members
  const openAccessModal = async (p) => {
    setAccessProject(p);
    setMembersLoading(true);
    setMemberUserId('');
    setMemberCanEdit(false);
    setMemberCanPay(false);
    try {
      const r = await apiListProjectMembers(p.id);
      setMembers(r.members || []);
    } catch (err) {
      showToast(err?.message || 'Failed to load members', 'error');
    } finally {
      setMembersLoading(false);
    }
  };

  const addMember = async (e) => {
    e.preventDefault();
    if (!accessProject || !memberUserId) return;
    try {
      await apiAddProjectMember(accessProject.id, {
        user_id: Number(memberUserId),
        can_edit: memberCanEdit,
        can_manage_payments: memberCanPay,
      });
      const r = await apiListProjectMembers(accessProject.id);
      setMembers(r.members || []);
      setMemberUserId('');
      setMemberCanEdit(false);
      setMemberCanPay(false);
      await loadWorkspace();
      showToast('Member added to project', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed to add member', 'error');
    }
  };

  const toggleMemberPerm = async (m, key) => {
    if (!accessProject) return;
    try {
      await apiPatchProjectMember(accessProject.id, m.user_id, {
        [key]: !m[key],
      });
      const r = await apiListProjectMembers(accessProject.id);
      setMembers(r.members || []);
      await loadWorkspace();
    } catch (err) {
      showToast(err?.message || 'Failed to update member permission', 'error');
    }
  };

  const removeMember = async (m) => {
    if (!accessProject) return;
    try {
      await apiRemoveProjectMember(accessProject.id, m.user_id);
      const r = await apiListProjectMembers(accessProject.id);
      setMembers(r.members || []);
      await loadWorkspace();
      showToast('Member removed', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed to remove member', 'error');
    }
  };

  // Filtering
  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (clientFilter !== 'all' && String(p.client_id) !== String(clientFilter)) return false;
      if (priorityFilter !== 'all' && String(p.priority || 'normal').toLowerCase() !== priorityFilter) return false;
      if (q) {
        const hay = `${p.name || ''} ${p.code || ''} ${p.client_name || ''} ${p.client_company || ''} ${stripHtmlText(p.description)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projects, clientFilter, priorityFilter, search]);

  const groupedByStage = useMemo(() => {
    const map = { todo: [], in_progress: [], in_review: [], done: [] };
    for (const p of filteredProjects) {
      const k = normalizeStageKey(p.status);
      map[k].push(p);
    }
    return map;
  }, [filteredProjects]);

  const activeFilterCount = (clientFilter !== 'all' ? 1 : 0) + (priorityFilter !== 'all' ? 1 : 0);

  return (
    <div className="prj-shell">
      <div className="prj-page">
        {/* Workspace / Projects Breadcrumb & Header */}
        <div className="prj-header-row">
          <div>
            <div className="prj-breadcrumb">
              <span onClick={() => navigate('/stats')} style={{ cursor: 'pointer' }}>Workspace</span>
              <span className="prj-bc-sep">/</span>
              <span className="prj-bc-current">Projects</span>
            </div>
            <h1 className="prj-title">Projects</h1>
            <p className="prj-subtitle">
              {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'} across {STAGES.length} stages &bull; {getCurrentQuarterLabel()}
            </p>
          </div>

          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={() => openCreateModal('new')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Project</span>
            </button>
          )}
        </div>

        {/* View Switcher + Search + Filter Bar */}
        <div className="prj-toolbar">
          <div className="prj-view-tabs" role="tablist" aria-label="Project views">
            <button
              type="button"
              className={`prj-tab-btn ${viewMode === 'board' ? 'active' : ''}`}
              onClick={() => setViewMode('board')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="5" height="18" rx="1" />
                <rect x="10" y="3" width="5" height="12" rx="1" />
                <rect x="17" y="3" width="5" height="15" rx="1" />
              </svg>
              <span>Board</span>
            </button>
            <button
              type="button"
              className={`prj-tab-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <circle cx="4" cy="6" r="1" />
                <circle cx="4" cy="12" r="1" />
                <circle cx="4" cy="18" r="1" />
              </svg>
              <span>List</span>
            </button>
            <button
              type="button"
              className={`prj-tab-btn ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="14" y2="6" />
                <line x1="8" y1="12" x2="20" y2="12" />
                <line x1="6" y1="18" x2="16" y2="18" />
              </svg>
              <span>Timeline</span>
            </button>
          </div>

          <div className="prj-toolbar-right">
            <div className="prj-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="prj-clear-search" onClick={() => setSearch('')}>×</button>
              )}
            </div>

            <div className="prj-filter-anchor">
              <button
                type="button"
                className={`prj-filter-btn ${activeFilterCount > 0 ? 'has-filters' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setFilterOpen((v) => !v);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />
                </svg>
                <span>Filter</span>
                {activeFilterCount > 0 && <span className="prj-filter-dot">{activeFilterCount}</span>}
              </button>

              {filterOpen && (
                <div className="prj-filter-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="prj-pop-field">
                    <label>Client</label>
                    <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
                      <option value="all">All Clients</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.company || c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="prj-pop-field">
                    <label>Priority</label>
                    <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                      <option value="all">All Priorities</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="normal">Normal</option>
                    </select>
                  </div>
                  <div className="prj-pop-actions">
                    <button
                      type="button"
                      className="prj-btn-subtle"
                      onClick={() => { setClientFilter('all'); setPriorityFilter('all'); }}
                    >
                      Reset
                    </button>
                    <button type="button" className="prj-btn-primary sm" onClick={() => setFilterOpen(false)}>
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <div className="prj-error-banner">{error}</div>}

        {loading ? (
          <div className="prj-loading-box">
            <div className="loader_container">
              <p className="loader_spinner"></p>
              <p>Loading projects workspace...</p>
            </div>
          </div>
        ) : viewMode === 'board' ? (
          /* ===================== BOARD VIEW ===================== */
          <div className="prj-board-scroll">
            <div className="prj-board">
              {STAGES.map((stage) => {
                const items = groupedByStage[stage.key] || [];
                const isDropTarget = dragOverStage === stage.key;
                return (
                  <div
                    key={stage.key}
                    className={`prj-column ${isDropTarget ? 'is-drag-over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverStage !== stage.key) setDragOverStage(stage.key);
                    }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverStage(null);
                      const proj = projects.find((x) => String(x.id) === String(draggedId));
                      setDraggedId(null);
                      if (proj) moveProjectStage(proj, stage.dbStatus);
                    }}
                  >
                    {/* Column Header */}
                    <div className="prj-col-head">
                      <div className="prj-col-title-wrap">
                        <span className="prj-col-dot" style={{ backgroundColor: stage.dotColor }} />
                        <span className="prj-col-title">{stage.label}</span>
                        <span className="prj-col-count">{items.length}</span>
                      </div>
                      <div className="prj-col-icons">
                        {isAdmin && (
                          <button
                            type="button"
                            className="prj-col-icon-btn"
                            title={`Add project in ${stage.label}`}
                            onClick={() => openCreateModal(stage.dbStatus)}
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Cards Stack */}
                    <div className="prj-col-cards">
                      {items.map((p) => {
                        const pct = computeProgress(p);
                        const dashArray = `${pct}, 100`;
                        const snippet = stripHtmlText(p.description) || 'No project overview added yet.';
                        const dateDisplay = formatShortDate(p.due_date || p.updated_at || p.created_at);
                        const prio = String(p.priority || 'normal').toLowerCase();
                        const isDragging = String(draggedId) === String(p.id);
                        const projMembers = p.members || [];

                        return (
                          <div
                            key={p.id}
                            className={`prj-card ${isDragging ? 'is-dragging' : ''}`}
                            draggable={canEdit(p)}
                            onDragStart={() => setDraggedId(p.id)}
                            onDragEnd={() => { setDraggedId(null); setDragOverStage(null); }}
                            onClick={() => openDetailModal(p)}
                          >
                            {/* Top Meta Row: Client badge + Priority Flag + ... menu */}
                            <div className="prj-card-top">
                              <div className="prj-card-badges">
                                <span className="prj-client-pill">
                                  {p.client_company || p.client_name || 'Internal'}
                                </span>
                                {(prio === 'urgent' || prio === 'high') && (
                                  <span className={`prj-priority-pill ${prio}`}>
                                    &#9873; {prio === 'urgent' ? 'Urgent' : 'High'}
                                  </span>
                                )}
                                {String(p.status).toLowerCase() === 'onhold' && (
                                  <span className="prj-hold-pill">On Hold</span>
                                )}
                              </div>

                              <div className="prj-card-menu-anchor" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="prj-dots-btn"
                                  onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                                  aria-label="Project options"
                                >
                                  •••
                                </button>
                                {openMenuId === p.id && (
                                  <div className="prj-card-dropdown">
                                    <button type="button" onClick={() => { setOpenMenuId(null); openDetailModal(p); }}>
                                      Open Details &amp; Comments
                                    </button>
                                    {canEdit(p) && (
                                      <button type="button" onClick={() => { setOpenMenuId(null); openEditModal(p); }}>
                                        Edit Project
                                      </button>
                                    )}
                                    {isAdmin && (
                                      <button type="button" onClick={() => { setOpenMenuId(null); openAccessModal(p); }}>
                                        Manage Team Members
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        openDetailModal(p);
                                        runAiSummary(p.id);
                                      }}
                                    >
                                      ZORVI AI Summary
                                    </button>
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        className="danger"
                                        onClick={() => { setOpenMenuId(null); handleDeleteProject(p); }}
                                      >
                                        Delete Project
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Title & Snippet */}
                            <h3 className="prj-card-title">{p.name}</h3>
                            <p className="prj-card-desc">{snippet}</p>

                            {/* Progress Ring + Tasks + Percentage */}
                            <div className="prj-card-progress-row">
                              <div className="prj-progress-left">
                                <svg className="prj-ring" viewBox="0 0 36 36">
                                  <path
                                    className="prj-ring-bg"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  />
                                  <path
                                    className="prj-ring-fg"
                                    strokeDasharray={dashArray}
                                    style={{ stroke: stage.dotColor === '#1f2937' ? '#6b7280' : stage.dotColor }}
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  />
                                </svg>
                                <span>
                                  {Number(p.tasks_total || 0) > 0
                                    ? `${p.tasks_done || 0}/${p.tasks_total} tasks`
                                    : `${(p.type || 'project').replace(/_/g, ' ')}`}
                                </span>
                              </div>
                              <strong className="prj-progress-pct">{pct}%</strong>
                            </div>

                            {/* Card Footer: Avatars + Comments / Code / Date */}
                            <div className="prj-card-footer">
                              <div className="prj-avatars">
                                {projMembers.length === 0 ? (
                                  <span className="prj-avatar-empty" title="No team members assigned">—</span>
                                ) : (
                                  <>
                                    {projMembers.slice(0, 3).map((m, i) => {
                                      const pal = AVATAR_PALETTE[(m.user_id || i) % AVATAR_PALETTE.length];
                                      return (
                                        <span
                                          key={m.user_id}
                                          className="prj-avatar-chip"
                                          style={{ backgroundColor: pal.bg, color: pal.fg }}
                                          title={`${m.name} (${m.email})`}
                                        >
                                          {getInitials(m.name, m.email)}
                                        </span>
                                      );
                                    })}
                                    {projMembers.length > 3 && (
                                      <span className="prj-avatar-more">+{projMembers.length - 3}</span>
                                    )}
                                  </>
                                )}
                              </div>

                              <div className="prj-card-meta-right">
                                <span className="prj-meta-item" title="Comments">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                  </svg>
                                  {p.comment_count || 0}
                                </span>
                                <span className="prj-meta-item" title={`Code: ${p.code}`}>
                                  {p.code}
                                </span>
                                {dateDisplay && (
                                  <span className="prj-meta-date">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="3" y="4" width="18" height="18" rx="2" />
                                      <line x1="16" y1="2" x2="16" y2="6" />
                                      <line x1="8" y1="2" x2="8" y2="6" />
                                      <line x1="3" y1="10" x2="21" y2="10" />
                                    </svg>
                                    {dateDisplay}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        className="prj-add-card-btn"
                        onClick={() => openCreateModal(stage.dbStatus)}
                      >
                        + Add project
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'list' ? (
          /* ===================== LIST VIEW ===================== */
          <div className="prj-list-card">
            <div className="prj-table-wrap">
              <table className="prj-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Stage</th>
                    <th>Priority</th>
                    <th>Progress</th>
                    <th>Team</th>
                    <th>Due Date</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="prj-empty-row">No matching projects found.</td>
                    </tr>
                  ) : filteredProjects.map((p) => {
                    const pct = computeProgress(p);
                    const stageObj = STAGES.find((s) => s.key === normalizeStageKey(p.status)) || STAGES[0];
                    const prio = String(p.priority || 'normal').toLowerCase();
                    return (
                      <tr key={p.id} onClick={() => openDetailModal(p)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div className="prj-list-title">{p.name}</div>
                          <div className="prj-list-sub">{p.code} &bull; {stripHtmlText(p.description).slice(0, 65) || 'No overview'}</div>
                        </td>
                        <td>
                          <span className="prj-client-pill">{p.client_company || p.client_name || 'Internal'}</span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="prj-stage-select"
                            value={stageObj.dbStatus}
                            disabled={!canEdit(p)}
                            onChange={(e) => moveProjectStage(p, e.target.value)}
                          >
                            {STAGES.map((st) => (
                              <option key={st.key} value={st.dbStatus}>{st.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <span className={`prj-priority-pill ${prio}`}>{prio}</span>
                        </td>
                        <td>
                          <div className="prj-list-prog">
                            <div className="prj-prog-track">
                              <div className="prj-prog-fill" style={{ width: `${pct}%`, backgroundColor: stageObj.dotColor }} />
                            </div>
                            <span>{pct}%</span>
                          </div>
                        </td>
                        <td>
                          <div className="prj-avatars">
                            {(p.members || []).slice(0, 3).map((m, i) => {
                              const pal = AVATAR_PALETTE[(m.user_id || i) % AVATAR_PALETTE.length];
                              return (
                                <span
                                  key={m.user_id}
                                  className="prj-avatar-chip"
                                  style={{ backgroundColor: pal.bg, color: pal.fg }}
                                  title={m.name}
                                >
                                  {getInitials(m.name, m.email)}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="prj-meta-date">{formatShortDate(p.due_date || p.created_at) || '—'}</td>
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                          <div className="prj-list-actions">
                            {canEdit(p) && (
                              <button type="button" className="prj-btn-subtle sm" onClick={() => openEditModal(p)}>
                                Edit
                              </button>
                            )}
                            {isAdmin && (
                              <button type="button" className="prj-btn-subtle sm" onClick={() => openAccessModal(p)}>
                                Team
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ===================== TIMELINE VIEW ===================== */
          <div className="prj-timeline-card">
            {filteredProjects.length === 0 ? (
              <div className="prj-empty-row">No projects to plot on timeline.</div>
            ) : filteredProjects.map((p) => {
              const pct = computeProgress(p);
              const stageObj = STAGES.find((s) => s.key === normalizeStageKey(p.status)) || STAGES[0];
              const startStr = formatShortDate(p.created_at) || 'Start';
              const endStr = formatShortDate(p.due_date) || 'Open';
              return (
                <div key={p.id} className="prj-tl-row" onClick={() => openDetailModal(p)}>
                  <div className="prj-tl-info">
                    <span className="prj-col-dot" style={{ backgroundColor: stageObj.dotColor }} />
                    <div>
                      <div className="prj-list-title">{p.name}</div>
                      <div className="prj-list-sub">{p.client_company || p.client_name} &bull; {stageObj.label}</div>
                    </div>
                  </div>
                  <div className="prj-tl-track-wrap">
                    <div className="prj-tl-bar" style={{ backgroundColor: `${stageObj.dotColor}18`, borderColor: `${stageObj.dotColor}44` }}>
                      <div className="prj-tl-fill" style={{ width: `${Math.max(12, pct)}%`, backgroundColor: stageObj.dotColor }} />
                      <span className="prj-tl-bar-label">{pct}% &bull; {startStr} &rarr; {endStr}</span>
                    </div>
                  </div>
                  <div className="prj-tl-avatars">
                    {(p.members || []).slice(0, 3).map((m, i) => {
                      const pal = AVATAR_PALETTE[(m.user_id || i) % AVATAR_PALETTE.length];
                      return (
                        <span
                          key={m.user_id}
                          className="prj-avatar-chip"
                          style={{ backgroundColor: pal.bg, color: pal.fg }}
                          title={m.name}
                        >
                          {getInitials(m.name, m.email)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===================== CREATE / EDIT PROJECT MODAL ===================== */}
      {formModalOpen && (
        <div className="prj-modal-backdrop" onClick={() => setFormModalOpen(false)}>
          <div className="prj-modal-card prj-modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={editingId ? 'Edit Project' : 'New Project'}>
            <div className="prj-modal-header">
              <div>
                <h4>{editingId ? 'Edit Project' : 'Create New Project'}</h4>
                <span className="prj-modal-sub">Organize client deliverables, tasks progress, and target dates.</span>
              </div>
              <button type="button" className="prj-modal-close" onClick={() => setFormModalOpen(false)}>×</button>
            </div>
            <form className="prj-modal-form" onSubmit={saveProjectForm}>
              <div className="prj-form-grid">
                {!editingId && (
                  <div className="prj-form-group">
                    <label>Client *</label>
                    <select
                      required
                      value={projForm.client_id}
                      onChange={(e) => setProjForm({ ...projForm, client_id: e.target.value })}
                    >
                      <option value="">Select client...</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.company || c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={`prj-form-group ${editingId ? 'span-2' : ''}`}>
                  <label>Project Title *</label>
                  <input
                    required
                    placeholder="e.g. Payments Dashboard"
                    value={projForm.name}
                    onChange={(e) => setProjForm({ ...projForm, name: e.target.value })}
                  />
                </div>

                <div className="prj-form-group">
                  <label>Stage</label>
                  <select value={projForm.status} onChange={(e) => setProjForm({ ...projForm, status: e.target.value })}>
                    {STAGES.map((st) => (
                      <option key={st.key} value={st.dbStatus}>{st.label}</option>
                    ))}
                    <option value="OnHold">On Hold</option>
                  </select>
                </div>

                <div className="prj-form-group">
                  <label>Priority</label>
                  <select value={projForm.priority} onChange={(e) => setProjForm({ ...projForm, priority: e.target.value })}>
                    <option value="normal">Normal</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="prj-form-group">
                  <label>Project Type</label>
                  <select value={projForm.type} onChange={(e) => setProjForm({ ...projForm, type: e.target.value })}>
                    <option value="web_development">Web Development</option>
                    <option value="digital_marketing">Digital Marketing</option>
                    <option value="data_analytics">Data Analytics</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="prj-form-group">
                  <label>Target / Due Date</label>
                  <input
                    type="date"
                    value={projForm.due_date}
                    onChange={(e) => setProjForm({ ...projForm, due_date: e.target.value })}
                  />
                </div>

                {projForm.type === 'other' && (
                  <div className="prj-form-group span-2">
                    <label>Specify Other Type</label>
                    <input
                      placeholder="e.g. Mobile App, Security Audit"
                      value={projForm.other_type}
                      onChange={(e) => setProjForm({ ...projForm, other_type: e.target.value })}
                    />
                  </div>
                )}

                <div className="prj-form-group">
                  <label>Tasks Done</label>
                  <input
                    type="number"
                    min="0"
                    value={projForm.tasks_done}
                    onChange={(e) => setProjForm({ ...projForm, tasks_done: e.target.value })}
                  />
                </div>

                <div className="prj-form-group">
                  <label>Total Tasks (for % progress)</label>
                  <input
                    type="number"
                    min="0"
                    value={projForm.tasks_total}
                    onChange={(e) => setProjForm({ ...projForm, tasks_total: e.target.value })}
                  />
                </div>
              </div>

              <div className="prj-form-group">
                <label>Description &amp; Scope</label>
                <RichTextEditor
                  value={projForm.description}
                  placeholder="Describe deliverables, scope, and milestones..."
                  minHeight="110px"
                  aiFieldLabel="Project Description"
                  aiContext={{ projectName: projForm.name, type: projForm.type }}
                  onChange={(content) => setProjForm((prev) => ({ ...prev, description: content }))}
                />
              </div>

              <div className="prj-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFormModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== PROJECT DETAIL & COMMENTS MODAL ===================== */}
      {detailProject && (
        <div className="prj-modal-backdrop" onClick={() => setDetailProject(null)}>
          <div className="prj-modal-card prj-modal-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={detailProject.name}>
            <div className="prj-modal-header">
              <div>
                <div className="prj-detail-badges">
                  <span className="prj-client-pill">{detailProject.client_company || detailProject.client_name || 'Internal'}</span>
                  <span className="prj-code-badge">{detailProject.code}</span>
                  <span className="prj-code-badge">{detailProject.type?.replace(/_/g, ' ')}</span>
                </div>
                <h4 style={{ marginTop: 6 }}>{detailProject.name}</h4>
              </div>
              <div className="prj-detail-header-actions">
                <button
                  type="button"
                  className="prj-ai-btn"
                  onClick={() => runAiSummary(detailProject.id)}
                  title="Summarize project & risks with ZORVI AI"
                >
                  <img src={ZorviAiLogo} alt="ZORVI AI" width="25" style={{ borderRadius: 3 }} />
                  <span>ZORVI AI Summary</span>
                </button>
                {canEdit(detailProject) && (
                  <button type="button" className="prj-btn-subtle sm" onClick={() => openEditModal(detailProject)}>
                    Edit
                  </button>
                )}
                {isAdmin && (
                  <button type="button" className="prj-btn-subtle sm" onClick={() => openAccessModal(detailProject)}>
                    Team ({(detailProject.members || []).length})
                  </button>
                )}
                <button type="button" className="prj-modal-close" onClick={() => setDetailProject(null)}>×</button>
              </div>
            </div>

            <div className="prj-detail-body">
              {/* Stage & Metrics Strip */}
              <div className="prj-detail-meta-strip">
                <div className="prj-meta-block">
                  <span>Stage</span>
                  <select
                    className="prj-stage-select"
                    value={STAGES.find((s) => s.key === normalizeStageKey(detailProject.status))?.dbStatus || 'new'}
                    disabled={!canEdit(detailProject)}
                    onChange={(e) => moveProjectStage(detailProject, e.target.value)}
                  >
                    {STAGES.map((st) => (
                      <option key={st.key} value={st.dbStatus}>{st.label}</option>
                    ))}
                  </select>
                </div>
                <div className="prj-meta-block">
                  <span>Priority</span>
                  <strong style={{ textTransform: 'capitalize' }}>{detailProject.priority || 'normal'}</strong>
                </div>
                <div className="prj-meta-block">
                  <span>Progress</span>
                  <strong>
                    {computeProgress(detailProject)}%
                    {Number(detailProject.tasks_total || 0) > 0 && ` (${detailProject.tasks_done}/${detailProject.tasks_total} tasks)`}
                  </strong>
                </div>
                <div className="prj-meta-block">
                  <span>Target Date</span>
                  <strong>{formatShortDate(detailProject.due_date) || 'Not set'}</strong>
                </div>
              </div>

              {aiOpen && (
                <AiInsightBox
                  title={`ZORVI Summary: ${detailProject.name}`}
                  loading={aiLoading}
                  error={aiErr}
                  uncertainty={aiData?.uncertainty}
                  providerMeta={aiData?.meta}
                  onRefresh={() => runAiSummary(detailProject.id)}
                  onClose={() => setAiOpen(false)}
                >
                  {aiData && (
                    <div>
                      <p style={{ margin: '0 0 6px' }}>{aiData.summary}</p>
                      {aiData.openIssuesAndRisks?.length > 0 && (
                        <ul className="zx-ai-list">
                          {aiData.openIssuesAndRisks.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      )}
                      {aiData.followUpActions?.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <strong>Next Actions:</strong>
                          <ul className="zx-ai-list">
                            {aiData.followUpActions.map((a, i) => <li key={i}>{a}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </AiInsightBox>
              )}

              <div className="prj-detail-desc-box">
                <div className="prj-section-lbl">Description</div>
                {detailProject.description ? (
                  <div
                    className="prj-detail-desc"
                    dangerouslySetInnerHTML={{ __html: renderSafeHtml(detailProject.description) }}
                  />
                ) : (
                  <div className="prj-muted">No description provided.</div>
                )}
              </div>

              <div className="prj-detail-comments">
                <ProjectComments
                  projectId={detailProject.id}
                  isAdmin={isAdmin}
                  currentUser={currentUser}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MANAGE PROJECT MEMBERS MODAL (ADMIN) ===================== */}
      {accessProject && (
        <div className="prj-modal-backdrop" onClick={() => setAccessProject(null)}>
          <div className="prj-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Manage Project Members">
            <div className="prj-modal-header">
              <div>
                <h4>Project Team Access</h4>
                <span className="prj-modal-sub">{accessProject.name} ({accessProject.code})</span>
              </div>
              <button type="button" className="prj-modal-close" onClick={() => setAccessProject(null)}>×</button>
            </div>
            <div className="prj-modal-form">
              <form className="prj-member-add-row" onSubmit={addMember}>
                <select value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} required>
                  <option value="">Select employee to add...</option>
                  {allUsers
                    .filter((u) => !members.some((m) => Number(m.user_id) === Number(u.id)))
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                </select>
                <label className="prj-chk">
                  <input type="checkbox" checked={memberCanEdit} onChange={(e) => setMemberCanEdit(e.target.checked)} />
                  Edit
                </label>
                <label className="prj-chk">
                  <input type="checkbox" checked={memberCanPay} onChange={(e) => setMemberCanPay(e.target.checked)} />
                  Payments
                </label>
                <button type="submit" className="prj-btn-primary sm">Add</button>
              </form>

              {membersLoading ? (
                <div className="prj-muted">Loading team members...</div>
              ) : members.length === 0 ? (
                <div className="prj-muted">No non-admin members assigned yet.</div>
              ) : (
                <div className="prj-members-list">
                  {members.map((m) => (
                    <div key={m.user_id} className="prj-member-row">
                      <div>
                        <strong>{m.name}</strong>
                        <div className="prj-list-sub">{m.email}</div>
                      </div>
                      <div className="prj-member-perms">
                        <label className="prj-chk">
                          <input type="checkbox" checked={!!m.can_edit} onChange={() => toggleMemberPerm(m, 'can_edit')} />
                          Can Edit
                        </label>
                        <label className="prj-chk">
                          <input type="checkbox" checked={!!m.can_manage_payments} onChange={() => toggleMemberPerm(m, 'can_manage_payments')} />
                          Payments
                        </label>
                        <button type="button" className="prj-btn-mini danger" onClick={() => removeMember(m)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="prj-modal-actions">
                <button type="button" className="prj-btn-subtle" onClick={() => setAccessProject(null)}>Close</button>
              </div>
            </div>
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
  );
}
