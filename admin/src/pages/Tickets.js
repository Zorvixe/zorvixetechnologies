// src/pages/Tickets.js
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  apiListTickets,
  apiCreateTicket,
  apiGetTicket,
  apiUpdateTicket,
  apiCreateTicketComment,
  apiUpdateTicketComment,
  apiDeleteTicketComment,
  apiGetUsersForAssignment,
  apiDeleteTicket,
} from "../api";
import { useAuth } from "../auth";
import "./Tickets.css";

import { useParams, useNavigate, useLocation } from "react-router-dom";
import useDeepLinkHandler from "../deeplink/useDeepLinkHandler";

// Function to detect URLs and convert them to clickable links
const linkifyText = (text) => {
  if (!text) return text;
  
  // Regular expression to match URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  // Split text into parts, keeping URLs as separate elements
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <a 
          key={index}
          href={part} 
          target="_blank" 
          rel="noopener noreferrer"
          className="comment-link"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

/* ------------------------- Bootstrap Modal Wrapper ------------------------- */
function BootstrapModal({
  open,
  title,
  onClose,
  children,
  dialogClassName = "",
  scrollable = false,
  centered = true,
}) {
  const overlayRef = useRef(null);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") onClose?.();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", onKeyDown);
      document.body.classList.add("modal-open");
      const bd = document.createElement("div");
      bd.className = "modal-backdrop fade show";
      document.body.appendChild(bd);
      return () => {
        document.removeEventListener("keydown", onKeyDown);
        document.body.classList.remove("modal-open");
        const found = document.querySelector(".modal-backdrop");
        if (found) found.remove();
      };
    }
  }, [open, onKeyDown]);

  if (!open) return null;

  const closeOnBackdrop = (e) => {
    if (e.target === overlayRef.current) onClose?.();
  };

  return (
    <div
      className="modal fade show"
      style={{ display: "block" }}
      tabIndex="-1"
      aria-modal="true"
      role="dialog"
      ref={overlayRef}
      onMouseDown={closeOnBackdrop}
    >
      <div
        className={[
          "modal-dialog",
          centered ? "modal-dialog-centered" : "",
          scrollable ? "modal-dialog-scrollable" : "",
          dialogClassName,
        ].join(" ").trim()}
      >
        <div className="modal-content">
          {title !== undefined && (
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={onClose}
              />
            </div>
          )}
          <div className="modal-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ User Avatar ------------------------------- */
const UserAvatar = ({ name = "U", size = 40 }) => {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#F9A826",
    "#6A5ACD",
    "#FFA5A5",
    "#77DD77",
    "#836953",
    "#CF9FFF",
    "#FDFD96",
    "#FFB347",
    "#B19CD9",
  ];
  const bg = colors[Math.abs(hash) % colors.length];

  return (
    <div
      className="user-avatar"
      style={{
        width: size,
        height: size,
        background: bg,
        fontWeight: "bold",
        fontSize: size * 0.4,
      }}
      title={name}
    >
      {initials}
    </div>
  );
};

