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
import LoginHistory from './pages/LoginHistory';
import Discussions from './pages/Discussions';
import Account from './pages/Account';
import Notification from './pages/Notification';
import UserTicket from './pages/UserTicket';
import LinkedInChatWidget from './components/LinkedInChatWidget';
import MobileBottomNav from './components/MobileBottomNav';

import LeaveManagement from "./pages/LeaveManagement/LeaveManagement"
import HRMS from './pages/HRMS';
import CRM from './pages/CRM';


import './App.css';
import './styles/deeplink.css'; // ensure highlight CSS loaded globally

const restricted = ['users', 'candidates', 'payments'];

function Shell() {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => window.innerWidth <= 768);
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
    discussions: 'Discussions',
    chat: 'Discussions',
    leaves: 'Leaves',
    'login-history': 'Login Timings',
    logins: 'Login Timings',
    account: 'My Account',
    profile: 'My Account',
    notifications: 'Notifications',
    'user-tickets': 'Tickets Activity',
    hrms: 'HRMS & Payroll',
    attendance: 'Attendance Management',
    payroll: 'Payroll & Payslips',
    employees: 'Employee Records',
    recruitment: 'Recruitment & Compliance',
    'workforce-insights': 'Workforce Insights',
    crm: 'CRM & Pipeline',
  };
  const currentTitle = titleMap[safePath] || 'Dashboard';

  return (
    <div className="app-shell">
      <Sidebar
        current={safePath}
        onNavigate={(v) => {
          navigate(`/${v}`);
          if (window.innerWidth <= 768) {
            setSidebarCollapsed(true);
          }
        }}
        collapsed={sidebarCollapsed}
        onClose={() => setSidebarCollapsed(true)}
      />
      {!sidebarCollapsed && window.innerWidth <= 768 && (
        <div className="sidebar-overlay" onClick={() => setSidebarCollapsed(true)} />
      )}
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

          <Route path="/discussions" element={<Discussions />} />
          <Route path="/chat" element={<Navigate to="/discussions" replace />} />
          <Route path="/leaves" element={<LeaveManagement />} />
          <Route path="/login-history" element={<LoginHistory />} />
          <Route path="/logins" element={<Navigate to="/login-history" replace />} />
          <Route path="/account" element={<Account />} />
          <Route path="/profile" element={<Navigate to="/account" replace />} />
          <Route path="/notifications" element={<Notification />} />
          <Route path="/user-tickets" element={<UserTicket />} />

          {/* HRMS & Payroll Suite */}
          <Route path="/hrms" element={<HRMS />} />
          <Route path="/attendance" element={<HRMS defaultTab="attendance" />} />
          <Route path="/payroll" element={<HRMS defaultTab="payroll" />} />
          <Route path="/employees" element={<HRMS defaultTab="employees" />} />
          <Route path="/recruitment" element={<HRMS defaultTab="recruitment" />} />
          <Route path="/workforce-insights" element={<HRMS defaultTab="workforce-insights" />} />

          {/* CRM & Sales Pipeline */}
          <Route path="/crm" element={<CRM />} />

          <Route path="*" element={<Navigate to="/stats" />} />
        </Routes>
      </main>

      {/* LinkedIn-style floating messaging widget docked at bottom-right */}
      <LinkedInChatWidget />

      {/* Native-feel Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        sidebarOpen={!sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
      />
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