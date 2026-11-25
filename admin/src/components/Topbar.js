// src/components/Topbar.js
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth";
import { usePresence } from "../context/PresenceContext";
import ZorvixeLogo from "../assets/zorvixe_logo.png";
import ZorvixeFavicon from "../assets/zorvixe_favicon.png";
import MeetIcon from "../assets/meeting_icon.png";

import {
  apiStatsNotifications,
  apiResetNotificationCount,
  apiMarkTicketActivityRead,
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

  /* ------------------- QUICK CREATE RECORDS MENU (ZOHO CRM MATCH) ------------------- */
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [qcSearch, setQcSearch] = useState("");
  const qcBtnRef = useRef(null);
  const qcMenuRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!quickCreateOpen) return;
      if (qcBtnRef.current?.contains(e.target) || qcMenuRef.current?.contains(e.target)) return;
      setQuickCreateOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [quickCreateOpen]);

  const notifStorageKey = (uid) => `lastChecked_notif_${uid || "anon"}`;
  const ticketStorageKey = (uid) => `lastChecked_ticket_${uid || "anon"}`;
  const latestNotifAtRef = useRef(null);
  const latestTicketAtRef = useRef(null);

  const fetchNotificationCount = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiStatsNotifications();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];
      if (feed[0]?.at) latestNotifAtRef.current = feed[0].at;

      if (typeof data?.unreadCount === "number") {
        setNotificationCount(data.unreadCount);
      } else {
        const uid = user?.id || user?._id || user?.email || "anon";
        const saved = localStorage.getItem(notifStorageKey(uid));
        const newActivities = saved
          ? feed.filter((a) => new Date(a.at) > new Date(saved))
          : feed;
        setNotificationCount(newActivities.length);
      }
    } catch {
      setNotificationCount(0);
    }
  }, [user]);

  const handleNotificationClick = async () => {
    const now = new Date().toISOString();
    const effectiveReadAt =
      latestNotifAtRef.current && new Date(latestNotifAtRef.current) > new Date(now)
        ? latestNotifAtRef.current
        : now;
    const uid = user?.id || user?._id || user?.email || "anon";
    setNotificationCount(0);
    setLastCheckedNotif(effectiveReadAt);
    localStorage.setItem(notifStorageKey(uid), effectiveReadAt);
    window.dispatchEvent(new CustomEvent("zorvixe:badge-sync", { detail: { type: "notifications", unreadCount: 0 } }));

    if (window.innerWidth <= 768) {
      navigate("/notifications");
    } else {
      setShowNotifications((v) => !v);
    }

    try {
      await apiResetNotificationCount({ markAll: true, latestAt: effectiveReadAt });
    } catch { }
  };

  /* ------------------- TICKETS ------------------- */
  const [ticketCount, setTicketCount] = useState(0);
  const [showUserTickets, setShowUserTickets] = useState(false);
  const [lastCheckedTickets, setLastCheckedTickets] = useState(null);

  const fetchTicketCount = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiStatsTickets();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];
      if (feed[0]?.at) latestTicketAtRef.current = feed[0].at;

      if (typeof data?.unreadCount === "number") {
        setTicketCount(data.unreadCount);
      } else {
        const uid = user?.id || user?._id || user?.email || "anon";
        const saved = localStorage.getItem(ticketStorageKey(uid));
        const newActivities = saved
          ? feed.filter((a) => new Date(a.at) > new Date(saved))
          : feed;
        setTicketCount(newActivities.length);
      }
    } catch {
      setTicketCount(0);
    }
  }, [user]);

  const handleTicketClick = async () => {
    const now = new Date().toISOString();
    const effectiveReadAt =
      latestTicketAtRef.current && new Date(latestTicketAtRef.current) > new Date(now)
        ? latestTicketAtRef.current
        : now;
    const uid = user?.id || user?._id || user?.email || "anon";
    setTicketCount(0);
    setLastCheckedTickets(effectiveReadAt);
    localStorage.setItem(ticketStorageKey(uid), effectiveReadAt);
    window.dispatchEvent(new CustomEvent("zorvixe:badge-sync", { detail: { type: "tickets", unreadCount: 0 } }));

    if (window.innerWidth <= 768) {
      navigate("/user-tickets");
    } else {
      setShowUserTickets((v) => !v);
    }

    try {
      await apiMarkTicketActivityRead({ markAll: true, latestAt: effectiveReadAt });
    } catch { }
  };

  /* ------------------- INIT & LIVE SYNC ------------------- */
  useEffect(() => {
    if (!user) return;
    const uid = user?.id || user?._id || user?.email || "anon";
    const savedNotif = localStorage.getItem(notifStorageKey(uid));
    if (savedNotif) setLastCheckedNotif(savedNotif);

    const savedTicket = localStorage.getItem(ticketStorageKey(uid));
    if (savedTicket) setLastCheckedTickets(savedTicket);

    fetchNotificationCount();
    fetchTicketCount();

    const interval = setInterval(() => {
      fetchNotificationCount();
      fetchTicketCount();
    }, 30000);

    const onBadgeSync = (e) => {
      const detail = e?.detail || {};
      if (detail.type === "notifications" && typeof detail.unreadCount === "number") {
        setNotificationCount(detail.unreadCount);
      }
      if (detail.type === "tickets" && typeof detail.unreadCount === "number") {
        setTicketCount(detail.unreadCount);
      }
    };
    window.addEventListener("zorvixe:badge-sync", onBadgeSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener("zorvixe:badge-sync", onBadgeSync);
    };
  }, [user, fetchNotificationCount, fetchTicketCount]);

  /* ------------------- PROFILE DROPDOWN ------------------- */
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  /* --- Zoho Presence Status & Profile Card Settings (Synced System-Wide) --- */
  const {
    presenceStatus,
    dndDuration,
    chatPrefs,
    updatePresence,
    updateDndDuration,
    updateChatPrefs,
    toPresenceClass,
  } = usePresence();
  const [presenceDropdownOpen, setPresenceDropdownOpen] = useState(false);

  const soundNotif = chatPrefs.soundNotif;
  const oneOneChats = chatPrefs.oneOneChats;
  const mentionNotif = chatPrefs.mentionNotif;
  const pauseChat = chatPrefs.pauseChat;

  const handleSetPresence = (status) => {
    updatePresence(status, dndDuration);
    setPresenceDropdownOpen(false);
  };
  const toggleSoundNotif = () => updateChatPrefs({ soundNotif: !soundNotif });
  const toggleOneOneChats = () => updateChatPrefs({ oneOneChats: !oneOneChats });
  const toggleMentionNotif = () => updateChatPrefs({ mentionNotif: !mentionNotif });
  const togglePauseChat = () => updateChatPrefs({ pauseChat: !pauseChat });

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

            {/* ZOHO QUICK CREATE '+' BUTTON & MENU (Matches Photo 4 - Desktop only) */}
            <div className="tb-quick-create-wrap tb-desktop-only">
              <button
                ref={qcBtnRef}
                type="button"
                className="tb-quick-create-btn"
                onClick={() => setQuickCreateOpen(v => !v)}
                title="Create Records (+)"
                aria-label="Create Records"
              >
                +
              </button>

              {quickCreateOpen && (
                <div ref={qcMenuRef} className="tb-quick-create-dropdown" onClick={(e) => e.stopPropagation()}>
                  <div className="tb-qc-header">
                    <div className="tb-qc-search">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b778c" strokeWidth="2.2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Search"
                        value={qcSearch}
                        onChange={(e) => setQcSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="tb-qc-columns">
                    {/* Column 1: Create Records */}
                    <div className="tb-qc-col">
                      <div className="tb-qc-col-title">Create Records</div>
                      <div className="tb-qc-list">
                        {[
                          { label: '+ Lead', path: '/leads' },
                          { label: '+ Contact', path: '/contacts' },
                          { label: '+ Account', path: '/accounts' },
                          { label: '+ Deal', path: '/deals' },
                          { label: '+ Campaign', path: '/automation' },
                          { label: '+ Task', path: '/crm#activities' },
                          { label: '+ Meeting', path: '/crm#activities' },
                          { label: '+ Call', path: '/crm#activities' },
                          { label: '+ Product', path: '/quotes' },
                          { label: '+ Price Book', path: '/quotes' }
                        ]
                          .filter(it => !qcSearch || it.label.toLowerCase().includes(qcSearch.toLowerCase()))
                          .map((it, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="tb-qc-item"
                              onClick={() => {
                                setQuickCreateOpen(false);
                                navigate(it.path);
                              }}
                            >
                              <span className="qc-plus">+</span> {it.label.replace('+', '').trim()}
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* Column 2: New Configurations & Collaboration (Matches Photo 4) */}
                    <div className="tb-qc-col">
                      <div className="tb-qc-col-title">New Configurations</div>
                      <div className="tb-qc-list">
                        <button type="button" className="tb-qc-item" onClick={() => { setQuickCreateOpen(false); navigate('/automation'); }}>
                          <svg className="qc-col-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                          <span>New Org Module</span>
                        </button>
                        <button type="button" className="tb-qc-item" onClick={() => { setQuickCreateOpen(false); navigate('/automation'); }}>
                          <svg className="qc-col-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                          <span>New Team Module</span>
                        </button>
                        <button type="button" className="tb-qc-item" onClick={() => { setQuickCreateOpen(false); navigate('/automation'); }}>
                          <svg className="qc-col-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                          <span>Create Module Using Zia</span>
                        </button>
                      </div>

                      <div className="tb-qc-col-title tb-qc-subgroup">New Collaboration Items</div>
                      <div className="tb-qc-list">
                        <button type="button" className="tb-qc-item tb-qc-item-boxed" onClick={() => { setQuickCreateOpen(false); navigate('/clients'); }}>
                          <svg className="qc-col-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                          <span>Projects</span>
                        </button>
                        <button type="button" className="tb-qc-item tb-qc-item-boxed" onClick={() => { setQuickCreateOpen(false); navigate('/clients'); }}>
                          <svg className="qc-col-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                          <span>Document</span>
                        </button>
                        <button type="button" className="tb-qc-item tb-qc-item-boxed" onClick={() => { setQuickCreateOpen(false); navigate('/clients'); }}>
                          <svg className="qc-col-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
                          <span>Spreadsheet</span>
                        </button>
                        <button type="button" className="tb-qc-item tb-qc-item-boxed" onClick={() => { setQuickCreateOpen(false); navigate('/clients'); }}>
                          <svg className="qc-col-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                          <span>Presentation</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CALENDAR & ACTIVITIES BUTTON (Desktop only) */}
            <button
              className={`icon-btn tb-desktop-only ${location.pathname === "/calendar" || location.hash === "#activities" ? "is-active" : ""}`}
              aria-label="Calendar & Activities"
              title="Calendar & Activities"
              onClick={() => navigate("/calendar")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>

            {/* MEETINGS DROPDOWN (Desktop only) */}
            <div className="profile-anchor tb-desktop-only">
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

            {/* HELP ICON (Desktop only) */}
            <button className="icon-btn tb-desktop-only" aria-label="Help">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" />
                <line x1="12" y1="17" x2="12" y2="17" />
              </svg>
            </button>

            {/* Notifications (Desktop only) */}
            <button
              className={`icon-btn notif-btn tb-desktop-only ${location.pathname === "/notifications" ? "is-active" : ""}`}
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

            {/* Tickets (Desktop only) */}
            <button
              className={`icon-btn ticket-btn tb-desktop-only ${location.pathname === "/user-tickets" ? "is-active" : ""}`}
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

            {/* Avatar + profile dropdown (Images 1 & 2) */}
            <div className="profile-anchor">
              <button
                ref={btnRef}
                className={`avatar-btn ${menuOpen ? "is-open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="avatar">
                  {initials}
                  <span className={`tb-presence-dot ${toPresenceClass(presenceStatus)}`}></span>
                </span>
              </button>

              {menuOpen && (
                <div ref={menuRef} className="profile-menu zoho-profile-card" role="menu">
                  {/* Card Top Title Bar (Images 1 & 2) */}
                  <div className="pm-card-topbar">
                    <div className="pm-card-top-user">
                      <span className="pm-card-top-icon">👤</span>
                      <span className="pm-card-top-name">{user?.name || user?.email || "User"}</span>
                      <span className="pm-card-top-sep">•</span>
                      <span className="pm-card-top-status">{presenceStatus}</span>
                    </div>
                    <div className="pm-card-top-actions">
                      <button
                        type="button"
                        className="pm-card-icon-btn"
                        title="My Account"
                        onClick={handleAccount}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                      </button>
                      <button
                        type="button"
                        className="pm-card-close-btn"
                        title="Close"
                        onClick={() => setMenuOpen(false)}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Big Avatar + Name + Presence Dropdown (Image 1) */}
                  <div className="pm-card-hero">
                    <div className="pm-big-avatar-wrapper">
                      <span className="pm-big-avatar">{initials}</span>
                      <span className={`pm-big-presence-dot ${toPresenceClass(presenceStatus)}`}></span>
                    </div>
                    <h4 className="pm-hero-name">{user?.name || user?.email || "User"}</h4>

                    {/* Status Dropdown Selector (Image 1) */}
                    <div className="pm-presence-picker-anchor">
                      <button
                        type="button"
                        className="pm-presence-picker-btn"
                        onClick={() => setPresenceDropdownOpen(v => !v)}
                      >
                        <span className={`status-dot ${toPresenceClass(presenceStatus)}`}></span>
                        <span className="pm-presence-label">{presenceStatus}</span>
                        <span className="pm-presence-arrow">▾</span>
                      </button>

                      {presenceDropdownOpen && (
                        <div className="pm-presence-dropdown">
                          <div className="pm-presence-group-title">Default status</div>

                          <button
                            type="button"
                            className={`pm-presence-opt ${presenceStatus === 'Available' ? 'selected' : ''}`}
                            onClick={() => handleSetPresence('Available')}
                          >
                            <div className="pm-opt-left">
                              <span className="status-dot available"></span>
                              <span>Available</span>
                            </div>
                            {presenceStatus === 'Available' && <span className="pm-check">✓</span>}
                          </button>

                          <button
                            type="button"
                            className={`pm-presence-opt ${presenceStatus === 'Away' ? 'selected' : ''}`}
                            onClick={() => handleSetPresence('Away')}
                          >
                            <div className="pm-opt-left">
                              <span className="status-dot away"></span>
                              <span>Away</span>
                            </div>
                            {presenceStatus === 'Away' && <span className="pm-check">✓</span>}
                          </button>

                          <button
                            type="button"
                            className={`pm-presence-opt ${presenceStatus === 'Busy' ? 'selected' : ''}`}
                            onClick={() => handleSetPresence('Busy')}
                          >
                            <div className="pm-opt-left">
                              <span className="status-dot busy"></span>
                              <span>Busy</span>
                            </div>
                            {presenceStatus === 'Busy' && <span className="pm-check">✓</span>}
                          </button>

                          <button
                            type="button"
                            className={`pm-presence-opt ${presenceStatus === 'Invisible' ? 'selected' : ''}`}
                            onClick={() => handleSetPresence('Invisible')}
                          >
                            <div className="pm-opt-left">
                              <span className="status-dot invisible"></span>
                              <span>Invisible</span>
                            </div>
                            {presenceStatus === 'Invisible' && <span className="pm-check">✓</span>}
                          </button>

                          <div className="pm-presence-dnd-row">
                            <button
                              type="button"
                              className={`pm-presence-opt ${presenceStatus === 'Do not disturb' ? 'selected' : ''}`}
                              onClick={() => handleSetPresence('Do not disturb')}
                            >
                              <div className="pm-opt-left">
                                <span className="status-dot dnd">🔕</span>
                                <span>Do not disturb</span>
                              </div>
                              {presenceStatus === 'Do not disturb' && <span className="pm-check">✓</span>}
                            </button>
                            <select
                              className="pm-dnd-select"
                              value={dndDuration}
                              onChange={(e) => updateDndDuration(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option>15 Mins</option>
                              <option>30 Mins</option>
                              <option>1 Hour</option>
                              <option>2 Hours</option>
                              <option>Until tomorrow</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Feed History (Image 2) */}
                  <div className="pm-card-section">
                    <button type="button" className="pm-card-row-btn" onClick={handleLeave}>
                      <span className="pm-row-icon">🕒</span>
                      <span>Feed History</span>
                    </button>
                  </div>

                  {/* Settings & Toggles (Images 1 & 2) */}
                  <div className="pm-card-section">
                    <div className="pm-section-heading">Settings</div>
                    <div className="pm-section-subheading">General</div>

                    <div className="pm-toggle-row">
                      <span>Pause chat here</span>
                      <label className="pm-switch">
                        <input type="checkbox" checked={pauseChat} onChange={togglePauseChat} />
                        <span className="pm-slider"></span>
                      </label>
                    </div>

                    <div className="pm-toggle-row">
                      <span>Sound Notification</span>
                      <label className="pm-switch">
                        <input type="checkbox" checked={soundNotif} onChange={toggleSoundNotif} />
                        <span className="pm-slider"></span>
                      </label>
                    </div>

                    <div className="pm-toggle-row">
                      <span>One - One Chats</span>
                      <label className="pm-switch">
                        <input type="checkbox" checked={oneOneChats} onChange={toggleOneOneChats} />
                        <span className="pm-slider"></span>
                      </label>
                    </div>

                    <div className="pm-toggle-row">
                      <span>Mention</span>
                      <label className="pm-switch">
                        <input type="checkbox" checked={mentionNotif} onChange={toggleMentionNotif} />
                        <span className="pm-slider"></span>
                      </label>
                    </div>
                  </div>

                  {/* Quick Action Links */}
                  <div className="pm-card-section pm-card-actions">
                    <button className="pm-action-link" onClick={handleAccount}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      <span>My Account</span>
                    </button>
                    <button className="pm-action-link" onClick={handleLeave}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      <span>Apply Leave</span>
                    </button>
                    <button className="pm-action-link" onClick={handleLogin}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      <span>Login History</span>
                    </button>
                    <button className="pm-action-link" onClick={handleDiscussions}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                      <span>Discussions / Chat</span>
                    </button>
                    <button className="pm-action-link logout" onClick={logout}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Ticket Updates Ticker Pill (Image 10) */}
          {ticketCount > 0 && (
            <div className="tb-ticket-ticker-pill tb-desktop-only" onClick={handleTicketClick} title="View ticket activity">
              <span className="tb-ticker-icon">↗</span>
              <span>Read new tickets updates</span>
            </div>
          )}
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