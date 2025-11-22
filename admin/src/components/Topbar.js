// src/components/Topbar.js
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth";
import ZorvixeLogo from "../assets/zorvixe_logo.png";
import ZorvixeFavicon from "../assets/zorvixe_favicon.png";
import MeetIcon from "../assets/meeting_icon.png";

import {
  apiStatsNotifications,
  apiResetNotificationCount,
  apiStatsTickets,
} from "../api";

import Notification from "../pages/Notification";
import UserTicket from "../pages/UserTicket";

import "./Topbar.css";

export default function Topbar({
  title,
  children,
  variant = "page",
  onToggleSidebar = () => {},
  sidebarCollapsed = false,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  /* ------------------- MEETINGS DROPDOWN ------------------- */
  const [meetOpen, setMeetOpen] = useState(false);
  const meetBtnRef = useRef(null);
  const meetMenuRef = useRef(null);

  /* ---------- NEW FEATURE BADGE FOR MEET ICON ---------- */
  const meetStorageKey = (uid) => `seen_feature_meet_${uid || "anon"}`;
  const [isMeetNew, setIsMeetNew] = useState(false);

  useEffect(() => {
    if (!user) return;
    const seen = localStorage.getItem(meetStorageKey(user?.id || user?.email));
    if (!seen) setIsMeetNew(true); // show NEW badge if user hasn't opened it yet
  }, [user]);

  const handleMeetClick = () => {
    setMeetOpen((v) => !v);

    // remove NEW badge when user opens meetings first time
    if (isMeetNew && user) {
      localStorage.setItem(
        meetStorageKey(user?.id || user?.email),
        "seen"
      );
      setIsMeetNew(false);
    }
  };

  useEffect(() => {
    const onDocClick = (e) => {
      if (!meetOpen) return;
      if (
        meetBtnRef.current?.contains(e.target) ||
        meetMenuRef.current?.contains(e.target)
      )
        return;
      setMeetOpen(false);
    };

    const onEsc = (e) => e.key === "Escape" && setMeetOpen(false);

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [meetOpen]);

  /* ------------------- NOTIFICATIONS ------------------- */
  const [notificationCount, setNotificationCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastCheckedNotif, setLastCheckedNotif] = useState(null);

  const notifStorageKey = (uid) => `lastChecked_notif_${uid || "anon"}`;

  const fetchNotificationCount = async () => {
    if (!user) return;
    try {
      const data = await apiStatsNotifications();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];
      const newActivities = lastCheckedNotif
        ? feed.filter((a) => new Date(a.at) > new Date(lastCheckedNotif))
        : feed;
      setNotificationCount(newActivities.length);
    } catch (err) {
      setNotificationCount(0);
    }
  };

  const handleNotificationClick = async () => {
    try {
      setNotificationCount(0);
      const now = new Date().toISOString();
      setLastCheckedNotif(now);
      localStorage.setItem(
        notifStorageKey(user?.id || user?.email || "anon"),
        now
      );
      setShowNotifications(true);
      await apiResetNotificationCount();
    } catch {}
  };

  /* ------------------- TICKETS ------------------- */
  const [ticketCount, setTicketCount] = useState(0);
  const [showUserTickets, setShowUserTickets] = useState(false);
  const [lastCheckedTickets, setLastCheckedTickets] = useState(null);

  const ticketStorageKey = (uid) => `lastChecked_ticket_${uid || "anon"}`;

  const fetchTicketCount = async () => {
    if (!user) return;
    try {
      const data = await apiStatsTickets();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];
      const newActivities = lastCheckedTickets
        ? feed.filter((a) => new Date(a.at) > new Date(lastCheckedTickets))
        : feed;
      setTicketCount(newActivities.length);
    } catch {
      setTicketCount(0);
    }
  };

  const handleTicketClick = () => {
    const now = new Date().toISOString();
    setLastCheckedTickets(now);
    localStorage.setItem(
      ticketStorageKey(user?.id || user?.email || "anon"),
      now
    );
    setTicketCount(0);
    setShowUserTickets(true);
  };

  /* ------------------- INIT ------------------- */
  useEffect(() => {
    if (!user) return;
    const savedNotif = localStorage.getItem(
      notifStorageKey(user?.id || user?.email || "anon")
    );
    if (savedNotif) setLastCheckedNotif(savedNotif);

    const savedTicket = localStorage.getItem(
      ticketStorageKey(user?.id || user?.email || "anon")
    );
    if (savedTicket) setLastCheckedTickets(savedTicket);

    fetchNotificationCount();
    fetchTicketCount();

    const interval = setInterval(() => {
      fetchNotificationCount();
      fetchTicketCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchNotificationCount();
  }, [lastCheckedNotif]);

  useEffect(() => {
    if (!user) return;
    fetchTicketCount();
  }, [lastCheckedTickets]);

  /* ------------------- PROFILE DROPDOWN ------------------- */
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const initials =
    (user?.name || user?.email || "U")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuOpen) return;
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target))
        return;
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

  const handleLeave = () => navigate("/leaves");

  /* ------------------- GLOBAL TOPBAR ------------------- */
  if (variant === "global") {
    return (
      <>
        <header className="topbar topbar--global">
          <div className="tb-left">
            {/* Sidebar Toggle */}
            <button className="icon-btn" onClick={onToggleSidebar}>
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
              onError={(e) => (e.currentTarget.src = ZorvixeFavicon)}
              className="tb-logo"
            />

            <span className="tb-divider" />

            <h1 className="tb-title" title={title}>
              {title}
            </h1>

            {children && <div className="tb-actions">{children}</div>}
          </div>

          {/* ---------------- RIGHT SIDE ---------------- */}
          <div className="tb-right">

            {/* MEETINGS DROPDOWN */}
            <div className="profile-anchor">
              <button
                ref={meetBtnRef}
                className="icon-btn"
                aria-label="Meetings"
                onClick={handleMeetClick}
                style={{ position: "relative" }}
              >
                <img src={MeetIcon} width="22" height="22" alt="Meetings" />
                {isMeetNew && (
                  <span className="new-badge">NEW</span>
                )}
              </button>

            {meetOpen && (
  <div
    ref={meetMenuRef}
    className="profile-menu meetings-anchor"
    style={{ width: "200px" }}
  >
    <h3>Join your Meet</h3>

    <div className="pm-actions">
      <a href="https://meet.google.com/wpb-epnm-mwy" target="_blank" rel="noopener noreferrer">
        <button className="pm-item_meet">All</button>
      </a>
    </div>

    <div className="pm-actions">
      <a href="https://meet.google.com/wpb-epnm-mwy" target="_blank" rel="noopener noreferrer">
        <button className="pm-item_meet">Web Development</button>
      </a>
    </div>

    <div className="pm-actions">
      <a href="https://meet.google.com/rvf-mwig-fdi" target="_blank" rel="noopener noreferrer">
        <button className="pm-item_meet">Digital Marketing</button>
      </a>
    </div>
  </div>
)}

            </div>

            {/* HELP ICON */}
            <button className="icon-btn" aria-label="Help">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" />
                <line x1="12" y1="17" x2="12" y2="17" />
              </svg>
            </button>

            {/* NOTIFICATIONS */}
            <button className="icon-btn notif-btn" onClick={handleNotificationClick}>
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

            {/* TICKETS */}
            <button className="icon-btn ticket-btn" onClick={handleTicketClick}>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {ticketCount > 0 && (
                <span className="notification-badge">{ticketCount}</span>
              )}
            </button>

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

            {/* PROFILE DROPDOWN */}
            <div className="profile-anchor">
              <button
                ref={btnRef}
                className={`avatar-btn ${menuOpen ? "is-open" : ""}`}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="avatar">{initials}</span>
              </button>

              {menuOpen && (
                <div ref={menuRef} className="profile-menu">
                  <div className="pm-header">
                    <span className="pm-avatar">{initials}</span>
                    <div className="pm-user">
                      <div className="pm-name">{user?.name || "User"}</div>
                      <div className="pm-email">{user?.email}</div>
                      <button className="pm-link">My account</button>
                    </div>
                  </div>

                  <div className="pm-actions">
                    <button className="pm-item_apply_leave" onClick={handleLeave}>
                      Apply Leave
                    </button>
                  </div>

                  <div className="pm-actions">
                    <button className="pm-item" onClick={logout}>
                      Sign out
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

  /* ---------------- PAGE VARIANT ---------------- */
  return (
    <div className="topbar topbar--page">
      <h3 className="page-title" title={title}>
        {title}
      </h3>
      <div className="page-controls">{children}</div>
    </div>
  );
}
