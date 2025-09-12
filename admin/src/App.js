// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';

import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

import Login from './pages/Login';
import Contacts from './pages/Contacts';
import Users from './pages/Users';
import Stats from './pages/Stats';
import Candidates from './pages/Candidates';
import Clients from './pages/Clients';
import Payments from './pages/Payments';
import Tickets from './pages/Tickets';



import './App.css';
import './styles/deeplink.css'; // ensure highlight CSS loaded globally

const restricted = ['users', 'candidates', 'payments'];

function Shell() {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div id="preloader">
        <img src="/assets/img/Zorvixe_preloader.png" alt="Zorvixe Logo" id="preloader-logo" />
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        onSuccess={() => {
          navigate('/stats', { replace: true });
        }}
      />
    );
  }

  const role = user?.role ?? 'guest';
  const path = location.pathname.replace(/^\//, '') || 'stats';
  const safePath = role === 'admin' ? path : (restricted.includes(path) ? 'stats' : path);

  const titleMap = {
    contacts: 'Contacts',
    stats: 'Stats',
    users: 'Users',
    candidates: 'Onboarding',
    clients: 'Clients',
    payments: 'Payments',
    tickets: 'Tickets',
  };
  const currentTitle = titleMap[safePath] || 'Dashboard';

  return (
    <div className="app-shell">
      <Sidebar
        current={safePath}
        onNavigate={(v) => navigate(`/${v}`)}
        collapsed={sidebarCollapsed}
      />
      <main className="content">
        <Topbar
          variant="global"
          title={currentTitle}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        />

        <Routes>
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/users" element={role === 'admin' ? <Users /> : <Navigate to="/stats" />} />
          <Route path="/candidates" element={role === 'admin' ? <Candidates /> : <Navigate to="/stats" />} />
          <Route path="/payments" element={role === 'admin' ? <Payments /> : <Navigate to="/stats" />} />

          {/* Tickets list & modal route:
              both /tickets and /tickets/:id render Tickets component.
              Tickets reads useParams() and opens the modal when :id exists.
          */}
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/tickets/:id" element={<Tickets />} />

          {/* Project detail remains as separate page */}
          <Route path="/clients" element={<Clients />} />

          <Route path="/projects/:id" element={<Clients />} />

          <Route path="*" element={<Navigate to="/stats" />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}
