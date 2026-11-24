import React, { useState, useEffect } from 'react';
import { apiListEmailTemplates, apiSendCrmEmail } from '../../api';
import { useAuth } from '../../auth';
import './SendEmailModal.css';

export default function SendEmailModal({
  isOpen,
  onClose,
  defaultRecipient = {},
  relatedType = 'lead',
  relatedId = null,
  onSuccess
}) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [toName, setToName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch templates on open
  useEffect(() => {
    if (!isOpen) return;

    setToEmail(defaultRecipient.email || '');
    setToName(defaultRecipient.name || defaultRecipient.first_name || '');
    setSubject(defaultRecipient.subject || '');
    setBody(defaultRecipient.body || '');
    setErrorMsg('');

    const loadTemplates = async () => {
      try {
        const res = await apiListEmailTemplates();
        setTemplates(res.templates || []);

        // If a default category was requested (e.g. proposal)
        if (defaultRecipient.category && res.templates) {
          const matched = res.templates.find(t => t.category === defaultRecipient.category);
          if (matched) {
            applyTemplate(matched, defaultRecipient);
            setSelectedTemplateId(matched.id);
          }
        }
      } catch (err) {
        console.error('Failed to load email templates:', err);
      }
    };

    loadTemplates();
  }, [isOpen, defaultRecipient]);

  const applyTemplate = (tmpl, recipientInfo = defaultRecipient) => {
    if (!tmpl) return;

    const contactName = recipientInfo.name || recipientInfo.first_name || 'Client';
    const company = recipientInfo.company || 'your organization';
    const dealTitle = recipientInfo.dealTitle || 'Project Engagement';
    const quoteNumber = recipientInfo.quoteNumber || 'QUO-2026';
    const amount = recipientInfo.amount ? `₹${Number(recipientInfo.amount).toLocaleString('en-IN')}` : 'as discussed';
    const myName = user?.name || 'Zorvixe Team Consultant';

    let subj = tmpl.subject
      .replace(/{Name}/g, contactName)
      .replace(/{Company}/g, company)
      .replace(/{DealTitle}/g, dealTitle)
      .replace(/{QuoteNumber}/g, quoteNumber)
      .replace(/{Amount}/g, amount)
      .replace(/{MyName}/g, myName);

    let content = tmpl.body
      .replace(/{Name}/g, contactName)
      .replace(/{Company}/g, company)
      .replace(/{DealTitle}/g, dealTitle)
      .replace(/{QuoteNumber}/g, quoteNumber)
      .replace(/{Amount}/g, amount)
      .replace(/{MyName}/g, myName);

    setSubject(subj);
    setBody(content);
  };

  const handleTemplateSelect = (e) => {
    const tmplId = e.target.value;
    setSelectedTemplateId(tmplId);
    if (!tmplId) return;

    const tmpl = templates.find(t => String(t.id) === String(tmplId));
    if (tmpl) {
      applyTemplate(tmpl, defaultRecipient);
    }
  };

  const insertTag = (tag) => {
    setBody(prev => prev + tag);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!toEmail) {
      setErrorMsg('Recipient email address is required.');
      return;
    }
    if (!subject.trim()) {
      setErrorMsg('Email subject line is required.');
      return;
    }
    if (!body.trim()) {
      setErrorMsg('Email body cannot be empty.');
      return;
    }

    setSending(true);
    setErrorMsg('');

    try {
      const res = await apiSendCrmEmail({
        to: toEmail,
        toName: toName,
        subject: subject,
        body: body,
        relatedType: relatedType,
        relatedId: relatedId
      });

      alert(res.message || 'Email sent successfully!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to dispatch email.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal-card send-email-card" onClick={e => e.stopPropagation()}>
        <div className="crm-modal-header">
          <div className="modal-title-with-icon">
            <span className="email-modal-icon">✉️</span>
            <div>
              <h4>Compose & Send Sales Email</h4>
              <p className="email-modal-subtitle">Auto-merges client data and logs conversation to Account 360°</p>
            </div>
          </div>
          <button type="button" className="crm-modal-close" onClick={onClose}>×</button>
        </div>

        {errorMsg && (
          <div className="email-error-banner">
            <span>⚠️</span> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSend} className="send-email-form">
          {/* Template Selector Bar */}
          <div className="email-template-bar">
            <label className="template-bar-label">⚡ Fast Template:</label>
            <select
              value={selectedTemplateId}
              onChange={handleTemplateSelect}
              className="email-template-select"
            >
              <option value="">-- Choose a pre-configured template --</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} [{t.category.toUpperCase()}]
                </option>
              ))}
            </select>
          </div>

          <div className="email-form-row two-col">
            <div className="email-form-group">
              <label>To (Email Address) *</label>
              <input
                type="email"
                value={toEmail}
                onChange={e => setToEmail(e.target.value)}
                placeholder="client.name@company.com"
                required
              />
            </div>
            <div className="email-form-group">
              <label>Recipient Name / Attention</label>
              <input
                type="text"
                value={toName}
                onChange={e => setToName(e.target.value)}
                placeholder="e.g. Vikram Sharma"
              />
            </div>
          </div>

          <div className="email-form-group">
            <label>Subject Line *</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Zorvixe Technologies — Architecture Proposal"
              required
            />
          </div>

          {/* Merge Tag Pills */}
          <div className="merge-tags-container">
            <span className="merge-hint">Click tag to insert:</span>
            <button type="button" className="merge-tag-pill" onClick={() => insertTag('{Name}')}>+ {'{Name}'}</button>
            <button type="button" className="merge-tag-pill" onClick={() => insertTag('{Company}')}>+ {'{Company}'}</button>
            <button type="button" className="merge-tag-pill" onClick={() => insertTag('{QuoteNumber}')}>+ {'{QuoteNumber}'}</button>
            <button type="button" className="merge-tag-pill" onClick={() => insertTag('{Amount}')}>+ {'{Amount}'}</button>
            <button type="button" className="merge-tag-pill" onClick={() => insertTag('{DealTitle}')}>+ {'{DealTitle}'}</button>
          </div>

          <div className="email-form-group">
            <label>Email Body *</label>
            <textarea
              rows={9}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your email proposal or notes here..."
              required
            />
          </div>

          <div className="email-modal-footer">
            <button type="button" className="crm-btn crm-btn-secondary" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button type="submit" className="crm-btn crm-btn-primary" disabled={sending}>
              {sending ? 'Sending Email...' : '🚀 Send Email & Log Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
