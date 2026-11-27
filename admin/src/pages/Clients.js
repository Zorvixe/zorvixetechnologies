"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import RichTextEditor from "../components/RichTextEditor";
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
  apiAiClientSummary,
  apiAiProjectSummary,
} from "../api";
import AiInsightBox from "../components/AiInsightBox";
import {
  SparklesIcon,
  CheckIcon,
  XIcon,
  SearchIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  BuildingIcon,
  FolderIcon,
  UsersIcon,
  MailIcon,
  PhoneIcon,
  EyeIcon,
  BriefcaseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageSquareIcon,
} from "../components/CrmHrmsIcons";
import ProjectComments from "../components/ProjectComments";
import "./Clients.css";

import DOMPurify from "dompurify";
import linkifyHtml from "linkify-html";

const truncateUrl = (url, maxLength = 30) => {
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength) + "...";
};

const renderSafeHtmlWithLinks = (html) => {
  if (!html) return "";
  const allowedTags = ["b", "i", "em", "strong", "a", "p", "ul", "ol", "li", "br", "span", "div", "img"];
  const allowedAttrs = ["href", "src", "alt", "title", "target", "rel", "class", "style"];

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttrs,
  });

  const linkified = linkifyHtml(sanitized, {
    defaultProtocol: "https",
    attributes: {
      rel: "noopener noreferrer",
      target: "_blank",
    },
    format: (value, type) => (type === "url" ? truncateUrl(value) : value),
  });

  return DOMPurify.sanitize(linkified, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttrs,
  });
};

const TYPE_LABELS = {
  web_development: "Web Development",
  digital_marketing: "Digital Marketing",
  data_analytics: "Data Analytics",
  other: "Other",
};

const STATUS_LABELS = {
  new: "New",
  InProgress: "In Progress",
  completed: "Completed",
  OnHold: "On Hold",
  cancelled: "Cancelled",
};

const AVATAR_TONES = [
  "tone-blue",
  "tone-teal",
  "tone-amber",
  "tone-emerald",
  "tone-slate",
];

function getAvatarTone(seed = "") {
  const str = String(seed || "Z");
  let sum = 0;
  for (let i = 0; i < str.length; i += 1) sum += str.charCodeAt(i);
  return AVATAR_TONES[sum % AVATAR_TONES.length];
}