/* -------------------------------- Tickets --------------------------------- */
export default function Tickets() {
  const { user } = useAuth();
  const { id: routeTicketId } = useParams(); // will be present when URL is /tickets/:id
  const navigate = useNavigate();
  const location = useLocation();

  const [allTickets, setAllTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    status: "all",
    priority: "all",
    search: "",
  });

  // toast
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
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, []);

  // For assignment dropdowns
  const [users, setUsers] = useState([]);

  // Modals state
  const [showCreate, setShowCreate] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // Selected ticket (for view/edit)
  const [selectedTicket, setSelectedTicket] = useState(null);

  // Create form state
  const [newTicket, setNewTicket] = useState({
    title: "",
    description: "",
    priority: "medium",
    assigned_to: "",
  });

  // Edit form state
  const [editData, setEditData] = useState({
    title: "",
    description: "",
    status: "open",
    priority: "medium",
    assigned_to: "",
  });

  const canManageTicket = (t) =>
    !!user &&
    (t?.creator_id === user.id || user.role === "admin" || t?.creator?.id === user.id);

  useEffect(() => {
    fetchTickets();
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply filters whenever filters or allTickets change
  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, allTickets]);

  // If URL contains /tickets/:id, open the view modal for that ticket
  useEffect(() => {
    if (routeTicketId) {
      openViewModal(routeTicketId, { pushHistory: false });
    } else {
      // if no id in route and modal open, close it
      setShowView(false);
      setSelectedTicket(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeTicketId]);

  const applyFilters = () => {
    let results = [...allTickets];

    // Apply status filter
    if (filters.status !== "all") {
      results = results.filter(ticket => ticket.status === filters.status);
    }

    // Apply priority filter
    if (filters.priority !== "all") {
      results = results.filter(ticket => ticket.priority === filters.priority);
    }

    // Apply search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      results = results.filter(ticket =>
        (ticket.title || "").toLowerCase().includes(searchTerm) ||
        (ticket.description || "").toLowerCase().includes(searchTerm) ||
        (ticket.creator_name || "").toLowerCase().includes(searchTerm) ||
        (ticket.assignee_name || "").toLowerCase().includes(searchTerm) ||
        (ticket.status || "").toLowerCase().includes(searchTerm) ||
        (ticket.priority || "").toLowerCase().includes(searchTerm)
      );
    }

    setFilteredTickets(results);
  };

  const fetchUsers = async () => {
    try {
      const data = await apiGetUsersForAssignment();
      if (data?.success) setUsers(data.users || []);
    } catch (e) {
      console.error("fetchUsers error", e);
    }
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await apiListTickets();
      setAllTickets(data.tickets || []);
    } catch (e) {
      console.error("fetchTickets error", e);
    } finally {
      setLoading(false);
    }
  };

 const openViewModal = async (id, { pushHistory = true } = {}) => {
  if (!id) return;
  try {
    // optionally push URL so route matches the modal
    if (pushHistory) {
      navigate(`/tickets/${id}`, { replace: false });
    }

    const data = await apiGetTicket(id);
    if (data?.success) {
      setSelectedTicket({ ...data.ticket, comments: data.comments || [] });
      setShowView(true);
    } else {
      // fallback - set selected from cached list if exists
      const cached = allTickets.find(t => String(t.id) === String(id));
      if (cached) {
        setSelectedTicket({ ...cached, comments: [] });
        setShowView(true);
      }
    }
  } catch (e) {
    console.error("openViewModal error", e);
  }
};


  const openEditFromCard = async (id, e) => {
    e?.stopPropagation();
    try {
      const data = await apiGetTicket(id);
      if (data?.success) {
        const t = data.ticket;
        setSelectedTicket({ ...t, comments: data.comments || [] });

        setEditData({
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          assigned_to: t.assigned_to || "",
        });
        setShowEdit(true);
        // reflect URL too
        navigate(`/tickets/${id}`, { replace: false });
      }
    } catch (e) {
      console.error("openEditFromCard error", e);
    }
  };

  const deleteTicket = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm("Delete this ticket? This cannot be undone.")) return;
    try {
      const res = await apiDeleteTicket(id);
      if (res?.success) {
        if (selectedTicket?.id === id) {
          setShowView(false);
          setShowEdit(false);
          setSelectedTicket(null);
          navigate("/tickets");
        }
        await fetchTickets();
      }
      showToast("Ticket Deleted", "success");
    } catch (e) {
      console.error("deleteTicket error", e);
      showToast("Ticket Delete Failed");
    }
  };

  /* --------------------------- Create Ticket Submit -------------------------- */
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      title: newTicket.title.trim(),
      description: newTicket.description.trim(),
      priority: newTicket.priority,
      assigned_to: newTicket.assigned_to || null,
    };
    if (!payload.title || !payload.description) return;

    try {
      const res = await apiCreateTicket(payload);
      if (res?.success) {
        setShowCreate(false);
        setNewTicket({ title: "", description: "", priority: "medium", assigned_to: "" });
        fetchTickets();
      }
      showToast("Ticket Created", "success");
    } catch (e) {
      console.error("handleCreateSubmit error", e);
      showToast("Ticket Create Failed", "error");
    }
  };

  /* ----------------------------- Edit Ticket Submit ---------------------------- */
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    try {
      const res = await apiUpdateTicket(selectedTicket.id, {
        ...editData,
        assigned_to: editData.assigned_to || null,
      });
      if (res?.success) {
        setShowEdit(false);
        await fetchTickets();
        await openViewModal(selectedTicket.id, { pushHistory: false });
      }
      showToast("Ticket Updated", "success");
    } catch (e) {
      console.error("handleEditSubmit error", e);
      showToast("Ticket Updated Failed", "error");
    }
  };

  return (
    <div className="tickets-container">
      <div className="tickets-header">
        <h5>Tickets</h5>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreate(true)}
          aria-haspopup="dialog"
        >
          New Ticket
        </button>
      </div>

      {/* Filters */}
      <div className="tickets-filters">
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <select
          value={filters.priority}
          onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
        >
          <option value="all">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>

        <input
          type="text"
          placeholder="Search tickets (title, description, creator, assignee, status, priority)..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="comment-input"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="loader_container">
          <p className="loader_spinner"></p>
          <p>Loading Tickets…</p>
        </div>
      ) : (
        <div className="tickets-list">
          {filteredTickets.length === 0 ? (
            <div className="no-comments">
              <p>No tickets found. {filters.search ? "Try a different search." : "Create the first one!"}</p>
            </div>
          ) : (
            filteredTickets.map((ticket) => {
              const manageable = canManageTicket(ticket);
              return (
                <div
                  key={ticket.id}
                  className="ticket-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => openViewModal(ticket.id)}
                  onKeyDown={(e) => (e.key === "Enter" ? openViewModal(ticket.id) : null)}
                >
                  {/* Hover action buttons (edit/delete) */}
                  {manageable && (
                    <div className="ticket-action-buttons">
                      <button
                        className="btn-link edit-btn"
                        title="Edit ticket"
                        onClick={(e) => openEditFromCard(ticket.id, e)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                      <button
                        className="btn-link delete-btn"
                        title="Delete ticket"
                        onClick={(e) => deleteTicket(ticket.id, e)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Header: Left + Right */}
                  <div className="ticket-header">
                    {/* LEFT */}
                    <div className="ticket-left">
                      <span style={{ marginLeft: 8, fontWeight: "bold", backgroundColor: "#1e90ff", color: "#fff", borderRadius: "8px", paddingLeft: "5px", paddingRight: "5px" }} > {ticket.id}</span>
                      <UserAvatar name={ticket.creator_name} />

                      <h4 className="ticket-creator">{ticket.creator_name}</h4>

                      <div className="ticket-meta">
                        {/* comment count */}
                        <span className="ticket-meta-item" title="Comments">
                          <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path
                              d="M20 2H4a2 2 0 0 0-2 2v13.5A1.5 1.5 0 0 0 3.5 19H6l3.6 3.2a1 1 0 0 0 1.4 0L14 19h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"
                              fill="currentColor"
                            />
                          </svg>
                          <span>{Number(ticket.comment_count || 0)}</span>
                        </span>

                        {/* last updated */}
                        <span className="ticket-meta-item" title="Last updated">
                          <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path
                              d="M12 1.75a10.25 10.25 0 1 0 0 20.5 10.25 10.25 0 0 0 0-20.5Zm.75 5.5a.75.75 0 0 0-1.5 0v5.25c0 .2.08.39.22.53l3.5 3.5a.75.75 0 0 0 1.06-1.06l-3.28-3.28V7.25Z"
                              fill="currentColor"
                            />
                          </svg>
                          <time dateTime={new Date(ticket.updated_at).toISOString()}>
                            {new Date(ticket.updated_at).toLocaleString()}
                          </time>
                        </span>
                      </div>
                    </div>

                    {/* RIGHT */}
                    <div className="ticket-right">
                      {ticket.assignee_name && (
                        <span className="ticket-assignee" title="Assigned to">
                          <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path
                              d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c-5.33 0-8 2.67-8 6v1h16v-1c0-3.33-2.67-6-8-6Z"
                              fill="currentColor"
                            />
                          </svg>
                          <span className="ticket-assignee-name">{ticket.assignee_name}</span>
                        </span>
                      )}
                      <span className={`ticket-status ${ticket.status}`}>{ticket.status}</span>
                      <span className={`ticket-priority ${ticket.priority}`}>{ticket.priority}</span>
                    </div>
                  </div>

                  {/* Bottom: title + description */}
                  <div className="ticket-body">
                    <h4 className="ticket-title">{ticket.title}</h4>
                    <p className="ticket-description">
                      {(ticket.description || "").length > 100
                        ? `${(ticket.description || "").substring(0, 100)}…`
                        : ticket.description || ""}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* --------------------------- Create Ticket Modal --------------------------- */}
      <BootstrapModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create New Ticket"
        centered
        scrollable={false}
      >
        <form onSubmit={handleCreateSubmit} className="ticket-form">
          <div className="form-group">
            <label htmlFor="new-title">Title</label>
            <input
              id="new-title"
              type="text"
              className="comment-input"
              value={newTicket.title}
              onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="new-desc">Description</label>
            <textarea
              id="new-desc"
              rows="4"
              className="comment-input"
              value={newTicket.description}
              onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="new-priority">Priority</label>
            <select
              id="new-priority"
              className="comment-input"
              value={newTicket.priority}
              onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="new-assignee">Assign To</label>
            <select
              id="new-assignee"
              className="comment-input"
              value={newTicket.assigned_to}
              onChange={(e) => setNewTicket({ ...newTicket, assigned_to: e.target.value })}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Create
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      </BootstrapModal>

      {/* ---------------------------- View Ticket Modal --------------------------- */}
      <ViewTicketModal
        open={showView}
        onClose={() => {
          setShowView(false);
          setSelectedTicket(null);
          // when modal closes, remove ticket id from URL
          navigate("/tickets", { replace: false });
        }}
        ticket={selectedTicket}
        canManage={!!selectedTicket && (selectedTicket.created_by === user.id || user.role === "admin")}
        openEdit={() => openEditFromCard(selectedTicket?.id)}
        onDelete={() => deleteTicket(selectedTicket?.id)}
      />

      {/* ---------------------------- Edit Ticket Modal --------------------------- */}
      <BootstrapModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit Ticket"
        centered
        scrollable={false}
        dialogClassName="modal-lg"
      >
        <form onSubmit={handleEditSubmit} className="ticket-form">
          <div className="form-group">
            <label>Title</label>
            <input
              className="comment-input"
              value={editData.title}
              onChange={(e) => setEditData({ ...editData, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              rows="4"
              className="comment-input"
              value={editData.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select
              className="comment-input"
              value={editData.status}
              onChange={(e) => setEditData({ ...editData, status: e.target.value })}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select
              className="comment-input"
              value={editData.priority}
              onChange={(e) => setEditData({ ...editData, priority: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="form-group">
            <label>Assign To</label>
            <select
              className="comment-input"
              value={editData.assigned_to}
              onChange={(e) => setEditData({ ...editData, assigned_to: e.target.value })}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Save Changes
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowEdit(false)}>
              Cancel
            </button>
          </div>
        </form>
      </BootstrapModal>

      <div className={`toastx ${toast.type} ${toast.open ? 'show' : ''}`} role="status" aria-live="polite">
        <div className="toastx-icon">
          {toast.type === 'success' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
          )}
        </div>
        <div className="toastx-body">
          <div className="toastx-title">{toast.type === 'success' ? 'Success' : 'Error'}</div>
          <div className="toastx-msg">{toast.message}</div>
        </div>
        <button className="toastx-close" onClick={hideToast} aria-label="Close">×</button>
      </div>
    </div>
  );
}

/* ---------------------------- View Ticket Modal ---------------------------- */
function ViewTicketModal({ open, onClose, ticket, canManage, openEdit, onDelete }) {
  const { user } = useAuth();
  const [comments, setComments] = useState(ticket?.comments || []);
  const [newComment, setNewComment] = useState("");
  const [viewLoading, setViewLoading] = useState(false);

  useDeepLinkHandler({
    resourceType: "ticket",
    resourceId: ticket ? ticket.id : null,
    whenLoaded: () => !viewLoading && Array.isArray(comments),
  });

  useEffect(() => {
    setViewLoading(true);
    setComments(ticket?.comments || []);
    setNewComment("");
    setViewLoading(false);
  }, [ticket]);

  // toast
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
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, []);

  if (!ticket) return null;

  const addComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setViewLoading(true);
    try {
      const res = await apiCreateTicketComment(ticket.id, { comment_text: newComment });
      if (res?.success) {
        setComments([...comments, res.comment]);
        setNewComment("");
        showToast("Comment added", "success");
      }
    } catch (e) {
      console.error("addComment error", e);
      showToast("Failed to add comment", "error");
    } finally {
      setViewLoading(false);
    }
  };

  const deleteComment = async (id) => {
    if (!window.confirm("Delete this comment?")) return;
    setViewLoading(true);
    try {
      await apiDeleteTicketComment(id);
      setComments(comments.filter((c) => c.id !== id));
      showToast("Comment deleted", "success");
    } catch (e) {
      console.error("deleteComment error", e);
      showToast("Failed to delete comment", "error");
    } finally {
      setViewLoading(false);
    }
  };

  const updateComment = async (id, text) => {
    setViewLoading(true);
    try {
      await apiUpdateTicketComment(id, { comment_text: text });
      setComments(comments.map((c) =>
        c.id === id ? { ...c, comment_text: text, updated_at: new Date() } : c
      ));
      showToast("Comment updated", "success");
    } catch (e) {
      console.error("updateComment error", e);
      showToast("Failed to update comment", "error");
    } finally {
      setViewLoading(false);
    }
  };

  const isCommentManageable = (c) =>
    !!user && (c.user_id === user.id || user.role === "admin");

  return viewLoading ? (
    <div className="loader_container">
      <p className="loader_spinner"></p>
      <p>Loading…</p>
    </div>
  ) : (
    <BootstrapModal
      open={open}
      onClose={onClose}
      title="Ticket Details"
      centered
      scrollable
      dialogClassName="modal-xl"
    >
      <div className="ticket-info hover-frame">
        {canManage && (
          <div className="ticket-action-buttons in-modal">
            <button className="btn-link edit-btn" title="Edit ticket" onClick={openEdit}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button className="btn-link delete-btn" title="Delete ticket" onClick={onDelete}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        )}

        <h4 style={{ marginTop: 5, marginBottom: 5 }}>{ticket.title}</h4>
        <div className="ticket-meta" style={{ marginBottom: 8, marginTop: 5 }}>
          <span className={`ticket-status ${ticket.status}`}>{ticket.status}</span>
          <span className={`ticket-priority ${ticket.priority}`}>{ticket.priority}</span>
          <span>Created by: {ticket.creator_name}</span>
          {ticket.assignee_name && <span><svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c-5.33 0-8 2.67-8 6v1h16v-1c0-3.33-2.67-6-8-6Z"
              fill="currentColor"
            />
          </svg> {ticket.assignee_name}</span>}
          <span><svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M12 1.75a10.25 10.25 0 1 0 0 20.5 10.25 10.25 0 0 0 0-20.5Zm.75 5.5a.75.75 0 0 0-1.5 0v5.25c0 .2.08.39.22.53l3.5 3.5a.75.75 0 0 0 1.06-1.06l-3.28-3.28V7.25Z"
              fill="currentColor"
            />
          </svg> {new Date(ticket.updated_at).toLocaleString()}</span>
        </div>
        {/* 🔽 updated to use linkifyText like CommentItem */}
        <p className="ticket-description">{linkifyText(ticket.description)}</p>
      </div>

      {/* Comments Section (unchanged) */}
      <div className="comments-section">
        <h3 className="comments-title">Discussion</h3>
        <form onSubmit={addComment} className="comment-form">
          <div className="form-group">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Reply a Ticket..."
              rows="3"
              className="comment-input"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Update Ticket
            </button>
          </div>
        </form>

        <div className="comments-list">
          {comments.length === 0 ? (
            <div className="no-comments">
              <p>No Tickets yet. Update your today's Task</p>
            </div>
          ) : (
            comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                isManageable={isCommentManageable(comment)}
                onDelete={deleteComment}
                onUpdate={updateComment}
              />
            ))
          )}
        </div>
      </div>

      <div className={`toastx ${toast.type} ${toast.open ? 'show' : ''}`} role="status" aria-live="polite">
        <div className="toastx-icon">
          {toast.type === 'success' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
          )}
        </div>
        <div className="toastx-body">
          <div className="toastx-title">{toast.type === 'success' ? 'Success' : 'Error'}</div>
          <div className="toastx-msg">{toast.message}</div>
        </div>
        <button className="toastx-close" onClick={hideToast} aria-label="Close">×</button>
      </div>
    </BootstrapModal>
  );
}


/* ------------------------------ Comment Item ------------------------------- */
function CommentItem({ comment, isManageable, onDelete, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.comment_text);

  const handleEdit = async () => {
    if (!editText.trim()) return;
    await onUpdate(comment.id, editText);
    setIsEditing(false);
  };

  return (
    <div className="comment hover-frame" id={`comment-${comment.id}`} tabIndex={-1}>
      <div className="comment-header">
        <div className="comment-author-info">
          <UserAvatar name={comment.user_name} />
          <div className="author-details">
            <div className="comment-author">{comment.user_name}</div>
            <div className="comment-meta">
              <span className="comment-date">{new Date(comment.created_at).toLocaleString()}</span>
              {comment.updated_at !== comment.created_at && (
                <span className="comment-edited">(edited)</span>
              )}
            </div>
          </div>
        </div>

        {isManageable && (
          <div className="comment-action-buttons">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="btn-link edit-btn"
                title="Edit comment"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={() => onDelete(comment.id)}
              className="btn-link delete-btn"
              title="Delete comment"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="comment-body">
        {isEditing ? (
          <div className="edit-form">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows="3"
              className="comment-input"
            />
            <div className="edit-actions">
              <button className="btn btn-primary btn-sm" onClick={handleEdit} disabled={!editText.trim()}>
                Save
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditText(comment.comment_text);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="comment_text">{linkifyText(comment.comment_text)}</p>
        )}
      </div>

    </div>
  );
}