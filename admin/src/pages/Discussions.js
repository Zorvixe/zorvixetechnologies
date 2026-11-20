import React, { useState, useEffect, useRef, useCallback } from "react";
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
import "./Discussions.css";

const getAvatarColor = (str = "") => {
  const colors = [
    { bg: "#0a66c2", text: "#ffffff" },
    { bg: "#057642", text: "#ffffff" },
    { bg: "#7c3aed", text: "#ffffff" },
    { bg: "#b45309", text: "#ffffff" },
    { bg: "#be185d", text: "#ffffff" },
    { bg: "#0f766e", text: "#ffffff" },
    { bg: "#1d4ed8", text: "#ffffff" },
    { bg: "#475569", text: "#ffffff" },
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

const getInitials = (name = "") => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

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

const formatMessageTimestamp = (dateString) => {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

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
          className="disc-link"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

export default function Discussions() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all");
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [activeColleague, setActiveColleague] = useState(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [editingMessage, setEditingMessage] = useState(null);
  const [activeMenuMsgId, setActiveMenuMsgId] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
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

  const fetchChatUsers = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const res = await apiGetChatUsers();
      if (res && res.users) {
        setUsers(res.users);
        // On desktop (> 768px), auto-select first user. On mobile, keep list view initially
        if (!activeColleague && res.users.length > 0) {
          if (typeof window !== "undefined" && window.innerWidth > 768) {
            setActiveColleague(res.users[0]);
          }
        }
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
      console.error("Discussions fetch error:", err);
    }
  }, [currentUserId, activeColleague]);

  const fetchActiveMessages = useCallback(async (colleagueId, silent = false) => {
    if (!colleagueId || !currentUserId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await apiGetChatMessages(colleagueId);
      if (res && res.messages) {
        setMessages(res.messages);
        if (res.messages.length > lastMsgCountRef.current) {
          // If silent polling brings in new incoming message, play chime!
          if (silent && lastMsgCountRef.current > 0) {
            const lastMsg = res.messages[res.messages.length - 1];
            if (lastMsg && Number(lastMsg.sender_id) !== Number(currentUserId)) {
              playNotificationSound();
            }
          }
          lastMsgCountRef.current = res.messages.length;
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 60);
        }
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    setLoadingUsers(true);
    fetchChatUsers().finally(() => setLoadingUsers(false));
  }, [currentUserId, fetchChatUsers]);

  // Polling loop
  useEffect(() => {
    if (!currentUserId) return;
    const interval = setInterval(() => {
      fetchChatUsers();
      if (activeColleague) {
        fetchActiveMessages(activeColleague.id, true);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [currentUserId, activeColleague, fetchChatUsers, fetchActiveMessages]);

  useEffect(() => {
    if (activeColleague) {
      lastMsgCountRef.current = 0;
      setEditingMessage(null);
      fetchActiveMessages(activeColleague.id);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 100);
      textareaRef.current?.focus();
    }
  }, [activeColleague, fetchActiveMessages]);

  const handleSelectColleague = (colleague) => {
    setActiveColleague(colleague);
    setMobileChatOpen(true);
    setEditingMessage(null);
    if (colleague.unread_count > 0) {
      setUsers((prev) =>
        prev.map((u) => (u.id === colleague.id ? { ...u, unread_count: 0 } : u))
      );
      setUnreadTotal((prev) => Math.max(0, prev - Number(colleague.unread_count)));
      apiMarkChatRead(colleague.id).catch(console.error);
    }
  };

  const handleStartEdit = (msg) => {
    setActiveMenuMsgId(null);
    setEditingMessage(msg);
    setInputMessage(msg.message_text || "");
    setTimeout(() => {
      textareaRef.current?.focus();
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

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const text = inputMessage.trim();
    if (!text || !activeColleague || sending) return;

    // Handle editing message
    if (editingMessage) {
      const targetId = editingMessage.id;
      setEditingMessage(null);
      setInputMessage("");
      setSending(true);

      // Optimistic edit
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

    // Normal message send
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
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? res.message : m))
        );
      }
      fetchChatUsers();
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert("Failed to send message.");
      setInputMessage(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape" && editingMessage) {
      e.preventDefault();
      handleCancelEdit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

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

  return (
    <div className="discussions-page">
      <div className={`discussions-card ${mobileChatOpen ? "mobile-chat-open" : "mobile-list-open"}`}>
        {/* LEFT COLUMN: Colleagues Sidebar */}
        <aside className="discussions-sidebar">
          <div className="disc-sidebar-header">
            <div className="disc-header-title">
              <h2>Messaging</h2>
              {unreadTotal > 0 && (
                <span className="disc-unread-badge">{unreadTotal}</span>
              )}
            </div>
            <div className="disc-search-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search colleagues..."
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
            <div className="disc-filter-row">
              <button
                type="button"
                className={`disc-filter-tab ${filterTab === "all" ? "active" : ""}`}
                onClick={() => setFilterTab("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`disc-filter-tab ${filterTab === "unread" ? "active" : ""}`}
                onClick={() => setFilterTab("unread")}
              >
                Unread {unreadTotal > 0 && `(${unreadTotal})`}
              </button>
            </div>
          </div>

          <div className="disc-users-list">
            {loadingUsers && users.length === 0 ? (
              <div className="disc-loading">Loading colleagues...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="disc-empty-search">No colleagues found.</div>
            ) : (
              filteredUsers.map((colleague) => {
                const color = getAvatarColor(colleague.email || colleague.name);
                const isSelected = activeColleague?.id === colleague.id;
                const hasUnread = Number(colleague.unread_count) > 0;
                const isSentByMe = Number(colleague.last_message_sender_id) === Number(currentUserId);

                return (
                  <div
                    key={colleague.id}
                    className={`disc-user-item ${isSelected ? "selected" : ""} ${hasUnread ? "has-unread" : ""}`}
                    onClick={() => handleSelectColleague(colleague)}
                  >
                    <div
                      className="disc-avatar"
                      style={{ backgroundColor: color.bg, color: color.text }}
                    >
                      {getInitials(colleague.name)}
                      <span className="disc-online-dot"></span>
                    </div>

                    <div className="disc-user-details">
                      <div className="disc-user-row1">
                        <span className="disc-user-name">{colleague.name}</span>
                        {colleague.last_message_at && (
                          <span className="disc-user-time">
                            {formatChatTime(colleague.last_message_at)}
                          </span>
                        )}
                      </div>
                      <div className="disc-user-role">
                        {colleague.role === "admin" ? "Admin" : "Employee"}
                        {colleague.position ? ` • ${colleague.position}` : ""}
                      </div>
                      <div className="disc-user-row2">
                        <span className={`disc-user-preview ${hasUnread ? "bold" : ""}`}>
                          {colleague.last_message ? (
                            <>
                              {isSentByMe && <span className="disc-you">You: </span>}
                              {colleague.last_message}
                            </>
                          ) : (
                            <span className="disc-new-prompt">Start conversation</span>
                          )}
                        </span>
                        {hasUnread && (
                          <span className="disc-badge-pill">{colleague.unread_count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN: Chat Conversation View */}
        <section className="discussions-main">
          {activeColleague ? (
            <>
              {/* Header */}
              <div className="disc-main-header">
                <button
                  type="button"
                  className="disc-mobile-back-btn"
                  onClick={() => setMobileChatOpen(false)}
                  aria-label="Back to conversations"
                  title="Back"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                  </svg>
                </button>
                <div
                  className="disc-main-avatar"
                  style={{
                    backgroundColor: getAvatarColor(activeColleague.email || activeColleague.name).bg,
                    color: getAvatarColor(activeColleague.email || activeColleague.name).text,
                  }}
                >
                  {getInitials(activeColleague.name)}
                  <span className="disc-online-dot"></span>
                </div>
                <div className="disc-main-header-info">
                  <h3>{activeColleague.name}</h3>
                  <p>
                    {activeColleague.position || (activeColleague.role === "admin" ? "Administrator" : "Team Member")}
                    {activeColleague.department ? ` • ${activeColleague.department}` : ""}
                    {" • Active"}
                  </p>
                </div>
              </div>

              {/* Messages scroll area */}
              <div className="disc-messages-area">


                {loadingMessages && messages.length === 0 ? (
                  <div className="disc-msg-loading">Loading...</div>
                ) : messages.length === 0 ? (
                  <div className="disc-msg-empty">
                    <span>No messages yet. Send a message below to start chatting!</span>
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const isMe = Number(msg.sender_id) === Number(currentUserId);
                    const isDeleted = Boolean(msg.is_deleted);
                    const isEdited = Boolean(msg.is_edited);

                    return (
                      <div
                        key={msg.id || i}
                        className={`disc-msg-row ${isMe ? "outgoing" : "incoming"}`}
                      >
                        {!isMe && (
                          <div
                            className="disc-msg-avatar"
                            style={{
                              backgroundColor: getAvatarColor(activeColleague.email || activeColleague.name).bg,
                              color: getAvatarColor(activeColleague.email || activeColleague.name).text,
                            }}
                          >
                            {getInitials(activeColleague.name)}
                          </div>
                        )}
                        <div className="disc-msg-wrapper">
                          <div className="disc-bubble-container">
                            {isDeleted ? (
                              <div className={`disc-bubble deleted ${isMe ? "outgoing" : "incoming"}`}>
                                <svg className="disc-deleted-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                </svg>
                                <span>{isMe ? "You deleted this message" : "This message was deleted"}</span>
                              </div>
                            ) : (
                              <>
                                <div className={`disc-bubble ${isMe ? "outgoing" : "incoming"}`}>
                                  {renderMessageWithLinks(msg.message_text)}
                                </div>
                                <button
                                  type="button"
                                  className={`disc-bubble-action-btn ${activeMenuMsgId === msg.id ? "active" : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuMsgId(activeMenuMsgId === msg.id ? null : msg.id);
                                  }}
                                  title="Message options"
                                  aria-label="Message options"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                </button>
                              </>
                            )}

                            {/* Dropdown Menu (WhatsApp style) */}
                            {activeMenuMsgId === msg.id && !isDeleted && (
                              <div
                                className={`disc-context-menu ${isMe ? "outgoing" : "incoming"}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isMe && (
                                  <button
                                    type="button"
                                    className="disc-context-item"
                                    onClick={() => handleStartEdit(msg)}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    <span>Edit</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="disc-context-item"
                                  onClick={() => handleCopyMessage(msg.message_text)}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                  <span>Copy</span>
                                </button>
                                {(isMe || user?.role === "admin") && (
                                  <button
                                    type="button"
                                    className="disc-context-item danger"
                                    onClick={() => handleDeleteMessage(msg.id)}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                    <span>Delete for everyone</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="disc-msg-time">
                            {formatMessageTimestamp(msg.created_at)}
                            {isEdited && !isDeleted && (
                              <span className="disc-edited-label">• edited</span>
                            )}
                            {isMe && !isDeleted && (
                              <span className="disc-read-status">
                                {msg.is_read ? " ✓✓" : " ✓"}
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

              {/* Message Composer Container */}
              <div className="disc-composer-container">
                {editingMessage && (
                  <div className="disc-edit-bar">
                    <div className="disc-edit-bar-left">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      <div className="disc-edit-bar-text">
                        <span className="disc-edit-bar-title">Editing Message</span>
                        <span className="disc-edit-bar-snippet">{editingMessage.message_text}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="disc-edit-bar-close"
                      onClick={handleCancelEdit}
                      title="Cancel editing (Esc)"
                    >
                      ×
                    </button>
                  </div>
                )}

                <form className="disc-composer" onSubmit={handleSendMessage}>
                  <textarea
                    ref={textareaRef}
                    className="disc-input"
                    placeholder={editingMessage ? "Edit message..." : `Message ${activeColleague.name.split(" ")[0]}...`}
                    rows={2}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    type="submit"
                    className={`disc-send-btn ${inputMessage.trim() ? "active" : ""}`}
                    disabled={!inputMessage.trim() || sending}
                    title={editingMessage ? "Save edit (Enter)" : "Send message (Enter)"}
                  >
                    {editingMessage ? (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Save</span>
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="disc-no-selection">
              <div className="disc-no-selection-icon">💬</div>
              <h3>Select a colleague to start chatting</h3>
              <p>Communicate easily with admins, employees, and team members in real-time.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
