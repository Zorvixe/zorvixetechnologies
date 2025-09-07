import { useAuth } from '../auth'
import "./Sidebar.css"

const VALID_VIEWS = new Set([
  'stats','clients','payments','users','candidates','tickets','contacts'
]);

export default function Sidebar({ current, onNavigate, collapsed }) {
  const { user } = useAuth()

  const goto = (key) => (e) => {
    e.preventDefault();
    if (!VALID_VIEWS.has(key)) return;
    // update hash so refresh keeps view
    window.location.hash = key;
    onNavigate(key);
  }

  const initials =
    (user?.name || user?.email || "U")
      .split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "U"

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed ? (
        <div className="user">
          <strong>{user?.name || user?.email}</strong>
          <span className="badge">
            ZOR -  {user?.role ? user.role.charAt(0).toUpperCase() : ""}
          </span>
        </div>
      ) : (
        <button className="avatar-btn avatar_button_sidebar" aria-label="Account" title={`${user?.name || ''} (${user?.email || ''})`}>
          <span className="avatar">{initials}</span>
        </button>
      )}

      <nav className="sidebar-nav">

        <a href="#stats" className={`navlink ${current === 'stats' ? 'active' : ''}`} onClick={goto('stats')} title="Stats">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          {!collapsed && <span>Stats</span>}
        </a>

        <a href="#clients" className={`navlink ${current === 'clients' ? 'active' : ''}`} onClick={goto('clients')} title="Clients">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          {!collapsed && <span>Clients</span>}
        </a>

        {user?.role === 'admin' && (
          <a href="#payments" className={`navlink ${current === 'payments' ? 'active' : ''}`} onClick={goto('payments')} title="Payments">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /><path d="M6 16h2" /><path d="M10 16h6" /></svg>
            {!collapsed && <span>Payments</span>}
          </a>
        )}

        {user?.role === 'admin' && (
          <a href="#users" className={`navlink ${current === 'users' ? 'active' : ''}`} onClick={goto('users')} title="Users">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M4 21v-2a4 4 0 0 1 3-3.87" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {!collapsed && <span>Users</span>}
          </a>
        )}

        {user?.role === 'admin' && (
          <a href="#candidates" className={`navlink ${current === 'candidates' ? 'active' : ''}`} onClick={goto('candidates')} title="Onboarding">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            {!collapsed && <span>Onboarding</span>}
          </a>
        )}

        <a href="#tickets" className={`navlink ${current === 'tickets' ? 'active' : ''}`} onClick={goto('tickets')} title="Tickets">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path><path d="M13 5v2"></path><path d="M13 17v2"></path><path d="M13 11v2"></path></svg>
          {!collapsed && <span>Jira</span>}
        </a>

        <a href="#contacts" className={`navlink ${current === 'contacts' ? 'active' : ''}`} onClick={goto('contacts')} title="Contacts">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="9" y1="12" x2="15" y2="12" />
            <line x1="9" y1="16" x2="13" y2="16" />
          </svg>
          {!collapsed && <span>Contacts</span>}
        </a>
      </nav>
    </aside>
  )
}
