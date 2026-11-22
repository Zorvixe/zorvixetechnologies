// src/components/Topbar.js
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth";
import ZorvixeLogo from "../assets/zorvixe_logo.png";
import ZorvixeFavicon from "../assets/zorvixe_favicon.png";
import MeetIcon from "../assets/meeting_icon.png";

import {
  apiStatsNotifications,
  apiResetNotificationCount,
  apiStatsTickets,
  apiGlobalSearch,
} from "../api";

import Notification from "../pages/Notification";
import UserTicket from "../pages/UserTicket";

import "./Topbar.css";

export default function Topbar({
  title,
  children,
  variant = "page",
  onToggleSidebar = () => { },
  sidebarCollapsed = false,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
      if (window.innerWidth <= 768) {
        navigate("/notifications");
      } else {
        setShowNotifications((v) => !v);
      }
      await apiResetNotificationCount();
    } catch { }
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
    if (window.innerWidth <= 768) {
      navigate("/user-tickets");
    } else {
      setShowUserTickets((v) => !v);
    }
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

  const handleLeave = () => { setMenuOpen(false); navigate("/leaves"); };
  const handleLogin = () => { setMenuOpen(false); navigate("/login-history"); };
  const handleDiscussions = () => { setMenuOpen(false); navigate("/discussions"); };
  const handleAccount = () => { setMenuOpen(false); navigate("/account"); };

  /* ------------------- GLOBAL SEARCH ------------------- */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchDebounceRef = useRef(null);

  // Debounced backend global search
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      setSelectedIndex(-1);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await apiGlobalSearch(trimmed);
        setSearchResults(Array.isArray(res?.results) ? res.results : []);
        setSelectedIndex(-1);
      } catch (err) {
        console.error("Global search failed:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery]);

  // Click outside listener for search dropdown
  useEffect(() => {
    const onDocClick = (e) => {
      if (!searchContainerRef.current?.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Global hotkey Ctrl+K / Cmd+K to focus search bar
  useEffect(() => {
    const onGlobalKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onGlobalKey);
    return () => document.removeEventListener("keydown", onGlobalKey);
  }, []);

  // Keyboard navigation inside search dropdown
  const handleSearchKeyDown = (e) => {
    if (!searchOpen || searchResults.length === 0) {
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        handleSelectResult(searchResults[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
  };

  const handleSelectResult = (item) => {
    setSearchOpen(false);
    setSearchQuery("");
    if (item?.url) {
      navigate(item.url);
    }
  };

  const getCategoryIcon = (type) => {
    switch (type) {
      case "ticket":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="12" r="3" />
            <path d="M15 8h4M15 12h4M15 16h4" />
          </svg>
        );
      case "project":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          </svg>
        );
      case "client":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        );
      case "contact":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5 12L3 7a2 2 0 012-2h14a2 2 0 012 2l-2 5" />
            <path d="M7 21h10a2 2 0 0 0 2-2v-7" />
          </svg>
        );
      case "user":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="7" r="4" />
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          </svg>
        );
      case "candidate":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        );
      case "leave":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        );
      case "payment":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        );
    }
  };


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
              className="tb-logo tb-logo-full"
            />
            <img
              src={ZorvixeFavicon}
              alt="Zorvixe"
              className="tb-logo tb-logo-icon"
            />

            <span className="tb-divider" aria-hidden="true" />

            <h1 className="tb-title" title={title}>{title}</h1>

            {children && <div className="tb-actions">{children}</div>}
          </div>

          {/* ---------------- CENTER: GLOBAL SEARCH ---------------- */}
          <div className="tb-center" ref={searchContainerRef}>
            <div className={`tb-search-wrapper ${searchOpen && (searchResults.length > 0 || isSearching) ? "has-results" : ""}`}>
              <div className="tb-search-input-box">
                <svg className="tb-search-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>

                <input
                  ref={searchInputRef}
                  type="text"
                  className="tb-search-input"
                  placeholder="Search tickets, projects, clients, contacts, team..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => {
                    if (searchQuery.trim().length > 0) setSearchOpen(true);
                  }}
                  onKeyDown={handleSearchKeyDown}
                />

                {isSearching && (
                  <span className="tb-search-spinner" />
                )}

                {searchQuery && !isSearching && (
                  <button
                    type="button"
                    className="tb-search-clear"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setSearchOpen(false);
                      searchInputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}

                <div className="tb-search-shortcut" title="Press Ctrl+K to search">
                  <kbd>Ctrl</kbd>+<kbd>K</kbd>
                </div>
              </div>

              {/* SEARCH DROPDOWN RESULTS */}
              {searchOpen && searchQuery.trim().length > 0 && (
                <div className="tb-search-dropdown">
                  {isSearching && searchResults.length === 0 ? (
                    <div className="tb-search-loading">
                      <span className="tb-search-spinner" />
                      <span>Searching across workspace...</span>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="tb-search-empty">
                      <p className="tb-empty-title">No results found for "<strong>{searchQuery}</strong>"</p>
                      <p className="tb-empty-sub">Try searching with a ticket ID, project name, client email, or person's name.</p>
                    </div>
                  ) : (
                    <div className="tb-search-results-list">
                      <div className="tb-results-summary">
                        <span>Found {searchResults.length} result{searchResults.length === 1 ? "" : "s"}</span>
                        <span className="tb-results-hint">Use ↑ ↓ to navigate, Enter to select, Esc to close</span>
                      </div>

                      {/* Grouped by category */}
                      {Object.entries(
                        searchResults.reduce((acc, item) => {
                          const cat = item.category || "Other";
                          if (!acc[cat]) acc[cat] = [];
                          acc[cat].push(item);
                          return acc;
                        }, {})
                      ).map(([catName, items]) => (
                        <div key={catName} className="tb-search-category-group">
                          <div className="tb-category-header">
                            <span>{catName}</span>
                            <span className="tb-category-count">{items.length}</span>
                          </div>
                          {items.map((item) => {
                            const globalIndex = searchResults.findIndex((r) => r.id === item.id);
                            const isSelected = globalIndex === selectedIndex;
                            return (
                              <div
                                key={item.id}
                                className={`tb-search-item ${isSelected ? "is-selected" : ""}`}
                                onClick={() => handleSelectResult(item)}
                              >
                                <div className={`tb-item-icon-wrap tb-icon-${item.type}`}>
                                  {getCategoryIcon(item.type)}
                                </div>
                                <div className="tb-item-body">
                                  <div className="tb-item-title-row">
                                    <span className="tb-item-title">{item.title}</span>
                                    {item.badge && (
                                      <span className={`tb-item-badge badge-${item.type}`}>
                                        {item.badge}
                                      </span>
                                    )}
                                  </div>
                                  {item.subtitle && (
                                    <div className="tb-item-sub">{item.subtitle}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
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

            {/* Notifications */}
            <button
              className={`icon-btn notif-btn ${location.pathname === "/notifications" ? "is-active" : ""}`}
              aria-label="Notifications"
              title="Notifications"
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
              className={`icon-btn ticket-btn ${location.pathname === "/user-tickets" ? "is-active" : ""}`}
              aria-label="My Tickets"
              title="Tickets Activity"
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

            {/* Desktop Modal Panels (only on other devices) */}
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
                        onClick={handleAccount}
                      >
                        My account →
                      </button>
                    </div>
                  </div>

                  <div className="pm-actions">
                    <button className="pm-item_apply_leave" onClick={handleLeave}>
                      <span className="pm-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-calendar-check" viewBox="0 0 16 16">
                          <path d="M10.854 7.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 9.793l2.646-2.647a.5.5 0 0 1 .708 0" />
                          <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z" />
                        </svg>
                      </span>
                      <span>Apply Leave</span>
                    </button>
                  </div>
                  <div className="pm-actions">
                    <button className="pm-item_apply_leave" onClick={handleLogin}>
                      <span className="pm-icon">

                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </span>
                      <span>Login History</span>
                    </button>
                  </div>

                  <div className="pm-actions">
                    <button className="pm-item_apply_leave" onClick={handleDiscussions}>
                      <span className="pm-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </span>
                      <span>Discussions / Chat</span>
                    </button>
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