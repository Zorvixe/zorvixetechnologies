import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { usePresence } from "../context/PresenceContext";
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
import RichTextEditor from "./RichTextEditor";
import { renderSafeHtml, stripHtmlText } from "../utils/safeHtml";
import { MessageSquareIcon, CheckIcon, CheckCheckIcon, UserIcon } from "./CrmHrmsIcons";
import { showToast } from "../utils/toast";
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

// Helper: safely render formatted chat messages
const renderMessageWithLinks = (text) => {
  if (!text) return "";
  return (
    <div
      className="chat-rich-body"
      dangerouslySetInnerHTML={{ __html: renderSafeHtml(text) }}
    />
  );
};

export default function LinkedInChatWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();

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

  // Zoho Cliq Presence & Status State (Synced System-Wide)
  const {
    presenceStatus,
    dndDuration,
    chatPrefs,
    updatePresence,
    updateDndDuration,
    updateChatPrefs,
    canPlaySound,
    toPresenceClass,
  } = usePresence();

  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const [showPresenceMenu, setShowPresenceMenu] = useState(false);
  const soundEnabled = chatPrefs.soundNotif;
  const oneOneChatsEnabled = chatPrefs.oneOneChats;
  const mentionsEnabled = chatPrefs.mentionNotif;
  const pauseChatEnabled = chatPrefs.pauseChat;
  const [cliqBottomTab, setCliqBottomTab] = useState("chats"); // 'pins' | 'chats' | 'contacts'
  const [isCliqMaximized, setIsCliqMaximized] = useState(false);

  // Swipe into device edge state (Mobile & Small Screen Space Optimization)
  const [isTucked, setIsTucked] = useState(() => {
    return localStorage.getItem("cliq_widget_tucked") === "true";
  });
  const [touchStartX, setTouchStartX] = useState(null);
  const [touchStartY, setTouchStartY] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleDockTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX);
      setTouchStartY(e.touches[0].clientY);
      setIsDragging(true);
      setDragOffset(0);
    }
  };

  const handleDockTouchMove = (e) => {
    if (!isDragging || touchStartX === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX;
    const deltaY = currentY - touchStartY;

    // Only track horizontal rightward swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
      setDragOffset(deltaX);
    }
  };

  const handleDockTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    // If swiped right by more than 40px, tuck to edge
    if (dragOffset > 40) {
      setIsTucked(true);
      setIsOpen(false);
      localStorage.setItem("cliq_widget_tucked", "true");
    }
    setDragOffset(0);
    setTouchStartX(null);
    setTouchStartY(null);
  };

  const handleTuckedTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX);
      setTouchStartY(e.touches[0].clientY);
      setIsDragging(true);
    }
  };

  const handleTuckedTouchMove = (e) => {
    if (!isDragging || touchStartX === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX;
    const deltaY = currentY - touchStartY;

    // Swiping left from edge untucks the widget
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < -25) {
      setIsTucked(false);
      localStorage.setItem("cliq_widget_tucked", "false");
      setIsDragging(false);
    }
  };

  const handleTuckedTouchEnd = () => {
    setIsDragging(false);
    setTouchStartX(null);
    setTouchStartY(null);
  };

  const handleStatusChange = (status) => {
    updatePresence(status, dndDuration);
    setShowPresenceMenu(false);
  };

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

  // 1. Fetch user list and unread count (respecting presence, sound, and pause settings)
  const fetchChatUsers = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const res = await apiGetChatUsers();
      if (res && res.users) {
        setUsers(res.users);
        setActiveColleague((prev) => {
          if (!prev) return prev;
          const updated = res.users.find((u) => Number(u.id) === Number(prev.id));
          return updated ? { ...prev, ...updated } : prev;
        });
      }
      const unreadRes = await apiGetChatUnreadCount();
      if (unreadRes && typeof unreadRes.total_unread === "number") {
        if (
          lastUnreadTotalRef.current !== null &&
          unreadRes.total_unread > lastUnreadTotalRef.current &&
          canPlaySound() &&
          oneOneChatsEnabled
        ) {
          playNotificationSound();
        }
        lastUnreadTotalRef.current = unreadRes.total_unread;
        setUnreadTotal(unreadRes.total_unread);
      }
    } catch (err) {
      console.error("Error fetching chat users:", err);
    }
  }, [currentUserId, canPlaySound, oneOneChatsEnabled]);

  // 2. Fetch messages for active colleague
  const fetchActiveMessages = useCallback(async (colleagueId, silent = false) => {
    if (!colleagueId || !currentUserId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await apiGetChatMessages(colleagueId);
      if (res && res.messages) {
        setMessages(res.messages);
        // If message count increased, scroll down and play sound if incoming & allowed by presence/prefs
        if (res.messages.length > lastMsgCountRef.current) {
          if (silent && lastMsgCountRef.current > 0) {
            const lastMsg = res.messages[res.messages.length - 1];
            if (lastMsg && Number(lastMsg.sender_id) !== Number(currentUserId) && canPlaySound() && oneOneChatsEnabled) {
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
  }, [currentUserId, canPlaySound, oneOneChatsEnabled]);

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
      showToast("Failed to delete message.", "error");
      if (activeColleague) {
        fetchActiveMessages(activeColleague.id, true);
      }
    }
  };

  const handleCopyMessage = (text) => {
    setActiveMenuMsgId(null);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(stripHtmlText(text) || text);
    }
  };

  // Send message
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const plain = stripHtmlText(inputMessage);
    const text = inputMessage.trim();
    if (!plain || !text || !activeColleague || sending) return;

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
        showToast("Failed to edit message.", "error");
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
      showToast("Failed to send message. Please try again.", "error");
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
                <span
                  className={`online-status-dot ${toPresenceClass(activeColleague.effective_status || activeColleague.presence_status)}`}
                  title={activeColleague.effective_status || activeColleague.presence_status || "Offline"}
                ></span>
              </div>
              <div className="chat-user-meta">
                <span className="chat-user-name" title={activeColleague.name}>
                  {activeColleague.name}
                </span>
                <span className="chat-user-status">
                  {activeColleague.effective_status || activeColleague.presence_status || "Offline"}
                  {activeColleague.position ? ` • ${activeColleague.position}` : activeColleague.department ? ` • ${activeColleague.department}` : ""}
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
                    <div className="chat-empty-icon"><MessageSquareIcon size={28} /></div>
                    <p>No messages yet.</p>
                    <span>Say hello to {activeColleague.name}</span>
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
                              <span className="chat-read-tick" title={msg.is_read ? "Read" : "Sent"} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {msg.is_read ? <CheckCheckIcon size={12} /> : <CheckIcon size={12} />}
                              </span>
                            )}
                          </div>
                        </div>
                        {isMe && (
                          <div
                            className="chat-bubble-avatar chat-bubble-avatar-self"
                            style={{
                              backgroundColor: currentUserColor.bg,
                              color: currentUserColor.text,
                            }}
                            title={user?.name || user?.email || "You"}
                          >
                            {currentUserInitials !== "?" ? currentUserInitials : <UserIcon size={13} />}
                          </div>
                        )}
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
                        <span className="chat-widget-edit-snippet">{stripHtmlText(editingMessage.message_text)}</span>
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
                  <RichTextEditor
                    compact
                    className="chat-composer-editor"
                    inputRef={chatInputRef}
                    minHeight="40px"
                    maxHeight="96px"
                    aiFieldLabel="Quick Chat Message"
                    aiContext={{ recipient: activeColleague?.name }}
                    placeholder={editingMessage ? "Edit message" : `Message ${activeColleague.name.split(" ")[0]}`}
                    value={inputMessage}
                    onChange={(content) => setInputMessage(content)}
                    onKeyDown={handleKeyDown}
                    style={{ width: "100%", minWidth: 0 }}
                    footerContent={
                      <div className="chat-editor-footer">
                        <button
                          type="submit"
                          className={`chat-send-btn ${stripHtmlText(inputMessage) ? "active" : ""}`}
                          disabled={!stripHtmlText(inputMessage) || sending}
                          title={editingMessage ? "Save edit (Enter)" : "Send (Enter)"}
                          aria-label={editingMessage ? "Save edit" : "Send message"}
                        >
                          {editingMessage ? (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>Save</span>
                            </>
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                              </svg>
                              <span>Send</span>
                            </>
                          )}
                        </button>
                      </div>
                    }
                  />
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------- MAIN MESSAGING DOCKED BAR / DRAWER ---------------- */}
      {isTucked ? (
        <div
          className="cliq-tucked-edge-tab"
          onClick={() => {
            setIsTucked(false);
            localStorage.setItem("cliq_widget_tucked", "false");
          }}
          onTouchStart={handleTuckedTouchStart}
          onTouchMove={handleTuckedTouchMove}
          onTouchEnd={handleTuckedTouchEnd}
          role="button"
          tabIndex={0}
          title="Drag left or click to expand Zorvixe Chat"
        >
          <div className="cliq-tucked-content">
            <div
              className="cliq-tucked-avatar"
              style={{
                backgroundColor: currentUserColor.bg,
                color: currentUserColor.text,
              }}
            >
              {currentUserInitials}
              <span className={`dock-online-dot ${toPresenceClass(presenceStatus)}`}></span>
            </div>
            {unreadTotal > 0 && (
              <span className="cliq-tucked-badge">{unreadTotal}</span>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`linkedin-messaging-dock ${isOpen ? "open" : "collapsed"}`}
          style={
            isDragging && dragOffset > 0
              ? { transform: `translateX(${dragOffset}px)`, transition: 'none' }
              : {}
          }
          onTouchStart={handleDockTouchStart}
          onTouchMove={handleDockTouchMove}
          onTouchEnd={handleDockTouchEnd}
        >
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
                style={{ backgroundColor: currentUserColor.bg, color: currentUserColor.text, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStatusPopover(v => !v);
                }}
                title="Change Status & Notifications"
              >
                {currentUserInitials}
                <span className={`dock-online-dot ${toPresenceClass(presenceStatus)}`}></span>
              </div>
              <div
                className="dock-user-title-wrap"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStatusPopover(v => !v);
                }}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                title="Change Status"
              >
                <span className="dock-title">{user?.name || 'Messaging'}</span>
                <span className="dock-sub-status">
                  <span className={`status-dot ${toPresenceClass(presenceStatus)}`}></span>
                  {presenceStatus}
                </span>
              </div>
              {unreadTotal > 0 && (
                <span className="dock-unread-badge" title={`${unreadTotal} unread messages`}>
                  {unreadTotal > 99 ? "99+" : unreadTotal}
                </span>
              )}
            </div>

            {/* Zoho Cliq Presence & Status Popover (Matches Photos 1 & 2) */}
            {showStatusPopover && (
              <div className="cliq-status-popover" onClick={(e) => e.stopPropagation()}>
                {/* Window Header Bar matching Photos 1 & 2 */}
                <div className="cliq-popover-top-bar">
                  <div className="cliq-top-bar-left">
                    <span className="cliq-popover-user-icon">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <span className="cliq-top-bar-name">{user?.name || 'Golla Ekambaram'}</span>
                    <span className="cliq-top-bar-status">• {presenceStatus}</span>
                  </div>
                  <div className="cliq-top-bar-actions">
                    <button
                      type="button"
                      className="cliq-top-icon-btn"
                      title={isCliqMaximized ? "Restore" : "Expand"}
                      onClick={() => setIsCliqMaximized(v => !v)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    </button>
                    <button type="button" className="cliq-top-icon-btn cliq-close-btn" onClick={() => setShowStatusPopover(false)} title="Close">×</button>
                  </div>
                </div>

                {/* Center Profile Avatar & Name */}
                <div className="cliq-user-profile-center">
                  <div className="cliq-large-avatar-wrap">
                    <span className="cliq-avatar-initials">{currentUserInitials}</span>
                    <span className={`cliq-presence-dot ${toPresenceClass(presenceStatus)}`}></span>
                  </div>
                  <h4 className="cliq-user-name">{user?.name || user?.email || 'Golla Ekambaram'}</h4>
                </div>

                {/* Status Select Box */}
                <div className="cliq-status-dropdown-box">
                  <button
                    type="button"
                    className="cliq-status-select-btn"
                    onClick={() => setShowPresenceMenu(v => !v)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`cliq-presence-dot ${toPresenceClass(presenceStatus)}`} style={{ position: 'static', display: 'inline-block' }}></span>
                      <span style={{ fontWeight: 600 }}>{presenceStatus}</span>
                    </span>
                    <span className="cliq-caret">▾</span>
                  </button>

                  {showPresenceMenu && (
                    <div className="cliq-status-options-menu">
                      <div className="cliq-menu-label-italic">Default status</div>

                      <button
                        type="button"
                        className={`cliq-status-option ${presenceStatus === 'Available' ? 'selected' : ''}`}
                        onClick={() => handleStatusChange('Available')}
                      >
                        <div className="cliq-status-option-left">
                          <span className="cliq-presence-dot available" style={{ position: 'static' }}></span>
                          <div className="cliq-opt-text-wrap">
                            <span className="cliq-opt-title">Available</span>
                          </div>
                        </div>
                        {presenceStatus === 'Available' && <span className="cliq-checkmark"><CheckIcon size={13} /></span>}
                      </button>

                      <button
                        type="button"
                        className={`cliq-status-option ${presenceStatus === 'Away' ? 'selected' : ''}`}
                        onClick={() => handleStatusChange('Away')}
                      >
                        <div className="cliq-status-option-left">
                          <span className="cliq-presence-dot away" style={{ position: 'static' }}></span>
                          <div className="cliq-opt-text-wrap">
                            <span className="cliq-opt-title">Away</span>
                            <span className="cliq-opt-sub">Let others know you are on a break</span>
                          </div>
                        </div>
                        {presenceStatus === 'Away' && <span className="cliq-checkmark"><CheckIcon size={13} /></span>}
                      </button>

                      <button
                        type="button"
                        className={`cliq-status-option ${presenceStatus === 'Busy' ? 'selected' : ''}`}
                        onClick={() => handleStatusChange('Busy')}
                      >
                        <div className="cliq-status-option-left">
                          <span className="cliq-presence-dot busy" style={{ position: 'static' }}></span>
                          <div className="cliq-opt-text-wrap">
                            <span className="cliq-opt-title">Busy</span>
                            <span className="cliq-opt-sub">All notification sounds will be turned off</span>
                          </div>
                        </div>
                        {presenceStatus === 'Busy' && <span className="cliq-checkmark"><CheckIcon size={13} /></span>}
                      </button>

                      <button
                        type="button"
                        className={`cliq-status-option ${presenceStatus === 'Invisible' ? 'selected' : ''}`}
                        onClick={() => handleStatusChange('Invisible')}
                      >
                        <div className="cliq-status-option-left">
                          <span className="cliq-presence-dot invisible" style={{ position: 'static' }}></span>
                          <div className="cliq-opt-text-wrap">
                            <span className="cliq-opt-title">Invisible</span>
                            <span className="cliq-opt-sub">You'll appear offline</span>
                          </div>
                        </div>
                        {presenceStatus === 'Invisible' && <span className="cliq-checkmark"><CheckIcon size={13} /></span>}
                      </button>

                      <div className={`cliq-status-option dnd-row ${presenceStatus === 'Do not disturb' ? 'selected' : ''}`}>
                        <div
                          className="cliq-status-option-left"
                          onClick={() => handleStatusChange('Do not disturb')}
                          style={{ flex: 1, cursor: 'pointer' }}
                        >
                          <span className="cliq-presence-dot dnd" style={{ position: 'static' }}></span>
                          <div className="cliq-opt-text-wrap">
                            <span className="cliq-opt-title">Do not disturb</span>
                          </div>
                        </div>
                        <select
                          className="cliq-dnd-select"
                          value={dndDuration}
                          onChange={(e) => updateDndDuration(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="15 Mins">15 Mins</option>
                          <option value="30 Mins">30 Mins</option>
                          <option value="1 Hour">1 Hour</option>
                          <option value="2 Hours">2 Hours</option>
                          <option value="Until tomorrow">Until tomorrow</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Menu Items (Photos 1 & 2) */}
                <div className="cliq-action-menu-list">
                  <button
                    type="button"
                    className="cliq-action-menu-item"
                    onClick={() => {
                      setShowStatusPopover(false);
                      navigate('/login-history');
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    <span>Feed History</span>
                  </button>
                  <button
                    type="button"
                    className="cliq-action-menu-item"
                    onClick={() => {
                      setShowStatusPopover(false);
                      navigate('/account');
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                    <span>Settings</span>
                  </button>
                  <button
                    type="button"
                    className="cliq-action-menu-item"
                    onClick={() => {
                      setShowStatusPopover(false);
                      navigate('/discussions');
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                    <span>General</span>
                  </button>
                  <button
                    type="button"
                    className="cliq-action-menu-item"
                    onClick={() => updateChatPrefs({ pauseChat: !pauseChatEnabled })}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="10" y1="15" x2="10" y2="9" /><line x1="14" y1="15" x2="14" y2="9" /></svg>
                    <span>{pauseChatEnabled ? 'Resume chat here' : 'Pause chat here'}</span>
                  </button>
                </div>

                {/* Sound Notification Switches (Photos 1 & 2) */}
                <div className="cliq-settings-list">
                  <div className="cliq-toggle-row">
                    <span>Sound Notification</span>
                    <label className="cliq-switch">
                      <input
                        type="checkbox"
                        checked={soundEnabled}
                        onChange={(e) => updateChatPrefs({ soundNotif: e.target.checked })}
                      />
                      <span className="cliq-slider"></span>
                    </label>
                  </div>

                  <div className="cliq-toggle-row">
                    <span>One - One Chats</span>
                    <label className="cliq-switch">
                      <input
                        type="checkbox"
                        checked={oneOneChatsEnabled}
                        onChange={(e) => updateChatPrefs({ oneOneChats: e.target.checked })}
                      />
                      <span className="cliq-slider"></span>
                    </label>
                  </div>

                  <div className="cliq-toggle-row">
                    <span>Mention</span>
                    <label className="cliq-switch">
                      <input
                        type="checkbox"
                        checked={mentionsEnabled}
                        onChange={(e) => updateChatPrefs({ mentionNotif: e.target.checked })}
                      />
                      <span className="cliq-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="dock-header-right" onClick={(e) => e.stopPropagation()}>
              {/* Mobile / Small screen tuck-to-edge swipe button */}
              <button
                type="button"
                className="dock-swipe-hide-btn"
                onClick={() => {
                  setIsTucked(true);
                  setIsOpen(false);
                  localStorage.setItem("cliq_widget_tucked", "true");
                }}
                title="Swipe / Tuck into device edge to free up space"
                aria-label="Tuck into screen edge"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

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

          {/* Dock Content Body (Search, Filter, Colleagues List - Matches Photo 5) */}
          {isOpen && (
            <div className={`messaging-dock-body ${isCliqMaximized ? "maximized" : ""}`}>
              {/* Search Bar with @ and Star (Photo 5) */}
              <div className="messaging-search-wrapper cliq-search-wrapper">
                <span className="messaging-search-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <input
                  type="text"
                  className="messaging-search-input"
                  placeholder="Search (Ctrl + Space)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="cliq-search-quick-actions">
                  <button type="button" className="cliq-search-icon-btn" title="Mentions (@)">@</button>
                  <button type="button" className="cliq-search-icon-btn" title="Starred chats">★</button>
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
              </div>

              {/* Filter Tabs: Recent / Unread (Photo 5) */}
              <div className="messaging-filter-tabs cliq-tabs">
                <button
                  type="button"
                  className={`filter-tab-btn ${filterTab === "all" ? "active" : ""}`}
                  onClick={() => setFilterTab("all")}
                >
                  Recent
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

              {/* Conversations / Contacts / Pins List */}
              <div className="messaging-conversations-list cliq-conversations-list">
                {loadingUsers && users.length === 0 ? (
                  <div className="conversations-loading">
                    <div className="chat-spinner"></div>
                    <span>Loading colleagues...</span>
                  </div>
                ) : cliqBottomTab === 'pins' ? (
                  <div className="conversations-empty cliq-empty-state">
                    <p className="cliq-empty-text">No pinned chats yet. Star important conversations to view them here.</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  /* Empty state matching Photo 5 */
                  <div className="conversations-empty cliq-empty-state">
                    <div className="cliq-watermark-icon">
                      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#b0b7c3" strokeWidth="1.2">
                        <circle cx="12" cy="12" r="10" strokeDasharray="3 3" />
                        <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <p className="cliq-empty-text">
                      The conversations you have with people and teams will appear here. You can click on a Contact or a Channel to participate in a conversation.
                    </p>
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
                          <span
                            className={`online-indicator ${toPresenceClass(colleague.effective_status || colleague.presence_status)}`}
                            title={colleague.effective_status || colleague.presence_status || "Offline"}
                          ></span>
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
                              {colleague.effective_status || colleague.presence_status || "Offline"}
                              {colleague.position ? ` • ${colleague.position}` : colleague.role === "admin" ? " • Admin" : " • Employee"}
                            </span>
                          </div>

                          <div className="colleague-preview-row">
                            <span className={`colleague-snippet ${hasUnread ? "bold" : ""}`}>
                              {colleague.last_message ? (
                                <>
                                  {isSentByMe && <span className="snippet-you">You: </span>}
                                  {stripHtmlText(colleague.last_message)}
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

              {/* Floating Action Button (+) (Photo 5) */}
              <button
                type="button"
                className="cliq-fab-add-btn"
                title="Start conversation (+)"
                onClick={() => {
                  setCliqBottomTab("contacts");
                  if (filterTab !== "all") setFilterTab("all");
                }}
              >
                +
              </button>

              {/* Bottom Navigation Dock Bar (Photo 5) */}
              <div className="cliq-dock-footer">
                <button
                  type="button"
                  className={`cliq-footer-tab ${cliqBottomTab === 'pins' ? 'active' : ''}`}
                  onClick={() => setCliqBottomTab('pins')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14v-2l-2-3V6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v6l-2 3v2z" />
                  </svg>
                  <span>My Pins</span>
                </button>
                <button
                  type="button"
                  className={`cliq-footer-tab ${cliqBottomTab === 'chats' ? 'active' : ''}`}
                  onClick={() => setCliqBottomTab('chats')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Chats</span>
                </button>
                <button
                  type="button"
                  className={`cliq-footer-tab ${cliqBottomTab === 'contacts' ? 'active' : ''}`}
                  onClick={() => setCliqBottomTab('contacts')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span>Contacts</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
