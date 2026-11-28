import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  apiAiStatus,
  apiAiCopilotSessions,
  apiAiCopilotSession,
  apiAiCopilotReset,
  apiAiCopilotDeleteSession,
  apiAiAssistantChat,
  apiAiCopilotConfirm,
  apiAiCopilotCancel,
} from '../api';
import ZorviAiLogo from '../assets/zorvi_ai_logo.png';
import {
  XIcon,
  AlertCircleIcon,
  ChevronRightIcon,
  UserIcon,
  PlusIcon,
  FolderIcon,
  ShieldIcon,
  MessageSquareIcon,
  ZapIcon,
  CheckIcon,
  TrashIcon,
} from './CrmHrmsIcons';
import RichTextEditor from './RichTextEditor';
import './AiAssistantDrawer.css';

const SESSION_STORAGE_KEY = 'zorvixe_copilot_session_id';

function SidebarPanelIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function ArrowUpIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function formatSessionTime(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d`;
  return `${Math.floor(diffDay / 30)}mo`;
}

function formatRouteLabel(pathname = '/stats') {
  const clean = String(pathname || '/stats').replace(/^\/+/, '').split('/')[0];
  return clean || 'dashboard';
}

function CopyIcon({ size = 13 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function renderInlineMarkdown(text, onOpenPath, keyPrefix) {
  const tokens = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(<strong key={`${keyPrefix}-b-${idx++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code key={`${keyPrefix}-c-${idx++}`} className="zx-ai-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const labelEnd = token.indexOf('](');
      const label = token.slice(1, labelEnd);
      const href = token.slice(labelEnd + 2, -1).trim();
      if (href.startsWith('/')) {
        tokens.push(
          <button
            key={`${keyPrefix}-l-${idx++}`}
            type="button"
            className="zx-ai-inline-link-btn"
            onClick={() => onOpenPath(href)}
          >
            {label}
          </button>
        );
      } else if (/^https?:\/\//i.test(href)) {
        tokens.push(
          <a
            key={`${keyPrefix}-a-${idx++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="zx-ai-inline-link"
          >
            {label}
          </a>
        );
      } else {
        tokens.push(label);
      }
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

function renderFormattedAnswer(text, onOpenPath) {
  const lines = String(text || '').split(/\r?\n/);
  const blocks = [];
  let listType = null;
  let listItems = [];

  const flushList = (keySuffix) => {
    if (!listItems.length) return;
    if (listType === 'ol') {
      blocks.push(
        <ol key={`ol-${keySuffix}`} className="zx-ai-md-list">
          {listItems.map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item, onOpenPath, `ol-${keySuffix}-${i}`)}</li>
          ))}
        </ol>
      );
    } else {
      blocks.push(
        <ul key={`ul-${keySuffix}`} className="zx-ai-md-list">
          {listItems.map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item, onOpenPath, `ul-${keySuffix}-${i}`)}</li>
          ))}
        </ul>
      );
    }
    listType = null;
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(idx);
      return;
    }
    const ulMatch = line.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      if (listType && listType !== 'ul') flushList(idx);
      listType = 'ul';
      listItems.push(ulMatch[1]);
      return;
    }
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType && listType !== 'ol') flushList(idx);
      listType = 'ol';
      listItems.push(olMatch[1]);
      return;
    }
    flushList(idx);
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      blocks.push(
        <div key={`h-${idx}`} className="zx-ai-md-heading">
          {renderInlineMarkdown(headingMatch[1], onOpenPath, `h-${idx}`)}
        </div>
      );
      return;
    }
    blocks.push(
      <p key={`p-${idx}`} className="zx-ai-md-para">
        {renderInlineMarkdown(line, onOpenPath, `p-${idx}`)}
      </p>
    );
  });

  flushList('end');
  return blocks;
}

function mapStoredMessage(m) {
  if (m.role === 'user') {
    return {
      id: `db-u-${m.id}`,
      role: 'user',
      text: m.content,
    };
  }
  const p = m.payload && typeof m.payload === 'object' ? m.payload : {};
  return {
    id: `db-a-${m.id}`,
    role: 'assistant',
    answer: m.content || p.answer || '',
    executedActions: Array.isArray(p.executedActions) ? p.executedActions : [],
    groundingRecords: Array.isArray(p.groundingRecords) ? p.groundingRecords : [],
    pendingConfirmation: p.pendingConfirmation || null,
    uncertainty: p.uncertainty || '',
    suggestedFollowUps: Array.isArray(p.suggestedFollowUps) ? p.suggestedFollowUps : [],
    meta: p.meta || null,
  };
}

export default function AiAssistantDrawer({ isOpen, onClose }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';

  const [aiStatus, setAiStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(() => {
    try {
      return Number(sessionStorage.getItem(SESSION_STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  });
  const [sessionPendingAction, setSessionPendingAction] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progressText, setProgressText] = useState('Checking authorized records...');
  const [error, setError] = useState('');
  const [contextEntity, setContextEntity] = useState(null);
  const [draftOverrides, setDraftOverrides] = useState({ subject: '', body: '', comments: '' });
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 900 : true
  );
  const [showPromptMenu, setShowPromptMenu] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState(null);

  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  const firstName = useMemo(() => {
    const raw = String(user?.name || user?.email || 'there').trim();
    if (!raw) return 'there';
    if (raw.includes('@')) return raw.split('@')[0];
    return raw.split(/\s+/)[0];
  }, [user]);

  const routeLabel = useMemo(() => formatRouteLabel(location.pathname), [location.pathname]);

  const refreshSessionsList = useCallback(async () => {
    try {
      const listRes = await apiAiCopilotSessions();
      if (Array.isArray(listRes?.sessions)) {
        setSessions(listRes.sessions);
      }
    } catch {
      // ignore background refresh error
    }
  }, []);

  // Sync draft editor defaults whenever active pending confirmation changes
  useEffect(() => {
    if (sessionPendingAction?.kind === 'confirmation') {
      const a = sessionPendingAction.args || {};
      setDraftOverrides({
        subject: a.subject || '',
        body: a.body || '',
        comments: a.comments || '',
      });
    }
  }, [sessionPendingAction]);

  // Auto-resize composer textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  }, [input, isOpen]);

  // Load AI status, active session, and session history on open
  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    setStatusLoading(true);
    setError('');
    setShowPromptMenu(false);

    const storedSid = (() => {
      try {
        return Number(sessionStorage.getItem(SESSION_STORAGE_KEY)) || sessionId || undefined;
      } catch {
        return sessionId || undefined;
      }
    })();

    Promise.all([
      apiAiStatus().catch(() => null),
      apiAiCopilotSession(storedSid ? { sessionId: storedSid } : {}).catch(() => null),
      apiAiCopilotSessions().catch(() => null),
    ])
      .then(([statusRes, sessionRes, listRes]) => {
        if (cancelled) return;
        setAiStatus(statusRes);
        if (sessionRes?.session?.id) {
          setSessionId(sessionRes.session.id);
          try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, String(sessionRes.session.id));
          } catch { }
          setSessionPendingAction(sessionRes.session.pending_action || null);
          setMessages((sessionRes.messages || []).map(mapStoredMessage));
        }
        if (Array.isArray(listRes?.sessions)) {
          setSessions(listRes.sessions);
        }
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    const onExternalOpen = (e) => {
      const detail = e?.detail || {};
      if (detail.contextEntity) setContextEntity(detail.contextEntity);
      if (detail.prompt) setInput(detail.prompt);
    };
    window.addEventListener('zorvixe:ai-prefill', onExternalOpen);
    return () => window.removeEventListener('zorvixe:ai-prefill', onExternalOpen);
  }, []);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, sending, confirming]);

  const activeConfirmationMsgId = useMemo(() => {
    if (!sessionPendingAction || sessionPendingAction.kind !== 'confirmation') return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].pendingConfirmation) {
        return messages[i].id;
      }
    }
    return null;
  }, [messages, sessionPendingAction]);

  const quickPrompts = useMemo(() => {
    const p = location.pathname || '/stats';
    if (p.includes('ticket')) {
      return [
        'Which open tickets have SLA risk or high urgency?',
        'Create a high-priority ticket for checkout timeout issue',
        'How many tickets are currently unassigned?',
      ];
    }
    if (p.includes('recruitment')) {
      return [
        'Summarize new candidate applications received recently',
        'Compare latest candidate against stated job requirements',
        'Show open roles and current applicant pipeline',
      ];
    }
    if (p.includes('crm') || p.includes('deal') || p.includes('lead') || p.includes('account')) {
      return [
        'Summarize active CRM pipeline value and open deals.',
        'Which deals look stale or overdue for follow-up?',
        'Show top unconverted CRM leads.',
      ];
    }
    if (p.includes('hrms') || p.includes('attendance') || p.includes('payroll') || p.includes('leave')) {
      return isAdmin
        ? [
          'How many attendance punches and late marks happened today?',
          'Summarize pending leave requests requiring review.',
          'Audit current month payroll status for anomalies.',
        ]
        : [
          'Summarize my recent attendance logs and hours.',
          'What is the status of my leave requests?',
          'Are any leave approvals waiting on me?',
        ];
    }
    if (p.includes('client') || p.includes('project')) {
      return [
        'Which accessible projects are still active or overdue?',
        'Which clients have open projects right now?',
      ];
    }
    if (p.includes('payment')) {
      return [
        'Show pending payment submissions awaiting verification.',
        'Summarize recent payment registrations.',
      ];
    }
    if (p.includes('contact')) {
      return [
        'Show recent contact inquiries requiring response.',
        'Summarize open website contact leads.',
      ];
    }
    return isAdmin
      ? [
        'Give me today’s executive summary and top risks.',
        'Which tickets need urgent triage or assignment?',
        'Summarize new applicants and pending leave requests.',
      ]
      : [
        'Give me my daily operational summary.',
        'Which open tickets are urgent or high priority?',
        'Summarize my accessible projects and recent leaves.',
      ];
  }, [location.pathname, isAdmin]);

  const handleSelectSession = async (targetSessionId) => {
    if (!targetSessionId || sending || confirming) return;
    if (Number(targetSessionId) === Number(sessionId)) {
      if (typeof window !== 'undefined' && window.innerWidth <= 900) {
        setSidebarOpen(false);
      }
      return;
    }
    setError('');
    setStatusLoading(true);
    try {
      const res = await apiAiCopilotSession({ sessionId: targetSessionId });
      if (res?.session?.id) {
        setSessionId(res.session.id);
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, String(res.session.id));
        } catch { }
        setSessionPendingAction(res.session.pending_action || null);
        setMessages((res.messages || []).map(mapStoredMessage));
      }
      if (typeof window !== 'undefined' && window.innerWidth <= 900) {
        setSidebarOpen(false);
      }
    } catch (err) {
      setError(err.message || 'Unable to load conversation.');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleNewChat = async () => {
    if (sending || confirming) return;
    setError('');
    setShowPromptMenu(false);
    try {
      const res = await apiAiCopilotReset();
      if (res?.session?.id) {
        setSessionId(res.session.id);
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, String(res.session.id));
        } catch { }
      }
      setMessages([]);
      setSessionPendingAction(null);
      setInput('');
      if (typeof window !== 'undefined' && window.innerWidth <= 900) {
        setSidebarOpen(false);
      }
      refreshSessionsList();
      setTimeout(() => inputRef.current?.focus(), 60);
    } catch (err) {
      setError(err.message || 'Unable to reset Copilot session.');
    }
  };

  const handleDeleteSession = async (e, targetSessionId) => {
    e.stopPropagation();
    if (!targetSessionId || sending || confirming) return;
    try {
      await apiAiCopilotDeleteSession(targetSessionId);
      const remaining = sessions.filter((s) => Number(s.id) !== Number(targetSessionId));
      setSessions(remaining);
      if (Number(targetSessionId) === Number(sessionId)) {
        if (remaining.length > 0) {
          await handleSelectSession(remaining[0].id);
        } else {
          await handleNewChat();
        }
      }
    } catch (err) {
      setError(err.message || 'Unable to delete conversation.');
    }
  };

  const handleCopyAnswer = async (msgId, answerText) => {
    if (!answerText || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(answerText);
      setCopiedMsgId(msgId);
      setTimeout(() => {
        setCopiedMsgId((prev) => (prev === msgId ? null : prev));
      }, 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const sendQuestion = async (questionText) => {
    const q = (questionText !== undefined ? questionText : input).trim();
    if (!q || sending || confirming) return;
    if (aiStatus && aiStatus.enabled === false) {
      setError('AI features are currently disabled. Ask an administrator to enable AI in Users -> AI Settings.');
      return;
    }

    setError('');
    setShowPromptMenu(false);
    setInput('');
    const tempUserId = `${Date.now()}-u`;
    setMessages((prev) => [...prev, { id: tempUserId, role: 'user', text: q }]);
    setSending(true);
    setProgressText('Analysing request...');

    const progressTimer = setTimeout(() => {
      setProgressText('Thinking...');
    }, 900);

    try {
      const res = await apiAiAssistantChat({
        message: q,
        currentPath: location.pathname + (location.hash || ''),
        contextEntity,
        sessionId,
      });
      if (res.sessionId) {
        setSessionId(res.sessionId);
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, String(res.sessionId));
        } catch { }
      }

      const nextPending = res.pendingConfirmation
        ? { kind: 'confirmation', ...res.pendingConfirmation }
        : null;
      setSessionPendingAction(nextPending);

      const botId = res.message?.id ? `db-a-${res.message.id}` : `${Date.now()}-a`;
      setMessages((prev) => [
        ...prev,
        {
          id: botId,
          role: 'assistant',
          answer: res.answer,
          executedActions: res.executedActions || [],
          groundingRecords: res.groundingRecords || [],
          pendingConfirmation: res.pendingConfirmation || null,
          uncertainty: res.uncertainty || '',
          suggestedFollowUps: res.suggestedFollowUps || [],
          meta: res.meta || null,
        },
      ]);
      refreshSessionsList();
    } catch (err) {
      setError(err.message || 'Unable to process Copilot request right now.');
    } finally {
      clearTimeout(progressTimer);
      setSending(false);
    }
  };

  const handleConfirmPending = async () => {
    if (!sessionId || confirming || sending) return;
    setError('');
    setConfirming(true);
    setProgressText('Applying confirmed action through platform API...');
    try {
      const toolName = sessionPendingAction?.tool;
      const overrides =
        toolName === 'send_external_email'
          ? { subject: draftOverrides.subject, body: draftOverrides.body }
          : toolName === 'review_leave_decision'
            ? { comments: draftOverrides.comments }
            : {};

      const res = await apiAiCopilotConfirm({ sessionId, overrides });
      setSessionPendingAction(null);
      const botId = res.message?.id ? `db-a-${res.message.id}` : `${Date.now()}-c`;
      setMessages((prev) => [
        ...prev,
        {
          id: botId,
          role: 'assistant',
          answer: res.answer,
          executedActions: res.executedActions || [],
          groundingRecords: res.groundingRecords || [],
          pendingConfirmation: null,
          uncertainty: '',
          suggestedFollowUps: [],
          meta: res.meta || null,
        },
      ]);
      refreshSessionsList();
    } catch (err) {
      setError(err.message || 'Failed to confirm action.');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelPending = async () => {
    if (!sessionId || confirming || sending) return;
    setError('');
    setConfirming(true);
    try {
      const res = await apiAiCopilotCancel({ sessionId });
      setSessionPendingAction(null);
      const botId = res.message?.id ? `db-a-${res.message.id}` : `${Date.now()}-x`;
      setMessages((prev) => [
        ...prev,
        {
          id: botId,
          role: 'assistant',
          answer: res.answer || 'Action cancelled. No changes were made.',
          executedActions: [],
          groundingRecords: [],
          pendingConfirmation: null,
          uncertainty: '',
          suggestedFollowUps: [],
          meta: null,
        },
      ]);
      refreshSessionsList();
    } catch (err) {
      setError(err.message || 'Failed to cancel confirmation.');
    } finally {
      setConfirming(false);
    }
  };

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  };

  if (!isOpen) return null;

  const modelLabel =
    aiStatus?.enabled === false
      ? 'AI Disabled'
      : aiStatus?.model || 'ZORVI Copilot';

  return (
    <div className="zx-ai-drawer-backdrop" onClick={onClose}>
      <aside
        className={`zx-ai-drawer ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="ZORVI Platform Copilot"
      >
        {/* Mobile Sidebar Scrim */}
        {sidebarOpen && (
          <div
            className="zx-ai-sidebar-scrim"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Left Sidebar */}
        <div className={`zx-ai-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="zx-ai-sidebar-top">
            <div className="zx-ai-sidebar-brand">
              <img src={ZorviAiLogo} alt="ZORVI AI" className="zx-ai-header-logo" />
              <div className="zx-ai-sidebar-brand-text">
                <strong>ZORVI</strong>
                <span>Copilot</span>
              </div>
            </div>
            <button
              type="button"
              className="zx-ai-icon-btn"
              onClick={() => setSidebarOpen(false)}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <SidebarPanelIcon size={16} />
            </button>
          </div>

          <div className="zx-ai-sidebar-new-wrap">
            <button
              type="button"
              className="zx-ai-new-conv-btn"
              onClick={handleNewChat}
              disabled={sending || confirming}
            >
              <PlusIcon size={15} />
              <span>New Conversation</span>
            </button>
          </div>

          <div className="zx-ai-sidebar-scroll">
            <div className="zx-ai-sidebar-group">
              <div className="zx-ai-sidebar-section-label">Quick Actions</div>
              {quickPrompts.slice(0, 3).map((qp, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="zx-ai-sidebar-nav-item"
                  onClick={() => sendQuestion(qp)}
                  disabled={sending || confirming || aiStatus?.enabled === false}
                  title={qp}
                >
                  <ZapIcon size={13} />
                  <span>{qp}</span>
                </button>
              ))}
            </div>

            <div className="zx-ai-sidebar-group">
              <div className="zx-ai-sidebar-section-head">
                <span className="zx-ai-sidebar-section-label">Conversations</span>
                <button
                  type="button"
                  className="zx-ai-sidebar-mini-add"
                  onClick={handleNewChat}
                  disabled={sending || confirming}
                  title="New conversation"
                  aria-label="New conversation"
                >
                  <PlusIcon size={13} />
                </button>
              </div>

              {statusLoading && sessions.length === 0 ? (
                <div className="zx-ai-sidebar-empty">Loading history...</div>
              ) : sessions.length === 0 ? (
                <div className="zx-ai-sidebar-empty">No saved conversations yet</div>
              ) : (
                <div className="zx-ai-session-list">
                  {sessions.map((s) => {
                    const isActive = Number(s.id) === Number(sessionId);
                    const displayTitle =
                      s.title && s.title !== 'Zorvi Workspace Copilot'
                        ? s.title
                        : s.first_prompt || 'New conversation';
                    return (
                      <div
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        className={`zx-ai-session-item ${isActive ? 'active' : ''}`}
                        onClick={() => handleSelectSession(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectSession(s.id);
                          }
                        }}
                        title={displayTitle}
                      >
                        <MessageSquareIcon size={13} className="zx-ai-session-icon" />
                        <span className="zx-ai-session-title">{displayTitle}</span>
                        <span className="zx-ai-session-meta">
                          {s.updated_at ? formatSessionTime(s.updated_at) : ''}
                        </span>
                        <button
                          type="button"
                          className="zx-ai-session-delete"
                          onClick={(e) => handleDeleteSession(e, s.id)}
                          title="Delete conversation"
                          aria-label="Delete conversation"
                        >
                          <TrashIcon size={12} />
                        </button>
                        {isActive && <span className="zx-ai-session-dot" aria-hidden="true" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="zx-ai-sidebar-footer">
            <div className="zx-ai-sidebar-user">
              <div className="zx-ai-sidebar-user-avatar">
                <UserIcon size={13} />
              </div>
              <div className="zx-ai-sidebar-user-info">
                <strong>{user?.name || user?.email || 'User'}</strong>
                <span>{isAdmin ? 'Administrator' : 'Employee'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Workspace Pane */}
        <div className="zx-ai-main">
          <header className="zx-ai-main-header">
            <div className="zx-ai-main-header-left">
              {!sidebarOpen && (
                <button
                  type="button"
                  className="zx-ai-icon-btn"
                  onClick={() => setSidebarOpen(true)}
                  title="Open sidebar"
                  aria-label="Open sidebar"
                >
                  <SidebarPanelIcon size={16} />
                </button>
              )}
              <button
                type="button"
                className="zx-ai-icon-btn zx-ai-mobile-sidebar-btn"
                onClick={() => setSidebarOpen((v) => !v)}
                title="Conversations & Shortcuts"
                aria-label="Toggle sidebar"
              >
                <SidebarPanelIcon size={16} />
              </button>
              {!sidebarOpen && (
                <div className="zx-ai-drawer-title">
                  <img src={ZorviAiLogo} alt="ZORVI AI" className="zx-ai-header-logo" />
                  <h3>ZORVI</h3>
                </div>
              )}
              <span className="zx-ai-route-pill">
                <FolderIcon size={12} />
                <span>{routeLabel}</span>
              </span>
            </div>

            <div className="zx-ai-header-controls">
              <span className="zx-ai-shortcut-pill">Ctrl+J</span>
              {messages.length > 0 && (
                <button
                  type="button"
                  className="zx-ai-btn-sm"
                  onClick={handleNewChat}
                  disabled={sending || confirming}
                  title="Start a fresh conversation"
                >
                  <PlusIcon size={13} />
                  <span>New Chat</span>
                </button>
              )}
              <button
                type="button"
                className="zx-ai-close-btn"
                onClick={onClose}
                aria-label="Close ZORVI"
                title="Close"
              >
                <XIcon size={18} />
              </button>
            </div>
          </header>

          {/* Conversation Body */}
          <div className="zx-ai-drawer-body" ref={bodyRef}>
            <div className="zx-ai-thread-inner">
              {messages.length === 0 && (
                <div className="zx-ai-hero">
                  <div className="zx-ai-hero-logo-wrap">
                    <img src={ZorviAiLogo} alt="ZORVI AI" className="zx-ai-hero-logo" />
                  </div>
                  <h2 className="zx-ai-hero-title">
                    Welcome back, {firstName}. Where should we pick up?
                  </h2>
                  <p className="zx-ai-hero-desc">
                    Scoped to your {user?.role || 'employee'} permissions across Zorvixe. Ask questions, run workflows, and confirm high-impact changes safely.
                  </p>
                  <div className="zx-ai-hero-prompts">
                    {quickPrompts.map((qp, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="zx-ai-prompt-chip"
                        onClick={() => sendQuestion(qp)}
                        disabled={sending || confirming || aiStatus?.enabled === false}
                      >
                        <span>{qp}</span>
                        <ChevronRightIcon size={13} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => {
                const isActiveConfirm = m.pendingConfirmation && m.id === activeConfirmationMsgId;
                return (
                  <div key={m.id} className={`zx-ai-msg zx-ai-msg-${m.role}`}>
                    {m.role === 'user' ? (
                      <>
                        <div className="zx-ai-bubble-user">{m.text}</div>
                        <div
                          className="zx-ai-msg-avatar zx-ai-msg-avatar-user"
                          title={user?.name || 'You'}
                          aria-hidden="true"
                        >
                          <UserIcon size={14} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className="zx-ai-msg-avatar zx-ai-msg-avatar-bot"
                          title="ZORVI AI"
                          aria-hidden="true"
                        >
                          <img src={ZorviAiLogo} alt="ZORVI AI" />
                        </div>
                        <div className="zx-ai-bubble-bot">
                          {m.meta?.fallbackUsed && m.meta?.providerError && (
                            <div className="zx-ai-fallback-notice" title={m.meta.providerError}>
                              Live LLM fallback ({m.meta.providerError}). Executed using built-in Copilot engine.
                            </div>
                          )}

                          <div className="zx-ai-bot-answer">
                            {renderFormattedAnswer(m.answer, (path) => {
                              navigate(path);
                              onClose();
                            })}
                          </div>

                          <div className="zx-ai-msg-tools">
                            <button
                              type="button"
                              className={`zx-ai-copy-btn ${copiedMsgId === m.id ? 'copied' : ''}`}
                              onClick={() => handleCopyAnswer(m.id, m.answer)}
                              title="Copy response"
                            >
                              {copiedMsgId === m.id ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                              <span>{copiedMsgId === m.id ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>

                          {/* Executed Actions */}
                          {m.executedActions?.length > 0 && (
                            <div className="zx-ai-executed-list">
                              <div className="zx-ai-mini-label">Completed Actions</div>
                              {m.executedActions.map((act, idx) => (
                                <div key={idx} className="zx-ai-executed-card">
                                  <span className="zx-ai-executed-check">&#10003;</span>
                                  <div className="zx-ai-executed-info">
                                    <strong>{act.label || act.type}</strong>
                                    {act.summary && <div>{act.summary}</div>}
                                  </div>
                                  {act.url && (
                                    <button
                                      type="button"
                                      className="zx-ai-action-link"
                                      onClick={() => {
                                        navigate(act.url);
                                        onClose();
                                      }}
                                    >
                                      Open &rarr;
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Confirmation Required Card */}
                          {m.pendingConfirmation && (
                            <div className={`zx-ai-confirm-card ${isActiveConfirm ? 'is-active' : 'is-resolved'}`}>
                              <div className="zx-ai-confirm-title">
                                {m.pendingConfirmation.title || 'Human Confirmation Required'}
                              </div>
                              <div className="zx-ai-confirm-summary">
                                {m.pendingConfirmation.summary}
                              </div>

                              {isActiveConfirm && m.pendingConfirmation.tool === 'send_external_email' && (
                                <div className="zx-ai-confirm-fields">
                                  <div className="zx-ai-confirm-meta">
                                    To: <strong>{m.pendingConfirmation.args?.to}</strong>
                                  </div>
                                  <label>
                                    Subject
                                    <input
                                      type="text"
                                      value={draftOverrides.subject}
                                      onChange={(e) =>
                                        setDraftOverrides((prev) => ({ ...prev, subject: e.target.value }))
                                      }
                                    />
                                  </label>
                                  <div style={{ marginTop: 4 }}>
                                    <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                      Body
                                    </span>
                                    <RichTextEditor
                                      compact
                                      disableAiAssist
                                      minHeight="90px"
                                      maxHeight="180px"
                                      value={draftOverrides.body}
                                      placeholder="Email body"
                                      onChange={(val) =>
                                        setDraftOverrides((prev) => ({ ...prev, body: val }))
                                      }
                                    />
                                  </div>
                                </div>
                              )}

                              {isActiveConfirm && m.pendingConfirmation.tool === 'review_leave_decision' && (
                                <div className="zx-ai-confirm-fields">
                                  <label>
                                    Optional Reviewer Comments
                                    <input
                                      type="text"
                                      value={draftOverrides.comments}
                                      placeholder="Add a note for the employee..."
                                      onChange={(e) =>
                                        setDraftOverrides((prev) => ({ ...prev, comments: e.target.value }))
                                      }
                                    />
                                  </label>
                                </div>
                              )}

                              {isActiveConfirm ? (
                                <div className="zx-ai-confirm-btns">
                                  <button
                                    type="button"
                                    className="zx-ai-btn-primary"
                                    onClick={handleConfirmPending}
                                    disabled={confirming || sending}
                                  >
                                    {confirming ? 'Executing...' : 'Confirm & Execute'}
                                  </button>
                                  <button
                                    type="button"
                                    className="zx-ai-btn-sm"
                                    onClick={handleCancelPending}
                                    disabled={confirming || sending}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="zx-ai-confirm-closed">Confirmation resolved.</div>
                              )}
                            </div>
                          )}

                          {/* Supporting Grounding Records */}
                          {m.groundingRecords?.length > 0 && (
                            <div className="zx-ai-grounding">
                              <div className="zx-ai-mini-label">Supporting Records</div>
                              <div className="zx-ai-ref-chips">
                                {m.groundingRecords.map((rec, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    className="zx-ai-ref-chip"
                                    onClick={() => {
                                      if (rec.url) {
                                        navigate(rec.url);
                                        onClose();
                                      }
                                    }}
                                  >
                                    {rec.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Suggested Follow-Ups */}
                          {m.suggestedFollowUps?.length > 0 && (
                            <div className="zx-ai-actions-row">
                              {m.suggestedFollowUps.map((fup, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  className="zx-ai-followup-chip"
                                  disabled={sending || confirming}
                                  onClick={() => sendQuestion(fup)}
                                >
                                  {fup}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {(sending || confirming) && (
                <div className="zx-ai-msg zx-ai-msg-assistant">
                  <div className="zx-ai-msg-avatar zx-ai-msg-avatar-bot" title="ZORVI AI" aria-hidden="true">
                    <img src={ZorviAiLogo} alt="ZORVI AI" />
                  </div>
                  <div className="zx-ai-state-loading">
                    <span className="zx-ai-spinner" />
                    <span>{progressText}</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="zx-ai-state-error" role="alert">
                  <AlertCircleIcon size={15} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Centered Floating Command Composer Deck */}
          <div className="zx-ai-composer-dock">
            {showPromptMenu && (
              <div className="zx-ai-prompt-popover">
                <div className="zx-ai-mini-label">Suggested for {routeLabel}</div>
                <div className="zx-ai-prompt-popover-list">
                  {quickPrompts.map((qp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="zx-ai-quick-mini"
                      onClick={() => sendQuestion(qp)}
                      disabled={sending || confirming || aiStatus?.enabled === false}
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form
              className="zx-ai-composer-card"
              onSubmit={(e) => {
                e.preventDefault();
                sendQuestion();
              }}
            >
              <div className="zx-ai-composer-context">
                <span className="zx-ai-context-chip">
                  <FolderIcon size={12} />
                  <span>zorvixetechnologies</span>
                </span>
                <span className="zx-ai-context-sep">&bull;</span>
                <span className="zx-ai-context-chip">{routeLabel}</span>
                {contextEntity && (
                  <>
                    <span className="zx-ai-context-sep">&bull;</span>
                    <span className="zx-ai-context-chip active">
                      <span>{contextEntity.label || contextEntity.type || 'Focused Record'}</span>
                      <button
                        type="button"
                        className="zx-ai-context-clear"
                        onClick={() => setContextEntity(null)}
                        aria-label="Clear record focus"
                      >
                        &times;
                      </button>
                    </span>
                  </>
                )}
              </div>

              <textarea
                ref={inputRef}
                rows={1}
                className="zx-ai-composer-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  aiStatus?.enabled === false
                    ? 'ZORVI AI features are disabled by administrator'
                    : 'Ask anything, or command ZORVI (tickets, CRM, hiring, HRMS, projects...)'
                }
                disabled={sending || confirming || aiStatus?.enabled === false}
                maxLength={1200}
              />

              <div className="zx-ai-composer-bar">
                <div className="zx-ai-composer-bar-left">
                  <button
                    type="button"
                    className={`zx-ai-bar-btn ${showPromptMenu ? 'active' : ''}`}
                    onClick={() => setShowPromptMenu((v) => !v)}
                    title="Quick prompts"
                    aria-label="Quick prompts"
                  >
                    <PlusIcon size={14} />
                    <span>Prompts</span>
                  </button>

                </div>

                <div className="zx-ai-composer-bar-right">
                  <span className="zx-ai-scope-pill">
                    <ShieldIcon size={12} />
                    <span>{isAdmin ? 'Admin Scope' : 'Standard Scope'}</span>
                  </span>
                  <button
                    type="submit"
                    className="zx-ai-send-circle"
                    disabled={sending || confirming || !input.trim() || aiStatus?.enabled === false}
                    title="Send (Enter)"
                    aria-label="Send message"
                  >
                    {sending ? <span className="zx-ai-send-spinner" /> : <ArrowUpIcon size={16} />}
                  </button>
                </div>
              </div>
            </form>
            <div className="zx-ai-composer-disclaimer">
              ZORVI can make mistakes. Check important info.
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
