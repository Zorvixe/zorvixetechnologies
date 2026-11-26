import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { apiAiStatus, apiAiAssistantChat } from '../api';
import { SparklesIcon, XIcon, AlertCircleIcon, ChevronRightIcon } from './CrmHrmsIcons';
import './AiAssistantDrawer.css';

export default function AiAssistantDrawer({ isOpen, onClose }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';

  const [aiStatus, setAiStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [contextEntity, setContextEntity] = useState(null);
  const [messages, setMessages] = useState([]);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    setStatusLoading(true);
    apiAiStatus()
      .then((res) => setAiStatus(res))
      .catch(() => setAiStatus(null))
      .finally(() => setStatusLoading(false));
  }, [isOpen, user]);

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
  }, [messages, sending]);

  const quickPrompts = useMemo(() => {
    const p = location.pathname || '/stats';
    if (p.includes('ticket')) {
      return [
        'Which open tickets have SLA risk or high urgency?',
        'How many tickets are currently unassigned?',
        'Summarize my team workload across open tickets.',
      ];
    }
    if (p.includes('crm') || p.includes('deal') || p.includes('lead') || p.includes('account')) {
      return [
        'Summarize active CRM pipeline value and open deals.',
        'Which deals look stale or overdue for follow-up?',
        'Which unconverted leads have the highest scores?',
      ];
    }
    if (p.includes('hrms') || p.includes('attendance') || p.includes('payroll') || p.includes('leave') || p.includes('recruitment')) {
      return isAdmin
        ? [
          'How many attendance punches and late marks happened today?',
          'Summarize pending leave requests requiring review.',
          'What is the current month payroll status?',
        ]
        : [
          'Summarize my recent attendance logs and hours.',
          'What is the status of my leave requests?',
          'Are any leave approvals waiting on me?',
        ];
    }
    if (p.includes('client') || p.includes('project')) {
      return [
        'Which accessible projects are still active or need updates?',
        'Which clients have open projects right now?',
      ];
    }
    return isAdmin
      ? [
        'Give me today’s executive summary and top risks.',
        'Which tickets need urgent triage or assignment?',
        'Are there pending payments or leave approvals?',
      ]
      : [
        'Give me my daily operational summary.',
        'Which open tickets are urgent or high priority?',
        'Summarize my accessible projects and recent leaves.',
      ];
  }, [location.pathname, isAdmin]);

  const sendQuestion = async (questionText) => {
    const q = (questionText !== undefined ? questionText : input).trim();
    if (!q || sending) return;
    if (aiStatus && aiStatus.enabled === false) {
      setError('AI features are currently disabled. Ask an administrator to enable AI in Users -> AI Settings.');
      return;
    }

    setError('');
    setInput('');
    setMessages((prev) => [...prev, { id: Date.now() + '-u', role: 'user', text: q }]);
    setSending(true);

    try {
      const res = await apiAiAssistantChat({
        message: q,
        currentPath: location.pathname + (location.hash || ''),
        contextEntity,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + '-a',
          role: 'assistant',
          answer: res.answer,
          supportingSummary: res.supportingSummary || [],
          groundingRecords: res.groundingRecords || [],
          suggestedActions: res.suggestedActions || [],
          uncertainty: res.uncertainty || '',
          meta: res.meta || null,
        },
      ]);
    } catch (err) {
      setError(err.message || 'Unable to get AI response right now.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="zx-ai-drawer-backdrop" onClick={onClose}>
      <aside
        className="zx-ai-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="ZORVI Role-Aware AI Assistant"
      >
        <div className="zx-ai-drawer-header">
          <div className="zx-ai-drawer-title">
            <span className="zx-ai-badge-icon">
              <SparklesIcon size={28} />
            </span>
            <div>
              <h3>ZORVI</h3>

            </div>
          </div>
          <button type="button" className="zx-ai-close-btn" onClick={onClose} aria-label="Close ZORVI">
            <XIcon size={18} />
          </button>
        </div>

        {/* Status Banner */}
        <div className="zx-ai-status-strip">
          {statusLoading ? (
            <span>Checking AI service status...</span>
          ) : aiStatus?.enabled === false ? (
            <span className="zx-ai-strip-warn">
              <AlertCircleIcon size={13} /> AI features disabled ({!aiStatus.envEnabled ? 'env' : 'admin setting'}).
            </span>
          ) : (
            <span>
              Mode: <strong>{aiStatus?.providerConfigured ? `${aiStatus.provider} (${aiStatus.model})` : 'Grounded Analytical Engine'}</strong>
            </span>
          )}
          <span className="zx-ai-strip-path" title={location.pathname}>
            Page: {location.pathname}
          </span>
        </div>

        {/* Conversation Body */}
        <div className="zx-ai-drawer-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="zx-ai-welcome">
              <p className="zx-ai-welcome-title">Ask ZORVI about authorized Zorvixe records</p>
              <p className="zx-ai-welcome-desc">
                I only query data your account ({user?.role || 'employee'}) is permitted to access, cite supporting records, and require human confirmation before any action changes records.
              </p>
              <div className="zx-ai-prompts-list">
                {quickPrompts.map((qp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="zx-ai-prompt-chip"
                    onClick={() => sendQuestion(qp)}
                    disabled={sending || aiStatus?.enabled === false}
                  >
                    <span>{qp}</span>
                    <ChevronRightIcon size={13} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`zx-ai-msg zx-ai-msg-${m.role}`}>
              {m.role === 'user' ? (
                <div className="zx-ai-bubble-user">{m.text}</div>
              ) : (
                <div className="zx-ai-bubble-bot">
                  <div className="zx-ai-bot-answer">{m.answer}</div>

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

                  {m.suggestedActions?.length > 0 && (
                    <div className="zx-ai-actions-row">
                      {m.suggestedActions.map((act, i) => (
                        <button
                          key={i}
                          type="button"
                          className="zx-ai-action-link"
                          onClick={() => {
                            if (act.url) {
                              navigate(act.url);
                              onClose();
                            }
                          }}
                        >
                          {act.label} →
                        </button>
                      ))}
                    </div>
                  )}

                  {m.uncertainty && (
                    <div className="zx-ai-bot-uncertainty">
                      Note: {m.uncertainty}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="zx-ai-state-loading">
              <span className="zx-ai-spinner" />
              <span>Checking authorized records...</span>
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
                disabled={sending || aiStatus?.enabled === false}
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              aiStatus?.enabled === false
                ? 'ZORVI AI features are disabled by administrator'
                : 'Ask ZORVI about tickets, deals, attendance, projects...'
            }
            disabled={sending || aiStatus?.enabled === false}
            maxLength={900}
          />
          <button
            type="submit"
            disabled={sending || !input.trim() || aiStatus?.enabled === false}
          >
            {sending ? '...' : 'Ask ZORVI'}
          </button>
        </form>
      </aside>
    </div>
  );
}
