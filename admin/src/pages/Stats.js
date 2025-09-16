import React, { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar";
import { apiStats } from "../api";
import { useAuth } from "../auth";   // <-- add this
import "./Stats.css";

export default function Stats() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";


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

  useEffect(() => { load(); }, []);

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
    <div>
      <Topbar title="Dashboard">
        <div className="dash-actions">
          <button className="button ghost" onClick={load} aria-label="Refresh dashboard"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-clockwise" viewBox="0 0 16 16">
            <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z" />
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466" />
          </svg></button>
        </div>
      </Topbar>

      {err && (
        <div className="card error" role="alert">
          <div className="err-title">Couldn’t load</div>
          <div className="err-msg">{err}</div>
          <button className="button" onClick={load}>Retry</button>
        </div>
      )}

      {/* Skeleton while loading first time */}
      {loading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <div className="dashboard-grid">
          {/* KPIs */}
          <section className="card kpis" aria-labelledby="kpi-heading">
            <h2 id="kpi-heading" className="sr-only">Key metrics</h2>
            <div className="kpi-grid">
              <KPI icon="users" label="Clients" value={num(data.totals.clients)} />
              <KPI icon="brief" label="Projects" value={num(data.totals.projects)} />
              <KPI icon="inbox" label="Contacts" value={num(data.totals.contacts)} />
              {isAdmin && (
                <KPI icon="link" label="Payment Links" value={num(data.totals.payment_links)} />

              )}
              {isAdmin && (
                <KPI icon="rupee" label="Payments" value={num(data.totals.payments)} />

              )}
              <KPI icon="id" label="Candidates" value={num(data.totals.candidates)} />
            </div>
          </section>

          {/* Status + Contacts trend */}
          <section className="card" aria-labelledby="status-heading">
            <h3 id="status-heading">Contacts by Status</h3>
            {(!data.contactsByStatus || !data.contactsByStatus.length) ? (
              <Empty message="No status data yet" />
            ) : (
              <div className="chip-grid">
                {data.contactsByStatus.map((s) => (
                  <div className="chip" key={s.status}>
                    <span className="chip-dot" data-variant={s.status.toLowerCase()} />
                    <span className="chip-label">{s.status}</span>
                    <span className="chip-value">{num(s.count)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="divider" />
            <h6 className="subtle">Last 30 Days — Contacts</h6>
            {(!data.contactsLast30 || !data.contactsLast30.length) ? (
              <Empty message="No contacts in the last 30 days" />
            ) : (
              <ul className="bar-list" role="list">
                {data.contactsLast30.map((d) => {
                  const c = Number(d.count || 0);
                  const w = Math.round((c / contactsMax) * 100);
                  return (
                    <li className="bar-row" key={String(d.day)}>
                      <span className="bar-label">{fmtDate(d.day)}</span>
                      <span className="bar-track" aria-hidden>
                        <span className="bar-fill" style={{ width: `${w}%` }} />
                      </span>
                      <span className="bar-value">{num(c)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {isAdmin && (
            <section className="card" aria-labelledby="payments-heading">
              <h3 id="payments-heading">Last 30 Days — Payments</h3>
              {(!data.paymentsLast30 || !data.paymentsLast30.length) ? (
                <Empty message="No payments in the last 30 days" />
              ) : (
                <ul className="bar-list" role="list">
                  {data.paymentsLast30.map((d) => {
                    const c = Number(d.count || 0);
                    const w = Math.round((c / paymentsMax) * 100);
                    return (
                      <li className="bar-row" key={String(d.day)}>
                        <span className="bar-label">{fmtDate(d.day)}</span>
                        <span className="bar-track" aria-hidden>
                          <span className="bar-fill pay" style={{ width: `${w}%` }} />
                        </span>
                        <span className="bar-value">
                          {num(c)} • {money(d.total_amount)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}


          {/* Recent logins */}
          <section className="card" aria-labelledby="logins-heading">
            <h3 id="logins-heading">Recent Logins</h3>
            {(!data.recentLogins || !data.recentLogins.length) ? (
              <Empty message="No recent logins" />
            ) : (
              <ul className="people" role="list">
                {data.recentLogins.map((u) => (
                  <li className="person" key={u.id}>
                    <Avatar name={u.name} />
                    <div className="person-info">
                      <div className="person-top">
                        <strong>{u.name}</strong>
                        <span className="role">ZOR - {u.role ? u.role.charAt(0).toUpperCase() : ""}</span>
                      </div>
                      <div className="person-sub">
                        {u.email}
                        <span className="dot" /> {fmtDateTime(u.last_login_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {isAdmin && (
            <section className="card recent_activity" aria-labelledby="activity-heading">
              <h3 id="activity-heading">Recent Activity</h3>
              {data.activityFeed
                .filter((a) => {
                  // hide payment activities if not admin
                  if (!isAdmin && a.type === "payment") return false;
                  return true;
                })
                .map((a, i) => (
                  <li className="timeline-item" key={`${a.type}-${i}`}>
                    <span className="tl-dot" data-type={a.type} />
                    <div className="tl-body">
                      <div className="tl-text">
                        <span className={`tag ${`tag-${a.type}`}`}>{a.type}</span>
                        <span>{a.text}</span>
                      </div>
                      <div className="tl-time">{fmtDateTime(a.at)}</div>
                    </div>
                  </li>
                ))}

            </section>
          )}
          {/* Activity timeline */}

        </div>
      ) : null}
    </div>
  );
}

/* ---------- small components ---------- */

function KPI({ icon, label, value }) {
  return (
    <div className="kpi-card" role="status" aria-label={`${label} ${value}`}>
      <div className="kpi-icon">{getIcon(icon)}</div>
      <div className="kpi-content">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
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
  return <div className="avatar" aria-hidden>{initials || "U"}</div>;
}

function Empty({ message }) {
  return <div className="empty">{message}</div>;
}

function DashboardSkeleton() {
  return (
    <>
      <div className="card kpis">
        <div className="kpi-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="kpi-card skeleton" key={i}>
              <div className="kpi-icon" />
              <div className="kpi-content">
                <div className="s-bar w60" />
                <div className="s-bar w40" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="dashboard-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="card skeleton-block" key={i}>
            <div className="s-bar w30" />
            <div className="s-bar w90" />
            <div className="s-bar w80" />
            <div className="s-bar w70" />
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
