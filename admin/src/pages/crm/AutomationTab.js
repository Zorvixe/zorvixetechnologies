import React, { useState, useEffect, useCallback } from 'react';
import {
  apiListEmailTemplates,
  apiCreateEmailTemplate,
  apiUpdateEmailTemplate,
  apiDeleteEmailTemplate
} from '../../api';
import {
  FileTextIcon,
  GlobeIcon,
  SettingsIcon,
  TrashIcon,
  CheckSquareIcon,
  AwardIcon,
  ShieldIcon,
  ClockIcon,
  TargetIcon,
  ZapIcon,
  CheckIcon
} from '../../components/CrmHrmsIcons';
import RichTextEditor from '../../components/RichTextEditor';
import { stripHtmlText } from '../../utils/safeHtml';
import './AutomationTab.css';

export default function AutomationTab() {
  const [subTab, setSubTab] = useState('templates'); // 'templates' | 'webforms' | 'blueprints'
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit Template Modal
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    category: 'sales',
    subject: '',
    body: ''
  });
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Webform Configurator State
  const [webformConfig, setWebformConfig] = useState({
    formTitle: 'Request a Free Technology Consultation',
    formSubtitle: 'Share your requirements and a Zorvixe enterprise architect will reach out within 24 hours.',
    includeCompany: true,
    includePhone: true,
    includeBudget: true,
    includeMessage: true,
    buttonText: 'Submit Consultation Request',
    themeColor: '#0052cc'
  });
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListEmailTemplates();
      setTemplates(res.templates || []);
    } catch (err) {
      console.error('Failed to load email templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      category: 'sales',
      subject: '',
      body: ''
    });
    setShowModal(true);
  };

  const openEditModal = (tmpl) => {
    setEditingTemplate(tmpl);
    setTemplateForm({
      name: tmpl.name,
      category: tmpl.category,
      subject: tmpl.subject,
      body: tmpl.body
    });
    setShowModal(true);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.subject.trim() || !stripHtmlText(templateForm.body)) {
      alert('Template Name, Subject, and Body are required.');
      return;
    }

    setSavingTemplate(true);
    try {
      if (editingTemplate) {
        await apiUpdateEmailTemplate(editingTemplate.id, templateForm);
        alert('Email template updated successfully!');
      } else {
        await apiCreateEmailTemplate(templateForm);
        alert('Email template created successfully!');
      }
      setShowModal(false);
      fetchTemplates();
    } catch (err) {
      alert(err.message || 'Failed to save email template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (tmpl) => {
    if (tmpl.is_system) {
      alert('Default system templates cannot be deleted.');
      return;
    }
    if (!window.confirm(`Delete template "${tmpl.name}"?`)) return;

    try {
      await apiDeleteEmailTemplate(tmpl.id);
      fetchTemplates();
    } catch (err) {
      alert(err.message || 'Failed to delete template');
    }
  };

  const insertTag = (tag) => {
    setTemplateForm(prev => ({
      ...prev,
      body: prev.body + tag
    }));
  };

  // Generate Web-to-lead embed code
  const generateEmbedCode = () => {
    const origin = window.location.origin;
    return `<!-- Zorvixe Technologies: Public Web-to-Lead Form -->
<div id="zorvixe-lead-form-container" style="max-width: 520px; margin: 20px auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #ffffff; border: 1px solid #dfe1e6; border-radius: 8px; padding: 24px; box-shadow: 0 4px 16px rgba(9,30,66,0.08);">
  <h3 style="margin-top:0; color:#172b4d;">${webformConfig.formTitle}</h3>
  <p style="color:#5e6c84; font-size:14px; margin-bottom: 20px;">${webformConfig.formSubtitle}</p>
  
  <form id="zorvixe-public-form" onsubmit="handleZorvixeLeadSubmit(event)">
    <div style="display:flex; gap:12px; margin-bottom:12px;">
      <div style="flex:1;">
        <label style="display:block; font-size:12px; font-weight:600; color:#42526e; margin-bottom:4px;">First Name *</label>
        <input type="text" id="z_first_name" required style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c1c7d0; border-radius:4px; font-size:14px;" />
      </div>
      <div style="flex:1;">
        <label style="display:block; font-size:12px; font-weight:600; color:#42526e; margin-bottom:4px;">Last Name</label>
        <input type="text" id="z_last_name" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c1c7d0; border-radius:4px; font-size:14px;" />
      </div>
    </div>

    <div style="margin-bottom:12px;">
      <label style="display:block; font-size:12px; font-weight:600; color:#42526e; margin-bottom:4px;">Work Email Address *</label>
      <input type="email" id="z_email" required style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c1c7d0; border-radius:4px; font-size:14px;" />
    </div>

    ${webformConfig.includeCompany ? `
    <div style="margin-bottom:12px;">
      <label style="display:block; font-size:12px; font-weight:600; color:#42526e; margin-bottom:4px;">Company / Organization</label>
      <input type="text" id="z_company" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c1c7d0; border-radius:4px; font-size:14px;" />
    </div>` : ''}

    ${webformConfig.includePhone ? `
    <div style="margin-bottom:12px;">
      <label style="display:block; font-size:12px; font-weight:600; color:#42526e; margin-bottom:4px;">Phone Number</label>
      <input type="tel" id="z_phone" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c1c7d0; border-radius:4px; font-size:14px;" />
    </div>` : ''}

    ${webformConfig.includeBudget ? `
    <div style="margin-bottom:12px;">
      <label style="display:block; font-size:12px; font-weight:600; color:#42526e; margin-bottom:4px;">Estimated Budget (INR)</label>
      <select id="z_budget" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c1c7d0; border-radius:4px; font-size:14px; background:#fff;">
        <option value="100000">₹1,00,000 - ₹3,00,000</option>
        <option value="500000" selected>₹3,00,000 - ₹10,00,000</option>
        <option value="1500000">₹10,00,000 - ₹25,00,000</option>
        <option value="3000000">₹25,00,000+</option>
      </select>
    </div>` : ''}

    ${webformConfig.includeMessage ? `
    <div style="margin-bottom:16px;">
      <label style="display:block; font-size:12px; font-weight:600; color:#42526e; margin-bottom:4px;">Project Scope & Objectives</label>
      <textarea id="z_description" rows="3" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c1c7d0; border-radius:4px; font-size:14px;"></textarea>
    </div>` : ''}

    <button type="submit" id="z_submit_btn" style="width:100%; padding:10px 16px; background:${webformConfig.themeColor}; color:#ffffff; border:none; border-radius:4px; font-size:14px; font-weight:600; cursor:pointer;">
      ${webformConfig.buttonText}
    </button>
    <div id="z_status" style="margin-top:12px; font-size:13px; text-align:center; display:none;"></div>
  </form>
</div>

<script>
async function handleZorvixeLeadSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('z_submit_btn');
  const status = document.getElementById('z_status');
  btn.disabled = true;
  btn.innerText = 'Submitting...';
  
  const payload = {
    first_name: document.getElementById('z_first_name')?.value || '',
    last_name: document.getElementById('z_last_name')?.value || '',
    email: document.getElementById('z_email')?.value || '',
    company: document.getElementById('z_company')?.value || '',
    phone: document.getElementById('z_phone')?.value || '',
    budget: document.getElementById('z_budget')?.value || '',
    description: document.getElementById('z_description')?.value || '',
    source: 'Website Embed Form'
  };

  try {
    const res = await fetch('${origin}/api/public/crm/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    status.style.display = 'block';
    if (res.ok) {
      status.style.color = '#006644';
      status.innerText = data.message || 'Thank you! We will reach out shortly.';
      document.getElementById('zorvixe-public-form').reset();
    } else {
      status.style.color = '#bf2600';
      status.innerText = data.message || 'Submission failed. Please try again.';
    }
  } catch (err) {
    status.style.display = 'block';
    status.style.color = '#bf2600';
    status.innerText = 'Network error. Please try again.';
  } finally {
    btn.disabled = false;
    btn.innerText = '${webformConfig.buttonText}';
  }
}
</script>`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateEmbedCode());
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2500);
  };

  return (
    <div className="automation-page">
      {/* Sub-header navigation */}
      <div className="auto-subnav-bar">
        <div className="auto-subnav-tabs">
          <button
            type="button"
            className={`auto-subnav-btn ${subTab === 'templates' ? 'active' : ''}`}
            onClick={() => setSubTab('templates')}
          >
            <FileTextIcon size={14} style={{ marginRight: '6px' }} />
            Email Templates & Mail Merge
          </button>
          <button
            type="button"
            className={`auto-subnav-btn ${subTab === 'webforms' ? 'active' : ''}`}
            onClick={() => setSubTab('webforms')}
          >
            <GlobeIcon size={14} style={{ marginRight: '6px' }} />
            Web-to-Lead Forms (Zoho Webforms)
          </button>
          <button
            type="button"
            className={`auto-subnav-btn ${subTab === 'blueprints' ? 'active' : ''}`}
            onClick={() => setSubTab('blueprints')}
          >
            <SettingsIcon size={14} style={{ marginRight: '6px' }} />
            Blueprint & Workflow Automations
          </button>
        </div>
      </div>

      {/* VIEW 1: EMAIL TEMPLATES */}
      {subTab === 'templates' && (
        <div className="auto-content-panel">
          <div className="panel-header-row">
            <div>
              <h3>Sales Email Templates</h3>
              <p className="panel-desc">
                Pre-configured templates for 1-click customer outreach, proposal delivery, and onboarding notifications.
              </p>
            </div>
            <button type="button" className="crm-btn crm-btn-primary" onClick={openCreateModal}>
              + Create Template
            </button>
          </div>

          {loading ? (
            <div className="loader_container">
              <p className="loader_spinner"></p>
              <p>Loading Templates...</p>
            </div>
          ) : (
            <div className="templates-grid">
              {templates.map(tmpl => (
                <div key={tmpl.id} className="template-card">
                  <div className="template-card-header">
                    <div>
                      <span className={`tmpl-cat-badge ${tmpl.category}`}>
                        {tmpl.category?.toUpperCase() || 'SALES'}
                      </span>
                      {tmpl.is_system && <span className="system-pill">SYSTEM</span>}
                    </div>
                    <div className="template-actions">
                      <button type="button" className="btn-icon-subtle" onClick={() => openEditModal(tmpl)} title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 2.19-2.19z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                      {!tmpl.is_system && (
                        <button type="button" className="btn-icon-subtle danger" onClick={() => handleDeleteTemplate(tmpl)} title="Delete">
                          <TrashIcon size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  <h4 className="template-name">{tmpl.name}</h4>
                  <div className="template-subject">
                    <span className="subj-label">Subject:</span> {tmpl.subject}
                  </div>
                  <div className="template-body-snippet">
                    {tmpl.body}
                  </div>
                  <div className="template-card-footer">
                    <span>Merge tags enabled</span>
                    <span className="footer-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ZapIcon size={12} /> Fast Dispatch</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: WEB-TO-LEAD FORMS */}
      {subTab === 'webforms' && (
        <div className="auto-content-panel">
          <div className="panel-header-row">
            <div>
              <h3>Web-to-Lead Forms (Zoho Webforms Equivalent)</h3>
              <p className="panel-desc">
                Embed a public lead capture form on your company website, landing pages, or marketing campaigns. Inbound inquiries automatically flow into the CRM Leads pool in real-time.
              </p>
            </div>
            <button
              type="button"
              className={`crm-btn ${copiedSnippet ? 'crm-btn-success' : 'crm-btn-primary'}`}
              onClick={copyToClipboard}
            >
              {copiedSnippet ? (
                <>
                  <CheckIcon size={14} style={{ marginRight: 6 }} />
                  Code Copied to Clipboard
                </>
              ) : (
                <>
                  <CheckSquareIcon size={14} style={{ marginRight: '6px' }} />
                  Copy Embed HTML Code
                </>
              )}
            </button>
          </div>

          <div className="webforms-split-layout">
            {/* Form Configurator Controls */}
            <div className="webform-controls-card">
              <h4>1. Configure Form Fields</h4>

              <div className="ctrl-group">
                <label>Form Title</label>
                <input
                  type="text"
                  value={webformConfig.formTitle}
                  onChange={e => setWebformConfig({ ...webformConfig, formTitle: e.target.value })}
                />
              </div>

              <div className="ctrl-group">
                <label>Subtitle / Instruction</label>
                <input
                  type="text"
                  value={webformConfig.formSubtitle}
                  onChange={e => setWebformConfig({ ...webformConfig, formSubtitle: e.target.value })}
                />
              </div>

              <div className="ctrl-group">
                <label>Submit Button Text</label>
                <input
                  type="text"
                  value={webformConfig.buttonText}
                  onChange={e => setWebformConfig({ ...webformConfig, buttonText: e.target.value })}
                />
              </div>

              <div className="ctrl-checkboxes">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={webformConfig.includeCompany}
                    onChange={e => setWebformConfig({ ...webformConfig, includeCompany: e.target.checked })}
                  />
                  <span>Require / Include Company Field</span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={webformConfig.includePhone}
                    onChange={e => setWebformConfig({ ...webformConfig, includePhone: e.target.checked })}
                  />
                  <span>Require / Include Phone Number</span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={webformConfig.includeBudget}
                    onChange={e => setWebformConfig({ ...webformConfig, includeBudget: e.target.checked })}
                  />
                  <span>Include Estimated Project Budget Selector</span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={webformConfig.includeMessage}
                    onChange={e => setWebformConfig({ ...webformConfig, includeMessage: e.target.checked })}
                  />
                  <span>Include Project Scope & Details Box</span>
                </label>
              </div>

              <div className="webhook-endpoint-info">
                <strong>Public Endpoint Target:</strong>
                <code>POST {window.location.origin}/api/public/crm/leads</code>
                <p>Cross-Origin (CORS) enabled: works from WordPress, Webflow, React, or standard static HTML.</p>
              </div>
            </div>

            {/* Live Interactive Preview */}
            <div className="webform-preview-card">
              <h4>2. Live Form Preview</h4>
              <div className="webform-live-box">
                <h3>{webformConfig.formTitle}</h3>
                <p className="preview-subtitle">{webformConfig.formSubtitle}</p>

                <div className="preview-form-fields">
                  <div className="preview-row">
                    <input type="text" placeholder="First Name *" disabled />
                    <input type="text" placeholder="Last Name" disabled />
                  </div>
                  <input type="email" placeholder="Work Email Address *" disabled />
                  {webformConfig.includeCompany && <input type="text" placeholder="Company / Organization" disabled />}
                  {webformConfig.includePhone && <input type="tel" placeholder="Phone Number" disabled />}
                  {webformConfig.includeBudget && (
                    <select disabled>
                      <option>₹3,00,000 - ₹10,00,000</option>
                    </select>
                  )}
                  {webformConfig.includeMessage && (
                    <RichTextEditor
                      disabled
                      compact
                      disableAiAssist
                      minHeight="72px"
                      maxHeight="120px"
                      placeholder="Project Scope & Objectives"
                    />
                  )}
                  <button type="button" className="preview-submit-btn" style={{ background: webformConfig.themeColor }} disabled>
                    {webformConfig.buttonText}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: BLUEPRINTS & WORKFLOW RULES */}
      {subTab === 'blueprints' && (
        <div className="auto-content-panel">
          <div className="panel-header-row">
            <div>
              <h3>Workflow Rules & Blueprint Automations</h3>
              <p className="panel-desc">
                Enforce business logic, deal stage requirements, automatic quotation transitions, and inactivity tracking.
              </p>
            </div>
          </div>

          <div className="rules-cards-stack">
            {/* Rule 1 */}
            <div className="rule-card">
              <div className="rule-icon-box won">
                <AwardIcon size={20} color="#006644" />
              </div>
              <div className="rule-details">
                <div className="rule-header">
                  <h4>Deal Closed Won ➔ Quote & Project Auto-Execution</h4>
                  <span className="rule-status-badge active">Active System Rule</span>
                </div>
                <p className="rule-text">
                  Whenever a pipeline deal is transitioned to <strong>"Closed Won"</strong>:
                </p>
                <ul className="rule-actions-list">
                  <li>Any linked draft quotation is automatically upgraded to <strong>"Accepted"</strong> status.</li>
                  <li>An executive milestone task is automatically created and logged in the client 360° timeline.</li>
                  <li>Sales rep closed won revenue is updated on the executive leaderboard.</li>
                </ul>
              </div>
            </div>

            {/* Rule 2 */}
            <div className="rule-card">
              <div className="rule-icon-box lost">
                <ShieldIcon size={20} color="#bf2600" />
              </div>
              <div className="rule-details">
                <div className="rule-header">
                  <h4>Deal Closed Lost ➔ Mandatory Loss Analytics</h4>
                  <span className="rule-status-badge active">Active System Rule</span>
                </div>
                <p className="rule-text">
                  When moving a deal to <strong>"Closed Lost"</strong>, sales reps must specify a structured loss reason:
                </p>
                <ul className="rule-actions-list">
                  <li>Options: <em>Price Too High</em>, <em>Competitor Won</em>, <em>Budget Cut</em>, <em>Timeline Mismatch</em>, or <em>Scope Shift</em>.</li>
                  <li>Populates the <strong>Deal Loss Breakdown chart</strong> in Sales Analytics for management review.</li>
                </ul>
              </div>
            </div>

            {/* Rule 3 */}
            <div className="rule-card">
              <div className="rule-icon-box alert">
                <ClockIcon size={20} color="#ffab00" />
              </div>
              <div className="rule-details">
                <div className="rule-header">
                  <h4>Rotten Deals / Inactivity Alerts (14 Days)</h4>
                  <span className="rule-status-badge active">Active System Rule</span>
                </div>
                <p className="rule-text">
                  Opportunities with zero activity updates for more than <strong>14 consecutive days</strong> are automatically highlighted with an amber/red warning chip on the Kanban board to trigger immediate client follow-up.
                </p>
              </div>
            </div>

            {/* Rule 4 */}
            <div className="rule-card">
              <div className="rule-icon-box score">
                <TargetIcon size={20} color="#ffab00" />
              </div>
              <div className="rule-details">
                <div className="rule-header">
                  <h4>Automated Lead Scoring Algorithm</h4>
                  <span className="rule-status-badge active">Active System Rule</span>
                </div>
                <p className="rule-text">
                  Inbound leads are automatically scored upon capture:
                </p>
                <ul className="rule-actions-list">
                  <li><strong>Base Score</strong>: 60 points.</li>
                  <li><strong>Corporate Domain</strong> (non-Gmail/Yahoo): +15 points.</li>
                  <li><strong>Direct Phone Provided</strong>: +10 points.</li>
                  <li><strong>Company Provided</strong>: +10 points.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT TEMPLATE MODAL */}
      {showModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="crm-modal-card template-editor-card" onClick={e => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h4>{editingTemplate ? 'Edit Email Template' : 'Create New Email Template'}</h4>
              <button type="button" className="crm-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <form onSubmit={handleSaveTemplate} className="template-form">
              <div className="template-form-row">
                <div className="template-form-group">
                  <label>Template Name *</label>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="e.g. Enterprise Proposal Follow-up"
                    required
                  />
                </div>
                <div className="template-form-group">
                  <label>Category *</label>
                  <select
                    value={templateForm.category}
                    onChange={e => setTemplateForm({ ...templateForm, category: e.target.value })}
                  >
                    <option value="sales">Sales & General</option>
                    <option value="lead_followup">Lead Follow-up</option>
                    <option value="proposal">Commercial Proposal</option>
                    <option value="negotiation">Negotiation & Contract</option>
                    <option value="welcome">Welcome & Kickoff</option>
                    <option value="payment">Payment & Invoicing</option>
                  </select>
                </div>
              </div>

              <div className="template-form-group">
                <label>Subject Line *</label>
                <input
                  type="text"
                  value={templateForm.subject}
                  onChange={e => setTemplateForm({ ...templateForm, subject: e.target.value })}
                  placeholder="e.g. Zorvixe Technologies Proposal for {Company}"
                  required
                />
              </div>

              <div className="merge-tags-container">
                <span className="merge-hint">Merge Placeholders:</span>
                <button type="button" className="merge-tag-pill" onClick={() => insertTag('{Name}')}>+ {'{Name}'}</button>
                <button type="button" className="merge-tag-pill" onClick={() => insertTag('{Company}')}>+ {'{Company}'}</button>
                <button type="button" className="merge-tag-pill" onClick={() => insertTag('{DealTitle}')}>+ {'{DealTitle}'}</button>
                <button type="button" className="merge-tag-pill" onClick={() => insertTag('{QuoteNumber}')}>+ {'{QuoteNumber}'}</button>
                <button type="button" className="merge-tag-pill" onClick={() => insertTag('{Amount}')}>+ {'{Amount}'}</button>
                <button type="button" className="merge-tag-pill" onClick={() => insertTag('{MyName}')}>+ {'{MyName}'}</button>
              </div>

              <div className="template-form-group">
                <label>Email Body *</label>
                <RichTextEditor
                  value={templateForm.body}
                  minHeight="140px"
                  maxHeight="260px"
                  aiFieldLabel="Email Template Body"
                  aiContext={{ name: templateForm.name, subject: templateForm.subject, category: templateForm.category }}
                  placeholder="Dear {Name}, thank you for your interest"
                  onChange={(content) => setTemplateForm((prev) => ({ ...prev, body: content }))}
                />
              </div>

              <div className="template-modal-footer">
                <button type="button" className="crm-btn crm-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="crm-btn crm-btn-primary" disabled={savingTemplate}>
                  {savingTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
