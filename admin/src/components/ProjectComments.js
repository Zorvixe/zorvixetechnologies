import { useState, useEffect, useRef } from "react";
import {
  apiGetProjectComments,
  apiPostProjectComment,
  apiUpdateComment,
  apiDeleteComment,
} from "../api";

import RichTextEditor from "./RichTextEditor";
import DOMPurify from "dompurify";
import linkifyHtml from "linkify-html";
import useDeepLinkHandler from "../deeplink/useDeepLinkHandler";
import "./ProjectComment.css";

const truncateUrl = (url, maxLength = 30) => {
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength) + "...";
};

const renderSafeHtmlWithLinks = (html) => {
  if (!html) return "";
  const allowedTags = ["b", "i", "em", "strong", "a", "p", "ul", "ol", "li", "br", "span", "div", "img"];
  const allowedAttrs = ["href", "src", "alt", "title", "target", "rel", "class", "style"];
  const sanitized = DOMPurify.sanitize(html, { ALLOWED_TAGS: allowedTags, ALLOWED_ATTR: allowedAttrs });
  const linkified = linkifyHtml(sanitized, {
    defaultProtocol: "https",
    attributes: { rel: "noopener noreferrer", target: "_blank" },
    format: (value, type) => (type === "url" ? truncateUrl(value) : value),
  });
  return DOMPurify.sanitize(linkified, { ALLOWED_TAGS: allowedTags, ALLOWED_ATTR: allowedAttrs });
};

const UserAvatar = ({ name, size = 40 }) => {
  const getInitials = (name) =>
    (name || "")
      .split(" ")
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const getColor = (name) => {
    let hash = 0;
    for (let i = 0; i < (name || "").length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      "#FF6B6B", "#4ECDC4", "#45B7D1", "#F9A826",
      "#6A5ACD", "#FFA5A5", "#77DD77", "#836953",
      "#CF9FFF", "#FDFD96", "#FFB347", "#B19CD9",
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

  useDeepLinkHandler({
    resourceType: "project",
    resourceId: projectId,
    whenLoaded: () => !loading && Array.isArray(comments),
  });

  useEffect(() => {
    mountedRef.current = true;
    fetchComments();
    return () => {
      mountedRef.current = false;
    };
  }, [projectId]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const data = await apiGetProjectComments(projectId);
      if (!mountedRef.current) return;
      if (data?.success && Array.isArray(data.comments)) {
        setComments(data.comments);
      } else {
        setAuthError(data?.message || "Failed to load comments");
        setComments([]);
      }
    } catch (err) {
      console.error("Error fetching comments:", err);
      setAuthError("Failed to load comments. Please try again.");
      setComments([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const submitComment = async (e) => {
    e?.preventDefault?.();
    if (!newComment.trim()) return;
    try {
      const data = await apiPostProjectComment(projectId, newComment);
      if (data?.success) {
        setNewComment("");
        await fetchComments();
      } else throw new Error(data?.message);
    } catch (err) {
      console.error("Error posting comment:", err);
      setAuthError("Failed to post comment. Please try again.");
    }
  };

  const submitReply = async (parentId) => {
    if (!replyText.trim()) return;
    try {
      const data = await apiPostProjectComment(projectId, replyText, parentId);
      if (data?.success) {
        setReplyText("");
        setReplyingTo(null);
        await fetchComments();
      } else throw new Error(data?.message);
    } catch (err) {
      console.error("Error posting reply:", err);
      setAuthError("Failed to post reply. Please try again.");
    }
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return;
    try {
      const data = await apiDeleteComment(commentId);
      if (data?.success) await fetchComments();
      else throw new Error(data?.message);
    } catch (err) {
      console.error("Error deleting comment:", err);
      setAuthError("Failed to delete comment. Please try again.");
    }
  };

  if (loading)
    return (
      <div className="loader_container">
        <p className="loader_spinner"></p>
        <p>Loading Comments…</p>
      </div>
    );

  return (
    <div className="comments-container">
      <h3 className="comments-title">Discussion</h3>

      {authError && <div className="alert alert-warning">{authError}</div>}

      <form onSubmit={submitComment}>
        <div className="form-group">
          <RichTextEditor
            value={newComment}
            onChange={(content) => setNewComment(content)}
            placeholder="Add a comment..."
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">Post Comment</button>
        </div>
      </form>

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
  onReply,
  onDelete,
  replyingTo,
  replyText,
  setReplyText,
  submitReply,
  cancelReply,
  refreshComments,
}) {
  // ✅ anyone can edit or delete now
  const canEdit = true;
  const canDelete = true;
  const isReplying = replyingTo === comment.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.comment_text || "");
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    setEditText(comment.comment_text || "");
  }, [comment.comment_text]);

  const handleEdit = async (e) => {
    e?.stopPropagation();
    if (!editText.trim()) return;
    try {
      const data = await apiUpdateComment(comment.id, editText);
      if (data?.success) {
        setIsEditing(false);
        await refreshComments();
      } else throw new Error(data?.message);
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
            <div className="comment-author">
              {comment.user_name}
              {/* ✅ Show edited_by beside author */}
              {comment.edited_by && (
                <span className="edited-by"> • edited by {comment.edited_by}</span>
              )}
            </div>
            <div className="comment-meta">
              <span className="comment-date">{new Date(comment.created_at).toLocaleString()}</span>
              {comment.updated_at !== comment.created_at && (
                <span className="comment-edited">(edited)</span>
              )}
            </div>
          </div>
        </div>

        {showActions && (
          <div className="comment-action-buttons" onClick={stop}>
            {canEdit && !isEditing && (
              <button onClick={(e) => { stop(e); setIsEditing(true); }} className="btn-link edit-btn" title="Edit">
                ✏️
              </button>
            )}
            {canDelete && (
              <button onClick={(e) => { stop(e); onDelete(comment.id); }} className="btn-link delete-btn" title="Delete">
                🗑️
              </button>
            )}
          </div>
        )}
      </div>

      <div className="comment-body" onClick={stop}>
        {isEditing ? (
          <div className="edit-form" onKeyDown={stop}>
            <RichTextEditor
              value={editText}
              onChange={(c) => setEditText(c)}
              rows="3"
              className="comment-input"
            />
            <div className="edit-actions form-actions">
              <button onClick={handleEdit} className="btn btn-primary btn-sm" disabled={!editText.trim()}>
                Save
              </button>
              <button onClick={cancelEdit} className="btn btn-secondary btn-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ whiteSpace: "pre-wrap" }} dangerouslySetInnerHTML={{ __html: renderSafeHtmlWithLinks(comment.comment_text) }} />
        )}
      </div>

      <div className="comment-actions" onClick={stop}>
        <button onClick={(e) => { stop(e); if (isReplying) cancelReply(e); else onReply(); }} className="btn-link reply-btn">
          {isReplying ? "Cancel Reply" : "Reply"}
        </button>
      </div>

      {isReplying && (
        <div className="mt-5" onClick={stop}>
          <div className="form-group">
            <RichTextEditor
              value={replyText}
              onChange={(c) => setReplyText(c)}
              placeholder="Write a reply..."
              rows="2"
            />
          </div>
          <div className="form-actions">
            <button onClick={(e) => { stop(e); submitReply(comment.id); }} className="btn btn-primary btn-sm" disabled={!replyText.trim()}>
              Post Reply
            </button>
            <button onClick={(e) => { stop(e); cancelReply(e); }} className="btn btn-secondary btn-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {comment.replies?.length > 0 && (
        <div className="replies">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
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
