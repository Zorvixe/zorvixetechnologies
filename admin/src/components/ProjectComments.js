import { useState, useEffect } from "react"
import {
  apiGetProjectComments,
  apiPostProjectComment,
  apiUpdateComment,
  apiDeleteComment
} from "../api"

import "./ProjectComment.css"
// Avatar component to display user initials
const UserAvatar = ({ name, size = 40 }) => {
  const getInitials = (name) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getColor = (name) => {
    // Simple hash function to generate consistent color based on name
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#F9A826', 
      '#6A5ACD', '#FFA5A5', '#77DD77', '#836953',
      '#CF9FFF', '#FDFD96', '#FFB347', '#B19CD9'
    ]
    
    return colors[Math.abs(hash) % colors.length]
  }

  return (
    <div 
      className="user-avatar"
      style={{ 
        width: size, 
        height: size, 
        backgroundColor: getColor(name),
        fontSize: size * 0.4,
        fontWeight: 'bold'
      }}
      title={name}
    >
      {getInitials(name)}
    </div>
  )
}

export default function ProjectComments({ projectId, isAdmin, currentUser }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState("")
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState("")
  const [authError, setAuthError] = useState("")

  useEffect(() => {
    fetchComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const fetchComments = async () => {
    try {
      setLoading(true)
      setAuthError("")
      const data = await apiGetProjectComments(projectId)
      
      if (data?.success && Array.isArray(data.comments)) {
        setComments(data.comments)
      } else if (!data?.success) {
        setAuthError(data?.message || "Failed to load comments")
      }
    } catch (err) {
      console.error("Error fetching comments:", err)
      if (err.message.includes("token") || err.message.includes("auth")) {
        setAuthError("You're not signed in or your session expired.")
      } else {
        setAuthError("Failed to load comments. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  const submitComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim()) return

    try {
      setAuthError("")
      const data = await apiPostProjectComment(projectId, newComment)
      
      if (data?.success) {
        setNewComment("")
        fetchComments() // Refresh comments
      }
    } catch (err) {
      console.error("Error posting comment:", err)
      if (err.message.includes("token") || err.message.includes("auth")) {
        setAuthError("You're not signed in or your session expired.")
      } else {
        setAuthError("Failed to post comment. Please try again.")
      }
    }
  }

  const submitReply = async (parentId) => {
    if (!replyText.trim()) return

    try {
      setAuthError("")
      const data = await apiPostProjectComment(projectId, replyText, parentId)
      
      if (data?.success) {
        setReplyText("")
        setReplyingTo(null)
        fetchComments() // Refresh comments
      }
    } catch (err) {
      console.error("Error posting reply:", err)
      if (err.message.includes("token") || err.message.includes("auth")) {
        setAuthError("You're not signed in or your session expired.")
      } else {
        setAuthError("Failed to post reply. Please try again.")
      }
    }
  }

  const deleteComment = async (commentId) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return

    try {
      setAuthError("")
      const data = await apiDeleteComment(commentId)
      
      if (data?.success) {
        fetchComments() // Refresh comments
      }
    } catch (err) {
      console.error("Error deleting comment:", err)
      if (err.message.includes("token") || err.message.includes("auth")) {
        setAuthError("You're not signed in or your session expired.")
      } else {
        setAuthError("Failed to delete comment. Please try again.")
      }
    }
  }

    if (loading) return <div className="loader_container">
    <p className="loader_spinner"></p>
    <p>Loading Comments…</p>
  </div>

  return (
    <div className="comments-container">
      <h3 className="comments-title">Discussion</h3>

      {authError && (
        <div className="alert alert-warning" role="alert">
          {authError} Please log in again and retry.
        </div>
      )}

      {/* New comment form */}
      <form onSubmit={submitComment} className="comment-form">
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
              onReply={() => setReplyingTo(comment.id)}
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
  )
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
  refreshComments
}) {
  const isAuthor = currentUser?.id != null && comment.user_id === currentUser.id
  const canEdit = isAuthor || isAdmin
  const canDelete = isAuthor || isAdmin
  const isReplying = replyingTo === comment.id
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(comment.comment_text)
  const [showActions, setShowActions] = useState(false)

  const handleEdit = async () => {
    try {
      const data = await apiUpdateComment(comment.id, editText)
      if (data?.success) {
        setIsEditing(false)
        refreshComments() // Refresh to show updated comment
      }
    } catch (err) {
      console.error("Error updating comment:", err)
      alert("Failed to update comment. Please try again.")
    }
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditText(comment.comment_text) // Reset to original text
  }

  return (
    <div 
      className={`comment ${comment.parent_id ? 'reply' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
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
          <div className="comment-action-buttons">
            {canEdit && !isEditing && (
              <button 
                onClick={() => setIsEditing(true)}
                className="btn-link edit-btn"
                title="Edit comment"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z" fill="currentColor"/>
                </svg>
              </button>
            )}
            {canDelete && (
              <button 
                onClick={() => onDelete(comment.id)}
                className="btn-link delete-btn"
                title="Delete comment"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
                </svg>
              </button>
            )}
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
          <p>{comment.comment_text}</p>
        )}
      </div>
      
      <div className="comment-actions">
        <button 
          onClick={onReply} 
          className="btn-link reply-btn"
          aria-expanded={isReplying}
        >
          {isReplying ? 'Cancel Reply' : 'Reply'}
        </button>
      </div>

      {/* Reply form */}
      {isReplying && (
        <div className="reply-form">
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
              onClick={() => submitReply(comment.id)} 
              className="btn btn-primary btn-sm"
              disabled={!replyText.trim()}
            >
              Post Reply
            </button>
            <button 
              onClick={cancelReply} 
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
  )
}