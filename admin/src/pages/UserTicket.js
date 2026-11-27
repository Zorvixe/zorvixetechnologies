// src/pages/UserTicket.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { apiStatsTickets, apiMarkTicketActivityRead } from "../api";
import "./Notifications.css";
import { buildDeepLink } from "../deeplink/resourceRegistry";
import { UserIcon, CalendarIcon } from "../components/CrmHrmsIcons";

/** ---- Local date helpers ---- */
const localYMD = (d = new Date()) => d.toLocaleDateString("en-CA");
const parseLocalYMD = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};
const startOfLocalDay = (ymd) => parseLocalYMD(ymd);
const endOfLocalDay = (ymd) => {
  const start = parseLocalYMD(ymd);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
};

/** ---- Per-user seen storage ---- */
const storageKey = (userId) => `zorvixe.tickets.seen.${userId || "anon"}`;
const loadSeenSet = (userId) => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};
const saveSeenSet = (userId, set) => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(Array.from(set)));
  } catch { }
};

/** Build stable key per ticket activity */
const buildTicketKey = (activity) => {
  const at = activity?.at || "";
  const id = activity?.data?.id ?? activity?.data?.ticket_id ?? "";
  const text = activity?.text || activity?.data?.title || "";
  return encodeURIComponent(`${at}|${id}|${text}`);
};

/** Map activity types to human readable titles */
const getTicketTitle = (type) => {
  switch (type) {
    case "ticket":
      return "Ticket Update";
    case "ticket_comment":
      return "Ticket Comment";
    default:
      return "Ticket Activity";
  }
};

