import React, { useState, useEffect, useCallback } from 'react';
import {
  apiUpdateDeal,
  apiListCrmActivities,
  apiCreateCrmActivity,
  apiListCrmEmails
} from '../../api';
import RichTextEditor from '../../components/RichTextEditor';
import { renderSafeHtml } from '../../utils/safeHtml';
import { showToast } from '../../utils/toast';
import {
  BriefcaseIcon,
  SparklesIcon,
  MailIcon,
  EditIcon,
  TrashIcon,
  PlusIcon,
  XIcon,
  FileTextIcon,
  AwardIcon
} from '../../components/CrmHrmsIcons';
import './LeadsTab.css';

export default function DealInspectorDrawer({
  deal,
  dealStages = [],
  timelineRefreshKey = 0,
  onClose,
  onDealUpdated,
  onStageChange,
  onDeleteDeal,
  onRunSummary,
  onOpenEmail,
  onActivityCreated
}) {
  const [drawerNote, setDrawerNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSavedMsg, setNoteSavedMsg] = useState('');
  const [dealActivities, setDealActivities] = useState([]);
  const [dealEmails, setDealEmails] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Inline quick interaction logger
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [quickActForm, setQuickActForm] = useState({
    type: 'call',
    title: '',
    description: ''
  });
  const [savingQuickAct, setSavingQuickAct] = useState(false);

  // Edit Deal Details modal inside drawer
  const [editingDeal, setEditingDeal] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const fmtCurrency = (val) => (val || Number(val) === 0 ? `₹${Number(val).toLocaleString('en-IN')}` : '--');
  const formatShortDate = (dt) => {
    if (!dt) return '--';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '--';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const formatShortDateTime = (dt) => {
    if (!dt) return '--';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '--';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const loadTimeline = useCallback(async (dealId) => {
    if (!dealId) return;
    setTimelineLoading(true);
    try {
      const [actsRes, emailsRes] = await Promise.all([
        apiListCrmActivities({ deal_id: dealId }).catch(() => ({ activities: [] })),
        apiListCrmEmails({ related_type: 'deal', related_id: dealId }).catch(() => ({ emails: [] }))
      ]);

      const allActs = actsRes.activities || [];
      const matchedActs = allActs.filter(
        (a) =>
          String(a.deal_id || '') === String(dealId) ||
          (a.related_type === 'deal' && String(a.related_id || '') === String(dealId))
      );
      setDealActivities(matchedActs);

      const allEmails = emailsRes.emails || [];
      const matchedEmails = allEmails.filter(
        (em) => em.related_type === 'deal' && String(em.related_id || '') === String(dealId)
      );
      setDealEmails(matchedEmails);
    } catch (err) {
      console.error('Failed to load deal timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  const currentDealId = deal?.id;
  const currentDealDescription = deal?.description || '';

  useEffect(() => {
    setDrawerNote(currentDealDescription);
  }, [currentDealId, currentDealDescription]);

  useEffect(() => {
    if (!currentDealId) return;
    setNoteSavedMsg('');
    setShowLogActivity(false);
    setEditingDeal(null);
    loadTimeline(currentDealId);
  }, [currentDealId, timelineRefreshKey, loadTimeline]);

  if (!deal) return null;

  const currentStageObj = dealStages.find((s) => s.key === (deal.stage || 'lead'));
  const currentStageLabel = currentStageObj?.label || deal.stage || 'Lead';
  const currentStageIdx = dealStages.findIndex((s) => s.key === (deal.stage || 'lead'));
  const nextStageObj =
    currentStageIdx >= 0 && currentStageIdx < dealStages.length - 1
      ? dealStages[currentStageIdx + 1]
      : null;

  const handleSaveNote = async () => {
    setSavingNote(true);
    setNoteSavedMsg('');
    try {
      const res = await apiUpdateDeal(deal.id, { description: drawerNote });
      const updated = { ...deal, ...(res.deal || {}), description: drawerNote };
      if (onDealUpdated) onDealUpdated(updated);
      setNoteSavedMsg('Saved');
      setTimeout(() => setNoteSavedMsg(''), 2500);
    } catch (err) {
      showToast(err.message || 'Failed to save deal note', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const handleQuickActivitySubmit = async (e) => {
    e.preventDefault();
    if (!quickActForm.title.trim()) return;
    setSavingQuickAct(true);
    try {
      await apiCreateCrmActivity({
        deal_id: deal.id,
        client_id: deal.client_id || null,
        type: quickActForm.type,
        title: quickActForm.title.trim(),
        description: quickActForm.description,
        due_date: new Date().toISOString().slice(0, 16)
      });
      setQuickActForm({ type: 'call', title: '', description: '' });
      setShowLogActivity(false);
      await loadTimeline(deal.id);
      if (onActivityCreated) onActivityCreated();
    } catch (err) {
      showToast(err.message || 'Failed to log deal interaction', 'error');
    } finally {
      setSavingQuickAct(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingDeal?.title?.trim()) {
      showToast('Deal title is required', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await apiUpdateDeal(deal.id, {
        title: editingDeal.title.trim(),
        value: Number(editingDeal.value || 0),
        probability: Number(editingDeal.probability ?? 50),
        expected_close_date: editingDeal.expected_close_date || null,
        description: editingDeal.description || ''
      });
      const updated = { ...deal, ...(res.deal || {}), ...editingDeal };
      setDrawerNote(updated.description || '');
      if (onDealUpdated) onDealUpdated(updated);
      setEditingDeal(null);
    } catch (err) {
      showToast(err.message || 'Failed to update deal', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <>
      <div className="ld-drawer-backdrop" onClick={onClose}>
        <aside
          className="ld-drawer-panel"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Deal details"
        >
          {/* Drawer Header */}
          <div className="ld-drawer-header">
            <div className="ld-drawer-header-top">
              <div className="ld-drawer-identity">
                <div className="ld-drawer-avatar">
                  <BriefcaseIcon size={18} />
                </div>
                <div>
                  <div className="ld-drawer-title-line">
                    <h3>{deal.title}</h3>
                    <span
                      className={`status-pill status-${deal.stage === 'won'
                          ? 'qualified'
                          : deal.stage === 'lost'
                            ? 'lost'
                            : deal.stage === 'negotiation'
                              ? 'attempted_to_contact'
                              : 'new'
                        }`}
                    >
                      {currentStageLabel}
                    </span>
                  </div>
                  <div className="ld-drawer-subtitle">
                    <span>DEAL-{deal.id}</span>
                    {deal.client_name && <span> · {deal.client_name}</span>}
                    {deal.contact_name && <span> · {deal.contact_name}</span>}
                    {deal.client_email && <span> · {deal.client_email}</span>}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="ld-drawer-close"
                onClick={onClose}
                aria-label="Close drawer"
              >
                <XIcon size={16} />
              </button>
            </div>

            <div className="ld-drawer-metrics-strip">
              <div className="ld-metric-cell">
                <span>Interactions</span>
                <strong className="tabular-nums">{dealActivities.length + dealEmails.length}</strong>
              </div>
              <div className="ld-metric-cell">
                <span>Win probability</span>
                <strong className="tabular-nums">{deal.probability ?? 50}%</strong>
              </div>
              <div className="ld-metric-cell">
                <span>Deal value</span>
                <strong className="tabular-nums">{fmtCurrency(deal.value)}</strong>
              </div>
              <div className="ld-metric-cell">
                <span>Target close</span>
                <strong className="tabular-nums">{formatShortDate(deal.expected_close_date)}</strong>
              </div>
            </div>
          </div>

          {/* Two-Column Split Body */}
          <div className="ld-drawer-body">
            {/* LEFT COLUMN: Known Info + Notes */}
            <div className="ld-drawer-left">
              <div className="ld-section-heading-row">
                <span className="ld-section-eyebrow">
                  Known info · {deal.loss_reason ? '10' : '8'} fields
                </span>
                <select
                  className="ld-inline-status-select"
                  value={deal.stage || 'lead'}
                  onChange={(e) => onStageChange && onStageChange(deal.id, e.target.value)}
                  aria-label="Update deal stage"
                >
                  {dealStages.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ld-known-info-grid">
                <div className="ld-known-cell">
                  <span className="ld-k-label">Deal reference</span>
                  <span className="ld-k-val tabular-nums">DEAL-{deal.id}</span>
                </div>
                <div className="ld-known-cell">
                  <span className="ld-k-label">Client / Account</span>
                  <span className="ld-k-val">{deal.client_name || '--'}</span>
                </div>
                <div className="ld-known-cell">
                  <span className="ld-k-label">Primary contact</span>
                  <span className="ld-k-val">{deal.contact_name || '--'}</span>
                </div>
                <div className="ld-known-cell">
                  <span className="ld-k-label">Email address</span>
                  <span className="ld-k-val">{deal.client_email || '--'}</span>
                </div>
                <div className="ld-known-cell">
                  <span className="ld-k-label">Deal value</span>
                  <span className="ld-k-val tabular-nums">{fmtCurrency(deal.value)}</span>
                </div>
                <div className="ld-known-cell">
                  <span className="ld-k-label">Win probability</span>
                  <span className="ld-k-val tabular-nums">{deal.probability ?? 50}%</span>
                </div>
                <div className="ld-known-cell">
                  <span className="ld-k-label">Target close</span>
                  <span className="ld-k-val tabular-nums">{formatShortDate(deal.expected_close_date)}</span>
                </div>
                <div className="ld-known-cell">
                  <span className="ld-k-label">Assigned owner</span>
                  <span className="ld-k-val">{deal.assigned_user_name || 'Zorvixe Sales'}</span>
                </div>
                {deal.loss_reason && (
                  <>
                    <div className="ld-known-cell">
                      <span className="ld-k-label">Loss reason</span>
                      <span className="ld-k-val">{deal.loss_reason}</span>
                    </div>
                    <div className="ld-known-cell">
                      <span className="ld-k-label">Created on</span>
                      <span className="ld-k-val tabular-nums">{formatShortDateTime(deal.created_at)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Notes & Scope inside RichTextEditor */}
              <div className="ld-notes-section">
                <div className="ld-section-heading-row">
                  <span className="ld-section-eyebrow">
                    <FileTextIcon size={12} /> Notes &amp; scope
                  </span>
                </div>
                <RichTextEditor
                  compact
                  className="ld-notes-editor"
                  minHeight="90px"
                  maxHeight="180px"
                  placeholder="Add deal scope, deliverables, or negotiation notes"
                  aiFieldLabel="Deal Scope & Notes"
                  aiContext={{
                    dealTitle: deal.title,
                    client: deal.client_name,
                    stage: currentStageLabel,
                    value: deal.value
                  }}
                  value={drawerNote}
                  onChange={(val) => setDrawerNote(val)}
                  footerContent={
                    <div className="ld-notes-editor-footer">
                      {noteSavedMsg && <span className="ld-note-saved">{noteSavedMsg}</span>}
                      <button
                        type="button"
                        className="ld-btn-save-note"
                        onClick={handleSaveNote}
                        disabled={savingNote}
                      >
                        {savingNote ? 'Saving...' : 'Save note'}
                      </button>
                    </div>
                  }
                />
              </div>
            </div>

            {/* RIGHT COLUMN: Interactions / Activity Timeline */}
            <div className="ld-drawer-right">
              <div className="ld-section-heading-row">
                <span className="ld-section-eyebrow">
                  Interactions · {dealActivities.length + dealEmails.length}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="ld-btn-mini"
                    onClick={() => onRunSummary && onRunSummary(deal.id)}
                  >
                    <SparklesIcon size={12} />
                    <span>ZORVI Brief</span>
                  </button>
                  <button
                    type="button"
                    className="ld-btn-mini ld-btn-mini-accent"
                    onClick={() => setShowLogActivity((v) => !v)}
                  >
                    <PlusIcon size={12} />
                    <span>Log interaction</span>
                  </button>
                </div>
              </div>

              {showLogActivity && (
                <form onSubmit={handleQuickActivitySubmit} className="ld-quick-log-card">
                  <div className="ld-quick-log-row">
                    <select
                      value={quickActForm.type}
                      onChange={(e) => setQuickActForm((p) => ({ ...p, type: e.target.value }))}
                    >
                      <option value="call">Phone call</option>
                      <option value="meeting">Client meeting / pitch</option>
                      <option value="email">Email follow-up</option>
                      <option value="note">Strategic note</option>
                      <option value="task">Action item</option>
                    </select>
                    <input
                      type="text"
                      required
                      placeholder="Interaction summary"
                      value={quickActForm.title}
                      onChange={(e) => setQuickActForm((p) => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <RichTextEditor
                    compact
                    minHeight="60px"
                    maxHeight="120px"
                    placeholder="Discussion outcome, pricing feedback, or next step"
                    aiFieldLabel="Deal Interaction Outcome"
                    value={quickActForm.description}
                    onChange={(val) => setQuickActForm((p) => ({ ...p, description: val }))}
                  />
                  <div className="ld-quick-log-actions">
                    <button
                      type="button"
                      className="btn-modal-cancel"
                      onClick={() => setShowLogActivity(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-modal-submit"
                      disabled={savingQuickAct}
                    >
                      {savingQuickAct ? 'Saving...' : 'Log interaction'}
                    </button>
                  </div>
                </form>
              )}

              {timelineLoading ? (
                <div className="loader_container">
                  <p className="loader_spinner"></p>
                  <p>Loading activities...</p>
                </div>
              ) : (
                <div className="ld-timeline-list">
                  {dealActivities.map((act) => (
                    <div className="ld-timeline-card" key={`deal-act-${act.id}`}>
                      <div className="ld-tl-header">
                        <span className={`status-pill status-${act.type === 'call' ? 'qualified' : 'new'}`}>
                          {act.type || 'activity'}
                        </span>
                        <span className="ld-tl-time tabular-nums">
                          {formatShortDateTime(act.due_date || act.created_at)}
                        </span>
                      </div>
                      <div className="ld-tl-title">{act.title}</div>
                      {act.description && (
                        <div
                          className="ld-tl-body"
                          dangerouslySetInnerHTML={{ __html: renderSafeHtml(act.description) }}
                        />
                      )}
                    </div>
                  ))}

                  {dealEmails.map((em) => (
                    <div className="ld-timeline-card" key={`deal-em-${em.id}`}>
                      <div className="ld-tl-header">
                        <span className="status-pill status-contacted">Email sent</span>
                        <span className="ld-tl-time tabular-nums">
                          {formatShortDateTime(em.sent_at || em.created_at)}
                        </span>
                      </div>
                      <div className="ld-tl-title">{em.subject || 'Outreach email'}</div>
                      {em.body && (
                        <div
                          className="ld-tl-body"
                          dangerouslySetInnerHTML={{ __html: renderSafeHtml(em.body) }}
                        />
                      )}
                    </div>
                  ))}

                  {/* Initial Deal Created Event */}
                  <div className="ld-timeline-card">
                    <div className="ld-tl-header">
                      <span className="status-pill status-new">{currentStageLabel}</span>
                      <span className="ld-tl-time tabular-nums">
                        {formatShortDateTime(deal.created_at)}
                      </span>
                    </div>
                    <div className="ld-tl-title">
                      Opportunity DEAL-{deal.id} created
                    </div>
                    {deal.description && (
                      <div
                        className="ld-tl-body"
                        dangerouslySetInnerHTML={{ __html: renderSafeHtml(deal.description) }}
                      />
                    )}
                    <div className="ld-tl-chips">
                      <span className="ld-tl-chip">+ Value: {fmtCurrency(deal.value)}</span>
                      <span className="ld-tl-chip">+ Probability: {deal.probability ?? 50}%</span>
                      {deal.client_name && <span className="ld-tl-chip">+ Client: {deal.client_name}</span>}
                      {deal.expected_close_date && (
                        <span className="ld-tl-chip">+ Target: {formatShortDate(deal.expected_close_date)}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Sticky Action Footer */}
          <div className="ld-drawer-footer">
            <div className="ld-drawer-footer-left">
              <button
                type="button"
                className="ld-btn-secondary"
                onClick={() =>
                  setEditingDeal({
                    title: deal.title || '',
                    value: Number(deal.value || 0),
                    probability: Number(deal.probability ?? 50),
                    expected_close_date: deal.expected_close_date
                      ? String(deal.expected_close_date).slice(0, 10)
                      : '',
                    description: deal.description || ''
                  })
                }
              >
                <EditIcon size={13} />
                <span>Edit</span>
              </button>
              <button
                type="button"
                className="ld-btn-secondary"
                onClick={() => onOpenEmail && onOpenEmail(deal)}
              >
                <MailIcon size={13} />
                <span>Send email</span>
              </button>
              <button
                type="button"
                className="ld-btn-danger-subtle"
                onClick={() => onDeleteDeal && onDeleteDeal(deal.id)}
              >
                <TrashIcon size={13} />
                <span>Delete</span>
              </button>
            </div>

            <div className="ld-drawer-footer-right">
              {nextStageObj && deal.stage !== 'won' && deal.stage !== 'lost' && (
                <button
                  type="button"
                  className="ld-btn-secondary"
                  onClick={() => onStageChange && onStageChange(deal.id, nextStageObj.key)}
                >
                  <span>Move to {nextStageObj.label}</span>
                </button>
              )}
              {deal.stage !== 'won' ? (
                <button
                  type="button"
                  className="btn-modal-convert"
                  onClick={() => onStageChange && onStageChange(deal.id, 'won')}
                >
                  <AwardIcon size={14} style={{ marginRight: 5 }} />
                  Mark Won
                </button>
              ) : (
                <span className="converted-tag">Closed Won</span>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Edit Deal Modal */}
      {editingDeal && (
        <div className="crm-modal-backdrop" style={{ zIndex: 10230 }} onClick={() => setEditingDeal(null)}>
          <div className="crm-modal-card crm-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h4>Edit Deal · DEAL-{deal.id}</h4>
              <button type="button" className="crm-modal-close" onClick={() => setEditingDeal(null)}>×</button>
            </div>
            <form onSubmit={handleSaveEdit} className="crm-modal-form">
              <div className="crm-form-group">
                <label>Deal Title *</label>
                <input
                  type="text"
                  required
                  value={editingDeal.title}
                  onChange={(e) => setEditingDeal({ ...editingDeal, title: e.target.value })}
                />
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Deal Value (₹)</label>
                  <input
                    type="number"
                    value={editingDeal.value}
                    onChange={(e) => setEditingDeal({ ...editingDeal, value: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Win Probability (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editingDeal.probability}
                    onChange={(e) => setEditingDeal({ ...editingDeal, probability: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-group">
                <label>Target Closing Date</label>
                <input
                  type="date"
                  value={editingDeal.expected_close_date}
                  onChange={(e) => setEditingDeal({ ...editingDeal, expected_close_date: e.target.value })}
                />
              </div>

              <div className="crm-form-group">
                <label>Scope &amp; Notes</label>
                <RichTextEditor
                  value={editingDeal.description}
                  minHeight="110px"
                  maxHeight="220px"
                  aiFieldLabel="Deal Scope & Notes"
                  placeholder="Update deal scope, pricing milestones, or deliverables"
                  onChange={(val) => setEditingDeal((prev) => ({ ...prev, description: val }))}
                />
              </div>

              <div className="crm-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setEditingDeal(null)}>Cancel</button>
                <button type="submit" className="btn-modal-submit" disabled={savingEdit}>
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
