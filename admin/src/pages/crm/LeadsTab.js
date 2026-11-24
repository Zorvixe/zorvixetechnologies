import React, { useState, useEffect, useCallback } from 'react';
import { apiListLeads, apiCreateLead, apiUpdateLead, apiDeleteLead, apiConvertLead } from '../../api';
import SendEmailModal from './SendEmailModal';
import { GlobeIcon, TrashIcon, BuildingIcon, UserIcon } from '../../components/CrmHrmsIcons';
import './LeadsTab.css';

export default function LeadsTab() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [convertedFilter, setConvertedFilter] = useState('false'); // 'false' = unconverted, 'true' = converted, '' = all

  // Send Email Modal State
  const [emailModalConfig, setEmailModalConfig] = useState({
    isOpen: false,
    recipient: {},
    relatedType: 'lead',
    relatedId: null
  });

  // Create Lead Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [leadForm, setLeadForm] = useState({
    first_name: '',
    last_name: '',
    company: '',
    email: '',
    phone: '',
    source: 'Website',
    status: 'new',
    industry: 'Technology',
    annual_revenue: '',
    lead_score: 50,
    description: ''
  });
  const [savingLead, setSavingLead] = useState(false);

  // 1-Click Convert Lead Modal (The Iconic Zoho CRM Feature)
  const [convertingLead, setConvertingLead] = useState(null);
  const [convertForm, setConvertForm] = useState({
    create_deal: true,
    deal_name: '',
    deal_amount: 150000,
    deal_stage: 'proposal',
    expected_close_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  });
  const [converting, setConverting] = useState(false);

  // Edit Lead Modal
  const [editingLead, setEditingLead] = useState(null);
  const [updating, setUpdating] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListLeads({
        search,
        status: statusFilter,
        source: sourceFilter,
        converted: convertedFilter
      });
      setLeads(res.leads || []);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sourceFilter, convertedFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleCreateLead = async (e) => {
    e.preventDefault();
    if (!leadForm.first_name) return alert('First name is required');
    setSavingLead(true);
    try {
      await apiCreateLead(leadForm);
      alert('Lead added to pool successfully!');
      setShowCreateModal(false);
      setLeadForm({
        first_name: '',
        last_name: '',
        company: '',
        email: '',
        phone: '',
        source: 'Website',
        status: 'new',
        industry: 'Technology',
        annual_revenue: '',
        lead_score: 50,
        description: ''
      });
      fetchLeads();
    } catch (err) {
      alert(err.message || 'Failed to create lead');
    } finally {
      setSavingLead(false);
    }
  };

  const handleUpdateLead = async (e) => {
    e.preventDefault();
    if (!editingLead) return;
    setUpdating(true);
    try {
      await apiUpdateLead(editingLead.id, editingLead);
      alert('Lead updated successfully');
      setEditingLead(null);
      fetchLeads();
    } catch (err) {
      alert(err.message || 'Failed to update lead');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteLead = async (id) => {
    if (!window.confirm('Are you sure you want to delete this lead?')) return;
    try {
      await apiDeleteLead(id);
      fetchLeads();
    } catch (err) {
      alert(err.message || 'Failed to delete lead');
    }
  };

  const openConvertModal = (lead) => {
    setConvertingLead(lead);
    const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
    const comp = lead.company || fullName;
    setConvertForm({
      create_deal: true,
      deal_name: `${comp} - Deal`,
      deal_amount: lead.annual_revenue || 150000,
      deal_stage: 'proposal',
      expected_close_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    });
  };

  const handleConvertLead = async (e) => {
    e.preventDefault();
    if (!convertingLead) return;
    setConverting(true);
    try {
      const res = await apiConvertLead(convertingLead.id, convertForm);
      alert(res.message || 'Lead converted successfully into Account, Contact, and Deal!');
      setConvertingLead(null);
      fetchLeads();
    } catch (err) {
      alert(err.message || 'Failed to convert lead');
    } finally {
      setConverting(false);
    }
  };

  const fmtCurrency = (val) => val ? `₹${Number(val).toLocaleString('en-IN')}` : '--';

  return (
    <div className="crm-leads-tab">
      {/* Top Filter Bar */}
      <div className="leads-filter-bar">
        <div className="leads-search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search leads by name, company, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="leads-filter-dropdowns">
          <select
            value={convertedFilter}
            onChange={(e) => setConvertedFilter(e.target.value)}
            className="leads-select"
          >
            <option value="false">Open Leads (Unconverted)</option>
            <option value="true">Converted Leads</option>
            <option value="">All Leads</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="leads-select"
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="attempted_to_contact">Attempted Contact</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="junk">Junk / Spam</option>
            <option value="lost">Lost</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="leads-select"
          >
            <option value="">All Sources</option>
            <option value="Website">Website</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Referral">Referral</option>
            <option value="Cold Call">Cold Call</option>
            <option value="Inbound">Inbound Inquiries</option>
          </select>

          <button
            type="button"
            className="btn-modal-cancel"
            style={{ border: '1px solid #c1c7d0', padding: '6px 12px', fontSize: '13px', fontWeight: '600' }}
            onClick={() => window.location.hash = 'automation'}
            title="Generate embeddable webform HTML code for website lead capture"
          >
            <GlobeIcon size={14} style={{ marginRight: '6px' }} />
            Webforms
          </button>
          <button className="btn-create-lead" onClick={() => setShowCreateModal(true)}>
            + Create Lead
          </button>
        </div>
      </div>

      {/* Leads Table */}
      <div className="leads-table-container">
        <table className="leads-table">
          <thead>
            <tr>
              <th>Lead Name</th>
              <th>Company & Industry</th>
              <th>Lead Score</th>
              <th>Source</th>
              <th>Status</th>
              <th>Contact Details</th>
              <th>Est. Budget</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="table-state-msg">Loading leads pool...</td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan="8" className="table-state-msg">No matching leads found. Click "+ Create Lead" to add one.</td>
              </tr>
            ) : (
              leads.map((lead) => {
                const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Anonymous';
                const initials = (lead.first_name || 'L').slice(0, 1).toUpperCase();

                return (
                  <tr key={lead.id} className={lead.is_converted ? 'lead-row-converted' : ''}>
                    <td>
                      <div className="lead-name-cell">
                        <div className="lead-avatar">{initials}</div>
                        <div>
                          <strong className="lead-name-text">{fullName}</strong>
                          <div className="lead-date-sub">{new Date(lead.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="lead-company">{lead.company || '--'}</div>
                      <div className="lead-industry">{lead.industry || 'General'}</div>
                    </td>
                    <td>
                      <span className={`score-badge ${lead.lead_score >= 70 ? 'score-high' : lead.lead_score >= 40 ? 'score-med' : 'score-low'}`}>
                        ⭐ {lead.lead_score || 10} pts
                      </span>
                    </td>
                    <td>
                      <span className="source-pill">{lead.source || 'Website'}</span>
                    </td>
                    <td>
                      <span className={`status-pill status-${lead.status}`}>
                        {lead.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="contact-info-block">
                        <span className="lead-email">{lead.email || '--'}</span>
                        <span className="lead-phone">{lead.phone || '--'}</span>
                      </div>
                    </td>
                    <td>
                      <strong>{fmtCurrency(lead.annual_revenue)}</strong>
                    </td>
                    <td>
                      <div className="lead-action-btns">
                        {!lead.is_converted ? (
                          <button
                            type="button"
                            className="btn-convert-lead"
                            onClick={() => openConvertModal(lead)}
                            title="Convert into Contact, Account, and Deal"
                          >
                            ⚡ Convert
                          </button>
                        ) : (
                          <span className="converted-tag">✓ Converted</span>
                        )}
                        {lead.email && (
                          <button
                            type="button"
                            className="btn-action-icon"
                            onClick={() => setEmailModalConfig({
                              isOpen: true,
                              recipient: {
                                email: lead.email,
                                name: fullName,
                                company: lead.company,
                                amount: lead.annual_revenue,
                                category: 'lead_followup'
                              },
                              relatedType: 'lead',
                              relatedId: lead.id
                            })}
                            title="Send Sales Email"
                          >
                            ✉️
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-action-icon"
                          onClick={() => setEditingLead(lead)}
                          title="Edit Lead"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn-action-icon text-danger"
                          onClick={() => handleDeleteLead(lead.id)}
                          title="Delete Lead"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE LEAD MODAL */}
      {showCreateModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="crm-modal-card crm-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h4>Create New Sales Lead</h4>
              <button type="button" className="crm-modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateLead} className="crm-modal-form">
              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul"
                    value={leadForm.first_name}
                    onChange={(e) => setLeadForm({ ...leadForm, first_name: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Verma"
                    value={leadForm.last_name}
                    onChange={(e) => setLeadForm({ ...leadForm, last_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Company / Organization *</label>
                  <input
                    type="text"
                    placeholder="e.g. Nexa Systems Pvt Ltd"
                    value={leadForm.company}
                    onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Industry</label>
                  <select
                    value={leadForm.industry}
                    onChange={(e) => setLeadForm({ ...leadForm, industry: e.target.value })}
                  >
                    <option value="Technology">Technology & SaaS</option>
                    <option value="Financial Services">Financial Services</option>
                    <option value="Retail & eCommerce">Retail & eCommerce</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Education">Education</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    placeholder="rahul@company.com"
                    value={leadForm.email}
                    onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={leadForm.phone}
                    onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Lead Source</label>
                  <select
                    value={leadForm.source}
                    onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
                  >
                    <option value="Website">Website Form</option>
                    <option value="LinkedIn">LinkedIn Outreach</option>
                    <option value="Referral">Client Referral</option>
                    <option value="Cold Call">Cold Outreach</option>
                    <option value="Inbound">Inbound Call/Email</option>
                  </select>
                </div>
                <div className="crm-form-group">
                  <label>Lead Score (0 - 100)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={leadForm.lead_score}
                    onChange={(e) => setLeadForm({ ...leadForm, lead_score: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-group">
                <label>Estimated Project Budget (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 500000"
                  value={leadForm.annual_revenue}
                  onChange={(e) => setLeadForm({ ...leadForm, annual_revenue: e.target.value })}
                />
              </div>

              <div className="crm-form-group">
                <label>Lead Requirements / Description</label>
                <textarea
                  rows="3"
                  placeholder="Client requirements, pain points, timeline..."
                  value={leadForm.description}
                  onChange={(e) => setLeadForm({ ...leadForm, description: e.target.value })}
                />
              </div>

              <div className="crm-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn-modal-submit" disabled={savingLead}>
                  {savingLead ? 'Saving...' : 'Save Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1-CLICK CONVERT LEAD MODAL (Iconic Zoho Feature) */}
      {convertingLead && (
        <div className="crm-modal-backdrop" onClick={() => setConvertingLead(null)}>
          <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header convert-modal-header">
              <h4>⚡ Convert Lead: {convertingLead.first_name} {convertingLead.last_name}</h4>
              <button type="button" className="crm-modal-close" onClick={() => setConvertingLead(null)}>×</button>
            </div>
            <form onSubmit={handleConvertLead} className="crm-modal-form">
              <div className="convert-summary-box">
                <p>This action will automatically create:</p>
                <ul>
                  <li><BuildingIcon size={14} style={{ marginRight: '6px' }} /> <strong>Account:</strong> {convertingLead.company || `${convertingLead.first_name} ${convertingLead.last_name}`}</li>
                  <li><UserIcon size={14} style={{ marginRight: '6px' }} /> <strong>Contact:</strong> {convertingLead.first_name} {convertingLead.last_name} ({convertingLead.email || 'N/A'})</li>
                </ul>
              </div>

              <div className="deal-create-checkbox-wrap">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={convertForm.create_deal}
                    onChange={(e) => setConvertForm({ ...convertForm, create_deal: e.target.checked })}
                  />
                  <span>Create a new Deal for this Account</span>
                </label>
              </div>

              {convertForm.create_deal && (
                <div className="convert-deal-fields">
                  <div className="crm-form-group">
                    <label>Deal Name *</label>
                    <input
                      type="text"
                      required
                      value={convertForm.deal_name}
                      onChange={(e) => setConvertForm({ ...convertForm, deal_name: e.target.value })}
                    />
                  </div>

                  <div className="crm-form-row">
                    <div className="crm-form-group">
                      <label>Deal Value (₹) *</label>
                      <input
                        type="number"
                        required
                        value={convertForm.deal_amount}
                        onChange={(e) => setConvertForm({ ...convertForm, deal_amount: e.target.value })}
                      />
                    </div>
                    <div className="crm-form-group">
                      <label>Stage</label>
                      <select
                        value={convertForm.deal_stage}
                        onChange={(e) => setConvertForm({ ...convertForm, deal_stage: e.target.value })}
                      >
                        <option value="proposal">Proposal Sent</option>
                        <option value="contacted">Contacted</option>
                        <option value="negotiation">Negotiation</option>
                        <option value="lead">Lead Inquiry</option>
                      </select>
                    </div>
                  </div>

                  <div className="crm-form-group">
                    <label>Expected Close Date</label>
                    <input
                      type="date"
                      value={convertForm.expected_close_date}
                      onChange={(e) => setConvertForm({ ...convertForm, expected_close_date: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="crm-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setConvertingLead(null)}>Cancel</button>
                <button type="submit" className="btn-modal-convert" disabled={converting}>
                  {converting ? 'Converting...' : 'Convert Lead Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT LEAD MODAL */}
      {editingLead && (
        <div className="crm-modal-backdrop" onClick={() => setEditingLead(null)}>
          <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h4>Edit Lead Details</h4>
              <button type="button" className="crm-modal-close" onClick={() => setEditingLead(null)}>×</button>
            </div>
            <form onSubmit={handleUpdateLead} className="crm-modal-form">
              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={editingLead.first_name || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, first_name: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={editingLead.last_name || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, last_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Status</label>
                  <select
                    value={editingLead.status || 'new'}
                    onChange={(e) => setEditingLead({ ...editingLead, status: e.target.value })}
                  >
                    <option value="new">New</option>
                    <option value="attempted_to_contact">Attempted Contact</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="junk">Junk / Spam</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div className="crm-form-group">
                  <label>Lead Score</label>
                  <input
                    type="number"
                    value={editingLead.lead_score || 50}
                    onChange={(e) => setEditingLead({ ...editingLead, lead_score: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-group">
                <label>Budget (₹)</label>
                <input
                  type="number"
                  value={editingLead.annual_revenue || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, annual_revenue: e.target.value })}
                />
              </div>

              <div className="crm-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setEditingLead(null)}>Cancel</button>
                <button type="submit" className="btn-modal-submit" disabled={updating}>
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PHASE 2: SEND EMAIL MODAL */}
      <SendEmailModal
        isOpen={emailModalConfig.isOpen}
        onClose={() => setEmailModalConfig({ ...emailModalConfig, isOpen: false })}
        defaultRecipient={emailModalConfig.recipient}
        relatedType={emailModalConfig.relatedType}
        relatedId={emailModalConfig.relatedId}
      />
    </div>
  );
}
