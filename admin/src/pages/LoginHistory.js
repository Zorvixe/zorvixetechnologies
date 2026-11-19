import React, { useEffect, useState, useRef, useCallback } from 'react';
import Topbar from '../components/Topbar';
import { useAuth } from '../auth';
import {
  apiListLoginLogs,
  apiExportLoginLogsCsv,
  apiGetUsersForAssignment
} from '../api';
import './LoginHistory.css';

const UserAvatar = ({ name, size = 36 }) => {
  const initials = (name || "U")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  const colors = [
    { bg: "#e0f2fe", text: "#0369a1" },
    { bg: "#fef3c7", text: "#b45309" },
    { bg: "#dcfce7", text: "#15803d" },
    { bg: "#f3e8ff", text: "#7e22ce" },
    { bg: "#ffe4e6", text: "#be123c" },
    { bg: "#e0e7ff", text: "#4338ca" },
  ];
  let charCodeSum = 0;
  for (let i = 0; i < (name || "").length; i++) charCodeSum += name.charCodeAt(i);
  const color = colors[charCodeSum % colors.length];

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color.bg,
        color: color.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: "bold",
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
};

export default function LoginHistory() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // State
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    total_logins_today: 0,
    currently_active: 0,
    first_login_today: null,
    last_logout_today: null
  });

  // Filters
  const [filters, setFilters] = useState({
    date: "",
    userId: "all",
    search: ""
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const totalPages = Math.ceil((total || 0) / (limit || 1));

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

  // Fetch users for assignment dropdown (if admin)
  useEffect(() => {
    if (isAdmin) {
      apiGetUsersForAssignment()
        .then((data) => {
          if (data?.success) setUsers(data.users || []);
        })
        .catch(() => {});
    }
  }, [isAdmin]);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit,
        date: filters.date || undefined,
        userId: filters.userId !== "all" ? filters.userId : undefined,
        search: filters.search.trim() || undefined
      };
      const res = await apiListLoginLogs(params);
      if (res?.success) {
        setLogs(res.logs || []);
        setTotal(res.pagination?.total || 0);
        if (res.stats) {
          setStats(res.stats);
        }
      } else {
        setLogs([]);
        setTotal(0);
      }
    } catch (e) {
      console.error("Failed to fetch login logs", e);
      showToast("Failed to load login history", "error");
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Quick Date Helpers
  const setTodayDate = () => {
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setFilters((prev) => ({ ...prev, date: ymd }));
    setPage(1);
  };

  const setYesterdayDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setFilters((prev) => ({ ...prev, date: ymd }));
    setPage(1);
  };

  const clearAllFilters = () => {
    setFilters({
      date: "",
      userId: "all",
      search: ""
    });
    setPage(1);
  };

  // Export CSV
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const params = {
        date: filters.date || undefined,
        userId: filters.userId !== "all" ? filters.userId : undefined,
        search: filters.search.trim() || undefined
      };
      await apiExportLoginLogsCsv(params);
      showToast("Export downloaded successfully", "success");
    } catch (e) {
      console.error("Export error", e);
      showToast("Failed to export logs", "error");
    } finally {
      setExporting(false);
    }
  };

  // Duration Formatter
  const formatDuration = (minutes, loginAt, logoutAt) => {
    if (logoutAt) {
      const mins = minutes ?? Math.max(1, Math.round((new Date(logoutAt) - new Date(loginAt)) / 60000));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    }
    const elapsedMins = Math.max(1, Math.round((Date.now() - new Date(loginAt).getTime()) / 60000));
    const h = Math.floor(elapsedMins / 60);
    const m = elapsedMins % 60;
    if (h > 0) return `${h}h ${m}m (Ongoing)`;
    return `${m}m (Ongoing)`;
  };

  // Format Device / Browser snippet from user agent
  const formatDevice = (userAgent) => {
    if (!userAgent) return "Web Browser";
    if (userAgent.includes("Edg/")) return "Microsoft Edge";
    if (userAgent.includes("Chrome/") && !userAgent.includes("Chromium/")) return "Google Chrome";
    if (userAgent.includes("Firefox/")) return "Mozilla Firefox";
    if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) return "Apple Safari";
    if (userAgent.includes("iPhone") || userAgent.includes("iPad")) return "iOS Mobile";
    if (userAgent.includes("Android")) return "Android Mobile";
    return "Web Browser";
  };

  const hasActiveFilters = filters.date || filters.userId !== "all" || filters.search;

  return (
    <div className="login-history-container">
      <Topbar title="Login & Logout Timings">
        <div className="login-history-topbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={fetchLogs}
            disabled={loading}
            title="Refresh logs"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleExportCsv}
            disabled={exporting || logs.length === 0}
            title="Export to CSV"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </Topbar>

      {/* KPI Stats Overview Cards */}
      <div className="login-stats-grid">
        <div className="login-stat-card">
          <div className="stat-icon-wrapper blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">Total Logins Today</div>
            <div className="stat-value">{stats.total_logins_today ?? 0}</div>
            <div className="stat-subtext">Recorded today</div>
          </div>
        </div>

        <div className="login-stat-card">
          <div className="stat-icon-wrapper green">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 14 14" />
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">Active Now</div>
            <div className="stat-value">{stats.currently_active ?? 0}</div>
            <div className="stat-subtext">Currently online</div>
          </div>
        </div>

        <div className="login-stat-card">
          <div className="stat-icon-wrapper orange">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">First Login Today</div>
            <div className="stat-value text-sm">
              {stats.first_login_today ? new Date(stats.first_login_today).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
            </div>
            <div className="stat-subtext">
              {stats.first_login_today ? new Date(stats.first_login_today).toLocaleDateString() : "No logins today yet"}
            </div>
          </div>
        </div>

        <div className="login-stat-card">
          <div className="stat-icon-wrapper purple">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">Last Logout Today</div>
            <div className="stat-value text-sm">
              {stats.last_logout_today ? new Date(stats.last_logout_today).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
            </div>
            <div className="stat-subtext">
              {stats.last_logout_today ? new Date(stats.last_logout_today).toLocaleDateString() : "No logouts today"}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="login-filters-card">
        <div className="login-filters-bar">
          {/* Quick Date Pills */}
          <div className="quick-date-pills">
            <button
              type="button"
              className={`pill-btn ${filters.date === "" ? "active" : ""}`}
              onClick={() => { setFilters(prev => ({ ...prev, date: "" })); setPage(1); }}
            >
              All Days
            </button>
            <button
              type="button"
              className={`pill-btn ${filters.date && new Date(filters.date).toDateString() === new Date().toDateString() ? "active" : ""}`}
              onClick={setTodayDate}
            >
              Today
            </button>
            <button
              type="button"
              className="pill-btn"
              onClick={setYesterdayDate}
            >
              Yesterday
            </button>
          </div>

          {/* Date Picker */}
          <div className="filter-item date-picker-wrapper">
            <label className="filter-label">Filter Date</label>
            <div className="input-with-clear">
              <input
                type="date"
                value={filters.date}
                onChange={(e) => {
                  setFilters({ ...filters, date: e.target.value });
                  setPage(1);
                }}
                className="filter-input"
                title="Select date"
              />
              {filters.date && (
                <button
                  type="button"
                  className="clear-icon-btn"
                  onClick={() => { setFilters({ ...filters, date: "" }); setPage(1); }}
                  title="Clear date"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* User selector for Admins */}
          {isAdmin && (
            <div className="filter-item user-select-wrapper">
              <label className="filter-label">Member</label>
              <select
                value={filters.userId}
                onChange={(e) => {
                  setFilters({ ...filters, userId: e.target.value });
                  setPage(1);
                }}
                className="filter-select"
              >
                <option value="all">All Members</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Input */}
          <div className="filter-item search-wrapper">
            <label className="filter-label">Search</label>
            <input
              type="text"
              placeholder="Search user, email, IP..."
              value={filters.search}
              onChange={(e) => {
                setFilters({ ...filters, search: e.target.value });
                setPage(1);
              }}
              className="filter-input search-input"
            />
          </div>

          {/* Reset button */}
          {hasActiveFilters && (
            <div className="filter-item clear-all-wrapper">
              <button
                type="button"
                className="btn btn-outline-secondary clear-filters-btn"
                onClick={clearAllFilters}
                title="Reset all filters"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      <div className="login-table-card">
        {loading ? (
          <div className="loader_container">
            <p className="loader_spinner"></p>
            <p>Loading Login Timings…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-logs-view">
            <div className="empty-icon-wrapper">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3>No login records found</h3>
            <p>
              {hasActiveFilters
                ? "No login timings match your active filters. Try picking another date or resetting filters."
                : "No login activities recorded yet."}
            </p>
            {hasActiveFilters && (
              <button type="button" className="btn btn-primary btn-sm mt-3" onClick={clearAllFilters}>
                View All Records
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="login-history-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role / Dept</th>
                  <th>Login Date & Time</th>
                  <th>Logout Date & Time</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>IP / Device</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isActive = !log.logout_at && log.session_status === 'active';
                  const loginDateObj = log.login_at ? new Date(log.login_at) : null;
                  const logoutDateObj = log.logout_at ? new Date(log.logout_at) : null;

                  return (
                    <tr key={log.id} className={isActive ? "row-active-session" : ""}>
                      {/* User Info */}
                      <td>
                        <div className="user-cell">
                          <UserAvatar name={log.user_name} size={36} />
                          <div className="user-details-text">
                            <span className="user-full-name">{log.user_name || "Unknown"}</span>
                            <span className="user-sub-email">{log.user_email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role / Dept */}
                      <td>
                        <div className="role-cell">
                          <span className={`role-badge ${log.user_role === 'admin' ? 'admin' : 'employee'}`}>
                            {log.user_role || "employee"}
                          </span>
                          {log.user_department && (
                            <span className="dept-tag">{log.user_department}</span>
                          )}
                        </div>
                      </td>

                      {/* Login Time */}
                      <td>
                        <div className="time-cell">
                          <span className="time-primary">
                            {loginDateObj ? loginDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—"}
                          </span>
                          <span className="date-secondary">
                            {loginDateObj ? loginDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ""}
                          </span>
                        </div>
                      </td>

                      {/* Logout Time */}
                      <td>
                        <div className="time-cell">
                          {logoutDateObj ? (
                            <>
                              <span className="time-primary">
                                {logoutDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                              <span className="date-secondary">
                                {logoutDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </>
                          ) : (
                            <span className="active-pulsing-badge">
                              <span className="pulse-dot"></span> Active Now
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Duration */}
                      <td>
                        <div className="duration-cell">
                          <span className="duration-text">
                            {formatDuration(log.session_duration_minutes, log.login_at, log.logout_at)}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        {isActive ? (
                          <span className="status-chip active">Online</span>
                        ) : log.logout_at ? (
                          <span className="status-chip logged-out">Logged Out</span>
                        ) : (
                          <span className="status-chip auto-closed">Closed</span>
                        )}
                      </td>

                      {/* IP / Device */}
                      <td>
                        <div className="device-cell">
                          <span className="ip-text" title={log.ip_address || "Local"}>
                            {log.ip_address || "—"}
                          </span>
                          <span className="browser-text">
                            {formatDevice(log.user_agent)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && logs.length > 0 && (
          <div className="pagination-bar">
            <div className="pagination-info">
              Showing <strong>{(page - 1) * limit + 1}</strong> to <strong>{Math.min(page * limit, total)}</strong> of <strong>{total}</strong> records
            </div>

            <div className="pagination-controls">
              <div className="limit-selector">
                <span>Per page:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="limit-select"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="page-buttons">
                <button
                  type="button"
                  className="page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  title="Previous page"
                >
                  ‹ Prev
                </button>
                <span className="page-number-display">
                  Page {page} of {totalPages || 1}
                </span>
                <button
                  type="button"
                  className="page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  title="Next page"
                >
                  Next ›
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      <div className={`toastx ${toast.type} ${toast.open ? 'show' : ''}`} role="status" aria-live="polite">
        <div className="toastx-icon">
          {toast.type === 'success' ? (
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
          <div className="toastx-title">{toast.type === 'success' ? 'Success' : 'Notice'}</div>
          <div className="toastx-msg">{toast.message}</div>
        </div>
        <button className="toastx-close" onClick={hideToast} aria-label="Close">×</button>
      </div>
    </div>
  );
}

