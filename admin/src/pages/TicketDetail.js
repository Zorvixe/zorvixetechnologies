// src/pages/TicketDetail.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGetTicket, apiCreateTicketComment } from '../api';
import useDeepLinkHandler from '../deeplink/useDeepLinkHandler';
import '../styles/deeplink.css';

export default function TicketDetail() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await apiGetTicket(id);
        if (!mounted) return;
        setTicket(res.ticket || res);
        setComments(res.comments || []);
      } catch (e) {
        console.error('Failed to load ticket', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [id]);

  useDeepLinkHandler({ resourceType: 'ticket', resourceId: id, whenLoaded: () => !loading });

  async function submitComment() {
    if (!newComment.trim()) return;
    try {
      const res = await apiCreateTicketComment(id, { comment_text: newComment });
      const created = res.comment || res;
      setComments((s) => [...s, created]);
      setNewComment('');
    } catch (e) {
      console.error('comment failed', e);
    }
  }

  if (loading) return <div>Loading ticket…</div>;
  if (!ticket) return <div>Ticket not found</div>;

  return (
    <div className="detail-page ticket-detail">
      <h2>{ticket.title}</h2>
      <div className="meta">
        <div>Status: {ticket.status}</div>
        <div>Priority: {ticket.priority}</div>
        <div>Created: {new Date(ticket.created_at).toLocaleString()}</div>
      </div>

      <section className="description">
        <h4>Description</h4>
        <p>{ticket.description}</p>
      </section>

      <section className="comments">
        <h4>Comments ({comments.length})</h4>

        <div className="comment-form">
          <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment..." />
          <button onClick={submitComment}>Add</button>
        </div>

        <div className="comments-list">
          {comments.map((c) => (
            <div
              key={c.id}
              id={`comment-${c.id}`}
              tabIndex={-1}
              className="comment-item"
            >
              <div className="comment-head">
                <strong>{c.user_name || c.name || c.user}</strong>
                <span className="time">{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <div className="comment-body">{c.comment_text || c.text || c.body}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
