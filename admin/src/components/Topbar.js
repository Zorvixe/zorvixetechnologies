// src/components/Topbar.js
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import ZorvixeLogo from "../assets/zorvixe_logo.png";
import ZorvixeFavicon from "../assets/zorvixe_favicon.png";
import {
  apiStatsNotifications,
  apiResetNotificationCount,
  apiStatsTickets,
} from "../api";
import Notification from "../pages/Notification";
import UserTicket from "../pages/UserTicket"; // add this

import "./Topbar.css";

export default function Topbar({
  title,
  children,
  variant = "page",
  onToggleSidebar = () => {},
  sidebarCollapsed = false,
}) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  // notifications
  const [notificationCount, setNotificationCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastCheckedNotif, setLastCheckedNotif] = useState(null);

  // tickets
  const [ticketCount, setTicketCount] = useState(0);
  const [showUserTickets, setShowUserTickets] = useState(false);
  const [lastCheckedTickets, setLastCheckedTickets] = useState(null);

  // helpers to build localStorage keys
  const notifStorageKey = (uid) => `lastChecked_notif_${uid || "anon"}`;
  const ticketStorageKey = (uid) => `lastChecked_ticket_${uid || "anon"}`;

  /* ---------------------- Notifications ---------------------- */
  const fetchNotificationCount = async () => {
    if (!user) return;
    try {
      const data = await apiStatsNotifications();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];
      const newActivities = lastCheckedNotif
        ? feed.filter((a) => new Date(a.at) > new Date(lastCheckedNotif))
        : feed;
      setNotificationCount(newActivities.length);
    } catch (error) {
      console.error("Error fetching notification count:", error);
      setNotificationCount(0);
    }
  };

  const handleNotificationClick = async () => {
    try {
      setNotificationCount(0);
      const now = new Date().toISOString();
      setLastCheckedNotif(now);
      localStorage.setItem(notifStorageKey(user?.id || user?.email || "anon"), now);
      setShowNotifications(true);
      // call server-side reset if available (keeps parity with existing flow)
      await apiResetNotificationCount();
    } catch (error) {
      console.error("Error resetting notification count:", error);
    }
  };

  /* ---------------------- Tickets ---------------------- */
  const fetchTicketCount = async () => {
    if (!user) return;
    try {
      const data = await apiStatsTickets();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];
      const newActivities = lastCheckedTickets
        ? feed.filter((a) => new Date(a.at) > new Date(lastCheckedTickets))
        : feed;
      setTicketCount(newActivities.length);
    } catch (error) {
      console.error("Error fetching ticket count:", error);
      setTicketCount(0);
    }
  };

  const handleTicketClick = () => {
    // mark tickets as checked locally and open panel
    const now = new Date().toISOString();
    setLastCheckedTickets(now);
    localStorage.setItem(ticketStorageKey(user?.id || user?.email || "anon"), now);
    // Clear the local badge immediately; UserTicket will also report back onNewActivities
    setTicketCount(0);
    setShowUserTickets(true);
  };

  /* ---------------------- Init & Polling ---------------------- */
  useEffect(() => {
    if (!user) return;
    // load saved timestamps
    const savedNotif = localStorage.getItem(notifStorageKey(user?.id || user?.email || "anon"));
    if (savedNotif) setLastCheckedNotif(savedNotif);

    const savedTicket = localStorage.getItem(ticketStorageKey(user?.id || user?.email || "anon"));
    if (savedTicket) setLastCheckedTickets(savedTicket);

    // initial fetch
    fetchNotificationCount();
    fetchTicketCount();

    // poll both counts (30s)
    const interval = setInterval(() => {
      fetchNotificationCount();
      fetchTicketCount();
    }, 30_000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // If lastChecked changes (due to clicking), re-run fetch once to refresh counts
  useEffect(() => {
    if (!user) return;
    fetchNotificationCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCheckedNotif]);

  useEffect(() => {
    if (!user) return;
    fetchTicketCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCheckedTickets]);

  /* ---------------------- Avatar menu (outside clicks + Esc) ---------------------- */
  const initials =
    (user?.name || user?.email || "U")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuOpen) return;
      const el = e.target;
      if (btnRef.current?.contains(el) || menuRef.current?.contains(el)) return;
      setMenuOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  /* ---------------------- Render ---------------------- */
  if (variant === "global") {
    return (
      <>
        {/* Fixed header */}
        <header className="topbar topbar--global">
          <div className="tb-left">
            <button
              className="icon-btn"
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              onClick={onToggleSidebar}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <img
              src={ZorvixeLogo}
              alt="Zorvixe"
              className="tb-logo"
              onError={(e) => { e.currentTarget.src = ZorvixeFavicon; }}
            />

            <span className="tb-divider" aria-hidden="true" />

            <h1 className="tb-title" title={title}>{title}</h1>

            {children && <div className="tb-actions">{children}</div>}
          </div>

          <div className="tb-right">
            <button className="icon-btn" aria-label="Help">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" />
                <line x1="12" y1="17" x2="12" y2="17" />
              </svg>
            </button>

            {/* Notifications */}
            <button
              className="icon-btn notif-btn"
              aria-label="Notifications"
              onClick={handleNotificationClick}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {notificationCount > 0 && (
                <span className="notification-badge">{notificationCount}</span>
              )}
            </button>

            {/* Tickets */}
            <button
              className="icon-btn ticket-btn"
              aria-label="My Tickets"
              onClick={handleTicketClick}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {ticketCount > 0 && (
                <span className="notification-badge">{ticketCount}</span>
              )}
            </button>

            {/* Render panels */}
            {showNotifications && (
              <Notification
                isOpen={showNotifications}
                onClose={() => setShowNotifications(false)}
                lastChecked={lastCheckedNotif}
                onNewActivities={(count) => setNotificationCount(count)}
              />
            )}

            {showUserTickets && (
              <UserTicket
                isOpen={showUserTickets}
                onClose={() => setShowUserTickets(false)}
                lastChecked={lastCheckedTickets}
                onNewActivities={(count) => setTicketCount(count)}
              />
            )}

            {/* Avatar + profile dropdown */}
            <div className="profile-anchor">
              <button
                ref={btnRef}
                className={`avatar-btn ${menuOpen ? "is-open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="avatar">{initials}</span>
              </button>

              {menuOpen && (
                <div ref={menuRef} className="profile-menu" role="menu">
                  <div className="pm-header">
                    <span className="pm-avatar">{initials}</span>
                    <div className="pm-user">
                      <div className="pm-name">{user?.name || "User"}</div>
                      <div className="pm-email">{user?.email}</div>
                      <button
                        className="pm-link"
                        onClick={() => { /* navigate to account page if present */ }}
                      >
                        My account
                      </button>
                    </div>
                  </div>

                  <div className="pm-actions">
                    <button className="pm-item" onClick={logout}>
                      <span className="pm-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      </span>
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
      </>
    );
  }

  // "page" variant (unchanged)
  return (
    <div className="topbar topbar--page">
      <h3 className="page-title" title={title}>{title}</h3>
      <div className="page-controls">{children}</div>
    </div>
  );
}
