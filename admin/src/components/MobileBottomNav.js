// src/components/MobileBottomNav.js
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './MobileBottomNav.css';

export default function MobileBottomNav({ onToggleSidebar, sidebarOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname.replace(/^\//, '') || 'stats';

  const items = [
    {
      key: 'stats',
      label: 'Dashboard',
      path: '/stats',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      ),
    },
    {
      key: 'clients',
      label: 'Clients',
      path: '/clients',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      key: 'tickets',
      label: 'Tickets',
      path: '/tickets',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M13 5v2" />
          <path d="M13 17v2" />
          <path d="M13 11v2" />
        </svg>
      ),
    },
    {
      key: 'discussions',
      label: 'Chat',
      path: '/discussions',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      key: 'menu',
      label: 'Menu',
      isMenu: true,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Bottom Navigation">
      {items.map((item) => {
        let active = false;
        if (item.isMenu) {
          active = sidebarOpen;
        } else if (item.key === 'stats') {
          active = currentPath === 'stats' || currentPath === '';
        } else if (item.key === 'discussions') {
          active = currentPath === 'discussions' || currentPath === 'chat';
        } else {
          active = currentPath.startsWith(item.key);
        }

        return (
          <button
            key={item.key}
            type="button"
            className={`mobile-nav-btn ${active ? 'is-active' : ''}`}
            onClick={() => {
              if (item.isMenu) {
                onToggleSidebar();
              } else {
                navigate(item.path);
              }
            }}
            aria-label={item.label}
          >
            <div className="mobile-nav-icon">
              {item.icon}
              {active && <span className="mobile-nav-indicator" />}
            </div>
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
