import React, { useState } from 'react'
import { AuthProvider, useAuth } from './auth'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'

import Login from './pages/Login'
import Contacts from './pages/Contacts'
import Users from './pages/Users'
import Stats from './pages/Stats'
import Candidates from './pages/Candidates'
import Clients from './pages/Clients'
import Payments from './pages/Payments'   // <-- NEW
import Tickets from './pages/Tickets';

import './App.css'

function Shell() {
  const { user, loading } = useAuth()
  const [view, setView] = useState('contacts') // + 'payments'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  if (loading) return <div className="center">Loading…</div>
  if (!user) return <Login onSuccess={() => setView('contacts')} />

  // Non-admin users cannot open "users" or "candidates"
  const restricted = ['users', 'candidates']
  const safeView = (user.role === 'admin') ? view : (restricted.includes(view) ? 'contacts' : view)

  // Add to the view mapping
  const titleMap = {
    contacts: 'Contacts',
    stats: 'Stats',
    users: 'Users',
    candidates: 'Onboarding',
    clients: 'Clients',
    payments: 'Payments',
    tickets: 'Tickets', // NEW
  }
  const currentTitle = titleMap[safeView] || 'Dashboard'

  return (
    <div className="app-shell">
      <Sidebar
        current={safeView}
        onNavigate={setView}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
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
        {safeView === 'users' && user.role === 'admin' && <Users />}
        {safeView === 'candidates' && user.role === 'admin' && <Candidates />}
        {safeView === 'clients' && <Clients />}
        {safeView === 'payments' && <Payments />}   {/* <-- NEW */}
        {safeView === 'tickets' && <Tickets />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}