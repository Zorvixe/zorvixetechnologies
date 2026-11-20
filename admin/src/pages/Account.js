import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { apiGetMyAccount, apiUpdateMyAccount, apiChangePassword } from "../api";
import "./Account.css";

// Helper: generate consistent avatar color
const getAvatarColor = (str = "") => {
  const colors = [
    { bg: "#0a66c2", text: "#ffffff" },
    { bg: "#057642", text: "#ffffff" },
    { bg: "#7c3aed", text: "#ffffff" },
    { bg: "#b45309", text: "#ffffff" },
    { bg: "#be185d", text: "#ffffff" },
    { bg: "#0f766e", text: "#ffffff" },
    { bg: "#1d4ed8", text: "#ffffff" },
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name = "") => {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function Account() {
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();

  // Active tab: 'profile' | 'security' | 'activity'
  const [activeTab, setActiveTab] = useState("profile");

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    tickets: { tickets_created: 0, tickets_assigned: 0 },
    leaves: null,
    logins: { total_logins: 0, last_session: null },
  });

  // Profile Form state
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    phone: "",
    department: "",
    position: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState({ type: "", message: "" });

  // Password Form state
  const [passwordData, setPasswordData] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState({ type: "", message: "" });

  // Load account info
  const loadAccount = async () => {
    try {
      setLoading(true);
      const res = await apiGetMyAccount();
      if (res && res.user) {
        setProfile(res.user);
        setFormData({
          name: res.user.name || "",
          username: res.user.username || "",
          phone: res.user.phone || "",
          department: res.user.department || "",
          position: res.user.position || "",
        });
        if (res.stats) {
          setStats(res.stats);
        }
      }
    } catch (err) {
      console.error("Error loading account:", err);
      setProfileFeedback({
        type: "error",
        message: err.message || "Failed to load account profile",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, []);

  // Handle profile form input
  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setProfileFeedback({ type: "", message: "" });
  };

  // Submit profile changes
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setProfileFeedback({ type: "error", message: "Name cannot be empty." });
      return;
    }

    try {
      setSavingProfile(true);
      setProfileFeedback({ type: "", message: "" });
      const res = await apiUpdateMyAccount(formData);
      if (res && res.user) {
        setProfile(res.user);
        setProfileFeedback({
          type: "success",
          message: "Profile updated successfully!",
        });
      }
    } catch (err) {
      console.error("Profile update error:", err);
      setProfileFeedback({
        type: "error",
        message: err.message || "Failed to update profile",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle password form input
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
    setPasswordFeedback({ type: "", message: "" });
  };

  // Submit password change
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordData.current_password) {
      setPasswordFeedback({ type: "error", message: "Please enter your current password." });
      return;
    }
    if (passwordData.new_password.length < 6) {
      setPasswordFeedback({ type: "error", message: "New password must be at least 6 characters long." });
      return;
    }
    if (passwordData.new_password !== passwordData.confirm_password) {
      setPasswordFeedback({ type: "error", message: "New passwords do not match." });
      return;
    }

    try {
      setSavingPassword(true);
      setPasswordFeedback({ type: "", message: "" });
      await apiChangePassword({
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
      });

      setPasswordFeedback({
        type: "success",
        message: "Password changed successfully!",
      });
      setPasswordData({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    } catch (err) {
      console.error("Password change error:", err);
      setPasswordFeedback({
        type: "error",
        message: err.message || "Failed to update password. Please check your current password.",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const userDisplayName = profile?.name || authUser?.name || "User";
  const userEmail = profile?.email || authUser?.email || "";
  const avatarColors = getAvatarColor(userEmail || userDisplayName);
  const initials = getInitials(userDisplayName);

  return (
    <div className="account-page">
      {/* -------------------- Top Hero Banner -------------------- */}
      <div className="account-hero-card">
        <div className="account-hero-cover"></div>
        <div className="account-hero-body">
          <div
            className="account-avatar-large"
            style={{ backgroundColor: avatarColors.bg, color: avatarColors.text }}
          >
            {initials}
            <span className="account-online-badge" title="Active"></span>
          </div>

          <div className="account-hero-info">
            <div className="account-hero-row1">
              <h1 className="account-user-name">{userDisplayName}</h1>
              <span className={`account-role-badge ${profile?.role === "admin" ? "admin" : "employee"}`}>
                ZOR • {profile?.role ? profile.role.toUpperCase() : "MEMBER"}
              </span>
            </div>

            <p className="account-user-title">
              {profile?.position || "Team Member"}
              {profile?.department ? ` • ${profile.department}` : ""}
            </p>

            <div className="account-hero-meta">
              <span className="meta-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                {userEmail}
              </span>

              {profile?.phone && (
                <span className="meta-item">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  {profile.phone}
                </span>
              )}

              {profile?.created_at && (
                <span className="meta-item">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* -------------------- Quick Stats Cards -------------------- */}
      <div className="account-stats-grid">
        <div className="stat-card" onClick={() => navigate("/tickets")}>
          <div className="stat-icon-box ticket-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
              <path d="M13 5v2"></path>
              <path d="M13 17v2"></path>
              <path d="M13 11v2"></path>
            </svg>
          </div>
          <div className="stat-details">
            <span className="stat-value">{stats.tickets?.tickets_assigned || 0}</span>
            <span className="stat-label">Assigned Tickets</span>
            <span className="stat-sub">({stats.tickets?.tickets_created || 0} created)</span>
          </div>
          <span className="stat-arrow">→</span>
        </div>

        <div className="stat-card" onClick={() => navigate("/leaves")}>
          <div className="stat-icon-box leave-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="stat-details">
            <span className="stat-value">
              {stats.leaves ? Number(stats.leaves.casual_balance || 0) + Number(stats.leaves.sick_balance || 0) : "—"}
            </span>
            <span className="stat-label">Leave Balance Days</span>
            <span className="stat-sub">
              {stats.leaves
                ? `Sick: ${stats.leaves.sick_balance} | Casual: ${stats.leaves.casual_balance}`
                : "Manage leaves"}
            </span>
          </div>
          <span className="stat-arrow">→</span>
        </div>

        <div className="stat-card" onClick={() => navigate("/login-history")}>
          <div className="stat-icon-box login-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="stat-details">
            <span className="stat-value">{stats.logins?.total_logins || 1}</span>
            <span className="stat-label">Recorded Logins</span>
            <span className="stat-sub">Check login & logout timings</span>
          </div>
          <span className="stat-arrow">→</span>
        </div>
      </div>

      {/* -------------------- Main Content Tabs -------------------- */}
      <div className="account-main-card">
        {/* Navigation Tabs Header */}
        <div className="account-tabs-header">
          <button
            type="button"
            className={`account-tab-btn ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Personal Information
          </button>

          <button
            type="button"
            className={`account-tab-btn ${activeTab === "security" ? "active" : ""}`}
            onClick={() => setActiveTab("security")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Security & Password
          </button>

          <button
            type="button"
            className={`account-tab-btn ${activeTab === "activity" ? "active" : ""}`}
            onClick={() => setActiveTab("activity")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Quick Actions & Hub
          </button>
        </div>

        {/* Tab Body */}
        <div className="account-tab-content">
          {/* TAB 1: Profile Information */}
          {activeTab === "profile" && (
            <form className="account-form" onSubmit={handleProfileSubmit}>
              <div className="form-section-intro">
                <h3>Profile Details</h3>
                <p>Update your personal information, department, and contact details.</p>
              </div>

              {profileFeedback.message && (
                <div className={`account-alert ${profileFeedback.type}`}>
                  {profileFeedback.type === "success" ? "✓ " : "⚠ "}
                  {profileFeedback.message}
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="acc-name">Full Name *</label>
                  <input
                    id="acc-name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleProfileChange}
                    required
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="acc-username">Username</label>
                  <input
                    id="acc-username"
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleProfileChange}
                    placeholder="e.g. johndoe"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="acc-email">Email Address</label>
                  <div className="input-readonly-wrap">
                    <input
                      id="acc-email"
                      type="email"
                      value={userEmail}
                      disabled
                      readOnly
                      title="Email is managed by system administrators"
                    />
                    <span className="badge-locked">Locked</span>
                  </div>
                  <span className="field-hint">Email address cannot be changed directly. Contact Admin for email updates.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="acc-phone">Phone Number</label>
                  <input
                    id="acc-phone"
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleProfileChange}
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="acc-dept">Department</label>
                  <input
                    id="acc-dept"
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleProfileChange}
                    placeholder="e.g. Engineering / Design / Sales"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="acc-pos">Position / Designation</label>
                  <input
                    id="acc-pos"
                    type="text"
                    name="position"
                    value={formData.position}
                    onChange={handleProfileChange}
                    placeholder="e.g. Senior Software Engineer"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-save-profile"
                  disabled={savingProfile}
                >
                  {savingProfile ? "Saving changes..." : "Save Profile Changes"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Security & Password */}
          {activeTab === "security" && (
            <form className="account-form" onSubmit={handlePasswordSubmit}>
              <div className="form-section-intro">
                <h3>Change Password</h3>
                <p>Ensure your account is protected with a strong, confidential password.</p>
              </div>

              {passwordFeedback.message && (
                <div className={`account-alert ${passwordFeedback.type}`}>
                  {passwordFeedback.type === "success" ? "✓ " : "⚠ "}
                  {passwordFeedback.message}
                </div>
              )}

              <div className="form-grid single-col">
                <div className="form-group">
                  <label htmlFor="acc-cur-pass">Current Password *</label>
                  <div className="input-password-wrap">
                    <input
                      id="acc-cur-pass"
                      type={showCurrentPassword ? "text" : "password"}
                      name="current_password"
                      value={passwordData.current_password}
                      onChange={handlePasswordChange}
                      placeholder="Enter your current password"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowCurrentPassword((v) => !v)}
                    >
                      {showCurrentPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="acc-new-pass">New Password *</label>
                  <div className="input-password-wrap">
                    <input
                      id="acc-new-pass"
                      type={showNewPassword ? "text" : "password"}
                      name="new_password"
                      value={passwordData.new_password}
                      onChange={handlePasswordChange}
                      placeholder="At least 6 characters"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowNewPassword((v) => !v)}
                    >
                      {showNewPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <span className="field-hint">Must contain at least 6 characters. Use letters, numbers, and symbols for better security.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="acc-conf-pass">Confirm New Password *</label>
                  <input
                    id="acc-conf-pass"
                    type="password"
                    name="confirm_password"
                    value={passwordData.confirm_password}
                    onChange={handlePasswordChange}
                    placeholder="Repeat your new password"
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-save-profile"
                  disabled={savingPassword}
                >
                  {savingPassword ? "Updating Password..." : "Update Password"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Activity & Quick Actions Hub */}
          {activeTab === "activity" && (
            <div className="account-hub">
              <div className="form-section-intro">
                <h3>Workplace Navigation Hub</h3>
                <p>Quick shortcuts to your everyday tools, schedules, and conversations.</p>
              </div>

              <div className="hub-grid">
                <div className="hub-card" onClick={() => navigate("/login-history")}>
                  <div className="hub-icon-wrap" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="hub-content">
                    <h4>Login Timings</h4>
                    <p>Review daily login, logout, and session durations across your shifts.</p>
                  </div>
                  <span className="hub-btn">Open →</span>
                </div>

                <div className="hub-card" onClick={() => navigate("/leaves")}>
                  <div className="hub-icon-wrap" style={{ background: "#fef3c7", color: "#b45309" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div className="hub-content">
                    <h4>Leave Management</h4>
                    <p>Check casual and sick leave balances or apply for upcoming leaves.</p>
                  </div>
                  <span className="hub-btn">Open →</span>
                </div>

                <div className="hub-card" onClick={() => navigate("/tickets")}>
                  <div className="hub-icon-wrap" style={{ background: "#dcfce7", color: "#15803d" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
                      <path d="M13 5v2"></path>
                    </svg>
                  </div>
                  <div className="hub-content">
                    <h4>Jira & Tickets</h4>
                    <p>Track reported bugs, view tasks, and resolve assigned project issues.</p>
                  </div>
                  <span className="hub-btn">Open →</span>
                </div>

                <div className="hub-card" onClick={() => navigate("/discussions")}>
                  <div className="hub-icon-wrap" style={{ background: "#ede9fe", color: "#6d28d9" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                  <div className="hub-content">
                    <h4>Discussions & Messaging</h4>
                    <p>Communicate in real-time with colleagues, admins, and teammates.</p>
                  </div>
                  <span className="hub-btn">Open →</span>
                </div>
              </div>

              <div className="hub-signout-row">
                <button type="button" className="btn-hub-signout" onClick={logout}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign Out from this Device
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
