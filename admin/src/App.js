import React, { useEffect, useMemo, useState } from 'react'
import { AuthProvider, useAuth } from './auth'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'

import Login from './pages/Login'
import Contacts from './pages/Contacts'
import Users from './pages/Users'
import Stats from './pages/Stats'
import Candidates from './pages/Candidates'
import Clients from './pages/Clients'
import Payments from './pages/Payments'
import Tickets from './pages/Tickets'

import './App.css'

const VALID_VIEWS = new Set([
  'stats','contacts','users','candidates','clients','payments','tickets'
]);

function getInitialViewFromHash() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '').trim();
  return VALID_VIEWS.has(raw) ? raw : 'stats'; // default to Stats
}

function Shell() {
  const { user, loading } = useAuth()
  const [view, setView] = useState(getInitialViewFromHash())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Keep state in sync with hash (so back/forward and refresh work)
  useEffect(() => {
    const onHash = () => {
      const v = getInitialViewFromHash();
      setView(v);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // ---- compute safeView UNCONDITIONALLY (no hooks) ----
  const restricted = ['users', 'candidates', 'payments'];
  const role = user?.role ?? 'guest';
  const safeView = role === 'admin' ? view : (restricted.includes(view) ? 'stats' : view);

  if (loading) return <div className="center">Loading…</div>;

  // After successful login, send to Stats and set hash
  if (!user) {
    return (
      <Login
        onSuccess={() => {
          window.location.hash = 'stats';
          setView('stats');
        }}
      />
    );
  }

  const titleMap = {
    contacts: 'Contacts',
    stats: 'Stats',
    users: 'Users',
    candidates: 'Onboarding',
    clients: 'Clients',
    payments: 'Payments',
    tickets: 'Tickets',
  };
  const currentTitle = titleMap[safeView] || 'Dashboard';

  return (
    <div className="app-shell">
      <Sidebar
        current={safeView}
        onNavigate={(v) => {
          window.location.hash = v;
          setView(v);
        }}
        collapsed={sidebarCollapsed}
      />
      <main className="content">
        <Topbar
          variant="global"
          title={currentTitle}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        />

        {safeView === 'contacts' && <Contacts />}
        {safeView === 'stats' && <Stats />}
        {safeView === 'users' && role === 'admin' && <Users />}
        {safeView === 'candidates' && role === 'admin' && <Candidates />}
        {safeView === 'clients' && <Clients />}
        {safeView === 'payments' && role === 'admin' && <Payments />}
        {safeView === 'tickets' && <Tickets />}
      </main>
    </div>
  );
}


export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
