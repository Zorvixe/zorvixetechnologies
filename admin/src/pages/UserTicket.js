// src/pages/UserTicket.js
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { apiStatsTickets } from "../api";
import "./Notifications.css";
import { buildDeepLink } from "../deeplink/resourceRegistry";

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

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(localYMD());

  const modalRef = useRef(null);

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

  useEffect(() => {
    if (isOpen) {
      fetchTickets();
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedDate]);

  const handleClickOutside = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      onClose();
    }
  };

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

      const ticketData = filtered.map((activity, index) => {
        const key = buildTicketKey(activity);
        return {
          id: index + 1,
          key,
          title: getTicketTitle(activity?.type),
          message: activity?.text || activity?.data?.title || "",
          creator: activity?.data?.user_name || activity?.creator || activity?.data?.creator || "",
          related_data: activity?.data,
          created_at: activity?.at,
          is_new: !seen.has(key),
          activityType: activity?.type || null,
        };
      });

      setTickets(ticketData);
      if (onNewActivities) onNewActivities(ticketData.filter((t) => t.is_new).length);
    } catch (err) {
      console.error("Error fetching tickets:", err);
      showToast("Failed to load tickets", "error");
    } finally {
      setLoading(false);
    }
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
    setTickets((prev) => {
      const next = prev.map((t) => (t.key === ticket.key ? { ...t, is_new: false } : t));
      if (onNewActivities) onNewActivities(next.filter((n) => n.is_new).length);
      return next;
    });

    const data = ticket.related_data || {};
    // Derive ticketId and commentId explicitly:
    const ticketId =
      // if it's a comment activity, prefer data.ticket_id; otherwise prefer data.id
      ticket.activityType === "ticket_comment"
        ? (data.ticket_id ?? data.id)
        : (data.id ?? data.ticket_id);
    const commentId = ticket.activityType === "ticket_comment" ? data.id : null;

    let url = "/tickets";
    if (ticketId) {
      if (ticket.activityType === "ticket_comment" && commentId) {
        // Build deep link to ticket with target comment
        try {
          url = buildDeepLink({
            resourceType: "ticket",
            resourceId: ticketId,
            targetType: "comment",
            targetId: commentId,
          });
        } catch (e) {
          // fallback
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

    // push/dispatch so app routing reacts
    window.history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
    onClose();
  };

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
              // compute ticketId for display:
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
                          <div className="notification-assigned">👤 {ticket.creator}</div>
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
