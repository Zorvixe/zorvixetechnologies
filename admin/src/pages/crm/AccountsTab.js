import React, { useState, useEffect, useCallback } from 'react';
import { apiListAccounts, apiGetAccount360, apiCreateAccount, apiCreateCrmContact, apiAiCrmSummarize } from '../../api';
import AiInsightBox from '../../components/AiInsightBox';
import RichTextEditor from '../../components/RichTextEditor';
import { stripHtmlText } from '../../utils/safeHtml';
import SendEmailModal from './SendEmailModal';
import {
  GlobeIcon,
  UsersIcon,
  BriefcaseIcon,
  QuotesIcon,
  ZapIcon,
  PhoneIcon,
  CalendarIcon,
  CheckSquareIcon,
  SparklesIcon,
  MailIcon
} from '../../components/CrmHrmsIcons';
import './AccountsTab.css';

export default function AccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 360 Account Drawer
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [account360, setAccount360] = useState(null);
  const [loading360, setLoading360] = useState(false);
  const [drawerSubTab, setDrawerSubTab] = useState('contacts'); // 'contacts' | 'deals' | 'quotes' | 'activities'

  // AI Account 360 Brief
  const [acctAiOpen, setAcctAiOpen] = useState(false);
  const [acctAiLoading, setAcctAiLoading] = useState(false);
  const [acctAiErr, setAcctAiErr] = useState('');
  const [acctAiData, setAcctAiData] = useState(null);

  const runAccountAiBrief = async (accId) => {
    const id = accId || selectedAccountId;
    if (!id) return;
    setAcctAiOpen(true);
    setAcctAiLoading(true);
    setAcctAiErr('');
    try {
      const res = await apiAiCrmSummarize({ entityType: 'account', entityId: id });
      setAcctAiData(res);
    } catch (err) {
      setAcctAiErr(err.message || 'Failed to summarize account');
    } finally {
      setAcctAiLoading(false);
    }
  };

  // Send Email Modal State
  const [emailModalConfig, setEmailModalConfig] = useState({
    isOpen: false,
    recipient: {},
    relatedType: 'account',
    relatedId: null
  });

  // Create Account Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [accountForm, setAccountForm] = useState({
    name: '',
    company: '',
    industry: 'Technology',
    website: '',
    annual_revenue: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'India'
  });
  const [savingAccount, setSavingAccount] = useState(false);

  // Quick Add Contact in 360 Drawer
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    position: 'Manager',
    department: 'Operations',
    is_primary: false,
    linkedin_url: ''
  });
  const [savingContact, setSavingContact] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListAccounts();
      setAccounts(res.accounts || []);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const openAccount360 = async (id) => {
    setSelectedAccountId(id);
    setLoading360(true);
    setShowAddContact(false);
    setAcctAiOpen(false);
    setAcctAiData(null);
    setAcctAiErr('');
    try {
      const res = await apiGetAccount360(id);
      setAccount360(res);
    } catch (err) {
      alert(err.message || 'Failed to load 360 account details');
    } finally {
      setLoading360(false);
    }
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!accountForm.company && !accountForm.name) return alert('Company name is required');
    setSavingAccount(true);
    try {
      await apiCreateAccount(accountForm);
      alert('Account added successfully!');
      setShowCreateModal(false);
      setAccountForm({
        name: '',
        company: '',
        industry: 'Technology',
        website: '',
        annual_revenue: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        country: 'India'
      });
      fetchAccounts();
    } catch (err) {
      alert(err.message || 'Failed to create account');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!contactForm.name) return alert('Contact name is required');
    setSavingContact(true);
    try {
      await apiCreateCrmContact({
        ...contactForm,
        client_id: selectedAccountId
      });
      alert('Contact linked to account!');
      setShowAddContact(false);
      setContactForm({
        name: '',
        email: '',
        phone: '',
        position: 'Manager',
        department: 'Operations',
        is_primary: false,
        linkedin_url: ''
      });
      openAccount360(selectedAccountId);
      fetchAccounts();
    } catch (err) {
      alert(err.message || 'Failed to add contact');
    } finally {
      setSavingContact(false);
    }
  };

  const fmtCurrency = (val) => val ? `₹${Number(val).toLocaleString('en-IN')}` : '₹0';

  const filteredAccounts = accounts.filter(acc => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (acc.company && acc.company.toLowerCase().includes(s)) ||
      (acc.name && acc.name.toLowerCase().includes(s)) ||
      (acc.industry && acc.industry.toLowerCase().includes(s)) ||
      (acc.email && acc.email.toLowerCase().includes(s))
    );
  });

  return (
    <div className="crm-accounts-tab">
      {/* Top Toolbar */}
      <div className="accounts-filter-bar">
        <div className="accounts-search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search accounts by company name, industry, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button className="btn-create-account" onClick={() => setShowCreateModal(true)}>
          + Create Account (Company)
        </button>
      </div>

      {/* Accounts Table */}
      <div className="accounts-table-container">
        <table className="accounts-table">
          <thead>
            <tr>
              <th>Account Name</th>
              <th>Industry</th>
              <th>Pipeline Value</th>
              <th>Won Revenue</th>
              <th>Contacts</th>
              <th>Open Activities</th>
              <th>Website</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <div className="loader_container">
                  <p className="loader_spinner"></p>
                  <p>Loading Accounts...</p>
                </div>
              </tr>
            ) : filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan="8" className="table-state-msg">No accounts found. Click "+ Create Account" to add one.</td>
              </tr>
            ) : (
              filteredAccounts.map((acc) => {
                const compName = acc.company || acc.name || 'Enterprise Account';
                const initials = compName.slice(0, 2).toUpperCase();

                return (
                  <tr key={acc.id} onClick={() => openAccount360(acc.id)} className="clickable-row">
                    <td>
                      <div className="account-name-cell">
                        <div className="account-avatar">{initials}</div>
                        <div>
                          <strong className="account-title">{compName}</strong>
                          <div className="account-contact-sub">{acc.name} • {acc.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="industry-tag">{acc.industry || 'Technology'}</span>
                    </td>
                    <td>
                      <strong className="text-primary">{fmtCurrency(acc.total_pipeline_value)}</strong>
                      <div className="sub-deals-count">{acc.total_deals_count || 0} deals</div>
                    </td>
                    <td>
                      <strong className="text-success">{fmtCurrency(acc.total_won_value)}</strong>
                    </td>
                    <td>
                      <span className="badge-pill">{acc.total_contacts_count || 0} People</span>
                    </td>
                    <td>
                      <span className={`act-pill ${Number(acc.open_activities_count) > 0 ? 'act-pending' : ''}`}>
                        {acc.open_activities_count || 0} Pending
                      </span>
                    </td>
                    <td>
                      {acc.website ? (
                        <a href={acc.website.startsWith('http') ? acc.website : `https://${acc.website}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="web-link">
                          <GlobeIcon size={12} style={{ marginRight: '4px' }} />
                          {acc.website.replace(/^https?:\/\//, '')}
                        </a>
                      ) : '--'}
                    </td>
                    <td>
                      <button className="btn-view-360" onClick={(e) => { e.stopPropagation(); openAccount360(acc.id); }}>
                        360° View →
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 360° ACCOUNT DRAWER / MODAL */}
      {selectedAccountId && (
        <div className="crm-modal-backdrop" onClick={() => setSelectedAccountId(null)}>
          <div className="crm-modal-card drawer-360" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-box">
                <div className="account-avatar-lg">
                  {(account360?.account?.company || 'AC').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3>{account360?.account?.company || account360?.account?.name}</h3>
                  <span className="drawer-sub">
                    Industry: <strong>{account360?.account?.industry || 'Technology'}</strong> • {account360?.account?.city || 'India'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="zx-ai-pill-btn"
                  onClick={() => runAccountAiBrief(selectedAccountId)}
                  title="ZORVI Account 360 Summary & Next Steps"
                >
                  <SparklesIcon size={13} />
                  <span>ZORVI Account Brief</span>
                </button>
                <button
                  type="button"
                  className="btn-create-account"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => setEmailModalConfig({
                    isOpen: true,
                    recipient: {
                      email: account360?.account?.email,
                      name: account360?.account?.name,
                      company: account360?.account?.company || account360?.account?.name
                    },
                    relatedType: 'account',
                    relatedId: account360?.account?.id
                  })}
                >
                  <MailIcon size={13} style={{ marginRight: 6 }} /> Email Organization
                </button>
                <button type="button" className="crm-modal-close" onClick={() => setSelectedAccountId(null)}>×</button>
              </div>
            </div>

            {loading360 ? (
              <div className="loader_container">
                <p className="loader_spinner"></p>
                <p>Loading...</p>
              </div>
            ) : account360 ? (
              <div className="drawer-body">
                {acctAiOpen && (
                  <AiInsightBox
                    title="ZORVI Account Summary & Follow-ups"
                    loading={acctAiLoading}
                    error={acctAiErr}
                    uncertainty={acctAiData?.uncertainty}
                    providerMeta={acctAiData?.meta}
                    onRefresh={() => runAccountAiBrief(selectedAccountId)}
                    onClose={() => setAcctAiOpen(false)}
                  >
                    {acctAiData && (
                      <div>
                        <p style={{ margin: '0 0 6px' }}>{acctAiData.summary}</p>
                        <div className="zx-ai-tags">
                          <span className={`zx-ai-tag ${acctAiData.healthStatus}`}>Health: {acctAiData.healthStatus}</span>
                          {(acctAiData.keySignals || []).map((s, i) => <span key={i} className="zx-ai-tag">{s}</span>)}
                        </div>
                        {acctAiData.nextSteps?.length > 0 && (
                          <ul className="zx-ai-list" style={{ fontSize: '12px', marginTop: '6px' }}>
                            {acctAiData.nextSteps.map((n, i) => <li key={i}>{n}</li>)}
                          </ul>
                        )}
                      </div>
                    )}
                  </AiInsightBox>
                )}

                {/* Metrics ribbon */}
                <div className="drawer-ribbon">
                  <div className="ribbon-item">
                    <span>Total Deals</span>
                    <strong>{account360.deals?.length || 0}</strong>
                  </div>
                  <div className="ribbon-item">
                    <span>Pipeline Value</span>
                    <strong className="text-primary">{fmtCurrency(account360.deals?.reduce((acc, d) => acc + Number(d.value || 0), 0))}</strong>
                  </div>
                  <div className="ribbon-item">
                    <span>Won Value</span>
                    <strong className="text-success">{fmtCurrency(account360.deals?.filter(d => d.stage === 'won').reduce((acc, d) => acc + Number(d.value || 0), 0))}</strong>
                  </div>
                  <div className="ribbon-item">
                    <span>Quotes Issued</span>
                    <strong>{account360.quotes?.length || 0}</strong>
                  </div>
                </div>

                {/* Sub-tabs nav */}
                <div className="drawer-tabs-nav">
                  <button
                    className={`drawer-tab-btn ${drawerSubTab === 'contacts' ? 'active' : ''}`}
                    onClick={() => setDrawerSubTab('contacts')}
                  >
                    <UsersIcon size={14} style={{ marginRight: '6px' }} />
                    Contacts ({account360.contacts?.length || 0})
                  </button>
                  <button
                    className={`drawer-tab-btn ${drawerSubTab === 'deals' ? 'active' : ''}`}
                    onClick={() => setDrawerSubTab('deals')}
                  >
                    <BriefcaseIcon size={14} style={{ marginRight: '6px' }} />
                    Deals ({account360.deals?.length || 0})
                  </button>
                  <button
                    className={`drawer-tab-btn ${drawerSubTab === 'quotes' ? 'active' : ''}`}
                    onClick={() => setDrawerSubTab('quotes')}
                  >
                    <QuotesIcon size={14} style={{ marginRight: '6px' }} />
                    Quotations ({account360.quotes?.length || 0})
                  </button>
                  <button
                    className={`drawer-tab-btn ${drawerSubTab === 'activities' ? 'active' : ''}`}
                    onClick={() => setDrawerSubTab('activities')}
                  >
                    <ZapIcon size={14} style={{ marginRight: '6px' }} />
                    Activities ({account360.activities?.length || 0})
                  </button>
                </div>

                {/* Sub-tab 1: Contacts */}
                {drawerSubTab === 'contacts' && (
                  <div className="drawer-section">
                    <div className="section-action-header">
                      <h5>Associated People & Decision Makers</h5>
                      <button className="btn-add-mini" onClick={() => setShowAddContact(!showAddContact)}>
                        {showAddContact ? 'Cancel' : '+ Add Person'}
                      </button>
                    </div>

                    {showAddContact && (
                      <form onSubmit={handleAddContact} className="mini-contact-form">
                        <div className="crm-form-row">
                          <input
                            type="text"
                            placeholder="Full Name *"
                            required
                            value={contactForm.name}
                            onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                          />
                          <input
                            type="email"
                            placeholder="Email address"
                            value={contactForm.email}
                            onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                          />
                        </div>
                        <div className="crm-form-row">
                          <input
                            type="text"
                            placeholder="Designation / Position"
                            value={contactForm.position}
                            onChange={(e) => setContactForm({ ...contactForm, position: e.target.value })}
                          />
                          <input
                            type="text"
                            placeholder="Phone number"
                            value={contactForm.phone}
                            onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                          />
                        </div>
                        <button type="submit" className="btn-save-mini" disabled={savingContact}>
                          {savingContact ? 'Saving...' : 'Link Contact to Account'}
                        </button>
                      </form>
                    )}

                    <div className="drawer-items-list">
                      {account360.contacts?.length === 0 ? (
                        <div className="empty-sub-list">No contacts linked to this company yet.</div>
                      ) : (
                        account360.contacts?.map(co => (
                          <div key={co.id} className="drawer-item-card">
                            <div className="item-left">
                              <strong>{co.name}</strong>
                              <span className="item-meta">{co.position || 'Staff'} • {co.department || 'Operations'}</span>
                            </div>
                            <div className="item-right">
                              <span className="item-email">{co.email || 'N/A'}</span>
                              <span className="item-phone">{co.phone || 'N/A'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Sub-tab 2: Deals */}
                {drawerSubTab === 'deals' && (
                  <div className="drawer-section">
                    <h5>Opportunities in Pipeline</h5>
                    <div className="drawer-items-list">
                      {account360.deals?.length === 0 ? (
                        <div className="empty-sub-list">No active deals for this account.</div>
                      ) : (
                        account360.deals?.map(d => (
                          <div key={d.id} className="drawer-item-card">
                            <div className="item-left">
                              <strong>{d.title}</strong>
                              <span className="item-meta">Stage: <span className={`stage-tag stage-${d.stage}`}>{d.stage.toUpperCase()}</span></span>
                            </div>
                            <div className="item-right">
                              <strong className="text-primary">{fmtCurrency(d.value)}</strong>
                              <span className="item-meta">Prob: {d.probability}%</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Sub-tab 3: Quotes */}
                {drawerSubTab === 'quotes' && (
                  <div className="drawer-section">
                    <h5>Quotations & Proposals</h5>
                    <div className="drawer-items-list">
                      {account360.quotes?.length === 0 ? (
                        <div className="empty-sub-list">No quotations issued yet.</div>
                      ) : (
                        account360.quotes?.map(q => (
                          <div key={q.id} className="drawer-item-card">
                            <div className="item-left">
                              <strong>{q.quote_number}</strong>
                              <span className="item-meta">{q.subject}</span>
                            </div>
                            <div className="item-right">
                              <strong className="text-success">{fmtCurrency(q.grand_total)}</strong>
                              <span className="item-meta">Status: {q.status.toUpperCase()}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Sub-tab 4: Activities */}
                {drawerSubTab === 'activities' && (
                  <div className="drawer-section">
                    <h5>Cadence, Calls & Tasks Timeline</h5>
                    <div className="drawer-items-list">
                      {account360.activities?.length === 0 ? (
                        <div className="empty-sub-list">No activities recorded yet.</div>
                      ) : (
                        account360.activities?.map(a => (
                          <div key={a.id} className="drawer-item-card">
                            <div className="item-left">
                              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                {a.type === 'call' ? <PhoneIcon size={14} color="#0052cc" /> : a.type === 'meeting' ? <CalendarIcon size={14} color="#ffab00" /> : <CheckSquareIcon size={14} color="#00875a" />}
                                {a.title}
                              </strong>
                              <span className="item-meta">{stripHtmlText(a.description) || 'No remarks recorded.'}</span>
                            </div>
                            <div className="item-right">
                              <span className={`status-pill ${a.completed ? 'status-qualified' : 'status-new'}`}>
                                {a.completed ? 'COMPLETED' : 'PENDING'}
                              </span>
                              <span className="item-meta">{a.due_date ? new Date(a.due_date).toLocaleDateString() : 'No date'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* CREATE ACCOUNT MODAL */}
      {showCreateModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="crm-modal-card crm-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h4>Create Business Account (Organization)</h4>
              <button type="button" className="crm-modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateAccount} className="crm-modal-form">
              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Company / Organization Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Zenitron Technologies"
                    value={accountForm.company}
                    onChange={(e) => setAccountForm({ ...accountForm, company: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Industry</label>
                  <select
                    value={accountForm.industry}
                    onChange={(e) => setAccountForm({ ...accountForm, industry: e.target.value })}
                  >
                    <option value="Technology">Technology & SaaS</option>
                    <option value="Financial Services">Financial Services</option>
                    <option value="Retail & eCommerce">Retail & eCommerce</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Consulting">Consulting</option>
                  </select>
                </div>
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Primary Contact Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Priya Sharma"
                    value={accountForm.name}
                    onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Website</label>
                  <input
                    type="text"
                    placeholder="e.g. zenitron.com"
                    value={accountForm.website}
                    onChange={(e) => setAccountForm({ ...accountForm, website: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Work Email</label>
                  <input
                    type="email"
                    placeholder="contact@zenitron.com"
                    value={accountForm.email}
                    onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Work Phone</label>
                  <input
                    type="text"
                    placeholder="+91 80 4123 4567"
                    value={accountForm.phone}
                    onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>City</label>
                  <input
                    type="text"
                    placeholder="e.g. Bengaluru"
                    value={accountForm.city}
                    onChange={(e) => setAccountForm({ ...accountForm, city: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Annual Revenue (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 25000000"
                    value={accountForm.annual_revenue}
                    onChange={(e) => setAccountForm({ ...accountForm, annual_revenue: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-group">
                <label>Office Address</label>
                <RichTextEditor
                  compact
                  minHeight="72px"
                  maxHeight="140px"
                  aiFieldLabel="Office Address"
                  aiContext={{ company: accountForm.company, city: accountForm.city }}
                  placeholder="Street address, business park, PIN code"
                  value={accountForm.address}
                  onChange={(content) => setAccountForm((prev) => ({ ...prev, address: content }))}
                />
              </div>

              <div className="crm-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn-modal-submit" disabled={savingAccount}>
                  {savingAccount ? 'Saving...' : 'Create Account'}
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
