// src/pages/Notification.js
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiStatsNotifications, apiResetNotificationCount } from '../api';
import { useAuth } from '../auth';
import './Notifications.css';
import { buildDeepLink } from '../deeplink/resourceRegistry';

/** ---- Local date helpers ---- */
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

/** ---- Per-user seen storage ---- */
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
  } catch { }
};

/** Build stable key per notification */
const buildNotifKey = (activity) => {
  const type = activity?.type || '';
  const at = activity?.at || '';
  const relatedId =
    activity?.data?.id ??
    activity?.data?.project_id ??
    activity?.data?.ticket_id ??
    '';
  const text = activity?.text || '';
  return encodeURIComponent(`${type}|${at}|${relatedId}|${text}`);
};

export default function Notification({ isOpen, onClose, lastChecked, onNewActivities }) {
  const { user } = useAuth();
  const userId = user?.id || user?._id || user?.email || 'anon';
  const navigate = useNavigate();

  const isModalMode = isOpen !== undefined;

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(isModalMode ? localYMD() : '');
  const [activeFilter, setActiveFilter] = useState('all'); // for mobile page: 'all' | 'unread'
  const [searchQuery, setSearchQuery] = useState('');

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
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' });
  const showToast = (message, type = 'success') => {
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

  /** Sync across tabs */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === storageKey(userId)) {
        setNotifications((prev) => {
          const seen = loadSeenSet(userId);
          const next = prev.map((n) => ({ ...n, is_new: !seen.has(n.key) }));
          if (onNewActivities) onNewActivities(next.filter((n) => n.is_new).length);
          return next;
        });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId, onNewActivities]);

  // Click outside handling for desktop modal mode
  useEffect(() => {
    if (isModalMode && isOpen) {
      fetchNotifications();
      const handleClickOutside = (e) => {
        if (modalRef.current && !modalRef.current.contains(e.target)) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    } else if (!isModalMode) {
      fetchNotifications();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedDate]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await apiStatsNotifications();
      const feed = Array.isArray(data?.activityFeed) ? data.activityFeed : [];

      let filtered = feed;
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
          id: index + 1,
          key,
          title: getNotificationTitle(activity.type),
          message: activity.text,
          assigned_to: getAssignedTo(activity),
          related_type: activity.type,
          related_id: getRelatedId(activity),
          related_data: activity.data,
          created_at: activity.at,
          is_new: !seen.has(key),
          activityType: activity.type,
        };
      });

      setNotifications(notificationData);
      if (onNewActivities) onNewActivities(notificationData.filter((n) => n.is_new).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      showToast('Failed to load notifications', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getNotificationTitle = (type) => {
    switch (type) {
      case 'project': return 'New Project';
      case 'ticket': return 'New Ticket';
      case 'project_comment': return 'Project Comment';
      case 'ticket_comment': return 'Ticket Comment';
      case 'user_login': return 'User Login';
      case 'user_logout': return 'User Logout';
      default: return 'System Notification';
    }
  };

  const getAssignedTo = (activity) => {
    switch (activity.type) {
      case 'ticket': return activity.data?.assigned_to_name || activity.data?.assigned_to || null;
      case 'project': return activity.data?.updated_by_name || activity.data?.updated_by || null;
      case 'project_comment':
      case 'ticket_comment': return activity.data?.user_name || activity.data?.user_email || 'Someone';
      case 'user_login':
      case 'user_logout': return activity.data?.name || activity.data?.email || 'User';
      default: return null;
    }
  };

  const getRelatedId = (activity) => {
    switch (activity.type) {
      case 'project': return activity.data?.id || null;
      case 'ticket': return activity.data?.id || null;
      case 'project_comment': return activity.data?.project_id || null;
      case 'ticket_comment': return activity.data?.ticket_id || null;
      default: return null;
    }
  };

  const handleMarkAllAsRead = async () => {
    const seen = loadSeenSet(userId);
    notifications.forEach((n) => seen.add(n.key));
    saveSeenSet(userId, seen);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_new: false })));
    try {
      await apiResetNotificationCount();
    } catch { }
    showToast('All notifications marked as read', 'success');
  };

  const handleNotificationClick = (notification) => {
    const seen = loadSeenSet(userId);
    if (!seen.has(notification.key)) {
      seen.add(notification.key);
      saveSeenSet(userId, seen);
    }
    setNotifications((prev) => {
      const next = prev.map((n) =>
        n.key === notification.key ? { ...n, is_new: false } : n
      );
      if (onNewActivities) onNewActivities(next.filter((n) => n.is_new).length);
      return next;
    });

    let url = '';
    try {
      switch (notification.related_type) {
        case 'ticket':
          if (notification.related_data?.id) {
            url = buildDeepLink({
              resourceType: 'ticket',
              resourceId: notification.related_data.id,
            });
          } else {
            url = '/tickets';
          }
          break;

        case 'project':
          if (notification.related_data?.id) {
            url = buildDeepLink({
              resourceType: 'project',
              resourceId: notification.related_data.id,
            });
          } else {
            url = '/clients';
          }
          break;

        case 'project_comment': {
          const projId = notification.related_data?.project_id;
          const commentId = notification.related_data?.id;
          if (projId && commentId) {
            url = buildDeepLink({
              resourceType: 'project',
              resourceId: projId,
              targetType: 'comment',
              targetId: commentId,
            });
          } else if (projId) {
            url = buildDeepLink({ resourceType: 'project', resourceId: projId });
          } else {
            url = '/clients';
          }
          break;
        }

        case 'ticket_comment': {
          const tId = notification.related_data?.ticket_id;
          const commentId = notification.related_data?.id;
          if (tId && commentId) {
            url = buildDeepLink({
              resourceType: 'ticket',
              resourceId: tId,
              targetType: 'comment',
              targetId: commentId,
            });
          } else if (tId) {
            url = buildDeepLink({ resourceType: 'ticket', resourceId: tId });
          } else {
            url = '/tickets';
          }
          break;
        }

        default:
          url = '/stats';
          break;
      }
    } catch (e) {
      url = '/stats';
    }

    if (url) {
      if (isModalMode) {
        window.history.pushState(null, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
        if (onClose) onClose();
      } else {
        navigate(url);
      }
    }
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
      case 'ticket': return `Assigned to: ${assignedTo}`;
      case 'project': return `Updated by: ${assignedTo}`;
      case 'project_comment':
      case 'ticket_comment': return `By: ${assignedTo}`;
      case 'user_login':
      case 'user_logout': return `User: ${assignedTo}`;
      default: return `By: ${assignedTo}`;
    }
  };

  // LinkedIn mobile format helpers
  const formatLinkedInTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)}w`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getInitials = (name) => {
    if (!name) return 'Z';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getAvatarColor = (name = '') => {
    const colors = ['#0a66c2', '#057642', '#7c3aed', '#c2410c', '#0284c7', '#4f46e5', '#0d9488', '#b91c1c'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const renderAvatarBadge = (type) => {
    switch (type) {
      case 'ticket':
      case 'ticket_comment':
        return (
          <span className="li-avatar-badge badge-ticket" title="Ticket">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
        );
      case 'project':
      case 'project_comment':
        return (
          <span className="li-avatar-badge badge-project" title="Project">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </span>
        );
      case 'user_login':
      case 'user_logout':
        return (
          <span className="li-avatar-badge badge-auth" title="User Access">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
        );
      default:
        return (
          <span className="li-avatar-badge badge-ticket" title="Notification">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </span>
        );
    }
  };

  const renderNotificationNarrative = (n) => {
    const actor = n.assigned_to || 'System';
    const type = n.related_type;

    switch (type) {
      case 'ticket':
        return (
          <p className="li-text-narrative">
            <strong className="li-actor-name">{actor}</strong>
            {' created new ticket '}
            {n.related_id && <span className="li-ticket-ref">#{n.related_id}</span>}
            {n.message && <span className="li-notif-snippet">{n.message}</span>}
          </p>
        );
      case 'ticket_comment':
        return (
          <p className="li-text-narrative">
            <strong className="li-actor-name">{actor}</strong>
            {' commented on ticket '}
            {n.related_id && <span className="li-ticket-ref">#{n.related_id}</span>}
            {n.message && <span className="li-notif-snippet">{n.message}</span>}
          </p>
        );
      case 'project':
        return (
          <p className="li-text-narrative">
            <strong className="li-actor-name">{actor}</strong>
            {' updated project '}
            {n.related_data?.title && <span className="li-project-ref">"{n.related_data.title}"</span>}
            {n.message && <span className="li-notif-snippet">{n.message}</span>}
          </p>
        );
      case 'project_comment':
        return (
          <p className="li-text-narrative">
            <strong className="li-actor-name">{actor}</strong>
            {' commented on a project '}
            {n.message && <span className="li-notif-snippet">{n.message}</span>}
          </p>
        );
      case 'user_login':
        return (
          <p className="li-text-narrative">
            <strong className="li-actor-name">{actor}</strong>
            {' signed into the workspace'}
          </p>
        );
      case 'user_logout':
        return (
          <p className="li-text-narrative">
            <strong className="li-actor-name">{actor}</strong>
            {' signed out of the workspace'}
          </p>
        );
      default:
        return (
          <p className="li-text-narrative">
            <strong className="li-actor-name">{actor}</strong>
            {' — '}
            <span>{n.title}</span>
            {n.message && <span className="li-notif-snippet">{n.message}</span>}
          </p>
        );
    }
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
            <h3>ZOR - Notify</h3>
            <div className="date-filter-input">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={localYMD()}
              />
              {selectedDate && (
                <button className="clear-date-btn" onClick={() => setSelectedDate('')} title="Clear filter">
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="notification-list">
            {loading ? (
              <div className="loader_container"><p className="loader_spinner"></p></div>
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
                          {notification.is_new && <span className="notif-dot" />}
                        </div>
                        {notification.assigned_to && (
                          <div className="notification-assigned">
                            👤 {formatAssignedText(notification.assigned_to, notification.related_type)}
                          </div>
                        )}
                      </div>
                      <div className="notification-message">{notification.message}</div>
                      <div className="notification-footer">
                        <div className="notification-time">{formatTime(notification.created_at)}</div>
                        <div className="notification-date">{new Date(notification.created_at).toLocaleDateString()}</div>
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

  /* -------------------------------------------------------------
     MODE 2: MOBILE LINKEDIN-STYLE PAGE (exclusively on mobile devices)
     ------------------------------------------------------------- */
  const unreadCount = notifications.filter((n) => n.is_new).length;
  const displayedNotifications = notifications.filter((n) => {
    if (activeFilter === 'unread' && !n.is_new) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = (n.title || '').toLowerCase().includes(q);
      const msgMatch = (n.message || '').toLowerCase().includes(q);
      const actorMatch = (n.assigned_to || '').toLowerCase().includes(q);
      const refMatch = String(n.related_id || '').toLowerCase().includes(q);
      const projMatch = (n.related_data?.title || '').toLowerCase().includes(q);
      return titleMatch || msgMatch || actorMatch || refMatch || projMatch;
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
                    placeholder="Search Notifications..."
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
                className={`li-chip ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                All
              </button>

              <button
                type="button"
                className={`li-chip ${activeFilter === 'unread' ? 'active' : ''}`}
                onClick={() => setActiveFilter('unread')}
              >
                Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
              </button>

              {/* Date filter chip */}
              <div
                role="button"
                tabIndex={0}
                className={`li-chip li-chip-date ${selectedDate ? 'active' : ''}`}
                title="Filter by date"
                onClick={handleOpenDatePicker}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenDatePicker(e);
                  }
                }}
              >
                <span>📅</span>
                <span>
                  {selectedDate
                    ? new Date(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Filter by date'}
                </span>
                <input
                  ref={mobileDateInputRef}
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  onClick={(e) => {
                    e.stopPropagation();
                    try {
                      if (typeof e.target.showPicker === 'function') {
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
                      setSelectedDate('');
                    }}
                    title="Clear date filter"
                  >
                    ×
                  </span>
                )}
              </div>
              <div className="li-header-actions">
                <button
                  type="button"
                  className="li-chip li-mark-all-btn"
                  onClick={handleMarkAllAsRead}
                  disabled={unreadCount === 0}
                  title="Mark all notifications as read"
                >
                  Mark all as read
                </button>
              </div>
            </div>
          </div>

          {/* LinkedIn Notification List */}
          <div className="li-list">
            {loading ? (
              <div className="loader_container">
                <p className="loader_spinner"></p>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="li-empty-state">
                <div className="li-empty-icon-wrap">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <h3 className="li-empty-title">
                  {searchQuery
                    ? `No notifications matching "${searchQuery}"`
                    : activeFilter === 'unread'
                    ? 'No unread notifications'
                    : selectedDate
                      ? `No updates for ${new Date(selectedDate).toLocaleDateString()}`
                      : 'No notifications right now'}
                </h3>
                <p className="li-empty-desc">
                  {searchQuery
                    ? 'Try searching with different keywords.'
                    : activeFilter === 'unread'
                    ? "You're completely caught up! Great job."
                    : "We'll notify you when new activity happens in your workspace."}
                </p>
              </div>
            ) : (
              displayedNotifications.map((n) => {
                const actorName = n.assigned_to || 'System';
                const initials = getInitials(actorName);
                const avatarColor = getAvatarColor(actorName);

                return (
                  <div
                    key={n.key}
                    className={`li-item ${n.is_new ? 'li-unseen' : ''}`}
                    onClick={() => handleNotificationClick(n)}
                  >
                    {/* Left Avatar with sub-badge */}
                    <div className="li-avatar-wrapper">
                      <div
                        className="li-avatar-circle"
                        style={{ backgroundColor: avatarColor }}
                      >
                        {initials}
                      </div>
                      {renderAvatarBadge(n.related_type)}
                    </div>

                    {/* Middle narrative */}
                    <div className="li-content">
                      {renderNotificationNarrative(n)}
                      <div className="li-meta">
                        <span>{formatLinkedInTime(n.created_at)}</span>
                        <span className="li-meta-dot">•</span>
                        <span className="li-category-tag">{n.title}</span>
                      </div>
                    </div>

                    {/* Right side indicators */}
                    <div className="li-right">
                      {n.is_new && <span className="li-unread-dot" title="Unread" />}
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
              {displayedNotifications.length} notification{displayedNotifications.length === 1 ? '' : 's'}
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
