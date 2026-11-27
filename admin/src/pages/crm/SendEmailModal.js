import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiListEmailTemplates, apiSendCrmEmail, apiAiCrmDraftEmail } from '../../api';
import { SparklesIcon, MailIcon, AlertTriangleIcon, ZapIcon, SendIcon, XIcon, CheckIcon } from '../../components/CrmHrmsIcons';
import RichTextEditor from '../../components/RichTextEditor';
import { stripHtmlText } from '../../utils/safeHtml';
import { useAuth } from '../../auth';
import './SendEmailModal.css';

function interpolateTemplate(tmpl, recipientInfo, senderName) {
  const contactName = recipientInfo.name || recipientInfo.first_name || 'Client';
  const company = recipientInfo.company || 'your organization';
  const dealTitle = recipientInfo.dealTitle || 'Project Engagement';
  const quoteNumber = recipientInfo.quoteNumber || 'QUO-2026';
  const amount = recipientInfo.amount
    ? `₹${Number(recipientInfo.amount).toLocaleString('en-IN')}`
    : 'as discussed';
  const myName = senderName || 'Zorvixe Team Consultant';

  const replaceVars = (str = '') =>
    String(str)
      .replace(/{Name}/g, contactName)
      .replace(/{Company}/g, company)
      .replace(/{DealTitle}/g, dealTitle)
      .replace(/{QuoteNumber}/g, quoteNumber)
      .replace(/{Amount}/g, amount)
      .replace(/{MyName}/g, myName);

  return {
    subject: replaceVars(tmpl.subject),
    body: replaceVars(tmpl.body)
  };
}

