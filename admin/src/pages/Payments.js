"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiListClients,
  apiListClientProjects,
  apiListPaymentLinks,
  apiDeletePaymentLink,
  apiTogglePaymentLink,
  apiMe,
  apiUpdatePaymentLinkMeta,
  apiRegeneratePaymentLink,
  apiListLinkSubmissions,
  apiCreatePaymentLinkWithMeta,
  downloadPaymentReceipt,
} from "../api";
import {
  PlusIcon,
  SearchIcon,
  RefreshIcon,
  EyeIcon,
  TrashIcon,
  XIcon,
  ChevronRightIcon,
  FolderIcon,
  BuildingIcon,
  LinkIcon,
  CheckIcon,
  DownloadIcon,
  DollarIcon,
  ClockIcon,
} from "../components/CrmHrmsIcons";

import "./Payments.css";

// ---- Helpers ----
function maskUrl(url = "") {
  try {
    const u = new URL(url);
    const host = u.host;
    const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
    if (path.length <= 12) return `${host}${path}`;
    return `${host}${path.slice(0, 6)}…${path.slice(-6)}`;
  } catch {
    return url.length > 26 ? `${url.slice(0, 12)}…${url.slice(-8)}` : url;
  }
}

function toInputDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getInitials(name = "") {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function normalizeLinks(links = []) {
  const byKind = { project: [], registration: [] };
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
    };
    byKind[norm.kind === "registration" ? "registration" : "project"].push(norm);
  });
  return byKind;
}

function isLinkActiveNow(link) {
  if (!link?.active) return false;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return false;
  return true;
}

function getLinkStatus(link) {
  if (!link?.active) return "Disabled";
  if (link.expires_at && new Date(link.expires_at) < new Date()) return "Expired";
  return "Active";
}

function CopyIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default function Payments() {
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Clients cache for the create drawer
  const [clients, setClients] = useState([]);

  // Projects with links
  const [rows, setRows] = useState([]); // [{ client, project, linksByKind }]
  const [linksLoadingId, setLinksLoadingId] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState("all"); // 'all' | 'active' | 'project_links' | 'registration_links'

  // Project links slide-over drawer
  const [view, setView] = useState(null); // { client, project, linksByKind }

  // Link details slide-over drawer (submissions & receipts)
  const [linkDetails, setLinkDetails] = useState(null); // { link, submissions, loading }

  // Create-link slide-over drawer
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createProjects, setCreateProjects] = useState([]);
  const [createProjectMeta, setCreateProjectMeta] = useState(null);
  const [createForm, setCreateForm] = useState({
    clientId: "",
    projectId: "",
    kind: "project",
    amount: "",
    expires_at: "",
  });

  // Toast
  const toastTimer = useRef(null);
  const [toast, setToast] = useState({ open: false, type: "success", message: "" });
  const showToast = useCallback((message, type = "success") => {
    setToast({ open: true, type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000);
  }, []);

  const fetchAllPaymentsData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshingAll(true);
    setError("");
    try {
      const me = await apiMe();
      const role = (me.me?.role || me.user?.role || "").toLowerCase();
      const adminFlag = role === "admin";
      setIsAdmin(adminFlag);

      const cRes = await apiListClients();
      const clientList = cRes.clients || [];
      setClients(clientList);

      const projectLists = await Promise.all(
        clientList.map(async (c) => {
          try {
            const pRes = await apiListClientProjects(c.id);
            return { client: c, projects: pRes.projects || [] };
          } catch {
            return { client: c, projects: [] };
          }
        })
      );

      const authorizedTargets = [];
      for (const { client, projects } of projectLists) {
        for (const p of projects) {
          const allowed = adminFlag || p?.my_perms?.can_manage_payments;
          if (allowed) {
            authorizedTargets.push({ client, project: p });
          }
        }
      }

      const rowsAcc = await Promise.all(
        authorizedTargets.map(async ({ client, project }) => {
          try {
            const linksRes = await apiListPaymentLinks(project.id);
            return {
              client,
              project,
              linksByKind: normalizeLinks(linksRes.links || []),
            };
          } catch {
            return {
              client,
              project,
              linksByKind: { project: [], registration: [] },
            };
          }
        })
      );

      setRows(rowsAcc);
      setView((prev) => {
        if (!prev) return null;
        const fresh = rowsAcc.find((r) => r.project.id === prev.project.id);
        return fresh || prev;
      });
    } catch (e) {
      setError(e.message || "Failed to load payments.");
    } finally {
      if (isInitial) setLoading(false);
      else setRefreshingAll(false);
    }
  }, []);

  useEffect(() => {
    fetchAllPaymentsData(true);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [fetchAllPaymentsData]);

  // Escape key closes topmost drawer
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (linkDetails) setLinkDetails(null);
      else if (createOpen) setCreateOpen(false);
      else if (view) setView(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkDetails, createOpen, view]);

  const kpiStats = useMemo(() => {
    let activeLinks = 0;
    let projectLinks = 0;
    let registrationLinks = 0;
    rows.forEach((r) => {
      const pLinks = r.linksByKind?.project || [];
      const regLinks = r.linksByKind?.registration || [];
      projectLinks += pLinks.length;
      registrationLinks += regLinks.length;
      activeLinks += [...pLinks, ...regLinks].filter(isLinkActiveNow).length;
    });
    return {
      totalProjects: rows.length,
      activeLinks,
      projectLinks,
      registrationLinks,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      const allLinks = [...(r.linksByKind?.project || []), ...(r.linksByKind?.registration || [])];
      if (filterKind === "active" && !allLinks.some(isLinkActiveNow)) return false;
      if (filterKind === "project_links" && (r.linksByKind?.project || []).length === 0) return false;
      if (filterKind === "registration_links" && (r.linksByKind?.registration || []).length === 0) return false;
      if (!q) return true;
      return (
        String(r.client?.name || "").toLowerCase().includes(q) ||
        String(r.client?.email || "").toLowerCase().includes(q) ||
        String(r.client?.company || "").toLowerCase().includes(q) ||
        String(r.project?.name || "").toLowerCase().includes(q) ||
        String(r.project?.code || "").toLowerCase().includes(q) ||
        allLinks.some((l) => String(l.id).includes(q))
      );
    });
  }, [rows, searchQuery, filterKind]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of filteredRows) {
      const key = row.client.id;
      if (!map.has(key)) map.set(key, { client: row.client, projects: [] });
      map.get(key).projects.push(row);
    }
    return Array.from(map.values());
  }, [filteredRows]);

  async function refreshProjectLinks(targetRow) {
    if (!targetRow) return;
    try {
      setLinksLoadingId(targetRow.project.id);
      const linksRes = await apiListPaymentLinks(targetRow.project.id);
      const byKind = normalizeLinks(linksRes.links || []);

      setRows((prev) =>
        prev.map((r) =>
          r.project.id === targetRow.project.id ? { ...r, linksByKind: byKind } : r
        )
      );
      setView((prev) =>
        prev && prev.project.id === targetRow.project.id ? { ...prev, linksByKind: byKind } : prev
      );
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLinksLoadingId(null);
    }
  }

  async function handleDownloadReceipt(id) {
    try {
      const { blob, filename } = await downloadPaymentReceipt(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `payment-receipt-${id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err.message || "Failed to download receipt", "error");
    }
  }

  async function createLink(project, kind) {
    try {
      await apiCreatePaymentLinkWithMeta(project.id, { kind, amount: null });
      showToast("Payment link created", "success");
      await refreshProjectLinks({ project });
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function toggleOneLink(link, active) {
    try {
      await apiUpdatePaymentLinkMeta(link.id, { active });
      showToast(active ? "Link enabled" : "Link disabled", "success");
      if (view) await refreshProjectLinks(view);
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function saveMeta(link, edited) {
    try {
      const patch = {};
      if (edited.amount !== undefined) patch.amount = Number(edited.amount) || 0;
      if (edited.expires_at !== undefined && edited.expires_at) {
        patch.expires_at = new Date(edited.expires_at).toISOString();
      }
      await apiUpdatePaymentLinkMeta(link.id, patch);
      showToast("Link updated", "success");
      if (view) await refreshProjectLinks(view);
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function regenerate(link) {
    try {
      await apiRegeneratePaymentLink(link.id);
      showToast("Link regenerated", "success");
      if (view) await refreshProjectLinks(view);
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function openLinkDetails(link) {
    try {
      setLinkDetails({ link, submissions: [], loading: true });
      const data = await apiListLinkSubmissions(link.id);
      setLinkDetails({ link, submissions: data.submissions || [], loading: false });
    } catch (e) {
      setLinkDetails({ link, submissions: [], loading: false });
      showToast(e.message, "error");
    }
  }

  async function loadCreateProjects(clientId) {
    setCreateProjects([]);
    setCreateProjectMeta(null);
    setCreateForm((f) => ({ ...f, projectId: "" }));
    if (!clientId) return;
    try {
      const res = await apiListClientProjects(clientId);
      const projects = (res.projects || []).filter(
        (p) => isAdmin || p?.my_perms?.can_manage_payments
      );
      setCreateProjects(projects);
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  function onChangeCreate(field, value) {
    setCreateForm((f) => ({ ...f, [field]: value }));
    if (field === "clientId") {
      loadCreateProjects(Number(value));
    }
    if (field === "projectId") {
      const p = createProjects.find((x) => String(x.id) === String(value));
      if (p) {
        setCreateProjectMeta({
          projectName: p.name,
          projectCode: p.code,
          projectType: p.type === "other" && p.other_type ? `other / ${p.other_type}` : p.type,
        });
      } else {
        setCreateProjectMeta(null);
      }
    }
  }

  async function submitCreate() {
    const { clientId, projectId, kind, amount, expires_at } = createForm;
    if (!clientId || !projectId || !kind) {
      return showToast("Please select client, project and kind", "error");
    }
    const amt = Number(amount);
    if (!(amt > 0)) return showToast("Enter a valid amount (> 0)", "error");
    if (!expires_at) return showToast("Please select an expiry date and time", "error");

    try {
      setCreateLoading(true);
      const createRes = await apiCreatePaymentLinkWithMeta(Number(projectId), { kind, amount: amt });
      const token = createRes?.token;

      if (token && expires_at) {
        const linksRes = await apiListPaymentLinks(Number(projectId));
        const found = (linksRes.links || []).find((l) => l.token === token);
        if (found) {
          await apiUpdatePaymentLinkMeta(found.id, { expires_at: new Date(expires_at).toISOString() });
        }
      }

      await refreshProjectLinks({ project: { id: Number(projectId) } });
      setCreateOpen(false);
      setCreateForm({ clientId: "", projectId: "", kind: "project", amount: "", expires_at: "" });
      setCreateProjects([]);
      setCreateProjectMeta(null);
      showToast("Payment link created", "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setCreateLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="pay-page">
        <div className="loader_container">
          <p className="loader_spinner"></p>
          <p>Loading Payments…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pay-page">
        <div className="pay-empty-card">
          <p className="pay-error-text">{error}</p>
          <button type="button" className="pay-btn-primary" onClick={() => fetchAllPaymentsData(true)}>
            <RefreshIcon size={14} />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pay-page">
      {/* Editorial Header */}
      <div className="pay-header">
        <div>
          <div className="pay-breadcrumb">
            <span>Financial Operations</span>
            <span className="pay-bc-sep">/</span>
            <span className="pay-bc-current">Payments</span>
          </div>
          <h1 className="pay-title">Payments &amp; Links</h1>
          <p className="pay-subtitle">
            Manage project and registration payment links, expiry windows, and verified receipts.
          </p>
        </div>

        <div className="pay-header-actions">
          <button
            type="button"
            className="pay-btn-subtle"
            onClick={() => fetchAllPaymentsData(false)}
            disabled={refreshingAll}
            title="Refresh all payment links"
          >
            <RefreshIcon size={14} className={refreshingAll ? "rotate" : ""} />
            <span>{refreshingAll ? "Refreshing…" : "Refresh"}</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              className="pay-btn-primary"
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon size={14} />
              <span>New Payment Link</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="pay-kpi-strip">
        <button
          type="button"
          className={`pay-kpi-card ${filterKind === "all" ? "active" : ""}`}
          onClick={() => setFilterKind("all")}
        >
          <div className="pay-kpi-top">
            <span className="pay-kpi-label">Managed Projects</span>
            <span className="pay-kpi-icon">
              <FolderIcon size={14} />
            </span>
          </div>
          <strong className="pay-kpi-val tabular-nums">{kpiStats.totalProjects}</strong>
          <span className="pay-kpi-hint">Across {grouped.length || clients.length} clients</span>
        </button>

        <button
          type="button"
          className={`pay-kpi-card ${filterKind === "active" ? "active" : ""}`}
          onClick={() => setFilterKind((v) => (v === "active" ? "all" : "active"))}
        >
          <div className="pay-kpi-top">
            <span className="pay-kpi-label">Active Links</span>
            <span className="pay-kpi-icon pos">
              <CheckIcon size={14} />
            </span>
          </div>
          <strong className="pay-kpi-val pay-val-pos tabular-nums">{kpiStats.activeLinks}</strong>
          <span className="pay-kpi-hint">Open &amp; not expired</span>
        </button>

        <button
          type="button"
          className={`pay-kpi-card ${filterKind === "project_links" ? "active" : ""}`}
          onClick={() => setFilterKind((v) => (v === "project_links" ? "all" : "project_links"))}
        >
          <div className="pay-kpi-top">
            <span className="pay-kpi-label">Project Links</span>
            <span className="pay-kpi-icon accent">
              <DollarIcon size={14} />
            </span>
          </div>
          <strong className="pay-kpi-val pay-val-accent tabular-nums">{kpiStats.projectLinks}</strong>
          <span className="pay-kpi-hint">Milestone &amp; fee URLs</span>
        </button>

        <button
          type="button"
          className={`pay-kpi-card ${filterKind === "registration_links" ? "active" : ""}`}
          onClick={() => setFilterKind((v) => (v === "registration_links" ? "all" : "registration_links"))}
        >
          <div className="pay-kpi-top">
            <span className="pay-kpi-label">Registration Links</span>
            <span className="pay-kpi-icon warn">
              <LinkIcon size={14} />
            </span>
          </div>
          <strong className="pay-kpi-val pay-val-warn tabular-nums">{kpiStats.registrationLinks}</strong>
          <span className="pay-kpi-hint">Onboarding &amp; token URLs</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="pay-filter-surface">
        <div className="pay-search-wrap">
          <SearchIcon size={15} className="pay-search-icon" />
          <input
            type="text"
            className="pay-search-input"
            placeholder="Search client name, email, project, code, or link ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="pay-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <XIcon size={13} />
            </button>
          )}
        </div>

        <div className="pay-filter-pills">
          {[
            { id: "all", label: "All Projects" },
            { id: "active", label: "Active Links" },
            { id: "project_links", label: "Project" },
            { id: "registration_links", label: "Registration" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={`pay-pill-filter ${filterKind === f.id ? "active" : ""}`}
              onClick={() => setFilterKind(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped Client Portfolio Payment Cards */}
      {grouped.length === 0 ? (
        <div className="pay-empty-card">
          <div className="pay-empty-icon">
            <DollarIcon size={22} />
          </div>
          <h3>No matching payment records</h3>
          <p>
            {rows.length === 0
              ? "No payment links are accessible with your current permissions yet."
              : "Try clearing your search or selecting another filter."}
          </p>
          {(searchQuery || filterKind !== "all") && (
            <button
              type="button"
              className="pay-btn-subtle"
              onClick={() => {
                setSearchQuery("");
                setFilterKind("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="pay-groups-stack">
          {grouped.map(({ client, projects }) => {
            const clientActiveCount = projects.reduce((sum, r) => {
              const all = [...r.linksByKind.project, ...r.linksByKind.registration];
              return sum + all.filter(isLinkActiveNow).length;
            }, 0);

            return (
              <section className="pay-client-card" key={client.id}>
                <div className="pay-client-card-head">
                  <div className="pay-client-identity">
                    <div className="pay-client-avatar">{getInitials(client.name)}</div>
                    <div className="pay-client-meta">
                      <div className="pay-client-title-row">
                        <strong>{client.name}</strong>
                        {client.company && <span className="pay-company-tag">{client.company}</span>}
                      </div>
                      <span className="pay-client-email">{client.email}</span>
                    </div>
                  </div>
                  <div className="pay-client-head-badges">
                    <span className="pay-count-pill tabular-nums">
                      {projects.length} {projects.length === 1 ? "project" : "projects"}
                    </span>
                    <span className={`pay-count-pill tabular-nums ${clientActiveCount > 0 ? "pos" : ""}`}>
                      {clientActiveCount} active {clientActiveCount === 1 ? "link" : "links"}
                    </span>
                  </div>
                </div>

                <div className="pay-table-wrap">
                  <table className="pay-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Code</th>
                        <th>Type</th>
                        <th>Payment Links</th>
                        <th className="right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((row) => {
                        const pLen = row.linksByKind.project.length;
                        const rLen = row.linksByKind.registration.length;
                        const activeCount = [...row.linksByKind.project, ...row.linksByKind.registration].filter(isLinkActiveNow).length;
                        const isSelected = view?.project?.id === row.project.id;

                        return (
                          <tr
                            key={row.project.id}
                            className={`pay-row-clickable ${isSelected ? "is-selected" : ""}`}
                            onClick={() => setView(row)}
                          >
                            <td>
                              <div className="pay-proj-cell">
                                <span className="pay-proj-name">{row.project.name}</span>
                              </div>
                            </td>
                            <td>
                              <code className="pay-code-pill tabular-nums">{row.project.code}</code>
                            </td>
                            <td>
                              <span className="pay-type-pill">
                                {row.project.type}
                                {row.project.type === "other" && row.project.other_type ? ` / ${row.project.other_type}` : ""}
                              </span>
                            </td>
                            <td>
                              <div className="pay-links-summary">
                                <span className="pay-mini-badge tabular-nums">
                                  Project: <strong>{pLen}</strong>
                                </span>
                                <span className="pay-mini-badge tabular-nums">
                                  Registration: <strong>{rLen}</strong>
                                </span>
                                {activeCount > 0 && (
                                  <span className="pay-mini-badge active tabular-nums">
                                    {activeCount} active
                                  </span>
                                )}
                              </div>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="pay-row-actions">
                                <button
                                  type="button"
                                  className="pay-btn-inspect"
                                  onClick={() => setView(row)}
                                >
                                  <span>Manage Links</span>
                                  <ChevronRightIcon size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="pay-icon-btn"
                                  title="Refresh links"
                                  aria-label="Refresh links"
                                  onClick={() => refreshProjectLinks(row)}
                                  disabled={linksLoadingId === row.project.id}
                                >
                                  <RefreshIcon size={14} className={linksLoadingId === row.project.id ? "rotate" : ""} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ====================================================================
          RIGHT-SIDE SLIDE-OVER DRAWER 1: Project Payment Links Inspector
         ==================================================================== */}
      {view && (
        <div className="pay-drawer-backdrop" onClick={() => setView(null)}>
          <aside
            className="pay-drawer-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Manage Payment Links"
          >
            <header className="pay-drawer-header">
              <div className="pay-drawer-header-top">
                <div className="pay-drawer-identity">
                  <div className="pay-drawer-icon">
                    <DollarIcon size={18} />
                  </div>
                  <div>
                    <div className="pay-drawer-title-line">
                      <h3>{view.project.name}</h3>
                      <code className="pay-code-pill tabular-nums">{view.project.code}</code>
                    </div>
                    <div className="pay-drawer-subtitle">
                      <span><BuildingIcon size={12} /> {view.client.name}</span>
                      <span>&bull;</span>
                      <span>{view.client.email}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="pay-drawer-close"
                  onClick={() => setView(null)}
                  aria-label="Close drawer"
                >
                  <XIcon size={18} />
                </button>
              </div>

              <div className="pay-drawer-metrics-strip">
                <div className="pay-metric-cell">
                  <span>Total Links</span>
                  <strong className="tabular-nums">
                    {view.linksByKind.project.length + view.linksByKind.registration.length}
                  </strong>
                </div>
                <div className="pay-metric-cell">
                  <span>Active Now</span>
                  <strong className="pay-val-pos tabular-nums">
                    {[...view.linksByKind.project, ...view.linksByKind.registration].filter(isLinkActiveNow).length}
                  </strong>
                </div>
                <div className="pay-metric-cell">
                  <span>Project Links</span>
                  <strong className="tabular-nums">{view.linksByKind.project.length}</strong>
                </div>
                <div className="pay-metric-cell">
                  <span>Registration</span>
                  <strong className="tabular-nums">{view.linksByKind.registration.length}</strong>
                </div>
              </div>

              {(isAdmin || view.project?.my_perms?.can_manage_payments) ? (
                <div className="pay-drawer-toolbar">
                  <button
                    type="button"
                    className="pay-btn-primary pay-btn-sm"
                    onClick={() => createLink(view.project, "project")}
                  >
                    <PlusIcon size={13} />
                    <span>Project Link</span>
                  </button>
                  <button
                    type="button"
                    className="pay-btn-primary pay-btn-sm"
                    onClick={() => createLink(view.project, "registration")}
                  >
                    <PlusIcon size={13} />
                    <span>Registration Link</span>
                  </button>
                  <button
                    type="button"
                    className="pay-btn-subtle pay-btn-sm"
                    onClick={() =>
                      apiTogglePaymentLink(view.project.id, true).then(() => {
                        showToast("All links enabled");
                        refreshProjectLinks(view);
                      })
                    }
                  >
                    Enable All
                  </button>
                  <button
                    type="button"
                    className="pay-btn-subtle pay-btn-sm"
                    onClick={() =>
                      apiTogglePaymentLink(view.project.id, false).then(() => {
                        showToast("All links disabled");
                        refreshProjectLinks(view);
                      })
                    }
                  >
                    Disable All
                  </button>
                </div>
              ) : (
                <div className="pay-drawer-readonly-note">
                  View-only mode: you do not have permission to modify payment links for this project.
                </div>
              )}
            </header>

            <div className="pay-drawer-body pay-drawer-body-split">
              <div className="pay-drawer-col">
                <div className="pay-col-heading">
                  <span>Project Links</span>
                  <span className="pay-count-pill tabular-nums">{view.linksByKind.project.length}</span>
                </div>
                <LinkList
                  kindLabel="project"
                  items={view.linksByKind.project}
                  canEdit={isAdmin || view.project?.my_perms?.can_manage_payments}
                  onCopy={(url) => {
                    navigator.clipboard.writeText(url);
                    showToast("Payment URL copied");
                  }}
                  onDelete={async (id) => {
                    if (!window.confirm("Delete this payment link?")) return;
                    try {
                      await apiDeletePaymentLink(id);
                      await refreshProjectLinks(view);
                      showToast("Link deleted");
                    } catch (e) {
                      showToast(e.message, "error");
                    }
                  }}
                  onToggle={toggleOneLink}
                  onSaveMeta={saveMeta}
                  onRegenerate={regenerate}
                  onOpenDetails={openLinkDetails}
                />
              </div>

              <div className="pay-drawer-col">
                <div className="pay-col-heading">
                  <span>Registration Links</span>
                  <span className="pay-count-pill tabular-nums">{view.linksByKind.registration.length}</span>
                </div>
                <LinkList
                  kindLabel="registration"
                  items={view.linksByKind.registration}
                  canEdit={isAdmin || view.project?.my_perms?.can_manage_payments}
                  onCopy={(url) => {
                    navigator.clipboard.writeText(url);
                    showToast("Registration URL copied");
                  }}
                  onDelete={async (id) => {
                    if (!window.confirm("Delete this registration link?")) return;
                    try {
                      await apiDeletePaymentLink(id);
                      await refreshProjectLinks(view);
                      showToast("Link deleted");
                    } catch (e) {
                      showToast(e.message, "error");
                    }
                  }}
                  onToggle={toggleOneLink}
                  onSaveMeta={saveMeta}
                  onRegenerate={regenerate}
                  onOpenDetails={openLinkDetails}
                />
              </div>
            </div>

            <footer className="pay-drawer-footer">
              <span className="pay-footer-hint">
                Set amount and expiry per link, or click the eye icon to inspect receipts.
              </span>
              <div className="pay-footer-btns">
                <button
                  type="button"
                  className="pay-btn-subtle"
                  onClick={() => refreshProjectLinks(view)}
                  disabled={linksLoadingId === view.project.id}
                >
                  <RefreshIcon size={13} className={linksLoadingId === view.project.id ? "rotate" : ""} />
                  <span>Refresh</span>
                </button>
                <button type="button" className="pay-btn-primary" onClick={() => setView(null)}>
                  Done
                </button>
              </div>
            </footer>
          </aside>
        </div>
      )}

      {/* ====================================================================
          RIGHT-SIDE SLIDE-OVER DRAWER 2: Link Submissions & Receipts
         ==================================================================== */}
      {linkDetails && (
        <div className="pay-drawer-backdrop pay-drawer-backdrop-top" onClick={() => setLinkDetails(null)}>
          <aside
            className="pay-drawer-panel pay-drawer-panel-md"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Link Submissions & Receipts"
          >
            <header className="pay-drawer-header">
              <div className="pay-drawer-header-top">
                <div className="pay-drawer-identity">
                  <div className="pay-drawer-icon">
                    <EyeIcon size={18} />
                  </div>
                  <div>
                    <div className="pay-drawer-title-line">
                      <h3>Link #{linkDetails.link.id} Submissions</h3>
                      <span className={`pay-status-badge ${getLinkStatus(linkDetails.link).toLowerCase()}`}>
                        {getLinkStatus(linkDetails.link)}
                      </span>
                    </div>
                    <div className="pay-drawer-subtitle">
                      <code className="pay-code-pill">{maskUrl(linkDetails.link.url)}</code>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="pay-drawer-close"
                  onClick={() => setLinkDetails(null)}
                  aria-label="Close submissions drawer"
                >
                  <XIcon size={18} />
                </button>
              </div>
            </header>

            <div className="pay-drawer-body pay-drawer-body-single">
              {linkDetails.loading ? (
                <div className="loader_container">
                  <p className="loader_spinner"></p>
                  <p>Loading Submissions…</p>
                </div>
              ) : !linkDetails.submissions.length ? (
                <div className="pay-empty-card">
                  <div className="pay-empty-icon">
                    <ClockIcon size={20} />
                  </div>
                  <h3>No submissions yet</h3>
                  <p>Client payment receipts submitted through this link will appear here.</p>
                </div>
              ) : (
                <div className="pay-submissions-list">
                  {linkDetails.submissions.map((s) => {
                    const files = s.files || s.receipts || (s.receipt_url ? [s.receipt_url] : []);
                    const statusKey = String(s.status || "pending").toLowerCase();
                    return (
                      <div key={s.id || s._id} className="pay-submission-card">
                        <div className="pay-submission-top">
                          <div>
                            <div className="pay-submission-amt tabular-nums">
                              &#8377;{Number(s.amount || 0).toLocaleString()}
                            </div>
                            <div className="pay-submission-date">
                              {new Date(s.created_at || s.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <span className={`pay-status-badge ${statusKey}`}>{statusKey}</span>
                        </div>

                        <div className="pay-submission-files">
                          {!files?.length ? (
                            <span className="pay-muted-sm">No receipt files attached</span>
                          ) : (
                            <>
                              {files.map((url, idx) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="pay-btn-subtle pay-btn-xs"
                                >
                                  <EyeIcon size={12} />
                                  <span>View File {idx + 1}</span>
                                </a>
                              ))}
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="pay-btn-primary pay-btn-xs"
                                  onClick={() => handleDownloadReceipt(s.id)}
                                >
                                  <DownloadIcon size={12} />
                                  <span>Admin Download</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="pay-drawer-footer">
              <span className="pay-footer-hint tabular-nums">
                {linkDetails.submissions.length} {linkDetails.submissions.length === 1 ? "submission" : "submissions"}
              </span>
              <button type="button" className="pay-btn-primary" onClick={() => setLinkDetails(null)}>
                Close
              </button>
            </footer>
          </aside>
        </div>
      )}

      {/* ====================================================================
          RIGHT-SIDE SLIDE-OVER DRAWER 3: Create New Payment Link
         ==================================================================== */}
      {createOpen && (
        <CreateLinkDrawer
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

      {/* Floating Toast */}
      <div className={`toastx ${toast.type} ${toast.open ? "show" : ""}`} role="status" aria-live="polite">
        <div className="toastx-icon">
          {toast.type === "success" ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          )}
        </div>
        <div className="toastx-body">
          <div className="toastx-title">{toast.type === "success" ? "Success" : "Error"}</div>
          <div className="toastx-msg">{toast.message}</div>
        </div>
        <button className="toastx-close" onClick={() => setToast((t) => ({ ...t, open: false }))} aria-label="Close">
          &times;
        </button>
      </div>
    </div>
  );
}

/** Right-side slide-over drawer to create a new payment link */
function CreateLinkDrawer({
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
  if (!open) return null;
  return (
    <div className="pay-drawer-backdrop" onClick={onClose}>
      <aside
        className="pay-drawer-panel pay-drawer-panel-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Create Payment Link"
      >
        <header className="pay-drawer-header">
          <div className="pay-drawer-header-top">
            <div className="pay-drawer-identity">
              <div className="pay-drawer-icon">
                <PlusIcon size={18} />
              </div>
              <div>
                <div className="pay-drawer-title-line">
                  <h3>Create Payment Link</h3>
                </div>
                <div className="pay-drawer-subtitle">
                  <span>Generate a tracked URL with amount and expiry</span>
                </div>
              </div>
            </div>
            <button type="button" className="pay-drawer-close" onClick={onClose} aria-label="Close">
              <XIcon size={18} />
            </button>
          </div>
        </header>

        <div className="pay-drawer-body pay-drawer-body-single">
          <div className="pay-form-stack">
            <label className="pay-field">
              <span>Client *</span>
              <select
                value={form.clientId}
                onChange={(e) => onChange("clientId", e.target.value)}
              >
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </select>
            </label>

            <label className="pay-field">
              <span>Project *</span>
              <select
                value={form.projectId}
                onChange={(e) => onChange("projectId", e.target.value)}
                disabled={!form.clientId}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.code}
                  </option>
                ))}
              </select>
            </label>

            <div className="pay-field">
              <span>Payment Kind *</span>
              <div className="pay-kind-switch">
                <button
                  type="button"
                  className={`pay-kind-btn ${form.kind === "project" ? "active" : ""}`}
                  onClick={() => onChange("kind", "project")}
                >
                  Project Fee
                </button>
                <button
                  type="button"
                  className={`pay-kind-btn ${form.kind === "registration" ? "active" : ""}`}
                  onClick={() => onChange("kind", "registration")}
                >
                  Registration
                </button>
              </div>
            </div>

            <div className="pay-form-grid-2">
              <label className="pay-field">
                <span>Amount (&#8377;) *</span>
                <input
                  type="number"
                  min="1"
                  value={form.amount}
                  onChange={(e) => onChange("amount", e.target.value)}
                  placeholder="e.g. 5000"
                />
              </label>

              <label className="pay-field">
                <span>Expiry Date &amp; Time *</span>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => onChange("expires_at", e.target.value)}
                />
              </label>
            </div>

            {projectMeta && (
              <div className="pay-selected-summary">
                <div className="pay-summary-head">
                  <span>Selected Project</span>
                  <span className="pay-type-pill">{projectMeta.projectType}</span>
                </div>
                <div className="pay-summary-body">
                  <strong>{projectMeta.projectName}</strong>
                  <code className="pay-code-pill tabular-nums">{projectMeta.projectCode}</code>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="pay-drawer-footer">
          <span className="pay-footer-hint">Amount and expiry are stored per link.</span>
          <div className="pay-footer-btns">
            <button type="button" className="pay-btn-subtle" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="pay-btn-primary" onClick={onSubmit} disabled={submitting}>
              {submitting ? "Creating…" : "Create Link"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

/** Subcomponent to render & edit payment links inside the inspector drawer */
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
  const [drafts, setDrafts] = useState({}); // { [linkId]: { amount, expires_at } }

  if (!items.length) {
    return (
      <div className="pay-links-empty">
        No {kindLabel} links created yet.
      </div>
    );
  }

  return (
    <div className="pay-link-list">
      {items.map((l) => {
        const draft = drafts[l.id] || {
          amount: l.amount ?? "",
          expires_at: toInputDateTime(l.expires_at),
        };
        const status = getLinkStatus(l);

        return (
          <div key={l.id} className="pay-link-card">
            <div className="pay-link-card-head">
              <div className="pay-link-card-id">
                <strong>Link #{l.id}</strong>
                <span className={`pay-status-badge ${status.toLowerCase()}`}>{status}</span>
              </div>

              <div className="pay-link-card-actions">
                <button
                  type="button"
                  className="pay-icon-btn"
                  title="Copy payment URL"
                  aria-label="Copy URL"
                  onClick={() => onCopy(l.url)}
                >
                  <CopyIcon size={13} />
                </button>
                <button
                  type="button"
                  className="pay-icon-btn"
                  title="View submissions & receipts"
                  aria-label="View submissions"
                  onClick={() => onOpenDetails(l)}
                >
                  <EyeIcon size={14} />
                </button>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      className="pay-btn-subtle pay-btn-xs"
                      onClick={() => onToggle(l, !l.active)}
                    >
                      {l.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="pay-btn-subtle pay-btn-xs"
                      onClick={() => onRegenerate(l)}
                    >
                      Regenerate
                    </button>
                    <button
                      type="button"
                      className="pay-icon-btn danger"
                      title="Delete link"
                      aria-label="Delete link"
                      onClick={() => onDelete(l.id)}
                    >
                      <TrashIcon size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {canEdit && (
              <div className="pay-link-edit-grid">
                <label className="pay-link-mini-field">
                  <span>Amount (&#8377;)</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.amount}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [l.id]: { ...draft, amount: e.target.value } }))
                    }
                  />
                </label>

                <label className="pay-link-mini-field">
                  <span>Expiry</span>
                  <input
                    type="datetime-local"
                    value={draft.expires_at}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [l.id]: { ...draft, expires_at: e.target.value } }))
                    }
                  />
                </label>

                <button
                  type="button"
                  className="pay-btn-primary pay-btn-sm"
                  onClick={() => onSaveMeta(l, drafts[l.id] || {})}
                >
                  Save
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