export default function UserTicket({ isOpen, onClose, lastChecked, onNewActivities }) {
  const { user } = useAuth();
  const userId = user?.id || user?._id || user?.email || "anon";
  const navigate = useNavigate();

  const isModalMode = isOpen !== undefined;

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'unread'
  const [searchQuery, setSearchQuery] = useState("");

  const modalRef = useRef(null);
  const mobileDateInputRef = useRef(null);

  const handleOpenDatePicker = (e) => {
    if (e.target.closest('.li-chip-clear')) return;
    if (mobileDateInputRef.current) {
      try {
        if (typeof mobileDateInputRef.current.showPicker === 'function') {
          mobileDateInputRef.current.showPicker();
        } else {
          mobileDateInputRef.current.focus();
        }
      } catch (err) {
        try {
          mobileDateInputRef.current.focus();
        } catch (_) { }
      }
    }
  };

  // Toast
  const toastTimer = useRef(null);
  const [toast, setToast] = useState({ open: false, type: "success", message: "" });
  const showToast = (message, type = "success") => {
    setToast({ open: true, type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000);
  };
  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast((t) => ({ ...t, open: false }));
  };

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // If accessed directly via URL on desktop (> 768px), redirect to /stats
  useEffect(() => {
    if (!isModalMode && window.innerWidth > 768) {
      navigate('/stats', { replace: true });
    }
  }, [isModalMode, navigate]);

  /** Sync across tabs: update 'is_new' flags when localStorage changes */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === storageKey(userId)) {
        setTickets((prev) => {
          const seen = loadSeenSet(userId);
          const next = prev.map((t) => ({ ...t, is_new: !seen.has(t.key) }));
          if (onNewActivities) onNewActivities(next.filter((n) => n.is_new).length);
          return next;
        });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId, onNewActivities]);

  // Click outside handling for desktop modal mode
  useEffect(() => {
    if (isModalMode && isOpen) {
      fetchTickets();
      const handleClickOutside = (e) => {
        if (modalRef.current && !modalRef.current.contains(e.target)) {
          onClose();
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    } else if (!isModalMode) {
      fetchTickets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedDate]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await apiStatsTickets();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];

      let filtered = feed;
      if (selectedDate) {
        const start = startOfLocalDay(selectedDate);
        const end = endOfLocalDay(selectedDate);
        filtered = feed.filter((a) => {
          const t = a?.at ? new Date(a.at) : null;
          return t && t >= start && t < end;
        });
      }

      const seen = loadSeenSet(userId);
      const lastCheckedMs = lastChecked ? new Date(lastChecked).getTime() : 0;

      const ticketData = filtered.map((activity, index) => {
        const key = activity?.key || buildTicketKey(activity);
        const serverIsNew = typeof activity?.is_new === "boolean" ? activity.is_new : true;
        const actMs = activity?.at ? new Date(activity.at).getTime() : 0;
        const afterLastCheck = !lastCheckedMs || actMs > lastCheckedMs;
        return {
          id: index + 1,
          key,
          title: getTicketTitle(activity?.type),
          message: activity?.text || activity?.data?.title || "",
          creator: activity?.data?.user_name || activity?.creator || activity?.data?.creator || "",
          related_data: activity?.data,
          created_at: activity?.at,
          is_new: serverIsNew && !seen.has(key) && afterLastCheck,
          activityType: activity?.type || null,
        };
      });

      setTickets(ticketData);
      const unreadCnt = ticketData.filter((t) => t.is_new).length;
      if (onNewActivities) onNewActivities(unreadCnt);
    } catch (err) {
      console.error("Error fetching tickets:", err);
      showToast("Failed to load tickets", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    const seen = loadSeenSet(userId);
    const keys = [];
    let latestAt = null;
    tickets.forEach((t) => {
      seen.add(t.key);
      keys.push(t.key);
      if (t.created_at && (!latestAt || new Date(t.created_at) > new Date(latestAt))) {
        latestAt = t.created_at;
      }
    });
    saveSeenSet(userId, seen);
    setTickets((prev) => prev.map((t) => ({ ...t, is_new: false })));
    if (onNewActivities) onNewActivities(0);
    window.dispatchEvent(new CustomEvent("zorvixe:badge-sync", { detail: { type: "tickets", unreadCount: 0 } }));
    try {
      await apiMarkTicketActivityRead({ markAll: true, latestAt, keys });
    } catch { }
    showToast("All tickets marked as read", "success");
  };

  const formatTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleTicketClick = (ticket) => {
    const seen = loadSeenSet(userId);
    if (!seen.has(ticket.key)) {
      seen.add(ticket.key);
      saveSeenSet(userId, seen);
    }
    apiMarkTicketActivityRead({ key: ticket.key }).catch(() => { });
    setTickets((prev) => {
      const next = prev.map((t) => (t.key === ticket.key ? { ...t, is_new: false } : t));
      const unreadCnt = next.filter((n) => n.is_new).length;
      if (onNewActivities) onNewActivities(unreadCnt);
      window.dispatchEvent(new CustomEvent("zorvixe:badge-sync", { detail: { type: "tickets", unreadCount: unreadCnt } }));
      return next;
    });

    const data = ticket.related_data || {};
    const ticketId =
      ticket.activityType === "ticket_comment"
        ? (data.ticket_id ?? data.id)
        : (data.id ?? data.ticket_id);
    const commentId = ticket.activityType === "ticket_comment" ? data.id : null;

    let url = "/tickets";
    if (ticketId) {
      if (ticket.activityType === "ticket_comment" && commentId) {
        try {
          url = buildDeepLink({
            resourceType: "ticket",
            resourceId: ticketId,
            targetType: "comment",
            targetId: commentId,
          });
        } catch (e) {
          url = `/tickets/${ticketId}?target=comment-${commentId}`;
        }
      } else {
        try {
          url = buildDeepLink({ resourceType: "ticket", resourceId: ticketId });
        } catch (e) {
          url = `/tickets/${ticketId}`;
        }
      }
    }

    if (isModalMode) {
      window.history.pushState(null, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
      if (onClose) onClose();
    } else {
      navigate(url);
    }
  };

  // LinkedIn mobile format helpers
  const formatLinkedInTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)}w`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getInitials = (name) => {
    if (!name) return "T";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getAvatarColor = (name = "") => {
    const colors = ["#0a66c2", "#057642", "#7c3aed", "#c2410c", "#0284c7", "#4f46e5", "#0d9488", "#b91c1c"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  /* -------------------------------------------------------------
     MODE 1: DESKTOP MODAL (Previous exact design for other devices)
     ------------------------------------------------------------- */
  if (isModalMode) {
    if (!isOpen) return null;

    return (
      <div className="notification-overlay">
        <div ref={modalRef} className="notification-modal">
          <div className="notification-header">
            <h3>ZOR - Tickets</h3>
            <div className="date-filter-input">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={localYMD()}
              />
              {selectedDate && (
                <button
                  className="clear-date-btn"
                  onClick={() => setSelectedDate("")}
                  title="Clear filter"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="notification-list">
            {loading ? (
              <div className="loader_container">
                <p className="loader_spinner"></p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="notification-empty">
                <p>
                  {selectedDate
                    ? `No ticket activity found for ${new Date(selectedDate).toLocaleDateString()}`
                    : "No recent ticket activity found"}
                </p>
              </div>
            ) : (
              tickets.map((ticket) => {
                const data = ticket.related_data || {};
                const ticketId =
                  ticket.activityType === "ticket_comment"
                    ? (data.ticket_id ?? data.id)
                    : (data.id ?? data.ticket_id);

                return (
                  <div
                    key={ticket.key}
                    className={`notification-item ${ticket.is_new ? "notification-unseen" : ""}`}
                    onClick={() => handleTicketClick(ticket)}
                  >
                    <div className="notification-content">
                      <div className="notification-details">
                        <div className="notification-header-row">
                          <div className="notification-title">
                            {ticketId ? (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontWeight: "bold",
                                  backgroundColor: "#1e90ff",
                                  color: "#fff",
                                  borderRadius: "8px",
                                  paddingLeft: "5px",
                                  paddingRight: "5px",
                                  marginRight: 8,
                                }}
                              >
                                #{ticketId}
                              </span>
                            ) : null}
                            {ticket.title}
                            {ticket.is_new && <span className="notif-dot" />}
                          </div>
                          {ticket.creator && (
                            <div className="notification-assigned"><UserIcon size={13} /> {ticket.creator}</div>
                          )}
                        </div>

                        <div className="notification-message">{ticket.message}</div>

                        <div className="notification-footer">
                          <div className="notification-time">{formatTime(ticket.created_at)}</div>
                          <div className="notification-date">
                            {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="notification-footer-info">
            <div className="notification-count">
              {tickets.length} ticket activ{tickets.length === 1 ? "y" : "ies"}
              {selectedDate && ` for ${new Date(selectedDate).toLocaleDateString()}`}
            </div>
          </div>
        </div>

        {toast.open && (
          <div className={`toast toast-${toast.type}`}>
            <span>{toast.message}</span>
            <button onClick={hideToast}>×</button>
          </div>
        )}
      </div>
    );
  }

  /* -------------------------------------------------------------
     MODE 2: MOBILE LINKEDIN-STYLE PAGE (exclusively on mobile devices)
     ------------------------------------------------------------- */
  const unreadCount = tickets.filter((t) => t.is_new).length;
  const displayedTickets = tickets.filter((t) => {
    if (activeFilter === "unread" && !t.is_new) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = (t.title || "").toLowerCase().includes(q);
      const msgMatch = (t.message || "").toLowerCase().includes(q);
      const creatorMatch = (t.creator || "").toLowerCase().includes(q);
      const idMatch = String(
        t.activityType === "ticket_comment"
          ? (t.related_data?.ticket_id ?? t.related_data?.id ?? "")
          : (t.related_data?.id ?? t.related_data?.ticket_id ?? "")
      ).toLowerCase().includes(q);
      return titleMatch || msgMatch || creatorMatch || idMatch;
    }
    return true;
  });

  return (
    <div className="li-page-container">
      <div className="li-page-main">
        <div className="li-page-card">
          {/* LinkedIn Header */}
          <div className="li-header">
            <div className="li-header-top">
              <div className="li-title-group">
                <button
                  type="button"
                  className="li-back-btn"
                  onClick={() => {
                    if (window.history.length > 1) {
                      navigate(-1);
                    } else {
                      navigate('/stats');
                    }
                  }}
                  aria-label="Back"
                  title="Back"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                  </svg>
                </button>
                <div className="disc-search-box">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search tickets"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="disc-clear-btn"
                      onClick={() => setSearchQuery("")}
                    >
                      ×
                    </button>
                  )}
                </div>
                {unreadCount > 0 && (
                  <span className="li-unread-badge">{unreadCount} new</span>
                )}
              </div>


            </div>

            {/* LinkedIn Filter Pills */}
            <div className="li-filter-row">
              <button
                type="button"
                className={`li-chip ${activeFilter === "all" ? "active" : ""}`}
                onClick={() => setActiveFilter("all")}
              >
                All
              </button>

              <button
                type="button"
                className={`li-chip ${activeFilter === "unread" ? "active" : ""}`}
                onClick={() => setActiveFilter("unread")}
              >
                Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
              </button>

              {/* Date filter chip */}
              <div
                role="button"
                tabIndex={0}
                className={`li-chip li-chip-date ${selectedDate ? "active" : ""}`}
                title="Filter by date"
                onClick={handleOpenDatePicker}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpenDatePicker(e);
                  }
                }}
              >
                <CalendarIcon size={13} />
                <span>
                  {selectedDate
                    ? new Date(selectedDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                    : "Filter by date"}
                </span>
                <input
                  ref={mobileDateInputRef}
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  onClick={(e) => {
                    e.stopPropagation();
                    try {
                      if (typeof e.target.showPicker === "function") {
                        e.target.showPicker();
                      }
                    } catch (err) { }
                  }}
                  max={localYMD()}
                  tabIndex={-1}
                  aria-hidden="true"
                />
                {selectedDate && (
                  <span
                    className="li-chip-clear"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedDate("");
                    }}
                    title="Clear date filter"
                  >
                    ×
                  </span>
                )}
              </div>
              <button
                type="button"
                className="li-chip li-mark-all-btn"
                onClick={handleMarkAllAsRead}
                disabled={unreadCount === 0}
                title="Mark all tickets as read"
              >
                Mark all as read
              </button>
            </div>
          </div>

          {/* LinkedIn Ticket List */}
          <div className="li-list">
            {loading ? (
              <div className="loader_container">
                <p className="loader_spinner"></p>
              </div>
            ) : displayedTickets.length === 0 ? (
              <div className="li-empty-state">
                <div className="li-empty-icon-wrap">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3 className="li-empty-title">
                  {searchQuery
                    ? `No tickets matching "${searchQuery}"`
                    : activeFilter === "unread"
                    ? "No unread tickets"
                    : selectedDate
                      ? `No ticket updates for ${new Date(selectedDate).toLocaleDateString()}`
                      : "No ticket updates found"}
                </h3>
                <p className="li-empty-desc">
                  {searchQuery
                    ? "Try searching with different ticket terms or ID."
                    : activeFilter === "unread"
                    ? "You're all caught up on all ticket activity!"
                    : "We'll notify you when tickets are assigned or updated."}
                </p>
              </div>
            ) : (
              displayedTickets.map((ticket) => {
                const data = ticket.related_data || {};
                const ticketId =
                  ticket.activityType === "ticket_comment"
                    ? (data.ticket_id ?? data.id)
                    : (data.id ?? data.ticket_id);
                const actor = ticket.creator || "Team member";
                const initials = getInitials(actor);
                const avatarColor = getAvatarColor(actor);
                const isComment = ticket.activityType === "ticket_comment";

                return (
                  <div
                    key={ticket.key}
                    className={`li-item ${ticket.is_new ? "li-unseen" : ""}`}
                    onClick={() => handleTicketClick(ticket)}
                  >
                    {/* Left Avatar with sub-badge */}
                    <div className="li-avatar-wrapper">
                      <div
                        className="li-avatar-circle"
                        style={{ backgroundColor: avatarColor }}
                      >
                        {initials}
                      </div>
                      <span
                        className={`li-avatar-badge ${isComment ? "badge-comment" : "badge-ticket"}`}
                        title={isComment ? "Ticket Comment" : "Ticket"}
                      >
                        {isComment ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                            <line x1="7" y1="7" x2="7.01" y2="7" />
                          </svg>
                        )}
                      </span>
                    </div>

                    {/* Middle narrative */}
                    <div className="li-content">
                      <p className="li-text-narrative">
                        <strong className="li-actor-name">{actor}</strong>
                        {isComment ? " commented on ticket " : " updated ticket "}
                        {ticketId && <span className="li-ticket-ref">#{ticketId}</span>}
                        {ticket.message && (
                          <span className="li-notif-snippet">{ticket.message}</span>
                        )}
                      </p>
                      <div className="li-meta">
                        <span>{formatLinkedInTime(ticket.created_at)}</span>
                        <span className="li-meta-dot">•</span>
                        <span className="li-category-tag">{ticket.title}</span>
                      </div>
                    </div>

                    {/* Right side indicators */}
                    <div className="li-right">
                      {ticket.is_new && <span className="li-unread-dot" title="Unread" />}
                      <span className="li-chevron-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Info */}
          <div className="li-footer">
            <span className="li-footer-info">
              {displayedTickets.length} ticket update{displayedTickets.length === 1 ? "" : "s"}
              {selectedDate && ` for ${new Date(selectedDate).toLocaleDateString()}`}
            </span>
          </div>
        </div>
      </div>

      {toast.open && (
        <div className={`toast toast-${toast.type}`}>
          <span>{toast.message}</span>
          <button onClick={hideToast}>×</button>
        </div>
      )}
    </div>
  );
}