export default function SendEmailModal({
  isOpen,
  onClose,
  defaultRecipient = {},
  relatedType = 'lead',
  relatedId = null,
  onSuccess
}) {
  const { user } = useAuth();
  const editorNodeRef = useRef(null);
  const closeTimerRef = useRef(null);

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [toName, setToName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiTone, setAiTone] = useState('consultative');
  const [aiDraftMeta, setAiDraftMeta] = useState(null);

  const applyTemplate = useCallback(
    (tmpl, recipientInfo = defaultRecipient) => {
      if (!tmpl) return;
      const rendered = interpolateTemplate(tmpl, recipientInfo, user?.name);
      setSubject(rendered.subject);
      setBody(rendered.body);
    },
    [defaultRecipient, user?.name]
  );

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Fetch templates & hydrate recipient fields on open
  useEffect(() => {
    if (!isOpen) return undefined;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    let cancelled = false;
    setSelectedTemplateId('');
    setToEmail(defaultRecipient.email || '');
    setToName(defaultRecipient.name || defaultRecipient.first_name || '');
    setSubject(defaultRecipient.subject || '');
    setBody(defaultRecipient.body || '');
    setErrorMsg('');
    setSuccessMsg('');
    setAiDraftMeta(null);

    const loadTemplates = async () => {
      try {
        const res = await apiListEmailTemplates();
        if (cancelled) return;
        const list = res.templates || [];
        setTemplates(list);

        if (defaultRecipient.category && list.length > 0) {
          const matched = list.find((t) => t.category === defaultRecipient.category);
          if (matched) {
            applyTemplate(matched, defaultRecipient);
            setSelectedTemplateId(String(matched.id));
          }
        }
      } catch (err) {
        console.error('Failed to load email templates:', err);
      }
    };

    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [isOpen, defaultRecipient, applyTemplate]);

  const handleTemplateSelect = (e) => {
    const tmplId = e.target.value;
    setSelectedTemplateId(tmplId);
    if (!tmplId) return;

    const tmpl = templates.find((t) => String(t.id) === String(tmplId));
    if (tmpl) {
      applyTemplate(tmpl, defaultRecipient);
    }
  };

  const insertTag = (tag) => {
    const editorEl = editorNodeRef.current;
    if (editorEl) {
      editorEl.focus();
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editorEl.contains(selection.anchorNode)) {
        document.execCommand('insertText', false, tag);
        setBody(editorEl.innerHTML);
        return;
      }
      const nextHtml = `${editorEl.innerHTML || ''}${editorEl.innerHTML ? ' ' : ''}${tag}`;
      editorEl.innerHTML = nextHtml;
      setBody(nextHtml);
      return;
    }
    setBody((prev) => `${prev || ''}${prev ? ' ' : ''}${tag}`);
  };

  const handleDraftWithAi = async () => {
    setAiDrafting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiAiCrmDraftEmail({
        relatedType,
        relatedId,
        recipientName: toName || defaultRecipient.name,
        recipientEmail: toEmail || defaultRecipient.email,
        company: defaultRecipient.company,
        goal: defaultRecipient.goal || 'Follow up and align on next steps',
        tone: aiTone
      });
      if (res?.subject) setSubject(res.subject);
      if (res?.body) setBody(res.body);
      setAiDraftMeta({
        auditId: res?.auditId || null,
        uncertainty: res?.uncertainty || 'Review and verify details before sending.'
      });
    } catch (err) {
      setErrorMsg(err.message || 'AI draft generation failed.');
    } finally {
      setAiDrafting(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!toEmail.trim()) {
      setErrorMsg('Recipient email address is required.');
      return;
    }
    if (!subject.trim()) {
      setErrorMsg('Email subject line is required.');
      return;
    }
    if (!stripHtmlText(body)) {
      setErrorMsg('Email body cannot be empty.');
      return;
    }

    setSending(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiSendCrmEmail({
        to: toEmail.trim(),
        toName: toName.trim(),
        subject: subject.trim(),
        body,
        relatedType,
        relatedId,
        aiAssisted: Boolean(aiDraftMeta),
        aiAuditId: aiDraftMeta?.auditId || null
      });

      setSuccessMsg(res.message || 'Email sent and logged successfully.');
      if (onSuccess) onSuccess();
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 750);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to dispatch email.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="crm-modal-backdrop send-email-backdrop" onClick={onClose}>
      <div
        className="crm-modal-card send-email-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Compose and Send Sales Email"
      >
        {/* Pinned Header */}
        <div className="crm-modal-header send-email-header">
          <div className="modal-title-with-icon">
            <span className="email-modal-icon">
              <MailIcon size={18} />
            </span>
            <div>
              <h4>Compose &amp; Send Sales Email</h4>
              <p className="email-modal-subtitle">
                Auto-merges client data and logs conversation to Account 360°
              </p>
            </div>
          </div>
          <button
            type="button"
            className="crm-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <XIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSend} className="send-email-form">
          {/* Scrollable Body */}
          <div className="send-email-scroll-body">
            {errorMsg && (
              <div className="email-error-banner" role="alert">
                <AlertTriangleIcon size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="email-success-banner" role="status">
                <CheckIcon size={15} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Template + AI Assistant Bar */}
            <div className="email-template-bar">
              <div className="email-template-select-wrap">
                <label className="template-bar-label" htmlFor="crm-email-tmpl">
                  <ZapIcon size={13} />
                  <span>Template</span>
                </label>
                <select
                  id="crm-email-tmpl"
                  value={selectedTemplateId}
                  onChange={handleTemplateSelect}
                  className="email-template-select"
                >
                  <option value="">-- Choose a template --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name} [{(t.category || 'general').toUpperCase()}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="email-ai-controls">
                <select
                  value={aiTone}
                  onChange={(e) => setAiTone(e.target.value)}
                  className="email-tone-select"
                  title="AI email tone"
                  aria-label="AI email tone"
                >
                  <option value="consultative">Consultative</option>
                  <option value="followup">Warm Follow-up</option>
                  <option value="executive">Executive Concise</option>
                </select>
                <button
                  type="button"
                  className="zx-ai-btn-primary email-ai-draft-btn"
                  onClick={handleDraftWithAi}
                  disabled={aiDrafting || sending}
                  title="Draft grounded sales email for review"
                >
                  <SparklesIcon size={13} />
                  <span>{aiDrafting ? 'Drafting...' : 'ZORVI Draft'}</span>
                </button>
              </div>
            </div>

            {aiDraftMeta && (
              <div className="email-ai-notice">
                <strong>ZORVI Draft Ready for Review:</strong> {aiDraftMeta.uncertainty}
              </div>
            )}

            <div className="email-form-row two-col">
              <div className="email-form-group">
                <label htmlFor="crm-email-to">To (Email Address) *</label>
                <input
                  id="crm-email-to"
                  type="email"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="client.name@company.com"
                  required
                />
              </div>
              <div className="email-form-group">
                <label htmlFor="crm-email-name">Recipient Name / Attention</label>
                <input
                  id="crm-email-name"
                  type="text"
                  value={toName}
                  onChange={(e) => setToName(e.target.value)}
                  placeholder="e.g. Vikram Sharma"
                />
              </div>
            </div>

            <div className="email-form-group">
              <label htmlFor="crm-email-subject">Subject Line *</label>
              <input
                id="crm-email-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Zorvixe Technologies — Architecture Proposal"
                required
              />
            </div>

            {/* Merge Tag Pills */}
            <div className="merge-tags-container">
              <span className="merge-hint">Insert tag:</span>
              <button type="button" className="merge-tag-pill" onClick={() => insertTag('{Name}')}>+ {'{Name}'}</button>
              <button type="button" className="merge-tag-pill" onClick={() => insertTag('{Company}')}>+ {'{Company}'}</button>
              <button type="button" className="merge-tag-pill" onClick={() => insertTag('{QuoteNumber}')}>+ {'{QuoteNumber}'}</button>
              <button type="button" className="merge-tag-pill" onClick={() => insertTag('{Amount}')}>+ {'{Amount}'}</button>
              <button type="button" className="merge-tag-pill" onClick={() => insertTag('{DealTitle}')}>+ {'{DealTitle}'}</button>
            </div>

            <div className="email-form-group">
              <label>Email Body *</label>
              <RichTextEditor
                inputRef={editorNodeRef}
                value={body}
                minHeight="140px"
                maxHeight="250px"
                aiFieldLabel="Sales Email Body"
                aiContext={{ subject, recipient: toName || toEmail, relatedType }}
                placeholder="Write your email proposal or follow-up message"
                onChange={(content) => setBody(content)}
              />
            </div>
          </div>

          {/* Pinned Footer */}
          <div className="email-modal-footer">
            <button
              type="button"
              className="crm-btn crm-btn-secondary"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="crm-btn crm-btn-primary"
              disabled={sending || Boolean(successMsg)}
            >
              <SendIcon size={13} />
              <span>{sending ? 'Sending Email...' : 'Send Email & Log Activity'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
