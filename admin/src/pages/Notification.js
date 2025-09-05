// Notification.js
import React, { useEffect, useState, useRef } from 'react';
import { apiGetNotifications, apiMarkNotificationRead, apiMarkAllNotificationsRead, apiDeleteNotification } from '../api';
import { useAuth } from '../auth';
import './Notifications.css';

export default function Notification({ isOpen, onClose }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState('all');
  const modalRef = useRef(null);


  // --- Toast (bottom-right) ---
    const toastTimer = useRef(null)
    const [toast, setToast] = useState({ open: false, type: 'success', message: '' })
  
    const showToast = (message, type = 'success') => {
      setToast({ open: true, type, message })
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => {
        setToast(t => ({ ...t, open: false }))
      }, 3000)
    }
  
    const hideToast = () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      setToast(t => ({ ...t, open: false }))
    }
  
    useEffect(() => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }, [])
  

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, activeTab]);

  const handleClickOutside = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      onClose();
    }
  };

  // Fix the fetchNotifications function
const fetchNotifications = async () => {
  try {
    setLoading(true);
    const params = { limit: 50 };
    if (activeTab === 'unread') params.unread = 'true';
    
    const data = await apiGetNotifications(params);
    setNotifications(data.notifications || []);
    setUnreadCount(data.unread_count || 0);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    showToast('Failed to load notifications', 'error');
  } finally {
    setLoading(false);
  }
};

  const handleMarkAsRead = async (id) => {
    try {
      const data = await apiMarkNotificationRead(id);
      setNotifications(prev => prev.map(n => 
        n.id === id ? { ...n, is_read: true } : n
      ));
      setUnreadCount(data.unread_count || 0);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiMarkAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      const data = await apiDeleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(data.unread_count || 0);
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      await handleMarkAsRead(notification.id);
    }
    
    // Handle navigation based on notification type
    switch (notification.related_type) {
      case 'ticket':
        window.location.href = `/tickets?view=${notification.related_id}`;
        break;
      case 'payment':
        window.location.href = `/payments`;
        break;
      case 'contact':
        window.location.href = `/contacts`;
        break;
      case 'candidate':
        window.location.href = `/candidates`;
        break;
      case 'project':
        window.location.href = `/clients`;
        break;
      default:
        break;
    }
    
    onClose();
  };

  const formatTime = (secondsAgo) => {
    if (secondsAgo < 60) return 'Just now';
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
    return `${Math.floor(secondsAgo / 86400)}d ago`;
  };

  if (!isOpen) return null;

  return (
    <div className="notification-overlay">
      <div ref={modalRef} className="notification-modal">
        <div className="notification-header">
          <h3>Notifications</h3>
          <div className="notification-actions">
            {unreadCount > 0 && (
              <button 
                className="btn-link" 
                onClick={handleMarkAllAsRead}
                title="Mark all as read"
              >
                Mark all read
              </button>
            )}
            <button className="btn-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="notification-tabs">
          <button 
            className={activeTab === 'all' ? 'active' : ''}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button 
            className={activeTab === 'unread' ? 'active' : ''}
            onClick={() => setActiveTab('unread')}
          >
            Unread {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>

        <div className="notification-list">
          {loading ? (
            <div className="notification-loading">
              <div className="loader-spinner"></div>
              <p>Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="notification-empty">
              <p>No notifications found</p>
            </div>
          ) : (
            notifications.map(notification => (
              <div
                key={notification.id}
                className={`notification-item ${notification.is_read ? 'read' : 'unread'}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="notification-content">
                  <div className="notification-title">{notification.title}</div>
                  <div className="notification-message">{notification.message}</div>
                  <div className="notification-time">
                    {formatTime(notification.seconds_ago)}
                  </div>
                </div>
                <div className="notification-actions">
                  {!notification.is_read && (
                    <button
                      className="btn-mark-read"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(notification.id);
                      }}
                      title="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                  <button
                    className="btn-delete"
                    onClick={(e) => handleDelete(notification.id, e)}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}