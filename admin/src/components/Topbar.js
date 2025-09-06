import { useEffect, useRef, useState } from "react"
import { useAuth } from "../auth"
import ZorvixeLogo from "../assets/zorvixe_logo.png"
import ZorvixeFavicon from "../assets/zorvixe_favicon.png"
import { apiStatsNotifications, apiResetNotificationCount } from '../api';
import Notification from '../pages/Notification';
import "./Topbar.css"

export default function Topbar({
  title,
  children,
  variant = "page",
  onToggleSidebar = () => { },
  sidebarCollapsed = false,
}) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const [notificationCount, setNotificationCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  // Fetch notification count based on last checked time
  const fetchNotificationCount = async () => {
    try {
      const data = await apiStatsNotifications();
      
      // Filter activities that occurred after the user last checked
      const newActivities = lastChecked 
        ? data.activityFeed.filter(activity => new Date(activity.at) > new Date(lastChecked))
        : data.activityFeed;
      
      setNotificationCount(newActivities.length);
    } catch (error) {
      console.error('Error fetching notification count:', error);
      setNotificationCount(0);
    }
  };

  // Reset notification count when user clicks the bell
  const handleNotificationClick = async () => {
    try {
      // Reset the count and set last checked time to now
      setNotificationCount(0);
      const now = new Date().toISOString();
      setLastChecked(now);
      
      // Store last checked time in localStorage for persistence
      localStorage.setItem(`lastChecked_${user.id}`, now);
      
      // Show notifications modal
      setShowNotifications(true);
      
      // Optional: Send to backend to track if needed
      await apiResetNotificationCount();
    } catch (error) {
      console.error('Error resetting notification count:', error);
    }
  };

  useEffect(() => {
    if (user) {
      // Load last checked time from localStorage
      const savedLastChecked = localStorage.getItem(`lastChecked_${user.id}`);
      if (savedLastChecked) {
        setLastChecked(savedLastChecked);
      }
      
      fetchNotificationCount();
      // Poll for new notifications every 30 seconds
      const interval = setInterval(fetchNotificationCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user, lastChecked]);

  const initials =
    (user?.name || user?.email || "U")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"

  // close on outside click / Esc
  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuOpen) return
      const el = e.target
      if (btnRef.current?.contains(el) || menuRef.current?.contains(el)) return
      setMenuOpen(false)
    }
    const onEsc = (e) => e.key === "Escape" && setMenuOpen(false)
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onEsc)
    }
  }, [menuOpen])

  if (variant === "global") {
    return (
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
            onError={(e) => { e.currentTarget.src = ZorvixeFavicon }}
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

          <button
            className="icon-btn"
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
                      onClick={() => { /* navigate to your account page if you have one */ }}
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

        {showNotifications && (
          <Notification
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
            lastChecked={lastChecked}
            onNewActivities={(count) => setNotificationCount(count)}
          />
        )}
      </header>
    )
  }

  // "page" variant
  return (
    <div className="topbar topbar--page">
      <h3 className="page-title" title={title}>{title}</h3>
      <div className="page-controls">{children}</div>
    </div>
  )
}