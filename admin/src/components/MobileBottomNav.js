// src/components/MobileBottomNav.js
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  apiStatsNotifications,
  apiResetNotificationCount,
  apiStatsTickets,
  apiMarkTicketActivityRead,
} from '../api';
import MeetIcon from '../assets/meeting_icon.png';
import './MobileBottomNav.css';

export default function MobileBottomNav({ onToggleSidebar, sidebarOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  /* ---------------- NOTIFICATIONS & TICKETS LIVE COUNTS ---------------- */
  const [notificationCount, setNotificationCount] = useState(0);
  const [ticketCount, setTicketCount] = useState(0);
  const latestNotifAtRef = React.useRef(null);
  const latestTicketAtRef = React.useRef(null);

  const notifStorageKey = (uid) => `lastChecked_notif_${uid || 'anon'}`;
  const ticketStorageKey = (uid) => `lastChecked_ticket_${uid || 'anon'}`;

  const fetchNotificationCount = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiStatsNotifications();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];
      if (feed[0]?.at) latestNotifAtRef.current = feed[0].at;

      if (typeof data?.unreadCount === 'number') {
        setNotificationCount(data.unreadCount);
      } else {
        const sNotif = localStorage.getItem(notifStorageKey(user?.id || user?.email));
        const newActivities = sNotif
          ? feed.filter((a) => new Date(a.at) > new Date(sNotif))
          : feed;
        setNotificationCount(newActivities.length);
      }
    } catch {
      setNotificationCount(0);
    }
  }, [user]);

  const fetchTicketCount = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiStatsTickets();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];
      if (feed[0]?.at) latestTicketAtRef.current = feed[0].at;

      if (typeof data?.unreadCount === 'number') {
        setTicketCount(data.unreadCount);
      } else {
        const sTicket = localStorage.getItem(ticketStorageKey(user?.id || user?.email));
        const newActivities = sTicket
          ? feed.filter((a) => new Date(a.at) > new Date(sTicket))
          : feed;
        setTicketCount(newActivities.length);
      }
    } catch {
      setTicketCount(0);
    }
  }, [user]);

  useEffect(() => {
    fetchNotificationCount();
    fetchTicketCount();
    const interval = setInterval(() => {
      fetchNotificationCount();
      fetchTicketCount();
    }, 30000);

    const onBadgeSync = (e) => {
      const detail = e?.detail || {};
      if (detail.type === 'notifications' && typeof detail.unreadCount === 'number') {
        setNotificationCount(detail.unreadCount);
      }
      if (detail.type === 'tickets' && typeof detail.unreadCount === 'number') {
        setTicketCount(detail.unreadCount);
      }
    };
    window.addEventListener('zorvixe:badge-sync', onBadgeSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('zorvixe:badge-sync', onBadgeSync);
    };
  }, [fetchNotificationCount, fetchTicketCount]);

  const handleNotificationClick = async () => {
    const now = new Date().toISOString();
    const effectiveReadAt =
      latestNotifAtRef.current && new Date(latestNotifAtRef.current) > new Date(now)
        ? latestNotifAtRef.current
        : now;
    setNotificationCount(0);
    localStorage.setItem(notifStorageKey(user?.id || user?.email), effectiveReadAt);
    window.dispatchEvent(new CustomEvent('zorvixe:badge-sync', { detail: { type: 'notifications', unreadCount: 0 } }));
    navigate('/notifications');
    try {
      await apiResetNotificationCount({ markAll: true, latestAt: effectiveReadAt });
    } catch { }
  };

  const handleTicketClick = async () => {
    const now = new Date().toISOString();
    const effectiveReadAt =
      latestTicketAtRef.current && new Date(latestTicketAtRef.current) > new Date(now)
        ? latestTicketAtRef.current
        : now;
    setTicketCount(0);
    localStorage.setItem(ticketStorageKey(user?.id || user?.email), effectiveReadAt);
    window.dispatchEvent(new CustomEvent('zorvixe:badge-sync', { detail: { type: 'tickets', unreadCount: 0 } }));
    navigate('/user-tickets');
    try {
      await apiMarkTicketActivityRead({ markAll: true, latestAt: effectiveReadAt });
    } catch { }
  };

  /* ---------------- QUICK CREATE BOTTOM SHEET ---------------- */
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [qcSearch, setQcSearch] = useState('');

  /* ---------------- MEETINGS BOTTOM SHEET ---------------- */
  const [meetOpen, setMeetOpen] = useState(false);

  // Close sheets on Escape or route change
  useEffect(() => {
    setQuickCreateOpen(false);
    setMeetOpen(false);
  }, [location.pathname, location.hash]);

  const isHomeActive = location.pathname === '/stats' || location.pathname === '/' || location.pathname === '/crm-home';
  const isCalendarActive = location.pathname === '/calendar' || location.hash === '#activities';
  const isNotifActive = location.pathname === '/notifications';
  const isTicketsActive = location.pathname === '/user-tickets';

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Mobile Bottom Navigation">
        {/* 1. HOME (In place of plus icon) */}
        <button
          type="button"
          className={`mobile-nav-btn ${isHomeActive ? 'is-active' : ''}`}
          onClick={() => {
            setQuickCreateOpen(false);
            setMeetOpen(false);
            navigate('/stats');
          }}
          aria-label="Home"
          title="Home Dashboard"
        >
          <div className="mobile-nav-icon">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            {isHomeActive && <span className="mobile-nav-indicator" />}
          </div>
          <span className="mobile-nav-label">Home</span>
        </button>

        {/* 2. CALENDAR & ACTIVITIES */}
        <button
          type="button"
          className={`mobile-nav-btn ${isCalendarActive ? 'is-active' : ''}`}
          onClick={() => {
            setQuickCreateOpen(false);
            setMeetOpen(false);
            navigate('/calendar');
          }}
          aria-label="Calendar & Activities"
          title="Calendar & Activities"
        >
          <div className="mobile-nav-icon">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {isCalendarActive && <span className="mobile-nav-indicator" />}
          </div>
          <span className="mobile-nav-label">Calendar</span>
        </button>

        {/* 3. PLUS ICON - QUICK CREATE (In the Center) */}
        <button
          type="button"
          className={`mobile-nav-btn mobile-nav-btn-create ${quickCreateOpen ? 'is-active' : ''}`}
          onClick={() => {
            setMeetOpen(false);
            setQuickCreateOpen((v) => !v);
          }}
          aria-label="Create Records"
          title="Create Records (+)"
        >
          <div className="mobile-nav-icon">
            <div className="mobile-nav-plus-box">+</div>
          </div>
          <span className="mobile-nav-label">Create</span>
        </button>

        {/* 4. MEETINGS (GOOGLE MEET) */}
        <button
          type="button"
          className={`mobile-nav-btn ${meetOpen ? 'is-active' : ''}`}
          onClick={() => {
            setQuickCreateOpen(false);
            setMeetOpen((v) => !v);
          }}
          aria-label="Meetings"
          title="Meetings"
        >
          <div className="mobile-nav-icon">
            <img src={MeetIcon} alt="Meet" className="mobile-nav-meet-img" />
            {meetOpen && <span className="mobile-nav-indicator" />}
          </div>
          <span className="mobile-nav-label">Meet</span>
        </button>

        {/* 5. NOTIFICATIONS */}
        <button
          type="button"
          className={`mobile-nav-btn ${isNotifActive ? 'is-active' : ''}`}
          onClick={handleNotificationClick}
          aria-label="Notifications"
          title="Notifications"
        >
          <div className="mobile-nav-icon">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {notificationCount > 0 && (
              <span className="mobile-nav-badge">{notificationCount}</span>
            )}
            {isNotifActive && <span className="mobile-nav-indicator" />}
          </div>
          <span className="mobile-nav-label">Alerts</span>
        </button>

        {/* 6. TICKETS ACTIVITY */}
        {/* <button
          type="button"
          className={`mobile-nav-btn ${isTicketsActive ? 'is-active' : ''}`}
          onClick={handleTicketClick}
          aria-label="Tickets Activity"
          title="Tickets Activity"
        >
          <div className="mobile-nav-icon">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {ticketCount > 0 && (
              <span className="mobile-nav-badge">{ticketCount}</span>
            )}
            {isTicketsActive && <span className="mobile-nav-indicator" />}
          </div>
          <span className="mobile-nav-label">Tickets</span>
        </button> */}
      </nav>

      {/* ---------------- QUICK CREATE BOTTOM SHEET / MODAL ---------------- */}
      {quickCreateOpen && (
        <div className="mobile-nav-sheet-backdrop" onClick={() => setQuickCreateOpen(false)}>
          <div className="mobile-nav-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-nav-sheet-handle" />
            <div className="mobile-nav-sheet-header">
              <div className="mobile-nav-sheet-title">Create Records</div>
              <button
                type="button"
                className="mobile-nav-sheet-close"
                onClick={() => setQuickCreateOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mobile-nav-sheet-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b778c" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search module to create..."
                value={qcSearch}
                onChange={(e) => setQcSearch(e.target.value)}
                autoFocus
              />
              {qcSearch && (
                <button type="button" className="mobile-nav-search-clear" onClick={() => setQcSearch('')}>
                  ✕
                </button>
              )}
            </div>

            <div className="mobile-nav-sheet-body">
              <div className="mobile-nav-qc-section-title">Create Records</div>
              <div className="mobile-nav-qc-grid">
                {[
                  { label: '+ Lead', path: '/leads', desc: 'New prospective lead' },
                  { label: '+ Contact', path: '/contacts', desc: 'Customer contact' },
                  { label: '+ Account', path: '/accounts', desc: 'Company or organization' },
                  { label: '+ Deal', path: '/deals', desc: 'Opportunity or pipeline deal' },
                  { label: '+ Campaign', path: '/automation', desc: 'Marketing campaign' },
                  { label: '+ Task', path: '/crm#activities', desc: 'To-do activity' },
                  { label: '+ Meeting', path: '/crm#activities', desc: 'Schedule conference' },
                  { label: '+ Call', path: '/crm#activities', desc: 'Log or schedule call' },
                  { label: '+ Product', path: '/quotes', desc: 'Catalog item' },
                  { label: '+ Price Book', path: '/quotes', desc: 'Pricing tier list' }
                ]
                  .filter((it) => !qcSearch || it.label.toLowerCase().includes(qcSearch.toLowerCase()) || it.desc.toLowerCase().includes(qcSearch.toLowerCase()))
                  .map((it, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="mobile-nav-qc-item"
                      onClick={() => {
                        setQuickCreateOpen(false);
                        navigate(it.path);
                      }}
                    >
                      <div className="mobile-nav-qc-item-left">
                        <span className="mobile-nav-qc-plus">+</span>
                        <span className="mobile-nav-qc-name">{it.label.replace('+', '').trim()}</span>
                      </div>
                      <span className="mobile-nav-qc-desc">{it.desc}</span>
                    </button>
                  ))}
              </div>

              <div className="mobile-nav-qc-section-title" style={{ marginTop: '16px' }}>Configurations & Collaboration</div>
              <div className="mobile-nav-qc-grid">
                <button
                  type="button"
                  className="mobile-nav-qc-item mobile-nav-qc-item-config"
                  onClick={() => {
                    setQuickCreateOpen(false);
                    navigate('/automation');
                  }}
                >
                  <div className="mobile-nav-qc-item-left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                    <span className="mobile-nav-qc-name">New Org Module</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="mobile-nav-qc-item mobile-nav-qc-item-config"
                  onClick={() => {
                    setQuickCreateOpen(false);
                    navigate('/automation');
                  }}
                >
                  <div className="mobile-nav-qc-item-left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                    <span className="mobile-nav-qc-name">New Team Module</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="mobile-nav-qc-item mobile-nav-qc-item-config"
                  onClick={() => {
                    setQuickCreateOpen(false);
                    navigate('/automation');
                  }}
                >
                  <div className="mobile-nav-qc-item-left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    <span className="mobile-nav-qc-name">Create Module Using Zia</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="mobile-nav-qc-item mobile-nav-qc-item-config"
                  onClick={() => {
                    setQuickCreateOpen(false);
                    navigate('/clients');
                  }}
                >
                  <div className="mobile-nav-qc-item-left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                    <span className="mobile-nav-qc-name">Projects</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="mobile-nav-qc-item mobile-nav-qc-item-config"
                  onClick={() => {
                    setQuickCreateOpen(false);
                    navigate('/clients');
                  }}
                >
                  <div className="mobile-nav-qc-item-left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                    <span className="mobile-nav-qc-name">Document</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="mobile-nav-qc-item mobile-nav-qc-item-config"
                  onClick={() => {
                    setQuickCreateOpen(false);
                    navigate('/clients');
                  }}
                >
                  <div className="mobile-nav-qc-item-left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
                    <span className="mobile-nav-qc-name">Spreadsheet</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="mobile-nav-qc-item mobile-nav-qc-item-config"
                  onClick={() => {
                    setQuickCreateOpen(false);
                    navigate('/clients');
                  }}
                >
                  <div className="mobile-nav-qc-item-left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                    <span className="mobile-nav-qc-name">Presentation</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- MEETINGS BOTTOM SHEET / POPUP ---------------- */}
      {meetOpen && (
        <div className="mobile-nav-sheet-backdrop" onClick={() => setMeetOpen(false)}>
          <div className="mobile-nav-sheet mobile-nav-sheet-sm" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-nav-sheet-handle" />
            <div className="mobile-nav-sheet-header">
              <div className="mobile-nav-sheet-title">Join your Meet</div>
              <button
                type="button"
                className="mobile-nav-sheet-close"
                onClick={() => setMeetOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mobile-nav-sheet-body" style={{ padding: '8px 16px 24px' }}>
              <div className="mobile-nav-meet-list">
                <a
                  href="https://meet.google.com/wpb-epnm-mwy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mobile-nav-meet-item"
                  onClick={() => setMeetOpen(false)}
                >
                  <div className="mobile-nav-meet-icon-box">
                    <img src={MeetIcon} alt="Meet" width="22" height="22" />
                  </div>
                  <div className="mobile-nav-meet-text">
                    <div className="mobile-nav-meet-name">All Members</div>
                    <div className="mobile-nav-meet-sub">General team meeting room</div>
                  </div>
                  <span className="mobile-nav-meet-arrow">→</span>
                </a>

                <a
                  href="https://meet.google.com/wpb-epnm-mwy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mobile-nav-meet-item"
                  onClick={() => setMeetOpen(false)}
                >
                  <div className="mobile-nav-meet-icon-box">
                    <img src={MeetIcon} alt="Meet" width="22" height="22" />
                  </div>
                  <div className="mobile-nav-meet-text">
                    <div className="mobile-nav-meet-name">Web Development</div>
                    <div className="mobile-nav-meet-sub">Dev sprint & sync room</div>
                  </div>
                  <span className="mobile-nav-meet-arrow">→</span>
                </a>

                <a
                  href="https://meet.google.com/rvf-mwig-fdi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mobile-nav-meet-item"
                  onClick={() => setMeetOpen(false)}
                >
                  <div className="mobile-nav-meet-icon-box">
                    <img src={MeetIcon} alt="Meet" width="22" height="22" />
                  </div>
                  <div className="mobile-nav-meet-text">
                    <div className="mobile-nav-meet-name">Digital Marketing</div>
                    <div className="mobile-nav-meet-sub">Campaigns & leads review</div>
                  </div>
                  <span className="mobile-nav-meet-arrow">→</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
