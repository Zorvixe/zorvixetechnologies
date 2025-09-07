import React, { useEffect, useState, useRef } from 'react';
import { apiStatsNotifications } from '../api';
import { useAuth } from '../auth';
import './Notifications.css';

/** ---- Local date helpers (avoid UTC shift from toISOString) ---- */
const localYMD = (d = new Date()) => d.toLocaleDateString('en-CA');

const parseLocalYMD = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

const startOfLocalDay = (ymd) => parseLocalYMD(ymd);
const endOfLocalDay = (ymd) => {
  const start = parseLocalYMD(ymd);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
};

/** ---- Per-user "seen" storage helpers ---- */
const storageKey = (userId) => `zorvixe.notify.seen.${userId || 'anon'}`;

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
  } catch {
    // ignore quota/JSON errors
  }
};

/** Build a stable key per notification item */
const buildNotifKey = (activity) => {
  const type = activity?.type || '';
  const at = activity?.at || '';
  const relatedId =
    (activity?.data?.id) ??
    (activity?.data?.project_id) ??
    (activity?.data?.ticket_id) ??
    '';
  const text = activity?.text || '';
  // Keep it readable & stable
  return encodeURIComponent(`${type}|${at}|${relatedId}|${text}`);
};

export default function Notification({ isOpen, onClose, lastChecked, onNewActivities }) {
  const { user } = useAuth();
  const userId = user?.id || user?._id || user?.email || 'anon';

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Default to *today in local time*, not UTC
  const [selectedDate, setSelectedDate] = useState(localYMD());

  const modalRef = useRef(null);

  // Toast (bottom-right)
  const toastTimer = useRef(null);
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' });

  const showToast = (message, type = 'success') => {
    setToast({ open: true, type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast((t) => ({ ...t, open: false }));
    }, 3000);
  };

  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast((t) => ({ ...t, open: false }));
  };

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  /** Keep multiple tabs in sync for the same user */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === storageKey(userId)) {
        // Recompute is_new flags without refetching server data
        setNotifications((prev) => {
          const seen = loadSeenSet(userId);
          const next = prev.map((n) => ({ ...n, is_new: !seen.has(n.key) }));
          if (onNewActivities) {
            const count = next.filter((n) => n.is_new).length;
            onNewActivities(count);
          }
          return next;
        });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId, onNewActivities]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
    // re-run when selectedDate changes so the list refilters
  }, [isOpen, selectedDate]);

  const handleClickOutside = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      onClose();
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await apiStatsNotifications();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];

      let filtered = feed;

      // Filter by selected date using local day window [start, end)
      if (selectedDate) {
        const start = startOfLocalDay(selectedDate);
        const end = endOfLocalDay(selectedDate);
        filtered = feed.filter((activity) => {
          const t = activity?.at ? new Date(activity.at) : null;
          return t && t >= start && t < end;
        });
      }

      const seen = loadSeenSet(userId);

      const notificationData = filtered.map((activity, index) => {
        const key = buildNotifKey(activity);

        return {
          id: index + 1, // local list key (not used for "seen")
          key,           // stable per-activity key for seen/unseen
          title: getNotificationTitle(activity.type),
          message: activity.text,
          assigned_to: getAssignedTo(activity),
          related_type: activity.type,
          related_id: getRelatedId(activity),
          related_data: activity.data,
          created_at: activity.at,
          // If you also want to keep supporting lastChecked, OR it with seen
          is_new: !seen.has(key)
        };
      });

      setNotifications(notificationData);

      // Report new activities count (if parent cares)
      const newActivitiesCount = notificationData.filter((n) => n.is_new).length;
      if (onNewActivities) onNewActivities(newActivitiesCount);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      showToast('Failed to load notifications', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get notification title based on type
  const getNotificationTitle = (type) => {
    switch (type) {
      case 'project':
        return 'New Project';
      case 'ticket':
        return 'New Ticket';
      case 'project_comment':
        return 'Project Comment';
      case 'ticket_comment':
        return 'Ticket Comment';
      case 'user_login':
        return 'User Login';
      case 'user_logout':
        return 'User Logout';
      default:
        return 'System Notification';
    }
  };

  // Helper function to extract assigned to information
  const getAssignedTo = (activity) => {
    switch (activity.type) {
      case 'ticket':
        return activity.data?.assigned_to_name || activity.data?.assigned_to || null;
      case 'project':
        return activity.data?.updated_by_name || activity.data?.updated_by || null;
      case 'project_comment':
        return activity.data?.user_name || activity.data?.user_email || 'Someone';
      case 'ticket_comment':
        return activity.data?.user_name || activity.data?.user_email || 'Someone';
      case 'user_login':
      case 'user_logout':
        return activity.data?.name || activity.data?.email || 'User';
      default:
        return null;
    }
  };

  // Helper function to extract related ID from activity data
  const getRelatedId = (activity) => {
    switch (activity.type) {
      case 'project':
        return activity.data?.id || null;
      case 'ticket':
        return activity.data?.id || null;
      case 'project_comment':
        return activity.data?.project_id || null;
      case 'ticket_comment':
        return activity.data?.ticket_id || null;
      default:
        return null;
    }
  };

  const handleNotificationClick = async (notification) => {
    // Mark as seen for THIS user immediately
    const seen = loadSeenSet(userId);
    if (!seen.has(notification.key)) {
      seen.add(notification.key);
      saveSeenSet(userId, seen);
    }

    // Update local UI (blue dot disappears)
    setNotifications((prev) => {
      const next = prev.map((n) =>
        n.key === notification.key ? { ...n, is_new: false } : n
      );
      if (onNewActivities) {
        const count = next.filter((n) => n.is_new).length;
        onNewActivities(count);
      }
      return next;
    });

    // Route handling (unchanged)
    let path = '';
    switch (notification.related_type) {
      case 'ticket': {
        const ticketId = notification.related_data?.id;
        path = ticketId ? `/tickets?view=${ticketId}` : '/tickets';
        break;
      }
      case 'project': {
        const projectId = notification.related_data?.id;
        path = projectId ? `/clients?project=${projectId}` : '/clients';
        break;
      }
      case 'project_comment': {
        const commentProjectId = notification.related_data?.project_id;
        path = commentProjectId ? `/clients?project=${commentProjectId}` : '/clients';
        break;
      }
      case 'ticket_comment': {
        const commentTicketId = notification.related_data?.ticket_id;
        path = commentTicketId ? `/tickets?view=${commentTicketId}` : '/tickets';
        break;
      }
      default:
        break;
    }

    if (path) {
      window.history.pushState(null, '', path);
      window.dispatchEvent(new CustomEvent('routechange', { detail: { path } }));
    }

    onClose();
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;

    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatAssignedText = (assignedTo, type) => {
    if (!assignedTo) return null;

    switch (type) {
      case 'ticket':
        return `Assigned to: ${assignedTo}`;
      case 'project':
        return `Updated by: ${assignedTo}`;
      case 'project_comment':
      case 'ticket_comment':
        return `By: ${assignedTo}`;
      case 'user_login':
      case 'user_logout':
        return `User: ${assignedTo}`;
      default:
        return `By: ${assignedTo}`;
    }
  };

  const handleDateChange = (e) => setSelectedDate(e.target.value);
  const clearDateFilter = () => setSelectedDate('');

  if (!isOpen) return null;

  return (
    <div className="notification-overlay">
      <div ref={modalRef} className="notification-modal">
        <div className="notification-header">
          <div className="notification-header-top">
            <div className="notification-title-section">
              <h3>ZOR - Notify</h3>
            </div>
          </div>

          <div className="date-filter-input">
            <input
              id="date-filter"
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              max={localYMD()}
            />
            {selectedDate && (
              <button className="clear-date-btn" onClick={clearDateFilter} title="Clear filter">
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
          ) : notifications.length === 0 ? (
            <div className="notification-empty">
              <p>
                {selectedDate
                  ? `No activities found for ${new Date(selectedDate).toLocaleDateString()}`
                  : 'No recent activities found'}
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.key}
                className={`notification-item ${notification.is_new ? 'notification-unseen' : ''}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="notification-content">
                  <div className="notification-details">
                    <div className="notification-header-row">
                      <div className="notification-title">
                        {notification.title}
                        {/* Blue dot for NEW */}
                        {notification.is_new && <span className="notif-dot" aria-label="new" />}
                      </div>

                      {notification.assigned_to && (
                        <div className="notification-assigned">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            fill="currentColor"
                            viewBox="0 0 16 16"
                          >
                            <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                            <path
                              fillRule="evenodd"
                              d="M8 9a5 5 0 0 0-5 5v1h10v-1a5 5 0 0 0-5-5z"
                            />
                          </svg>
                          {formatAssignedText(notification.assigned_to, notification.related_type)}
                        </div>
                      )}
                    </div>

                    <div className="notification-message">{notification.message}</div>

                    <div className="notification-footer">
                      <div className="notification-time">{formatTime(notification.created_at)}</div>
                      <div className="notification-date">
                        {new Date(notification.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="notification-footer-info">
          <div className="notification-count">
            {notifications.length} activit{notifications.length === 1 ? 'y' : 'ies'}
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
