import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  apiAiStatus,
  apiAiCopilotSession,
  apiAiCopilotReset,
  apiAiAssistantChat,
  apiAiCopilotConfirm,
  apiAiCopilotCancel,
} from '../api';
import ZorviAiLogo from '../assets/zorvi_ai_logo.png';
import { XIcon, AlertCircleIcon, ChevronRightIcon } from './CrmHrmsIcons';
import './AiAssistantDrawer.css';

const SESSION_STORAGE_KEY = 'zorvixe_copilot_session_id';

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

  const bodyRef = useRef(null);
  const inputRef = useRef(null);

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

  // Load AI status and persisted multi-turn session on open
  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    setStatusLoading(true);
    setError('');

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
    ])
      .then(([statusRes, sessionRes]) => {
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

  const handleNewChat = async () => {
    if (sending || confirming) return;
    setError('');
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
    } catch (err) {
      setError(err.message || 'Unable to reset Copilot session.');
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
    setInput('');
    const tempUserId = `${Date.now()}-u`;
    setMessages((prev) => [...prev, { id: tempUserId, role: 'user', text: q }]);
    setSending(true);
    setProgressText('Inspecting permissions & selecting platform tools...');

    const progressTimer = setTimeout(() => {
      setProgressText('Executing authorized queries & actions...');
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
    } catch (err) {
      setError(err.message || 'Failed to cancel confirmation.');
    } finally {
      setConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="zx-ai-drawer-backdrop" onClick={onClose}>
      <aside
        className="zx-ai-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="ZORVI Platform Copilot"
      >
        <div className="zx-ai-drawer-header">
          <div className="zx-ai-drawer-title">
            <img src={ZorviAiLogo} alt="ZORVI AI" className="zx-ai-header-logo" />
            <div>
              <h3>ZORVI</h3>
              <p>AI assistant &bull; Ctrl+J</p>
            </div>
          </div>
          <div className="zx-ai-header-controls">
            {messages.length > 0 && (
              <button
                type="button"
                className="zx-ai-btn-sm"
                onClick={handleNewChat}
                disabled={sending || confirming}
                title="Start a fresh conversation"
              >
                New Chat
              </button>
            )}
            <button type="button" className="zx-ai-close-btn" onClick={onClose} aria-label="Close ZORVI">
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* Conversation Body */}
        <div className="zx-ai-drawer-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="zx-ai-welcome">
              <p className="zx-ai-welcome-title">Ask or command ZORVI across Zorvixe</p>
              <p className="zx-ai-welcome-desc">
                I respect your account permissions ({user?.role || 'employee'}), ask clarifying questions when details
                are missing, execute routine actions, and ask you to confirm high-impact changes.
              </p>
              <div className="zx-ai-prompts-list">
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
                  <div className="zx-ai-bubble-user">{m.text}</div>
                ) : (
                  <div className="zx-ai-bubble-bot">
                    {m.meta?.fallbackUsed && m.meta?.providerError && (
                      <div className="zx-ai-fallback-notice" title={m.meta.providerError}>
                        Live LLM fallback ({m.meta.providerError}). Executed using built-in Copilot engine.
                      </div>
                    )}

                    <div className="zx-ai-bot-answer">{m.answer}</div>

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
                            <label>
                              Body
                              <textarea
                                rows={4}
                                value={draftOverrides.body}
                                onChange={(e) =>
                                  setDraftOverrides((prev) => ({ ...prev, body: e.target.value }))
                                }
                              />
                            </label>
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

                    {m.uncertainty && (
                      <div className="zx-ai-bot-uncertainty">Note: {m.uncertainty}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {(sending || confirming) && (
            <div className="zx-ai-state-loading">
              <span className="zx-ai-spinner" />
              <span>{progressText}</span>
            </div>
          )}

          {error && (
            <div className="zx-ai-state-error" role="alert">
              <AlertCircleIcon size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Prompt Suggestions bar when conversation active */}
        {messages.length > 0 && (
          <div className="zx-ai-quick-row">
            {quickPrompts.slice(0, 2).map((qp, idx) => (
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
        )}

        {/* Composer */}
        <form
          className="zx-ai-composer"
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              aiStatus?.enabled === false
                ? 'ZORVI AI features are disabled by administrator'
                : 'Ask or command ZORVI (tickets, CRM, hiring, HRMS, projects...)'
            }
            disabled={sending || confirming || aiStatus?.enabled === false}
            maxLength={1200}
          />
          <button
            type="submit"
            disabled={sending || confirming || !input.trim() || aiStatus?.enabled === false}
          >
            {sending ? '...' : 'Send'}
          </button>
        </form>
      </aside>
    </div>
  );
}
