// src/components/ProjectComments.jsx
import { useState, useEffect, useRef } from "react";
import {
  apiGetProjectComments,
  apiPostProjectComment,
  apiUpdateComment,
  apiDeleteComment,
} from "../api";

import useDeepLinkHandler from "../deeplink/useDeepLinkHandler";
import "./ProjectComment.css";

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

// Avatar component to display user initials
const UserAvatar = ({ name, size = 40 }) => {
  const getInitials = (name) =>
    (name || "")
      .split(" ")
      .map((word) => word[0] || "")
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const getColor = (name) => {
    let hash = 0;
    for (let i = 0; i < (name || "").length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
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
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div
      className="user-avatar"
      style={{
        width: size,
        height: size,
        backgroundColor: getColor(name || ""),
        fontSize: size * 0.4,
        fontWeight: "bold",
      }}
      title={name}
    >
      {getInitials(name || "")}
    </div>
  );
};

export default function ProjectComments({ projectId, isAdmin, currentUser }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [authError, setAuthError] = useState("");
  const mountedRef = useRef(true);

  // deep-link handler: ALWAYS call at top-level so hooks rules satisfied.
  useDeepLinkHandler({
    resourceType: "project",
    resourceId: projectId,
    // whenLoaded returns true when comments are loaded so the handler can try to scroll to the target
    whenLoaded: () => !loading && Array.isArray(comments),
  });

  useEffect(() => {
    mountedRef.current = true;
    fetchComments();
    return () => { mountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      setAuthError("");
      const data = await apiGetProjectComments(projectId);
      if (!mountedRef.current) return;
      if (data?.success && Array.isArray(data.comments)) {
        setComments(data.comments);
      } else if (!data?.success) {
        setAuthError(data?.message || "Failed to load comments");
        setComments([]);
      }
    } catch (err) {
      console.error("Error fetching comments:", err);
      if ((err.message || "").toLowerCase().includes("token") || (err.message || "").toLowerCase().includes("auth")) {
        setAuthError("You're not signed in or your session expired.");
      } else {
        setAuthError("Failed to load comments. Please try again.");
      }
      setComments([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const submitComment = async (e) => {
    e?.preventDefault?.();
    if (!newComment.trim()) return;
    try {
      setAuthError("");
      const data = await apiPostProjectComment(projectId, newComment);
      if (data?.success) {
        setNewComment("");
        await fetchComments();
        // focus the last comment (optional)
        setTimeout(() => {
          const last = comments[comments.length - 1];
          if (last) {
            const el = document.getElementById(`comment-${last.id}`);
            el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
            el?.focus?.();
          }
        }, 200);
      } else {
        throw new Error(data?.message || "Failed to post");
      }
    } catch (err) {
      console.error("Error posting comment:", err);
      if ((err.message || "").toLowerCase().includes("token") || (err.message || "").toLowerCase().includes("auth")) {
        setAuthError("You're not signed in or your session expired.");
      } else {
        setAuthError("Failed to post comment. Please try again.");
      }
    }
  };

  const submitReply = async (parentId) => {
    if (!replyText.trim()) return;
    try {
      setAuthError("");
      const data = await apiPostProjectComment(projectId, replyText, parentId);
      if (data?.success) {
        setReplyText("");
        setReplyingTo(null);
        await fetchComments();
        // optionally scroll to the new reply
      } else {
        throw new Error(data?.message || "Failed to post reply");
      }
    } catch (err) {
      console.error("Error posting reply:", err);
      if ((err.message || "").toLowerCase().includes("token") || (err.message || "").toLowerCase().includes("auth")) {
        setAuthError("You're not signed in or your session expired.");
      } else {
        setAuthError("Failed to post reply. Please try again.");
      }
    }
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return;
    try {
      setAuthError("");
      const data = await apiDeleteComment(commentId);
      if (data?.success) {
        await fetchComments();
      } else {
        throw new Error(data?.message || "Failed to delete");
      }
    } catch (err) {
      console.error("Error deleting comment:", err);
      if ((err.message || "").toLowerCase().includes("token") || (err.message || "").toLowerCase().includes("auth")) {
        setAuthError("You're not signed in or your session expired.");
      } else {
        setAuthError("Failed to delete comment. Please try again.");
      }
    }
  };

  if (loading) return (
    <div className="loader_container">
      <p className="loader_spinner"></p>
      <p>Loading Comments…</p>
    </div>
  );

  return (
    <div className="comments-container">
      <h3 className="comments-title">Discussion</h3>

      {authError && (
        <div className="alert alert-warning" role="alert">
          {authError} Please log in again and retry.
        </div>
      )}

      {/* New comment form */}
      <form onSubmit={submitComment} className="comment-form" onKeyDown={(e) => e.stopPropagation()}>
        <div className="form-group">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows="3"
            className="comment-input"
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">Post Comment</button>
        </div>
      </form>

      {/* Comments list */}
      <div className="comments-list">
        {comments.length === 0 ? (
          <div className="no-comments">
            <p>No comments yet. Be the first to comment!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUser={currentUser}
              isAdmin={isAdmin}
              onReply={() => { setReplyingTo(comment.id); setReplyText(""); }}
              onDelete={deleteComment}
              replyingTo={replyingTo}
              replyText={replyText}
              setReplyText={setReplyText}
              submitReply={submitReply}
              cancelReply={() => setReplyingTo(null)}
              refreshComments={fetchComments}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  currentUser,
  isAdmin,
  onReply,
  onDelete,
  replyingTo,
  replyText,
  setReplyText,
  submitReply,
  cancelReply,
  refreshComments,
}) {
  const isAuthor = currentUser?.id != null && comment.user_id === currentUser.id;
  const canEdit = isAuthor || isAdmin;
  const canDelete = isAuthor || isAdmin;
  const isReplying = replyingTo === comment.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.comment_text || "");
  const [showActions, setShowActions] = useState(false);

  // reset editText if comment changes externally
  useEffect(() => { setEditText(comment.comment_text || ""); }, [comment.comment_text]);

  const handleEdit = async (e) => {
    e?.stopPropagation();
    if (!editText.trim()) return;
    try {
      const data = await apiUpdateComment(comment.id, editText);
      if (data?.success) {
        setIsEditing(false);
        await refreshComments();
      } else {
        throw new Error(data?.message || "Failed to update");
      }
    } catch (err) {
      console.error("Error updating comment:", err);
      alert("Failed to update comment. Please try again.");
    }
  };

  const cancelEdit = (e) => {
    e?.stopPropagation();
    setIsEditing(false);
    setEditText(comment.comment_text || "");
  };

  // stop propagation so parent clickable rows/modals don't react
  const stop = (e) => e.stopPropagation();

  return (
    <div
      id={`comment-${comment.id}`}
      tabIndex={-1}
      className={`comment ${comment.parent_id ? "reply" : ""}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={stop}
    >
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

        {/* Action buttons (only show on hover) */}
        {showActions && (
          <div className="comment-action-buttons" onClick={stop}>
            {canEdit && !isEditing && (
              <button
                onClick={(e) => { stop(e); setIsEditing(true); }}
                className="btn-link edit-btn"
                title="Edit comment"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z" fill="currentColor" />
                </svg>
              </button>
            )}
            {canDelete && (
              <button
                onClick={(e) => { stop(e); onDelete(comment.id); }}
                className="btn-link delete-btn"
                title="Delete comment"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="comment-body" onClick={stop}>
        {isEditing ? (
          <div className="edit-form" onKeyDown={stop}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows="3"
              className="comment-input"
            />
            <div className="edit-actions">
              <button
                onClick={handleEdit}
                className="btn btn-primary btn-sm"
                disabled={!editText.trim()}
              >
                Save
              </button>
              <button
                onClick={cancelEdit}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p>{linkifyText(comment.comment_text)}</p>
        )}
      </div>

      <div className="comment-actions" onClick={stop}>
        <button
          onClick={(e) => { stop(e); if (isReplying) cancelReply(e); else onReply(); }}
          className="btn-link reply-btn"
          aria-expanded={isReplying}
        >
          {isReplying ? 'Cancel Reply' : 'Reply'}
        </button>
      </div>

      {/* Reply form */}
      {isReplying && (
        <div className="reply-form" onClick={stop}>
          <div className="form-group">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              rows="2"
              className="comment-input"
            />
          </div>
          <div className="form-actions">
            <button
              onClick={(e) => { stop(e); submitReply(comment.id); }}
              className="btn btn-primary btn-sm"
              disabled={!replyText.trim()}
            >
              Post Reply
            </button>
            <button
              onClick={(e) => { stop(e); cancelReply(e); }}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="replies">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUser={currentUser}
              isAdmin={isAdmin}
              onReply={onReply}
              onDelete={onDelete}
              replyingTo={replyingTo}
              replyText={replyText}
              setReplyText={setReplyText}
              submitReply={submitReply}
              cancelReply={cancelReply}
              refreshComments={refreshComments}
            />
          ))}
        </div>
      )}
    </div>
  );
}