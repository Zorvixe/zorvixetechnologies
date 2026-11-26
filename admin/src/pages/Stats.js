import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiStats, apiGlobalSearch, apiAiDashboardDigest } from "../api";
import AiInsightBox from "../components/AiInsightBox";
import { SparklesIcon } from "../components/CrmHrmsIcons";
import { useAuth } from "../auth";

// Import banners with unique names
import banner1 from "../assets/home_banner_1.png";
import banner2 from "../assets/home_banner_2.png";
import banner3 from "../assets/home_banner_3.png";
import banner4 from "../assets/home_banner_4.png";
import banner5 from "../assets/home_banner_5.png";

import jira_logo from "../assets/jira_logo.png";
import projects_logo from "../assets/projects_logo.png";

import "./Stats.css";

export default function Stats() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  /* ------------------- AI DAILY DIGEST & RISK RADAR ------------------- */
  const [digestOpen, setDigestOpen] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState("");
  const [digestData, setDigestData] = useState(null);

  const loadAiDigest = async () => {
    setDigestOpen(true);
    setDigestLoading(true);
    setDigestError("");
    try {
      const res = await apiAiDashboardDigest();
      setDigestData(res);
    } catch (e) {
      setDigestError(e?.message || "Failed to generate AI digest");
    } finally {
      setDigestLoading(false);
    }
  };

  /* ------------------- GLOBAL SEARCH (MOBILE / SMALL DEVICES) ------------------- */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      setSelectedIndex(-1);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await apiGlobalSearch(trimmed);
        setSearchResults(Array.isArray(res?.results) ? res.results : []);
        setSelectedIndex(-1);
      } catch (err) {
        console.error("Stats global search error:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!searchContainerRef.current?.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleSearchKeyDown = (e) => {
    if (!searchOpen || searchResults.length === 0) {
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        handleSelectResult(searchResults[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
  };

  const handleSelectResult = (item) => {
    setSearchOpen(false);
    setSearchQuery("");
    if (item?.url) {
      navigate(item.url);
    }
  };

  const getSearchCategoryIcon = (type) => {
    switch (type) {
      case "ticket":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="12" r="3" />
            <path d="M15 8h4M15 12h4M15 16h4" />
          </svg>
        );
      case "project":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          </svg>
        );
      case "client":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        );
      case "contact":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5 12L3 7a2 2 0 012-2h14a2 2 0 012 2l-2 5" />
            <path d="M7 21h10a2 2 0 0 0 2-2v-7" />
          </svg>
        );
      case "user":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="7" r="4" />
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          </svg>
        );
      case "candidate":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        );
      case "leave":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        );
      case "payment":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        );
    }
  };

  // Put banners in an array
  const banners = [banner1, banner2, banner3, banner4, banner5];

  // Select banner based on the current day
  const today = new Date();
  const dayOfYear = Math.floor(
    (today - new Date(today.getFullYear(), 0, 0)) / 86400000
  );
  const selectedBanner = banners[dayOfYear % banners.length];

  async function load() {
    try {
      setLoading(true);
      const d = await apiStats(); // GET /api/stats/dashboard
      setData(d);
      setErr("");
    } catch (e) {
      setErr(e.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const fmtDate = (v) => new Date(v).toLocaleDateString();
  const fmtDateTime = (v) => new Date(v).toLocaleString();
  const num = (v) => Number(v || 0).toLocaleString();
  const money = (v) => `₹${Number(v || 0).toLocaleString()}`;

  // ---- derived for mini bars
  const contactsMax = useMemo(
    () => Math.max(1, ...(data?.contactsLast30 || []).map((d) => Number(d.count || 0))),
    [data]
  );
  const paymentsMax = useMemo(
    () => Math.max(1, ...(data?.paymentsLast30 || []).map((d) => Number(d.count || 0))),
    [data]
  );

  return (
    <div className="stats-container">
      {/* Top Banner with overlay & buttons */}
      <div
        className="stats-top-banner"
        style={{ backgroundImage: `url(${selectedBanner})` }}
      >
        <div className="stats-banner-overlay" />
        <div className="stats-banner-content">
          <div className="stats-banner-header">
            <div className="stats-banner-date">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </div>
            <h2 className="stats-banner-greeting">Hello, {user?.name || "User"}</h2>
          </div>

          <div className="stats-home-banner-buttons">
            <a href="/clients" className="stats-banner-btn stats-first-btn">
              <img
                src={projects_logo}
                alt="Projects"
                className="stats-btn-icon"
              />
              <span>Read project updates</span>
            </a>

            <a href="/tickets" className="stats-banner-btn stats-second-btn">
              <img
                src={jira_logo}
                alt="Tickets"
                className="stats-btn-icon"
              />
              <span>Read new tickets updates</span>
            </a>
          </div>
        </div>
      </div>

      {/* Global Search Bar (Only shown on mobile / small devices where topbar search is hidden) */}
      <div className="stats-search-section" ref={searchContainerRef}>
        <div className={`stats-search-wrapper ${searchOpen && (searchResults.length > 0 || isSearching) ? "has-results" : ""}`}>
          <div className="stats-search-input-box">
            <svg className="stats-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              ref={searchInputRef}
              type="text"
              className="stats-search-input"
              placeholder="Search tickets, projects, clients, contacts, team..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => {
                if (searchQuery.trim().length > 0) setSearchOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
            />

            {isSearching && (
              <span className="stats-search-spinner" />
            )}

            {searchQuery && !isSearching && (
              <button
                type="button"
                className="stats-search-clear"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setSearchOpen(false);
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* Search Dropdown Results */}
          {searchOpen && searchQuery.trim().length > 0 && (
            <div className="stats-search-dropdown">
              {isSearching && searchResults.length === 0 ? (
                <div className="stats-search-loading">
                  <span className="stats-search-spinner" />
                  <span>Searching across workspace...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="stats-search-empty">
                  <p className="stats-empty-title">No results found for "<strong>{searchQuery}</strong>"</p>
                  <p className="stats-empty-sub">Try searching with a ticket ID, project name, client email, or person's name.</p>
                </div>
              ) : (
                <div className="stats-search-results-list">
                  <div className="stats-results-summary">
                    <span>Found {searchResults.length} result{searchResults.length === 1 ? "" : "s"}</span>
                  </div>

                  {Object.entries(
                    searchResults.reduce((acc, item) => {
                      const cat = item.category || "Other";
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(item);
                      return acc;
                    }, {})
                  ).map(([catName, items]) => (
                    <div key={catName} className="stats-search-category-group">
                      <div className="stats-category-header">
                        <span>{catName}</span>
                        <span className="stats-category-count">{items.length}</span>
                      </div>
                      {items.map((item) => {
                        const globalIndex = searchResults.findIndex((r) => r.id === item.id);
                        const isSelected = globalIndex === selectedIndex;
                        return (
                          <div
                            key={item.id}
                            className={`stats-search-item ${isSelected ? "selected" : ""}`}
                            onClick={() => handleSelectResult(item)}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                          >
                            <div className={`stats-item-icon-wrap stats-icon-${item.type}`}>
                              {getSearchCategoryIcon(item.type)}
                            </div>
                            <div className="stats-item-body">
                              <div className="stats-item-main">
                                <span className="stats-item-title">{item.title}</span>
                                {item.badge && (
                                  <span className={`stats-item-badge stats-badge-${item.type}`}>
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              {item.subtitle && (
                                <span className="stats-item-sub">{item.subtitle}</span>
                              )}
                            </div>
                            <svg className="stats-item-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {err && (
        <div className="stats-card stats-error" role="alert">
          <div className="stats-err-title">Couldn’t load stats</div>
          <div className="stats-err-msg">{err}</div>
          <button className="stats-button" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {/* Skeleton while loading first time */}
      {loading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <div className="stats-dashboard-grid">
          {/* Role-Scoped AI Daily Digest & Emerging Risks */}
          <section className="stats-card stats-card-full" style={{ padding: "12px 16px" }} aria-label="AI Daily Digest">
            {!digestOpen ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className="zx-ai-badge-icon"><SparklesIcon size={28} /></span>
                  <div>
                    <strong style={{ fontSize: "14px", color: "#172b4d" }}>ZORVI Daily Digest &amp; Risk Radar</strong>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button type="button" className="zx-ai-btn-primary" onClick={loadAiDigest}>
                    <SparklesIcon size={13} />
                    <span>Today&apos;s Digest</span>
                  </button>
                  <button
                    type="button"
                    className="zx-ai-btn-sm"
                    onClick={() => window.dispatchEvent(new CustomEvent("zorvixe:open-ai-assistant"))}
                  >
                    <SparklesIcon size={13} />
                    Ask ZORVI
                  </button>
                </div>
              </div>
            ) : (
              <AiInsightBox
                title={digestData?.headline || "ZORVI Daily Digest & Risk Radar"}
                subtitle={`Role-scoped (${isAdmin ? "Admin" : "Employee"}) • Grounded in live database queues`}
                loading={digestLoading}
                error={digestError}
                uncertainty={digestData?.uncertainty}
                providerMeta={digestData?.meta}
                onRefresh={loadAiDigest}
                onClose={() => setDigestOpen(false)}
              >
                {digestData && (
                  <div>
                    <p style={{ margin: "0 0 8px" }}>{digestData.digestSummary}</p>
                    {digestData.emergingRisks?.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                        <strong style={{ fontSize: "12px", color: "#42526e" }}>Emerging Risks &amp; Queues:</strong>
                        {digestData.emergingRisks.map((risk, idx) => (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", background: "#ffffff", border: "1px solid #dfe1e6", borderRadius: "6px", padding: "6px 10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span className={`zx-ai-tag ${risk.severity}`}>{risk.severity}</span>
                              <span style={{ fontSize: "12px" }}>{risk.title}</span>
                            </div>
                            {risk.url && (
                              <button
                                type="button"
                                className="zx-ai-btn-sm"
                                onClick={() => navigate(risk.url)}
                              >
                                Inspect →
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </AiInsightBox>
            )}
          </section>

          {/* KPIs Section - Full Width */}
          <section className="stats-card stats-card-full stats-kpis" aria-labelledby="kpi-heading">
            <div className="stats-kpis-header">
              <h2 id="kpi-heading" className="stats-card-title">Key Performance Indicators</h2>
              <span className="stats-badge-live">Live</span>
            </div>
            <div className="stats-kpi-grid">
              <KPI icon="users" label="Clients" value={num(data.totals.clients)} variant="blue" />
              <KPI icon="brief" label="Projects" value={num(data.totals.projects)} variant="indigo" />
              <KPI icon="inbox" label="Contacts" value={num(data.totals.contacts)} variant="emerald" />
              {isAdmin && (
                <KPI icon="link" label="Payment Links" value={num(data.totals.payment_links)} variant="amber" />
              )}
              {isAdmin && (
                <KPI icon="rupee" label="Payments" value={num(data.totals.payments)} variant="teal" />
              )}
              <KPI icon="id" label="Candidates" value={num(data.totals.candidates)} variant="rose" />
            </div>
          </section>

          {/* Status + Contacts Trend - Half Width */}
          <section className="stats-card stats-card-half" aria-labelledby="status-heading">
            <div className="stats-card-header">
              <h3 id="status-heading" className="stats-card-title">Contacts by Status</h3>
            </div>
            {!data.contactsByStatus || !data.contactsByStatus.length ? (
              <Empty message="No status data yet" />
            ) : (
              <div className="stats-chip-grid">
                {data.contactsByStatus.map((s) => (
                  <div className="stats-chip" key={s.status}>
                    <span className="stats-chip-dot" data-variant={s.status.toLowerCase()} />
                    <span className="stats-chip-label">{s.status}</span>
                    <span className="stats-chip-value">{num(s.count)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="stats-divider" />
            <div className="stats-section-subtitle">Last 30 Days — Contacts Trend</div>
            {!data.contactsLast30 || !data.contactsLast30.length ? (
              <Empty message="No contacts in the last 30 days" />
            ) : (
              <div className="stats-scroll-box">
                <ul className="stats-bar-list">
                  {data.contactsLast30.map((d) => {
                    const c = Number(d.count || 0);
                    const w = Math.round((c / contactsMax) * 100);
                    return (
                      <li className="stats-bar-row" key={String(d.day)}>
                        <span className="stats-bar-label">{fmtDate(d.day)}</span>
                        <span className="stats-bar-track" aria-hidden>
                          <span className="stats-bar-fill" style={{ width: `${w}%` }} />
                        </span>
                        <span className="stats-bar-value">{num(c)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          {/* Last 30 Days Payments - Half Width (Admin only) */}
          {isAdmin && (
            <section className="stats-card stats-card-half" aria-labelledby="payments-heading">
              <div className="stats-card-header">
                <h3 id="payments-heading" className="stats-card-title">Last 30 Days — Payments</h3>
              </div>
              {!data.paymentsLast30 || !data.paymentsLast30.length ? (
                <Empty message="No payments in the last 30 days" />
              ) : (
                <div className="stats-scroll-box">
                  <ul className="stats-bar-list">
                    {data.paymentsLast30.map((d) => {
                      const c = Number(d.count || 0);
                      const w = Math.round((c / paymentsMax) * 100);
                      return (
                        <li className="stats-bar-row stats-pay-row" key={String(d.day)}>
                          <span className="stats-bar-label">{fmtDate(d.day)}</span>
                          <span className="stats-bar-track" aria-hidden>
                            <span className="stats-bar-fill stats-pay" style={{ width: `${w}%` }} />
                          </span>
                          <span className="stats-bar-value">
                            <span className="stats-pay-count">{num(c)}</span>
                            <span className="stats-pay-dot">•</span>
                            <span className="stats-pay-amt">{money(d.total_amount)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Recent Logins - Half Width */}
          <section className="stats-card stats-card-half" aria-labelledby="logins-heading">
            <div className="stats-card-header">
              <h3 id="logins-heading" className="stats-card-title">Recent Logins</h3>
            </div>
            {!data.recentLogins || !data.recentLogins.length ? (
              <Empty message="No recent logins" />
            ) : (
              <div className="stats-scroll-box">
                <ul className="stats-people">
                  {data.recentLogins.map((u) => (
                    <li className="stats-person" key={u.id}>
                      <Avatar name={u.name} />
                      <div className="stats-person-info">
                        <div className="stats-person-top">
                          <strong className="stats-person-name">{u.name}</strong>
                          <span className="stats-role">ZOR - {u.role ? u.role.charAt(0).toUpperCase() : ""}</span>
                        </div>
                        <div className="stats-person-sub">
                          <span className="stats-person-email" title={u.email}>{u.email}</span>
                          <span className="stats-dot" />
                          <span className="stats-person-time">{fmtDateTime(u.last_login_at)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Recent Activity - Half Width (Admin only) */}
          {isAdmin && (
            <section className="stats-card stats-card-half stats-recent-activity" aria-labelledby="activity-heading">
              <div className="stats-card-header">
                <h3 id="activity-heading" className="stats-card-title">Recent Activity</h3>
              </div>
              <div className="stats-scroll-box">
                <ul className="stats-timeline">
                  {data.activityFeed
                    .filter((a) => {
                      if (!isAdmin && a.type === "payment") return false;
                      return true;
                    })
                    .map((a, i) => (
                      <li className="stats-timeline-item" key={`${a.type}-${i}`}>
                        <span className="stats-tl-dot" data-type={a.type} />
                        <div className="stats-tl-body">
                          <div className="stats-tl-text">
                            <span className={`stats-tag stats-tag-${a.type}`}>{a.type}</span>
                            <span className="stats-tl-desc">{a.text}</span>
                          </div>
                          <div className="stats-tl-time">{fmtDateTime(a.at)}</div>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- small components ---------- */

function KPI({ icon, label, value, variant = "blue" }) {
  return (
    <div className={`stats-kpi-card stats-kpi-${variant}`} role="status" aria-label={`${label} ${value}`}>
      <div className={`stats-kpi-icon stats-kpi-icon-${variant}`}>{getIcon(icon)}</div>
      <div className="stats-kpi-content">
        <div className="stats-kpi-label">{label}</div>
        <div className="stats-kpi-value">{value}</div>
      </div>
    </div>
  );
}

function Avatar({ name = "" }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <div className="stats-avatar" aria-hidden>
      {initials || "U"}
    </div>
  );
}

function Empty({ message }) {
  return <div className="stats-empty">{message}</div>;
}

function DashboardSkeleton() {
  return (
    <>
      <div className="stats-card stats-card-full stats-kpis">
        <div className="stats-kpi-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="stats-kpi-card stats-skeleton" key={i}>
              <div className="stats-kpi-icon" />
              <div className="stats-kpi-content">
                <div className="stats-s-bar stats-w60" />
                <div className="stats-s-bar stats-w40" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="stats-dashboard-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="stats-card stats-card-half stats-skeleton-block" key={i}>
            <div className="stats-s-bar stats-w30" />
            <div className="stats-s-bar stats-w90" />
            <div className="stats-s-bar stats-w80" />
            <div className="stats-s-bar stats-w70" />
          </div>
        ))}
      </div>
    </>
  );
}

function getIcon(kind) {
  const common = { stroke: "currentColor", fill: "none", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "users":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    case "brief":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
        </svg>
      );
    case "inbox":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5 12L3 7a2 2 0 012-2h14a2 2 0 012 2l-2 5" />
          <path d="M7 21h10a2 2 0 002-2v-7" />
        </svg>
      );
    case "link":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 00-7.07-7.07L10 5" />
          <path d="M14 11a5 5 0 00-7.07 0L5.5 12.43a5 5 0 007.07 7.07L14 19" />
        </svg>
      );
    case "rupee":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M6 4h12" />
          <path d="M6 8h12" />
          <path d="M6 12h6a4 4 0 010 8H6" />
        </svg>
      );
    case "id":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="12" r="3" />
          <path d="M15 8h4M15 12h4M15 16h4" />
        </svg>
      );
    default:
      return null;
  }
}
