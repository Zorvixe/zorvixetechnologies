import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import {
  apiGetChatUsers,
  apiGetChatMessages,
  apiSendChatMessage,
  apiEditChatMessage,
  apiDeleteChatMessage,
  apiMarkChatRead,
  apiGetChatUnreadCount,
} from "../api";
import { playNotificationSound } from "../utils/notificationSound";
import "./LinkedInChatWidget.css";

// Helper: generate consistent avatar color from string
const getAvatarColor = (str = "") => {
  const colors = [
    { bg: "#0a66c2", text: "#ffffff" }, // LinkedIn blue
    { bg: "#057642", text: "#ffffff" }, // Emerald green
    { bg: "#7c3aed", text: "#ffffff" }, // Purple
    { bg: "#b45309", text: "#ffffff" }, // Warm Amber
    { bg: "#be185d", text: "#ffffff" }, // Rose
    { bg: "#0f766e", text: "#ffffff" }, // Teal
    { bg: "#1d4ed8", text: "#ffffff" }, // Royal blue
    { bg: "#475569", text: "#ffffff" }, // Slate
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

// Helper: initials
const getInitials = (name = "") => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Helper: format relative time
const formatChatTime = (dateString) => {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

// Helper: exact message timestamp
const formatMessageTimestamp = (dateString) => {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// Helper: check if message links to URL
const renderMessageWithLinks = (text) => {
  if (!text) return "";
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-link"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

export default function LinkedInChatWidget() {
  const { user } = useAuth();

  // Widget state
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all"); // 'all' | 'unread'
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Active chat window state
  const [activeColleague, setActiveColleague] = useState(null);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [editingMessage, setEditingMessage] = useState(null);
  const [activeMenuMsgId, setActiveMenuMsgId] = useState(null);

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const lastMsgCountRef = useRef(0);
  const lastUnreadTotalRef = useRef(null);

  const currentUserId = user?.sub || user?.id;

  // Close context menu on outside click
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveMenuMsgId(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // 1. Fetch user list and unread count
  const fetchChatUsers = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const res = await apiGetChatUsers();
      if (res && res.users) {
        setUsers(res.users);
      }
      const unreadRes = await apiGetChatUnreadCount();
      if (unreadRes && typeof unreadRes.total_unread === "number") {
        if (
          lastUnreadTotalRef.current !== null &&
          unreadRes.total_unread > lastUnreadTotalRef.current
        ) {
          playNotificationSound();
        }
        lastUnreadTotalRef.current = unreadRes.total_unread;
        setUnreadTotal(unreadRes.total_unread);
      }
    } catch (err) {
      console.error("Error fetching chat users:", err);
    }
  }, [currentUserId]);

  // 2. Fetch messages for active colleague
  const fetchActiveMessages = useCallback(async (colleagueId, silent = false) => {
    if (!colleagueId || !currentUserId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await apiGetChatMessages(colleagueId);
      if (res && res.messages) {
        setMessages(res.messages);
        // If message count increased, scroll down and play sound if incoming
        if (res.messages.length > lastMsgCountRef.current) {
          if (silent && lastMsgCountRef.current > 0) {
            const lastMsg = res.messages[res.messages.length - 1];
            if (lastMsg && Number(lastMsg.sender_id) !== Number(currentUserId)) {
              playNotificationSound();
            }
          }
          lastMsgCountRef.current = res.messages.length;
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 80);
        }
      }
    } catch (err) {
      console.error("Error fetching chat messages:", err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [currentUserId]);

  // Initial load
  useEffect(() => {
    if (!currentUserId) return;
    setLoadingUsers(true);
    fetchChatUsers().finally(() => setLoadingUsers(false));
  }, [currentUserId, fetchChatUsers]);

  // Polling loop (every 3.5s)
  useEffect(() => {
    if (!currentUserId) return;
    const interval = setInterval(() => {
      fetchChatUsers();
      if (activeColleague && !isChatMinimized) {
        fetchActiveMessages(activeColleague.id, true);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [currentUserId, activeColleague, isChatMinimized, fetchChatUsers, fetchActiveMessages]);

  // Auto-scroll when messages load or active user changes
  useEffect(() => {
    if (activeColleague && !isChatMinimized) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 100);
      chatInputRef.current?.focus();
    }
  }, [activeColleague, isChatMinimized]);

  // Open conversation with a user
  const handleSelectColleague = (colleague) => {
    setActiveColleague(colleague);
    setIsChatMinimized(false);
    setEditingMessage(null);
    lastMsgCountRef.current = 0;
    fetchActiveMessages(colleague.id);

    // Update unread count locally for smooth UI
    if (colleague.unread_count > 0) {
      setUsers((prev) =>
        prev.map((u) => (u.id === colleague.id ? { ...u, unread_count: 0 } : u))
      );
      setUnreadTotal((prev) => Math.max(0, prev - Number(colleague.unread_count)));
      apiMarkChatRead(colleague.id).catch(console.error);
    }
  };

  // Close active conversation
  const handleCloseChat = () => {
    setActiveColleague(null);
    setEditingMessage(null);
    setMessages([]);
    lastMsgCountRef.current = 0;
  };

  // Toggle minimize of active conversation
  const handleToggleMinimizeChat = () => {
    setIsChatMinimized((prev) => !prev);
  };

  const handleStartEdit = (msg) => {
    setActiveMenuMsgId(null);
    setEditingMessage(msg);
    setInputMessage(msg.message_text || "");
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 50);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInputMessage("");
  };

  const handleDeleteMessage = async (messageId) => {
    setActiveMenuMsgId(null);
    const confirmed = window.confirm("Delete message for everyone?");
    if (!confirmed) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, is_deleted: true, message_text: "This message was deleted" }
          : m
      )
    );

    try {
      await apiDeleteChatMessage(messageId);
      fetchChatUsers();
    } catch (err) {
      console.error("Failed to delete message:", err);
      alert("Failed to delete message.");
      if (activeColleague) {
        fetchActiveMessages(activeColleague.id, true);
      }
    }
  };

  const handleCopyMessage = (text) => {
    setActiveMenuMsgId(null);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
  };

  // Send message
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const text = inputMessage.trim();
    if (!text || !activeColleague || sending) return;

    if (editingMessage) {
      const targetId = editingMessage.id;
      setEditingMessage(null);
      setInputMessage("");
      setSending(true);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === targetId
            ? { ...m, message_text: text, is_edited: true, edited_at: new Date().toISOString() }
            : m
        )
      );

      try {
        const res = await apiEditChatMessage(targetId, text);
        if (res && res.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === targetId ? res.message : m))
          );
        }
        fetchChatUsers();
      } catch (err) {
        console.error("Failed to edit message:", err);
        alert("Failed to edit message.");
        fetchActiveMessages(activeColleague.id, true);
      } finally {
        setSending(false);
      }
      return;
    }

    // Optimistic message
    const tempId = "temp-" + Date.now();
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUserId,
      receiver_id: activeColleague.id,
      message_text: text,
      is_read: false,
      is_edited: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
      sender_name: user?.name || "You",
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setInputMessage("");
    setSending(true);

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);

    try {
      const res = await apiSendChatMessage({
        receiver_id: activeColleague.id,
        message_text: text,
      });

      if (res && res.message) {
        // Replace temp message with server message
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? res.message : m))
        );
      }
      // Refresh users list to update last message preview
      fetchChatUsers();
    } catch (err) {
      console.error("Failed to send message:", err);
      // Mark optimistic message as failed or alert user
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert("Failed to send message. Please try again.");
      setInputMessage(text);
    } finally {
      setSending(false);
    }
  };

  // Handle Enter key for quick sending
  const handleKeyDown = (e) => {
    if (e.key === "Escape" && editingMessage) {
      e.preventDefault();
      handleCancelEdit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const location = useLocation();

  if (!user || location.pathname === "/discussions" || location.pathname === "/chat") return null;

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    const matchName = (u.name || "").toLowerCase().includes(q);
    const matchRole = (u.role || "").toLowerCase().includes(q);
    const matchDept = (u.department || "").toLowerCase().includes(q);
    const matchEmail = (u.email || "").toLowerCase().includes(q);
    const matchesSearch = !q || matchName || matchRole || matchDept || matchEmail;

    if (filterTab === "unread") {
      return matchesSearch && Number(u.unread_count) > 0;
    }
    return matchesSearch;
  });

  const currentUserInitials = getInitials(user?.name || user?.email);
  const currentUserColor = getAvatarColor(user?.email || user?.name || "Z");

  return (
    <div className="linkedin-chat-container" aria-label="Messaging Widget">
      {/* ---------------- ACTIVE CHAT WINDOW (POPS UP TO THE LEFT OF MESSAGING BAR) ---------------- */}
      {activeColleague && (
        <div className={`linkedin-chat-window ${isChatMinimized ? "minimized" : ""}`}>
          {/* Chat Window Header */}
          <div
            className="chat-window-header"
            onClick={() => isChatMinimized && setIsChatMinimized(false)}
          >
            <div className="chat-window-user">
              <div
                className="chat-avatar-small"
                style={{
                  backgroundColor: getAvatarColor(activeColleague.email || activeColleague.name).bg,
                  color: getAvatarColor(activeColleague.email || activeColleague.name).text,
                }}
              >
                {getInitials(activeColleague.name)}
                <span className="online-status-dot active"></span>
              </div>
              <div className="chat-user-meta">
                <span className="chat-user-name" title={activeColleague.name}>
                  {activeColleague.name}
                </span>
                <span className="chat-user-status">
                  {activeColleague.role
                    ? `${activeColleague.role.charAt(0).toUpperCase() + activeColleague.role.slice(1)}`
                    : "Colleague"}
                  {activeColleague.department ? ` • ${activeColleague.department}` : ""}
                </span>
              </div>
            </div>

            {/* Header controls */}
            <div className="chat-window-controls" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="chat-ctrl-btn"
                title={isChatMinimized ? "Expand" : "Minimize"}
                onClick={handleToggleMinimizeChat}
                aria-label="Minimize or Expand Chat"
              >
                {isChatMinimized ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="chat-ctrl-btn"
                title="Close Chat"
                onClick={handleCloseChat}
                aria-label="Close Chat Window"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Chat Window Body (Messages & Input) */}
          {!isChatMinimized && (
            <>
              <div className="chat-messages-body">


                {loadingMessages && messages.length === 0 ? (
                  <div className="chat-loading-state">
                    <div className="chat-spinner"></div>
                    <span>Loading conversation...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-empty-state">
                    <div className="chat-empty-icon">💬</div>
                    <p>No messages yet.</p>
                    <span>Say hello to {activeColleague.name}!</span>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isMe = Number(msg.sender_id) === Number(currentUserId);
                    const isDeleted = Boolean(msg.is_deleted);
                    const isEdited = Boolean(msg.is_edited);

                    return (
                      <div
                        key={msg.id || idx}
                        className={`chat-bubble-row ${isMe ? "outgoing" : "incoming"}`}
                      >
                        {!isMe && (
                          <div
                            className="chat-bubble-avatar"
                            style={{
                              backgroundColor: getAvatarColor(activeColleague.email || activeColleague.name).bg,
                              color: getAvatarColor(activeColleague.email || activeColleague.name).text,
                            }}
                            title={activeColleague.name}
                          >
                            {getInitials(activeColleague.name)}
                          </div>
                        )}
                        <div className="chat-bubble-wrapper">
                          <div className="chat-bubble-container">
                            {isDeleted ? (
                              <div className={`chat-bubble deleted ${isMe ? "bubble-outgoing" : "bubble-incoming"}`}>
                                <svg className="chat-deleted-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                </svg>
                                <span>{isMe ? "You deleted this message" : "This message was deleted"}</span>
                              </div>
                            ) : (
                              <>
                                <div className={`chat-bubble ${isMe ? "bubble-outgoing" : "bubble-incoming"}`}>
                                  {renderMessageWithLinks(msg.message_text)}
                                </div>
                                <button
                                  type="button"
                                  className={`chat-bubble-action-btn ${activeMenuMsgId === msg.id ? "active" : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuMsgId(activeMenuMsgId === msg.id ? null : msg.id);
                                  }}
                                  title="Message options"
                                  aria-label="Message options"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                </button>
                              </>
                            )}

                            {/* Dropdown Menu (WhatsApp style) */}
                            {activeMenuMsgId === msg.id && !isDeleted && (
                              <div
                                className={`chat-context-menu ${isMe ? "outgoing" : "incoming"}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isMe && (
                                  <button
                                    type="button"
                                    className="chat-context-item"
                                    onClick={() => handleStartEdit(msg)}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    <span>Edit</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="chat-context-item"
                                  onClick={() => handleCopyMessage(msg.message_text)}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                  <span>Copy</span>
                                </button>
                                {(isMe || user?.role === "admin") && (
                                  <button
                                    type="button"
                                    className="chat-context-item danger"
                                    onClick={() => handleDeleteMessage(msg.id)}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                    <span>Delete for everyone</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="chat-bubble-meta">
                            <span className="chat-bubble-time">
                              {formatMessageTimestamp(msg.created_at)}
                            </span>
                            {isEdited && !isDeleted && (
                              <span className="chat-edited-label">• edited</span>
                            )}
                            {isMe && !isDeleted && (
                              <span className="chat-read-tick" title={msg.is_read ? "Read" : "Sent"}>
                                {msg.is_read ? "✓✓" : "✓"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer Footer */}
              <div className="chat-composer-container">
                {editingMessage && (
                  <div className="chat-widget-edit-bar">
                    <div className="chat-widget-edit-bar-left">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      <div className="chat-widget-edit-text">
                        <span className="chat-widget-edit-title">Editing</span>
                        <span className="chat-widget-edit-snippet">{editingMessage.message_text}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="chat-widget-edit-close"
                      onClick={handleCancelEdit}
                      title="Cancel editing (Esc)"
                    >
                      ×
                    </button>
                  </div>
                )}
                <form className="chat-composer" onSubmit={handleSendMessage}>
                  <textarea
                    ref={chatInputRef}
                    className="chat-composer-input"
                    placeholder={editingMessage ? "Edit message..." : `Message ${activeColleague.name.split(" ")[0]}...`}
                    rows={1}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    type="submit"
                    className={`chat-send-btn ${inputMessage.trim() ? "active" : ""}`}
                    disabled={!inputMessage.trim() || sending}
                    title={editingMessage ? "Save edit (Enter)" : "Send (Enter)"}
                    aria-label={editingMessage ? "Save edit" : "Send message"}
                  >
                    {editingMessage ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    )}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------- MAIN MESSAGING DOCKED BAR / DRAWER ---------------- */}
      <div className={`linkedin-messaging-dock ${isOpen ? "open" : "collapsed"}`}>
        {/* Dock Header Bar */}
        <div
          className="messaging-dock-header"
          onClick={() => setIsOpen((prev) => !prev)}
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
        >
          <div className="dock-header-left">
            <div
              className="dock-user-avatar"
              style={{ backgroundColor: currentUserColor.bg, color: currentUserColor.text }}
            >
              {currentUserInitials}
              <span className="dock-online-dot"></span>
            </div>
            <span className="dock-title">Messaging</span>
            {unreadTotal > 0 && (
              <span className="dock-unread-badge" title={`${unreadTotal} unread messages`}>
                {unreadTotal > 99 ? "99+" : unreadTotal}
              </span>
            )}
          </div>

          <div className="dock-header-right" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="dock-toggle-btn"
              onClick={() => setIsOpen((prev) => !prev)}
              aria-label={isOpen ? "Collapse Messaging" : "Expand Messaging"}
              title={isOpen ? "Collapse" : "Expand"}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`chevron-icon ${isOpen ? "rotate-down" : "rotate-up"}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Dock Content Body (Search, Filter, Colleagues List) */}
        {isOpen && (
          <div className="messaging-dock-body">
            {/* Search Bar */}
            <div className="messaging-search-wrapper">
              <span className="messaging-search-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                className="messaging-search-input"
                placeholder="Search colleagues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="messaging-filter-tabs">
              <button
                type="button"
                className={`filter-tab-btn ${filterTab === "all" ? "active" : ""}`}
                onClick={() => setFilterTab("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-tab-btn ${filterTab === "unread" ? "active" : ""}`}
                onClick={() => setFilterTab("unread")}
              >
                Unread
                {unreadTotal > 0 && <span className="tab-unread-pill">{unreadTotal}</span>}
              </button>
            </div>

            {/* Conversations List */}
            <div className="messaging-conversations-list">
              {loadingUsers && users.length === 0 ? (
                <div className="conversations-loading">
                  <div className="chat-spinner"></div>
                  <span>Loading colleagues...</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="conversations-empty">
                  {searchQuery ? (
                    <p>No colleagues match "{searchQuery}"</p>
                  ) : filterTab === "unread" ? (
                    <p>No unread conversations</p>
                  ) : (
                    <p>No other colleagues found.</p>
                  )}
                </div>
              ) : (
                filteredUsers.map((colleague) => {
                  const avatarColor = getAvatarColor(colleague.email || colleague.name);
                  const isCurrentActive = activeColleague?.id === colleague.id;
                  const hasUnread = Number(colleague.unread_count) > 0;
                  const isSentByMe = Number(colleague.last_message_sender_id) === Number(currentUserId);

                  return (
                    <div
                      key={colleague.id}
                      className={`conversation-item ${isCurrentActive ? "active" : ""} ${hasUnread ? "unread" : ""}`}
                      onClick={() => handleSelectColleague(colleague)}
                    >
                      {/* Avatar */}
                      <div
                        className="colleague-avatar"
                        style={{ backgroundColor: avatarColor.bg, color: avatarColor.text }}
                      >
                        {getInitials(colleague.name)}
                        <span className="online-indicator active"></span>
                      </div>

                      {/* Info & Snippet */}
                      <div className="colleague-info">
                        <div className="colleague-top-row">
                          <span className="colleague-name">{colleague.name}</span>
                          {colleague.last_message_at && (
                            <span className="colleague-time">
                              {formatChatTime(colleague.last_message_at)}
                            </span>
                          )}
                        </div>

                        <div className="colleague-sub-row">
                          <span className="colleague-role">
                            {colleague.role === "admin" ? "Admin" : "Employee"}
                            {colleague.position ? ` • ${colleague.position}` : ""}
                          </span>
                        </div>

                        <div className="colleague-preview-row">
                          <span className={`colleague-snippet ${hasUnread ? "bold" : ""}`}>
                            {colleague.last_message ? (
                              <>
                                {isSentByMe && <span className="snippet-you">You: </span>}
                                {colleague.last_message}
                              </>
                            ) : (
                              <span className="snippet-new">Start conversation</span>
                            )}
                          </span>

                          {hasUnread && (
                            <span className="colleague-unread-count">
                              {colleague.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