function getInitials(name, company) {
  const src = (name || company || "C").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function formatShortDate(dt) {
  if (!dt) return "--";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "--";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Clients() {
  const [isAdmin, setIsAdmin] = useState(false);

  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [epForm, setEpForm] = useState({
    id: null,
    name: "",
    status: "new",
    type: "web_development",
    other_type: "",
    description: "",
  });

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
      setProjects((prev) => prev.map((x) => (x.id === epForm.id ? { ...x, ...r.project } : x)));
      setViewProject((prev) => (prev && prev.id === epForm.id ? { ...prev, ...r.project } : prev));
      setShowEditProjectModal(false);
      showToast("Project updated", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // Clients list, search, filter, sort & view mode
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all"); // 'all' | 'with_projects' | 'without_projects'
  const [sortBy, setSortBy] = useState("newest"); // 'newest' | 'projects_desc' | 'name_asc'
  const [viewMode, setViewMode] = useState("cards"); // 'cards' | 'table'
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const clientStats = useMemo(() => {
    const total = clients.length;
    const totalProjects = clients.reduce((sum, c) => sum + Number(c.project_count || 0), 0);
    const withProjects = clients.filter((c) => Number(c.project_count || 0) > 0).length;
    const withoutProjects = total - withProjects;
    return { total, totalProjects, withProjects, withoutProjects };
  }, [clients]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = clients.filter((c) => {
      const pCount = Number(c.project_count || 0);
      if (projectFilter === "with_projects" && pCount === 0) return false;
      if (projectFilter === "without_projects" && pCount > 0) return false;
      if (q) {
        const hay = `${c.id || ""} ${c.name || ""} ${c.email || ""} ${c.phone || ""} ${c.company || ""} ${c.industry || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === "projects_desc") {
      return [...list].sort((a, b) => Number(b.project_count || 0) - Number(a.project_count || 0));
    }
    if (sortBy === "name_asc") {
      return [...list].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    }
    return list;
  }, [clients, search, projectFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const pagedClients = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredClients.slice(start, start + PAGE_SIZE);
  }, [filteredClients, page]);

  // Create/edit client
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", company: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [drawerEditingClient, setDrawerEditingClient] = useState(false);

  // Selected client (Right-side Inspector Drawer) & projects
  const [selected, setSelected] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projLoading, setProjLoading] = useState(false);

  // AI Client & Project Summaries
  const [clientAiOpen, setClientAiOpen] = useState(false);
  const [clientAiLoading, setClientAiLoading] = useState(false);
  const [clientAiErr, setClientAiErr] = useState("");
  const [clientAiData, setClientAiData] = useState(null);

  const [projAiOpen, setProjAiOpen] = useState(false);
  const [projAiLoading, setProjAiLoading] = useState(false);
  const [projAiErr, setProjAiErr] = useState("");
  const [projAiData, setProjAiData] = useState(null);

  const runClientAiSummary = async (cid) => {
    if (!cid) return;
    setClientAiOpen(true);
    setClientAiLoading(true);
    setClientAiErr("");
    try {
      const res = await apiAiClientSummary(cid);
      setClientAiData(res);
    } catch (e) {
      setClientAiErr(e?.message || "Failed to summarize client");
    } finally {
      setClientAiLoading(false);
    }
  };

  const runProjectAiSummary = async (pid) => {
    if (!pid) return;
    setProjAiOpen(true);
    setProjAiLoading(true);
    setProjAiErr("");
    try {
      const res = await apiAiProjectSummary(pid);
      setProjAiData(res);
    } catch (e) {
      setProjAiErr(e?.message || "Failed to summarize project");
    } finally {
      setProjAiLoading(false);
    }
  };

  // Inline project edit inside drawer
  const [projEditId, setProjEditId] = useState(null);
  const [projEditForm, setProjEditForm] = useState({ name: "", status: "new" });

  // New project (modal)
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [np, setNp] = useState({ name: "", description: "", type: "web_development", other_type: "" });
  const showOther = np.type === "other";

  // Project details modal
  const [viewProject, setViewProject] = useState(null);

  // Members cache & access manager
  const [membersByProject, setMembersByProject] = useState({});
  const [users, setUsers] = useState([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [accessProject, setAccessProject] = useState(null);
  const [addingMember, setAddingMember] = useState({ user_id: "", can_edit: false, can_manage_payments: false });

  // Toast
  const toastTimer = useRef(null);
  const [toast, setToast] = useState({ open: false, type: "success", message: "" });
  const showToast = (message, type = "success") => {
    setToast({ open: true, type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000);
  };
  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast((t) => ({ ...t, open: false }));
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const r = await apiListClients();
        setClients(r.clients || []);
        const me = await apiMe();
        const role = (me.me?.role || me.user?.role || "").toLowerCase();
        setIsAdmin(role === "admin");
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [filteredClients.length, page, totalPages]);

  async function refreshProjects(client) {
    if (!client) return;
    setProjLoading(true);
    try {
      const r = await apiListClientProjects(client.id);
      setProjects(r.projects || []);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setProjLoading(false);
    }
  }

  async function openClient(c) {
    setSelected(c);
    setDrawerEditingClient(false);
    setEditForm({ name: c.name || "", email: c.email || "", phone: c.phone || "", company: c.company || "" });
    setClientAiOpen(false);
    setClientAiData(null);
    setProjEditId(null);
    await refreshProjects(c);
    setMemberLoading(true);
    try {
      const u = await apiListUsers({ limit: 200 });
      setUsers(u.data || []);
    } catch {
      /* no-op */
    } finally {
      setMemberLoading(false);
    }
  }

  function closeClientDrawer() {
    setSelected(null);
    setProjects([]);
    setClientAiOpen(false);
    setDrawerEditingClient(false);
    setProjEditId(null);
  }

  // Client CRUD
  async function createClient(e) {
    e.preventDefault();
    try {
      const r = await apiCreateClient(newClient);
      setClients((prev) => [r.client, ...prev]);
      setNewClient({ name: "", email: "", phone: "", company: "" });
      setShowCreateClient(false);
      setPage(1);
      showToast("Client created", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditForm({ name: c.name || "", email: c.email || "", phone: c.phone || "", company: c.company || "" });
  }

  async function saveEdit(id) {
    try {
      const r = await apiPatchClient(id, editForm);
      setClients((prev) => prev.map((x) => (x.id === id ? { ...x, ...r.client } : x)));
      setSelected((prev) => (prev && prev.id === id ? { ...prev, ...r.client } : prev));
      setEditingId(null);
      setDrawerEditingClient(false);
      showToast("Client updated", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function delClient(id) {
    if (!window.confirm("Delete this client and ALL its projects?")) return;
    try {
      await apiDeleteClient(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
      if (selected?.id === id) closeClientDrawer();
      showToast("Client deleted", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  // Project CRUD
  async function createProject(e) {
    e.preventDefault();
    try {
      const body = {
        client_id: selected.id,
        name: np.name,
        description: np.description,
        type: np.type,
        other_type: showOther ? np.other_type : "",
      };
      await apiCreateProject(body);
      setNp({ name: "", description: "", type: "web_development", other_type: "" });
      setShowCreateProject(false);
      await refreshProjects(selected);
      setClients((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, project_count: Number(c.project_count || 0) + 1 } : c))
      );
      showToast("Project created", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  function startEditProject(p) {
    setProjEditId(p.id);
    setProjEditForm({ name: p.name || "", status: p.status || "new" });
  }

  async function saveProjectInline(p) {
    try {
      const r = await apiPatchProject(p.id, { name: projEditForm.name, status: projEditForm.status });
      setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...r.project } : x)));
      setProjEditId(null);
      showToast("Project updated", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function deleteProject(p) {
    if (!window.confirm("Delete this project?")) return;
    try {
      await apiDeleteProject(p.id);
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
      setMembersByProject((prev) => {
        const c = { ...prev };
        delete c[p.id];
        return c;
      });
      if (selected) {
        setClients((prev) =>
          prev.map((c) =>
            c.id === selected.id ? { ...c, project_count: Math.max(0, Number(c.project_count || 1) - 1) } : c
          )
        );
      }
      showToast("Project deleted", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  // Members
  async function refreshMembers(project) {
    setMemberLoading(true);
    try {
      const r = await apiListProjectMembers(project.id);
      setMembersByProject((prev) => ({ ...prev, [project.id]: r.members || [] }));
    } catch {
      setMembersByProject((prev) => ({ ...prev, [project.id]: [] }));
    } finally {
      setMemberLoading(false);
    }
  }

  const members = accessProject ? membersByProject[accessProject.id] || [] : [];
  const optimisticUpdate = (updater) => {
    if (!accessProject) return;
    setMembersByProject((prev) => {
      const cur = prev[accessProject.id] || [];
      return { ...prev, [accessProject.id]: cur.map(updater) };
    });
  };

  const [activeTab, setActiveTab] = useState("details");
  const [currentUser, setCurrentUser] = useState({ id: null });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
  }, []);

  const drawerProjectCounts = useMemo(() => {
    const active = projects.filter((p) => p.status === "new" || p.status === "InProgress").length;
    const completed = projects.filter((p) => p.status === "completed").length;
    return { active, completed };
  }, [projects]);

  if (loading) {
    return (
      <div className="loader_container">
        <p className="loader_spinner"></p>
        <p>Loading client portfolio...</p>
      </div>
    );
  }

  if (error) return <div className="cl-error-banner">{error}</div>;

  return (
    <div className="clients-page">
      {/* Header */}
      <div className="cl-header">
        <div>
          <div className="cl-breadcrumb">
            <span>Workspace</span>
            <span className="cl-bc-sep">/</span>
            <span className="cl-bc-current">Clients</span>
          </div>
          <h1 className="cl-title">Client Portfolio</h1>
          <p className="cl-subtitle">
            Client organizations
          </p>
        </div>

        <div className="cl-header-actions">
          <div className="cl-view-switch" role="group" aria-label="View mode">
            <button
              type="button"
              className={`cl-switch-btn ${viewMode === "cards" ? "active" : ""}`}
              onClick={() => setViewMode("cards")}
            >
              Cards
            </button>
            <button
              type="button"
              className={`cl-switch-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
            >
              Table
            </button>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="cl-btn-primary"
              onClick={() => setShowCreateClient(true)}
            >
              <PlusIcon size={14} />
              <span>New Client</span>
            </button>
          )}
        </div>
      </div>

      {/* Editorial KPI Strip */}
      <div className="cl-kpi-strip">
        <button
          type="button"
          className={`cl-kpi-card ${projectFilter === "all" ? "active" : ""}`}
          onClick={() => {
            setProjectFilter("all");
            setPage(1);
          }}
        >
          <div className="cl-kpi-top">
            <span className="cl-kpi-label">Total clients</span>
            <span className="cl-kpi-icon">
              <BuildingIcon size={14} />
            </span>
          </div>
          <strong className="cl-kpi-val tabular-nums">{clientStats.total}</strong>
          <span className="cl-kpi-hint">Registered accounts</span>
        </button>

        <div className="cl-kpi-card cl-kpi-static">
          <div className="cl-kpi-top">
            <span className="cl-kpi-label">Linked projects</span>
            <span className="cl-kpi-icon accent">
              <FolderIcon size={14} />
            </span>
          </div>
          <strong className="cl-kpi-val cl-val-accent tabular-nums">{clientStats.totalProjects}</strong>
          <span className="cl-kpi-hint">Across all clients</span>
        </div>

        <button
          type="button"
          className={`cl-kpi-card ${projectFilter === "with_projects" ? "active" : ""}`}
          onClick={() => {
            setProjectFilter((v) => (v === "with_projects" ? "all" : "with_projects"));
            setPage(1);
          }}
        >
          <div className="cl-kpi-top">
            <span className="cl-kpi-label">Active engagements</span>
            <span className="cl-kpi-icon pos">
              <BriefcaseIcon size={14} />
            </span>
          </div>
          <strong className="cl-kpi-val cl-val-pos tabular-nums">{clientStats.withProjects}</strong>
          <span className="cl-kpi-hint">With active projects</span>
        </button>

        <button
          type="button"
          className={`cl-kpi-card ${projectFilter === "without_projects" ? "active" : ""}`}
          onClick={() => {
            setProjectFilter((v) => (v === "without_projects" ? "all" : "without_projects"));
            setPage(1);
          }}
        >
          <div className="cl-kpi-top">
            <span className="cl-kpi-label">Onboarding queue</span>
            <span className="cl-kpi-icon warn">
              <UsersIcon size={14} />
            </span>
          </div>
          <strong className="cl-kpi-val cl-val-warn tabular-nums">{clientStats.withoutProjects}</strong>
          <span className="cl-kpi-hint">Awaiting first project</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="cl-filter-surface">
        <div className="cl-search-wrap">
          <SearchIcon size={15} className="cl-search-icon" />
          <input
            type="text"
            className="cl-search-input"
            placeholder="Search client name, company, email, phone, or ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {search && (
            <button
              type="button"
              className="cl-search-clear"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="cl-filter-controls">
          <div className="cl-seg-pills">
            <button
              type="button"
              className={`cl-seg-pill ${projectFilter === "all" ? "active" : ""}`}
              onClick={() => {
                setProjectFilter("all");
                setPage(1);
              }}
            >
              All
            </button>
            <button
              type="button"
              className={`cl-seg-pill ${projectFilter === "with_projects" ? "active" : ""}`}
              onClick={() => {
                setProjectFilter("with_projects");
                setPage(1);
              }}
            >
              With projects
            </button>
            <button
              type="button"
              className={`cl-seg-pill ${projectFilter === "without_projects" ? "active" : ""}`}
              onClick={() => {
                setProjectFilter("without_projects");
                setPage(1);
              }}
            >
              No projects
            </button>
            <select
              className="cl-filter-select"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              aria-label="Sort clients"
            >
              <option value="newest">Sort: Newest first</option>
              <option value="projects_desc">Sort: Most projects</option>
              <option value="name_asc">Sort: Name A–Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Directory Content */}
      {!filteredClients.length ? (
        <div className="cl-empty-state">
          <div className="cl-empty-icon-wrap">
            <BuildingIcon size={24} />
          </div>
          <h4>{clients.length === 0 ? "No clients registered yet" : "No matching clients found"}</h4>
          <p>
            {clients.length === 0
              ? 'Add your first client account to create projects, manage team access, and generate ZORVI briefs.'
              : "Try clearing your search query or switching engagement filters."}
          </p>
          {(search || projectFilter !== "all") && (
            <button
              type="button"
              className="cl-btn-subtle"
              onClick={() => {
                setSearch("");
                setProjectFilter("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : viewMode === "cards" ? (
        <div className="cl-cards-wrapper">
          <div className="cl-cards-grid">
            {pagedClients.map((c) => {
              const initials = getInitials(c.name, c.company);
              const tone = getAvatarTone(c.name || c.company);
              const pCount = Number(c.project_count || 0);
              const isSelected = selected?.id === c.id;

              return (
                <div
                  key={c.id}
                  className={`cl-portfolio-card ${isSelected ? "is-selected" : ""}`}
                  onClick={() => openClient(c)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openClient(c);
                    }
                  }}
                >
                  <div className="cl-pcard-header">
                    <div className="cl-pcard-identity">
                      <div className={`cl-avatar cl-avatar-lg ${tone}`}>{initials}</div>
                      <div className="cl-name-meta">
                        <div className="cl-pcard-title-row">
                          <strong>{c.name}</strong>
                        </div>
                        <span className="cl-pcard-company">
                          {c.company || "Independent Account"}
                        </span>
                      </div>
                    </div>
                    <span className="cl-id-badge tabular-nums">CL-{c.id}</span>
                  </div>

                  <div className="cl-pcard-fields">
                    <div className="cl-pcard-field">
                      <span className="cl-pf-label"><MailIcon size={12} /> Email</span>
                      <span className="cl-pf-val">{c.email || "--"}</span>
                    </div>
                    <div className="cl-pcard-field">
                      <span className="cl-pf-label"><PhoneIcon size={12} /> Phone</span>
                      <span className="cl-pf-val tabular-nums">{c.phone || "--"}</span>
                    </div>
                  </div>

                  <div className="cl-pcard-footer" onClick={(e) => e.stopPropagation()}>
                    <div className="cl-pcard-metrics">
                      <span className={`cl-proj-badge tabular-nums ${pCount > 0 ? "has-projects" : ""}`}>
                        <FolderIcon size={12} />
                        <span>{pCount} {pCount === 1 ? "project" : "projects"}</span>
                      </span>
                      {c.industry && <span className="cl-industry-badge">{c.industry}</span>}
                    </div>

                    <div className="cl-pcard-actions">
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            className="cl-icon-btn"
                            onClick={() => {
                              openClient(c);
                              setDrawerEditingClient(true);
                            }}
                            title="Edit client"
                          >
                            <EditIcon size={13} />
                          </button>
                          <button
                            type="button"
                            className="cl-icon-btn danger"
                            onClick={() => delClient(c.id)}
                            title="Delete client"
                          >
                            <TrashIcon size={13} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="cl-btn-inspect"
                        onClick={() => openClient(c)}
                      >
                        <span>Inspect</span>
                        <ChevronRightIcon size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cl-pagination cl-pagination-standalone">
            <span className="cl-pagination-info tabular-nums">
              Page {page} of {totalPages} · {filteredClients.length} accounts
            </span>
            <div className="cl-pagination-btns">
              <button
                type="button"
                className="cl-btn-subtle"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeftIcon size={14} />
                <span>Previous</span>
              </button>
              <button
                type="button"
                className="cl-btn-subtle"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <span>Next</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="cl-card">
          <div className="cl-table-wrap">
            <table className="cl-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Phone</th>
                  <th>Company</th>
                  <th>Projects</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedClients.map((c) => {
                  const initials = getInitials(c.name, c.company);
                  const tone = getAvatarTone(c.name || c.company);
                  const isEditing = editingId === c.id;
                  const pCount = Number(c.project_count || 0);

                  return (
                    <tr
                      key={c.id}
                      className={`${!isEditing ? "cl-row-clickable" : ""} ${selected?.id === c.id ? "cl-row-selected" : ""}`}
                      onClick={() => {
                        if (!isEditing) openClient(c);
                      }}
                    >
                      <td>
                        {isEditing ? (
                          <div className="cl-inline-edit-stack" onClick={(e) => e.stopPropagation()}>
                            <input
                              id={`editName-${c.id}`}
                              className="cl-inline-input"
                              value={editForm.name}
                              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                              placeholder="Client name"
                              autoComplete="name"
                            />
                            <input
                              id={`editEmail-${c.id}`}
                              className="cl-inline-input"
                              type="email"
                              value={editForm.email}
                              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                              placeholder="Email"
                              autoComplete="email"
                            />
                          </div>
                        ) : (
                          <div className="cl-name-cell">
                            <div className={`cl-avatar ${tone}`}>{initials}</div>
                            <div className="cl-name-meta">
                              <div className="cl-name-row">
                                <strong>{c.name}</strong>
                                <span className="cl-id-tag tabular-nums">CL-{c.id}</span>
                              </div>
                              <span className="cl-email-sub">{c.email || "--"}</span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="tabular-nums">
                        {isEditing ? (
                          <input
                            id={`editPhone-${c.id}`}
                            className="cl-inline-input"
                            value={editForm.phone}
                            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Phone"
                            autoComplete="tel"
                          />
                        ) : (
                          <span className="cl-phone-text">{c.phone || "--"}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            id={`editCompany-${c.id}`}
                            className="cl-inline-input"
                            value={editForm.company}
                            onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Company"
                            autoComplete="organization"
                          />
                        ) : (
                          <span className="cl-company-pill">{c.company || "--"}</span>
                        )}
                      </td>
                      <td>
                        <span className={`cl-proj-badge tabular-nums ${pCount > 0 ? "has-projects" : ""}`}>
                          <FolderIcon size={12} />
                          <span>{pCount}</span>
                        </span>
                      </td>
                      <td className="cl-date-cell tabular-nums">{formatShortDate(c.created_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="cl-row-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="cl-icon-btn positive"
                                onClick={() => saveEdit(c.id)}
                                title="Save"
                              >
                                <CheckIcon size={14} />
                              </button>
                              <button
                                type="button"
                                className="cl-icon-btn danger"
                                onClick={() => setEditingId(null)}
                                title="Cancel"
                              >
                                <XIcon size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="cl-btn-inspect"
                                onClick={() => openClient(c)}
                              >
                                <EyeIcon size={13} />
                                <span>Inspect</span>
                              </button>
                              {isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    className="cl-icon-btn"
                                    onClick={() => startEdit(c)}
                                    title="Edit inline"
                                  >
                                    <EditIcon size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className="cl-icon-btn danger"
                                    onClick={() => delClient(c.id)}
                                    title="Delete client"
                                  >
                                    <TrashIcon size={14} />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="cl-pagination">
            <span className="cl-pagination-info tabular-nums">
              Page {page} of {totalPages} · {filteredClients.length} accounts
            </span>
            <div className="cl-pagination-btns">
              <button
                type="button"
                className="cl-btn-subtle"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeftIcon size={14} />
                <span>Previous</span>
              </button>
              <button
                type="button"
                className="cl-btn-subtle"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <span>Next</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RIGHT-SIDE SLIDE-OVER CLIENT INSPECTOR DRAWER */}
      {selected && (
        <div className="cl-drawer-backdrop" onClick={closeClientDrawer}>
          <aside
            className="cl-drawer-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Client details and projects"
          >
            {/* Pinned Drawer Header */}
            <div className="cl-drawer-header">
              <div className="cl-drawer-header-top">
                <div className="cl-drawer-identity">
                  <div className={`cl-avatar cl-avatar-xl ${getAvatarTone(selected.name || selected.company)}`}>
                    {getInitials(selected.name, selected.company)}
                  </div>
                  <div>
                    <div className="cl-drawer-title-line">
                      <h3>{selected.name}</h3>
                      {selected.company && <span className="cl-company-pill">{selected.company}</span>}
                      <span className="cl-id-badge tabular-nums">CL-{selected.id}</span>
                    </div>
                    <div className="cl-drawer-subtitle">
                      {selected.email && (
                        <a href={`mailto:${selected.email}`} className="cl-drawer-link">
                          <MailIcon size={12} /> {selected.email}
                        </a>
                      )}
                      {selected.phone && (
                        <a href={`tel:${selected.phone}`} className="cl-drawer-link tabular-nums">
                          <PhoneIcon size={12} /> {selected.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="cl-modal-close"
                  onClick={closeClientDrawer}
                  aria-label="Close drawer"
                >
                  <XIcon size={16} />
                </button>
              </div>

              <div className="cl-drawer-metrics-strip">
                <div className="cl-metric-cell">
                  <span>Total projects</span>
                  <strong className="tabular-nums">{projects.length}</strong>
                </div>
                <div className="cl-metric-cell">
                  <span>Active / New</span>
                  <strong className="cl-val-accent tabular-nums">{drawerProjectCounts.active}</strong>
                </div>
                <div className="cl-metric-cell">
                  <span>Completed</span>
                  <strong className="cl-val-pos tabular-nums">{drawerProjectCounts.completed}</strong>
                </div>
                <div className="cl-metric-cell">
                  <span>Client since</span>
                  <strong className="tabular-nums">{formatShortDate(selected.created_at)}</strong>
                </div>
              </div>
            </div>

            {/* Two-Column Split Scrollable Body */}
            <div className="cl-drawer-body">
              {/* LEFT PANE: Account Dossier + ZORVI Intelligence */}
              <div className="cl-drawer-left">
                <div className="cl-section-heading-row">
                  <span className="cl-section-eyebrow">Account dossier · Known info</span>
                  {isAdmin && (
                    <button
                      type="button"
                      className="cl-btn-mini"
                      onClick={() => {
                        setEditForm({
                          name: selected.name || "",
                          email: selected.email || "",
                          phone: selected.phone || "",
                          company: selected.company || "",
                        });
                        setDrawerEditingClient((v) => !v);
                      }}
                    >
                      <EditIcon size={12} />
                      <span>{drawerEditingClient ? "Cancel edit" : "Edit profile"}</span>
                    </button>
                  )}
                </div>

                {drawerEditingClient ? (
                  <form
                    className="cl-drawer-edit-card"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit(selected.id);
                    }}
                  >
                    <div className="cl-form-group">
                      <label>Client Name *</label>
                      <input
                        required
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="cl-form-group">
                      <label>Company Name</label>
                      <input
                        value={editForm.company}
                        onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))}
                      />
                    </div>
                    <div className="cl-form-group">
                      <label>Email Address *</label>
                      <input
                        type="email"
                        required
                        value={editForm.email}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                    <div className="cl-form-group">
                      <label>Phone Number *</label>
                      <input
                        type="tel"
                        required
                        value={editForm.phone}
                        onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                    <div className="cl-drawer-edit-actions">
                      <button
                        type="button"
                        className="cl-btn-subtle"
                        onClick={() => setDrawerEditingClient(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="cl-btn-primary">
                        Save Profile
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="cl-known-info-grid">
                    <div className="cl-known-cell">
                      <span className="cl-k-label">Contact name</span>
                      <span className="cl-k-val">{selected.name || "--"}</span>
                    </div>
                    <div className="cl-known-cell">
                      <span className="cl-k-label">Organization</span>
                      <span className="cl-k-val">{selected.company || "--"}</span>
                    </div>
                    <div className="cl-known-cell">
                      <span className="cl-k-label">Email address</span>
                      <span className="cl-k-val">{selected.email || "--"}</span>
                    </div>
                    <div className="cl-known-cell">
                      <span className="cl-k-label">Phone number</span>
                      <span className="cl-k-val tabular-nums">{selected.phone || "--"}</span>
                    </div>
                    <div className="cl-known-cell">
                      <span className="cl-k-label">Industry</span>
                      <span className="cl-k-val">{selected.industry || "General"}</span>
                    </div>
                    <div className="cl-known-cell">
                      <span className="cl-k-label">Account ID</span>
                      <span className="cl-k-val cl-mono tabular-nums">CL-{selected.id}</span>
                    </div>
                    {(selected.city || selected.country || selected.website) && (
                      <>
                        <div className="cl-known-cell">
                          <span className="cl-k-label">Location</span>
                          <span className="cl-k-val">
                            {[selected.city, selected.country].filter(Boolean).join(", ") || "--"}
                          </span>
                        </div>
                        <div className="cl-known-cell">
                          <span className="cl-k-label">Website</span>
                          <span className="cl-k-val">{selected.website || "--"}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ZORVI Client Intelligence Card inside Drawer */}
                <div className="cl-ai-section">
                  <div className="cl-section-heading-row">
                    <span className="cl-section-eyebrow">ZORVI account intelligence</span>
                    <button
                      type="button"
                      className="zx-ai-pill-btn"
                      onClick={() => runClientAiSummary(selected.id)}
                    >
                      <SparklesIcon size={12} />
                      <span>{clientAiOpen ? "Refresh Brief" : "ZORVI Client Brief"}</span>
                    </button>
                  </div>

                  {clientAiOpen ? (
                    <AiInsightBox
                      title={`Client History & Follow-ups`}
                      loading={clientAiLoading}
                      error={clientAiErr}
                      uncertainty={clientAiData?.uncertainty}
                      providerMeta={clientAiData?.meta}
                      onRefresh={() => runClientAiSummary(selected.id)}
                      onClose={() => setClientAiOpen(false)}
                    >
                      {clientAiData && (
                        <div>
                          <p style={{ margin: "0 0 6px" }}>{clientAiData.summary}</p>
                          {clientAiData.openIssuesAndRisks?.length > 0 && (
                            <div style={{ fontSize: "12px", marginTop: "4px" }}>
                              <strong>Open Issues &amp; Risks:</strong>
                              <ul className="zx-ai-list">
                                {clientAiData.openIssuesAndRisks.map((r, i) => <li key={i}>{r}</li>)}
                              </ul>
                            </div>
                          )}
                          {clientAiData.followUpActions?.length > 0 && (
                            <div style={{ fontSize: "12px", marginTop: "4px" }}>
                              <strong>Follow-up Actions:</strong>
                              <ul className="zx-ai-list">
                                {clientAiData.followUpActions.map((a, i) => <li key={i}>{a}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </AiInsightBox>
                  ) : (
                    <div className="cl-ai-placeholder-card">
                      <p>Generate an AI executive brief of delivery risks, ticket signals, and next client follow-ups.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT PANE: Client Projects & Team Access */}
              <div className="cl-drawer-right">
                <div className="cl-section-heading-row">
                  <span className="cl-section-eyebrow">
                    Delivery projects · {projects.length}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      className="cl-btn-mini cl-btn-mini-accent"
                      onClick={() => setShowCreateProject(true)}
                    >
                      <PlusIcon size={12} />
                      <span>New Project</span>
                    </button>
                  )}
                </div>

                {projLoading ? (
                  <div className="loader_container">
                    <p className="loader_spinner"></p>
                    <p>Loading projects...</p>
                  </div>
                ) : !projects.length ? (
                  <div className="cl-empty-state cl-empty-compact">
                    <FolderIcon size={24} />
                    <h4>No projects yet</h4>
                    <p>Create a project to track milestones, comments, and team access for this client.</p>
                    {isAdmin && (
                      <button
                        type="button"
                        className="cl-btn-primary"
                        onClick={() => setShowCreateProject(true)}
                      >
                        <PlusIcon size={14} />
                        <span>New Project</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="cl-drawer-projects-list">
                    {projects.map((p) => {
                      const isEditingProj = projEditId === p.id;
                      return (
                        <div className="cl-project-item-card" key={p.id}>
                          <div className="cl-proj-item-top">
                            <div className="cl-proj-code-row">
                              <span className="cl-id-badge tabular-nums">{p.code || `PRJ-${p.id}`}</span>
                              <span className="cl-company-pill">
                                {TYPE_LABELS[p.type] || p.type}
                                {p.type === "other" && p.other_type ? ` / ${p.other_type}` : ""}
                              </span>
                            </div>

                            {isEditingProj ? (
                              <select
                                className="cl-inline-input"
                                value={projEditForm.status}
                                onChange={(e) => setProjEditForm((f) => ({ ...f, status: e.target.value }))}
                              >
                                <option value="new">New</option>
                                <option value="InProgress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="OnHold">On Hold</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            ) : (
                              <span className={`cl-status-pill status-${String(p.status || "new").toLowerCase()}`}>
                                {STATUS_LABELS[p.status] || p.status}
                              </span>
                            )}
                          </div>

                          {isEditingProj ? (
                            <input
                              className="cl-inline-input cl-proj-inline-title"
                              value={projEditForm.name}
                              onChange={(e) => setProjEditForm((f) => ({ ...f, name: e.target.value }))}
                              placeholder="Project name"
                            />
                          ) : (
                            <h4
                              className="cl-proj-item-title"
                              onClick={() => {
                                setActiveTab("details");
                                setViewProject(p);
                              }}
                            >
                              {p.name}
                            </h4>
                          )}

                          {p.description && !isEditingProj && (
                            <div
                              className="cl-proj-item-desc"
                              dangerouslySetInnerHTML={{ __html: renderSafeHtmlWithLinks(p.description) }}
                            />
                          )}

                          <div className="cl-proj-item-footer">
                            <div className="cl-proj-footer-left">
                              <button
                                type="button"
                                className="cl-btn-mini"
                                onClick={() => {
                                  setActiveTab("details");
                                  setViewProject(p);
                                }}
                              >
                                <EyeIcon size={12} />
                                <span>Details</span>
                              </button>
                              <button
                                type="button"
                                className="cl-btn-mini"
                                onClick={() => {
                                  setActiveTab("comments");
                                  setViewProject(p);
                                }}
                              >
                                <MessageSquareIcon size={12} />
                                <span>Comments</span>
                              </button>
                              <button
                                type="button"
                                className="cl-btn-mini"
                                onClick={async () => {
                                  setAccessProject(p);
                                  await refreshMembers(p);
                                }}
                              >
                                <UsersIcon size={12} />
                                <span>Access</span>
                              </button>
                            </div>

                            <div className="cl-proj-footer-right">
                              {isEditingProj ? (
                                <>
                                  <button
                                    type="button"
                                    className="cl-icon-btn positive"
                                    onClick={() => saveProjectInline(p)}
                                    title="Save"
                                  >
                                    <CheckIcon size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="cl-icon-btn danger"
                                    onClick={() => setProjEditId(null)}
                                    title="Cancel"
                                  >
                                    <XIcon size={13} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="cl-icon-btn"
                                    title="Quick edit"
                                    onClick={() => startEditProject(p)}
                                  >
                                    <EditIcon size={13} />
                                  </button>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      className="cl-icon-btn danger"
                                      title="Delete project"
                                      onClick={() => deleteProject(p)}
                                    >
                                      <TrashIcon size={13} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Pinned Drawer Footer */}
            <div className="cl-drawer-footer">
              <div className="cl-footer-left">
                {selected.email && (
                  <a className="cl-btn-subtle" href={`mailto:${selected.email}`}>
                    <MailIcon size={13} />
                    <span>Email Client</span>
                  </a>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    className="cl-btn-danger-subtle"
                    onClick={() => delClient(selected.id)}
                  >
                    <TrashIcon size={13} />
                    <span>Delete Client</span>
                  </button>
                )}
              </div>
              <div className="cl-footer-right">
                {isAdmin && (
                  <button
                    type="button"
                    className="cl-btn-primary"
                    onClick={() => setShowCreateProject(true)}
                  >
                    <PlusIcon size={14} />
                    <span>New Project</span>
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Create Client Modal */}
      {showCreateClient && (
        <div className="cl-modal-backdrop" style={{ zIndex: 10210 }} onClick={() => setShowCreateClient(false)}>
          <div className="cl-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create Client">
            <div className="cl-modal-header">
              <h4>Create Client</h4>
              <button type="button" className="cl-modal-close" onClick={() => setShowCreateClient(false)} aria-label="Close">
                <XIcon size={16} />
              </button>
            </div>
            <form className="cl-modal-form" onSubmit={createClient}>
              <div className="cl-modal-body">
                <div className="cl-form-grid">
                  <div className="cl-form-group">
                    <label htmlFor="newClientName">Client Name *</label>
                    <input
                      id="newClientName"
                      required
                      placeholder="e.g. Acme Corporation"
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      autoComplete="name"
                      autoFocus
                    />
                  </div>
                  <div className="cl-form-group">
                    <label htmlFor="newClientEmail">Email Address *</label>
                    <input
                      id="newClientEmail"
                      required
                      placeholder="client@company.com"
                      type="email"
                      value={newClient.email}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      autoComplete="email"
                    />
                  </div>
                  <div className="cl-form-group">
                    <label htmlFor="newClientPhone">Phone Number *</label>
                    <input
                      id="newClientPhone"
                      required
                      placeholder="+91 9876543210"
                      type="tel"
                      value={newClient.phone}
                      onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                      autoComplete="tel"
                    />
                  </div>
                  <div className="cl-form-group">
                    <label htmlFor="newClientCompany">Company Name</label>
                    <input
                      id="newClientCompany"
                      placeholder="e.g. Acme Inc"
                      value={newClient.company}
                      onChange={(e) => setNewClient({ ...newClient, company: e.target.value })}
                      autoComplete="organization"
                    />
                  </div>
                </div>
              </div>
              <div className="cl-modal-footer">
                <button type="button" className="cl-btn-subtle" onClick={() => setShowCreateClient(false)}>
                  Cancel
                </button>
                <button className="cl-btn-primary" type="submit">
                  Create Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateProject && (
        <div className="cl-modal-backdrop" style={{ zIndex: 10220 }} onClick={() => setShowCreateProject(false)}>
          <div className="cl-modal-card cl-modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create Project">
            <div className="cl-modal-header">
              <div>
                <h4>Create Project</h4>
                {selected && <span className="cl-modal-sub">Client: {selected.company || selected.name}</span>}
              </div>
              <button type="button" className="cl-modal-close" onClick={() => setShowCreateProject(false)} aria-label="Close">
                <XIcon size={16} />
              </button>
            </div>
            <form className="cl-modal-form" onSubmit={createProject}>
              <div className="cl-modal-body">
                <div className="cl-form-grid">
                  <div className="cl-form-group">
                    <label htmlFor="npName">Project Name *</label>
                    <input
                      id="npName"
                      required
                      placeholder="e.g. Corporate Website"
                      value={np.name}
                      onChange={(e) => setNp({ ...np, name: e.target.value })}
                      autoComplete="off"
                      autoFocus
                    />
                  </div>
                  <div className="cl-form-group">
                    <label htmlFor="npType">Project Type *</label>
                    <select
                      id="npType"
                      value={np.type}
                      onChange={(e) => setNp({ ...np, type: e.target.value })}
                    >
                      <option value="web_development">Web Development</option>
                      <option value="digital_marketing">Digital Marketing</option>
                      <option value="data_analytics">Data Analytics</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {showOther && (
                  <div className="cl-form-group">
                    <label htmlFor="npOtherType">Other Type Specification *</label>
                    <input
                      id="npOtherType"
                      placeholder="Specify project type..."
                      value={np.other_type}
                      onChange={(e) => setNp({ ...np, other_type: e.target.value })}
                      autoComplete="off"
                    />
                  </div>
                )}

                <div className="cl-form-group">
                  <label htmlFor="npDesc">Project Description</label>
                  <RichTextEditor
                    id="npDesc"
                    minHeight="130px"
                    maxHeight="260px"
                    placeholder="Enter project description, deliverables, scope..."
                    aiFieldLabel="Project Description"
                    value={np.description}
                    onChange={(content) => setNp({ ...np, description: content })}
                  />
                </div>
              </div>
              <div className="cl-modal-footer">
                <button type="button" className="cl-btn-subtle" onClick={() => setShowCreateProject(false)}>
                  Cancel
                </button>
                <button type="submit" className="cl-btn-primary">
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project Details Modal */}
      {viewProject && (
        <div
          className="cl-modal-backdrop"
          style={{ zIndex: 10225 }}
          onClick={() => {
            setViewProject(null);
            setProjAiOpen(false);
            setActiveTab("details");
          }}
        >
          <div className="cl-modal-card cl-modal-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Project Details">
            <div className="cl-modal-header">
              <div>
                <h4>{viewProject.name || "Project Details"}</h4>
                {viewProject.code && <span className="cl-modal-sub">{viewProject.code}</span>}
              </div>
              <div className="cl-modal-header-right">
                <button
                  type="button"
                  className="zx-ai-pill-btn"
                  onClick={() => runProjectAiSummary(viewProject.id)}
                >
                  <SparklesIcon size={12} />
                  <span>ZORVI Summary &amp; Risks</span>
                </button>
                <button
                  type="button"
                  className="cl-modal-close"
                  onClick={() => {
                    setViewProject(null);
                    setProjAiOpen(false);
                    setActiveTab("details");
                  }}
                  aria-label="Close"
                >
                  <XIcon size={16} />
                </button>
              </div>
            </div>

            <div className="cl-modal-body">
              {projAiOpen && (
                <AiInsightBox
                  title="ZORVI Project Brief & Blockers"
                  loading={projAiLoading}
                  error={projAiErr}
                  uncertainty={projAiData?.uncertainty}
                  providerMeta={projAiData?.meta}
                  onRefresh={() => runProjectAiSummary(viewProject.id)}
                  onClose={() => setProjAiOpen(false)}
                >
                  {projAiData && (
                    <div>
                      <p style={{ margin: "0 0 6px" }}>{projAiData.summary}</p>
                      {projAiData.openIssues?.length > 0 && (
                        <div style={{ fontSize: "12px", marginTop: "4px" }}>
                          <strong>Open Issues &amp; Discussion Risks:</strong>
                          <ul className="zx-ai-list">
                            {projAiData.openIssues.map((it, i) => <li key={i}>{it}</li>)}
                          </ul>
                        </div>
                      )}
                      {projAiData.followUpActions?.length > 0 && (
                        <div style={{ fontSize: "12px", marginTop: "4px" }}>
                          <strong>Extracted Follow-ups:</strong>
                          <ul className="zx-ai-list">
                            {projAiData.followUpActions.map((a, i) => <li key={i}>{a}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </AiInsightBox>
              )}

              <div className="cl-seg-tabs" role="tablist">
                <button
                  type="button"
                  className={`cl-seg-btn ${activeTab === "details" ? "active" : ""}`}
                  onClick={() => setActiveTab("details")}
                >
                  Details
                </button>
                <button
                  type="button"
                  className={`cl-seg-btn ${activeTab === "comments" ? "active" : ""}`}
                  onClick={() => setActiveTab("comments")}
                >
                  Comments
                </button>
              </div>

              {activeTab === "details" ? (
                <div className="cl-project-detail-pane">
                  <div className="cl-meta-grid">
                    <div className="cl-meta-cell">
                      <span className="cl-meta-label">Project Name</span>
                      <span className="cl-meta-val">{viewProject.name || "--"}</span>
                    </div>
                    <div className="cl-meta-cell">
                      <span className="cl-meta-label">Project Code</span>
                      <span className="cl-meta-val cl-mono">{viewProject.code || "--"}</span>
                    </div>
                    <div className="cl-meta-cell">
                      <span className="cl-meta-label">Project Type</span>
                      <span className="cl-meta-val">
                        {TYPE_LABELS[viewProject.type] || viewProject.type}
                        {viewProject.type === "other" && viewProject.other_type ? ` / ${viewProject.other_type}` : ""}
                      </span>
                    </div>
                    <div className="cl-meta-cell">
                      <span className="cl-meta-label">Status</span>
                      <span className={`cl-status-pill status-${String(viewProject.status || "new").toLowerCase()}`}>
                        {STATUS_LABELS[viewProject.status] || viewProject.status || "--"}
                      </span>
                    </div>
                  </div>

                  <div className="cl-desc-box">
                    <div className="cl-desc-heading">Description &amp; Scope</div>
                    <div
                      className="cl-desc-content"
                      dangerouslySetInnerHTML={{
                        __html: renderSafeHtmlWithLinks(viewProject.description) || "<p>No description added yet.</p>",
                      }}
                    />
                  </div>
                </div>
              ) : (
                <ProjectComments
                  projectId={viewProject.id}
                  isAdmin={isAdmin}
                  currentUser={currentUser}
                />
              )}
            </div>

            <div className="cl-modal-footer cl-modal-footer-split">
              <div className="cl-footer-left">
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      className="cl-btn-subtle"
                      onClick={() => openEditFromProjectView(viewProject)}
                    >
                      <EditIcon size={13} />
                      <span>Edit Project</span>
                    </button>
                    <button
                      type="button"
                      className="cl-btn-danger-subtle"
                      onClick={() => {
                        if (!window.confirm("Delete this project?")) return;
                        setViewProject(null);
                        deleteProject(viewProject);
                      }}
                    >
                      <TrashIcon size={13} />
                      <span>Delete</span>
                    </button>
                  </>
                )}
              </div>
              <button
                type="button"
                className="cl-btn-subtle"
                onClick={() => {
                  setViewProject(null);
                  setProjAiOpen(false);
                  setActiveTab("details");
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditProjectModal && (
        <div
          className="cl-modal-backdrop"
          style={{ zIndex: 10230 }}
          onClick={() => setShowEditProjectModal(false)}
        >
          <div className="cl-modal-card cl-modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit Project">
            <div className="cl-modal-header">
              <h4>Edit Project</h4>
              <button type="button" className="cl-modal-close" onClick={() => setShowEditProjectModal(false)} aria-label="Close">
                <XIcon size={16} />
              </button>
            </div>
            <form className="cl-modal-form" onSubmit={saveProjectEdit}>
              <div className="cl-modal-body">
                <div className="cl-form-grid three-col">
                  <div className="cl-form-group">
                    <label htmlFor="epName">Project Name *</label>
                    <input
                      id="epName"
                      required
                      placeholder="Project name"
                      value={epForm.name}
                      onChange={(e) => setEpForm({ ...epForm, name: e.target.value })}
                      autoComplete="off"
                    />
                  </div>
                  <div className="cl-form-group">
                    <label htmlFor="epStatus">Status *</label>
                    <select
                      id="epStatus"
                      value={epForm.status}
                      onChange={(e) => setEpForm({ ...epForm, status: e.target.value })}
                    >
                      <option value="new">New</option>
                      <option value="InProgress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="OnHold">On Hold</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="cl-form-group">
                    <label htmlFor="epType">Project Type *</label>
                    <select
                      id="epType"
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

                {epForm.type === "other" && (
                  <div className="cl-form-group">
                    <label htmlFor="epOtherType">Other Type Specification *</label>
                    <input
                      id="epOtherType"
                      placeholder="Specify other type..."
                      value={epForm.other_type}
                      onChange={(e) => setEpForm({ ...epForm, other_type: e.target.value })}
                      autoComplete="off"
                    />
                  </div>
                )}

                <div className="cl-form-group">
                  <label htmlFor="epDesc">Description</label>
                  <RichTextEditor
                    id="epDesc"
                    minHeight="130px"
                    maxHeight="260px"
                    placeholder="Project description"
                    aiFieldLabel="Project Description"
                    value={epForm.description}
                    onChange={(content) => setEpForm({ ...epForm, description: content })}
                  />
                </div>
              </div>
              <div className="cl-modal-footer">
                <button type="button" className="cl-btn-subtle" onClick={() => setShowEditProjectModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="cl-btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Access Manager Modal */}
      {accessProject && (
        <div
          className="cl-modal-backdrop"
          style={{ zIndex: 10235 }}
          onClick={() => setAccessProject(null)}
        >
          <div className="cl-modal-card cl-modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Manage Access">
            <div className="cl-modal-header">
              <div>
                <h4>Manage Access</h4>
                <span className="cl-modal-sub">{accessProject.name}</span>
              </div>
              <button type="button" className="cl-modal-close" onClick={() => setAccessProject(null)} aria-label="Close">
                <XIcon size={16} />
              </button>
            </div>

            <div className="cl-modal-body">
              <div className="cl-table-wrap cl-members-wrap">
                <table className="cl-table table-members">
                  <thead>
                    <tr>
                      <th>Team Member</th>
                      <th>Role</th>
                      {isAdmin && <th className="center-col">Can Edit</th>}
                      {isAdmin && <th className="center-col">Can Manage Payments</th>}
                      {isAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {memberLoading ? (
                      <tr>
                        <td colSpan={isAdmin ? 5 : 2} className="cl-members-empty">
                          Loading members...
                        </td>
                      </tr>
                    ) : members.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 5 : 2} className="cl-members-empty">
                          No collaborators assigned to this project yet.
                        </td>
                      </tr>
                    ) : (
                      members.map((m) => (
                        <tr key={m.user_id}>
                          <td>
                            <div className="cl-name-meta">
                              <strong>{m.name}</strong>
                              <span className="cl-email-sub">{m.email}</span>
                            </div>
                          </td>
                          <td>
                            <span className="cl-company-pill">
                              ZOR - {m.role ? m.role.charAt(0).toUpperCase() : ""}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className="center-col">
                              <input
                                type="checkbox"
                                checked={!!m.can_edit}
                                disabled={!isAdmin}
                                onChange={async (e) => {
                                  const next = e.target.checked;
                                  optimisticUpdate((row) =>
                                    row.user_id === m.user_id ? { ...row, can_edit: next } : row
                                  );
                                  try {
                                    await apiPatchProjectMember(accessProject.id, m.user_id, { can_edit: next });
                                    await refreshMembers(accessProject);
                                  } catch (err) {
                                    optimisticUpdate((row) =>
                                      row.user_id === m.user_id ? { ...row, can_edit: !next } : row
                                    );
                                    showToast(err.message || "Failed to update", "error");
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
                                  const next = e.target.checked;
                                  optimisticUpdate((row) =>
                                    row.user_id === m.user_id ? { ...row, can_manage_payments: next } : row
                                  );
                                  try {
                                    await apiPatchProjectMember(accessProject.id, m.user_id, {
                                      can_manage_payments: next,
                                    });
                                    await refreshMembers(accessProject);
                                  } catch (err) {
                                    optimisticUpdate((row) =>
                                      row.user_id === m.user_id ? { ...row, can_manage_payments: !next } : row
                                    );
                                    showToast(err.message || "Failed to update", "error");
                                  }
                                }}
                              />
                            </td>
                          )}
                          {isAdmin && (
                            <td className="right-col">
                              <button
                                type="button"
                                className="cl-btn-danger-subtle cl-btn-xs"
                                onClick={async () => {
                                  if (!window.confirm("Remove member?")) return;
                                  try {
                                    await apiRemoveProjectMember(accessProject.id, m.user_id);
                                    await refreshMembers(accessProject);
                                  } catch (err) {
                                    showToast(err.message, "error");
                                  }
                                }}
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {isAdmin && (
                <form
                  className="cl-add-member-box"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiAddProjectMember(accessProject.id, addingMember);
                      setAddingMember({ user_id: "", can_edit: false, can_manage_payments: false });
                      await refreshMembers(accessProject);
                      showToast("Project member added", "success");
                    } catch (err) {
                      showToast(err.message, "error");
                    }
                  }}
                >
                  <select
                    className="cl-filter-select cl-member-select"
                    required
                    value={addingMember.user_id}
                    onChange={(e) => setAddingMember({ ...addingMember, user_id: Number(e.target.value) || "" })}
                  >
                    <option value="">Select team user...</option>
                    {users.map((u) => (
                      <option value={u.id} key={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>

                  <label className="cl-perm-toggle">
                    <input
                      type="checkbox"
                      checked={addingMember.can_edit}
                      onChange={(e) => setAddingMember({ ...addingMember, can_edit: e.target.checked })}
                    />
                    <span>Can edit</span>
                  </label>

                  <label className="cl-perm-toggle">
                    <input
                      type="checkbox"
                      checked={addingMember.can_manage_payments}
                      onChange={(e) => setAddingMember({ ...addingMember, can_manage_payments: e.target.checked })}
                    />
                    <span>Can manage payments</span>
                  </label>

                  <button type="submit" className="cl-btn-primary">
                    <PlusIcon size={13} />
                    <span>Add Member</span>
                  </button>
                </form>
              )}
            </div>

            <div className="cl-modal-footer">
              <button type="button" className="cl-btn-subtle" onClick={() => setAccessProject(null)}>
                Close
              </button>
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
  );
}
