import React, { useState, useEffect, useCallback } from 'react';
import {
  apiCrmStats,
  apiListDeals,
  apiCreateDeal,
  apiDeleteDeal,
  apiListCrmActivities,
  apiCreateCrmActivity,
  apiListClients,
  apiUpdateDealStage,
  apiAiCrmStaleDeals,
  apiAiCrmSummarize
} from '../api';
import AiInsightBox from '../components/AiInsightBox';
import RichTextEditor from '../components/RichTextEditor';
import { renderSafeHtml } from '../utils/safeHtml';
import { showToast } from '../utils/toast';

import LeadsTab from './crm/LeadsTab';
import AccountsTab from './crm/AccountsTab';
import ContactsTab from './crm/ContactsTab';
import QuotesTab from './crm/QuotesTab';
import SalesAnalyticsTab from './crm/SalesAnalyticsTab';
import AutomationTab from './crm/AutomationTab';
import SendEmailModal from './crm/SendEmailModal';
import DealInspectorDrawer from './crm/DealInspectorDrawer';
import CrmHomeTab from './crm/CrmHomeTab';
import WorkqueueTab from './crm/WorkqueueTab';
import ActivitiesCalendarTab from './crm/ActivitiesCalendarTab';
import {
  HomeIcon,
  WorkqueueIcon,
  PipelineIcon,
  LeadsIcon,
  BuildingIcon,
  UsersIcon,
  QuotesIcon,
  ChartIcon,
  SettingsIcon,
  PhoneIcon,
  HandshakeIcon,
  AwardIcon,
  FolderIcon,
  CalendarIcon,
  SparklesIcon,
  BriefcaseIcon,
  MailIcon,
  AlertTriangleIcon
} from '../components/CrmHrmsIcons';

import './CRM.css';

export default function CRM({ defaultTab }) {
  const getInitialTab = () => {
    if (defaultTab && ['home', 'workqueue', 'pipeline', 'leads', 'accounts', 'contacts', 'quotes', 'activities', 'analytics', 'automation'].includes(defaultTab)) {
      return defaultTab;
    }
    const hash = window.location.hash.replace('#', '');
    if (['home', 'workqueue', 'pipeline', 'leads', 'accounts', 'contacts', 'quotes', 'activities', 'analytics', 'automation'].includes(hash)) {
      return hash;
    }
    return 'home';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    if (defaultTab && ['home', 'workqueue', 'pipeline', 'leads', 'accounts', 'contacts', 'quotes', 'activities', 'analytics', 'automation'].includes(defaultTab)) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    window.location.hash = tabKey;
  };
  const [stats, setStats] = useState(null);
  const [dealsData, setDealsData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Clients list for dropdowns
  const [clients, setClients] = useState([]);

  // Activities
  const [activities, setActivities] = useState([]);

  // Jira Quick Filters
  const [boardSearch, setBoardSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'high_val' | 'high_prob'

  // Selected deal for slide-over inspector drawer
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [dealTimelineKey, setDealTimelineKey] = useState(0);

  // Send Email Modal State
  const [emailModalConfig, setEmailModalConfig] = useState({
    isOpen: false,
    recipient: {},
    relatedType: 'deal',
    relatedId: null
  });

  // Lost Deal Reason Modal State
  const [lostDealModal, setLostDealModal] = useState({
    isOpen: false,
    dealId: null,
    reason: 'Price Too High',
    notes: ''
  });

  // Create Deal Modal
  const [showDealModal, setShowDealModal] = useState(false);
  const [dealForm, setDealForm] = useState({
    title: '',
    client_id: '',
    value: 150000,
    stage: 'lead',
    probability: 60,
    expected_close_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    description: ''
  });
  const [savingDeal, setSavingDeal] = useState(false);

  // Create Activity Modal
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityForm, setActivityForm] = useState({
    deal_id: '',
    client_id: '',
    type: 'call',
    title: '',
    description: '',
    due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 16)
  });
  const [savingActivity, setSavingActivity] = useState(false);

  // CRM AI: Stale Deals Scanner & Deal Summary
  const [staleOpen, setStaleOpen] = useState(false);
  const [staleLoading, setStaleLoading] = useState(false);
  const [staleError, setStaleError] = useState('');
  const [staleData, setStaleData] = useState(null);

  const [dealAiOpen, setDealAiOpen] = useState(false);
  const [dealAiLoading, setDealAiLoading] = useState(false);
  const [dealAiErr, setDealAiErr] = useState('');
  const [dealAiData, setDealAiData] = useState(null);

  const runStaleDealsScan = async () => {
    setStaleOpen(true);
    setStaleLoading(true);
    setStaleError('');
    try {
      const res = await apiAiCrmStaleDeals();
      setStaleData(res);
    } catch (err) {
      setStaleError(err.message || 'Failed to scan stale deals');
    } finally {
      setStaleLoading(false);
    }
  };

  const runDealSummary = async (dealId) => {
    setDealAiOpen(true);
    setDealAiLoading(true);
    setDealAiErr('');
    try {
      const res = await apiAiCrmSummarize({ entityType: 'deal', entityId: dealId });
      setDealAiData(res);
    } catch (err) {
      setDealAiErr(err.message || 'Failed to summarize deal');
    } finally {
      setDealAiLoading(false);
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiCrmStats();
      setStats(res.stats || null);
    } catch (err) {
      console.error('Failed to load CRM stats:', err);
    }
  }, []);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListDeals();
      setDealsData(res.stages || {});
      const allDeals = Object.values(res.stages || {}).flat();
      setSelectedDeal((prev) => (prev ? allDeals.find((d) => d.id === prev.id) || null : null));
    } catch (err) {
      console.error('Failed to load deals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await apiListCrmActivities();
      setActivities(res.activities || []);
    } catch (err) {
      console.error('Failed to load activities:', err);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await apiListClients();
      setClients(res.clients || []);
    } catch (err) {
      console.error('Failed to load clients:', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchDeals();
    fetchActivities();
    fetchClients();
  }, [fetchStats, fetchDeals, fetchActivities, fetchClients]);

  // Refresh pipeline deals & counts whenever switching back to Pipeline or Activities tabs
  useEffect(() => {
    if (activeTab === 'pipeline') {
      fetchDeals();
      fetchStats();
    } else if (activeTab === 'activities') {
      fetchActivities();
    }
  }, [activeTab, fetchDeals, fetchStats, fetchActivities]);

  const handleLeadConverted = useCallback(() => {
    fetchDeals();
    fetchStats();
    fetchActivities();
    fetchClients();
  }, [fetchDeals, fetchStats, fetchActivities, fetchClients]);

  const handleCreateDeal = async (e) => {
    e.preventDefault();
    if (!dealForm.title) {
      showToast('Please enter deal title', 'error');
      return;
    }
    setSavingDeal(true);
    try {
      await apiCreateDeal(dealForm);
      showToast('Deal added to pipeline!', 'success');
      setShowDealModal(false);
      setDealForm({
        title: '',
        client_id: '',
        value: 150000,
        stage: 'lead',
        probability: 60,
        expected_close_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        description: ''
      });
      fetchDeals();
      fetchStats();
    } catch (err) {
      showToast(err.message || 'Failed to create deal', 'error');
    } finally {
      setSavingDeal(false);
    }
  };

  const handleStageMove = async (dealId, nextStage) => {
    if (nextStage === 'lost') {
      setLostDealModal({
        isOpen: true,
        dealId,
        reason: 'Price Too High',
        notes: ''
      });
      return;
    }
    try {
      await apiUpdateDealStage(dealId, { stage: nextStage });
      fetchDeals();
      fetchStats();
    } catch (err) {
      showToast(err.message || 'Failed to move deal', 'error');
    }
  };

  const handleConfirmLostDeal = async (e) => {
    e.preventDefault();
    if (!lostDealModal.dealId) return;
    try {
      await apiUpdateDealStage(lostDealModal.dealId, {
        stage: 'lost',
        loss_reason: lostDealModal.reason,
        loss_notes: lostDealModal.notes
      });
      setLostDealModal({ isOpen: false, dealId: null, reason: 'Price Too High', notes: '' });
      fetchDeals();
      fetchStats();
    } catch (err) {
      showToast(err.message || 'Failed to update deal', 'error');
    }
  };

  const handleDeleteDeal = async (dealId) => {
    if (!window.confirm('Delete this deal from CRM?')) return;
    try {
      await apiDeleteDeal(dealId);
      setSelectedDeal((prev) => (prev?.id === dealId ? null : prev));
      fetchDeals();
      fetchStats();
    } catch (err) {
      showToast(err.message || 'Failed to delete deal', 'error');
    }
  };

  const handleCreateActivity = async (e) => {
    e.preventDefault();
    if (!activityForm.title) {
      showToast('Please enter activity title', 'error');
      return;
    }
    setSavingActivity(true);
    try {
      await apiCreateCrmActivity(activityForm);
      showToast('Activity logged successfully', 'success');
      setShowActivityModal(false);
      setActivityForm({
        deal_id: '',
        client_id: '',
        type: 'call',
        title: '',
        description: '',
        due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 16)
      });
      fetchActivities();
    } catch (err) {
      showToast(err.message || 'Failed to log activity', 'error');
    } finally {
      setSavingActivity(false);
    }
  };

  const fmtCurrency = (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`;

  const dealStages = [
    { key: 'lead', label: 'LEAD INQUIRIES', color: '#42526e', icon: LeadsIcon },
    { key: 'contacted', label: 'CONTACTED', color: '#0052cc', icon: PhoneIcon },
    { key: 'proposal', label: 'PROPOSAL SENT', color: '#ffab00', icon: QuotesIcon },
    { key: 'negotiation', label: 'NEGOTIATION', color: '#6554c0', icon: HandshakeIcon },
    { key: 'won', label: 'CLOSED WON', color: '#006644', icon: AwardIcon },
    { key: 'lost', label: 'CLOSED LOST', color: '#bf2600', icon: FolderIcon }
  ];

  return (
    <div className="jira-crm-container">
      {/* Atlassian Jira Project Header */}
      <div className="jira-crm-header">
        <div className="jira-breadcrumbs">
          <span>Projects</span>
          <span className="jira-bc-sep">/</span>
          <span>Zorvixe CRM</span>
          <span className="jira-bc-sep">/</span>
          <span className="jira-bc-current">Sales Deals Pipeline</span>
        </div>

        <div className="jira-title-row">
          <div className="jira-title-left">
            <div className="jira-project-avatar jira-avatar-crm">
              <span>CRM</span>
            </div>
            <div>
              <h1 className="jira-project-title">Sales Deals & Opportunities</h1>
              <span className="jira-project-key">ZORVIXE-CRM • Kanban Board</span>
            </div>
          </div>

          <div className="jira-header-actions">
            <button type="button" className="zx-ai-pill-btn" onClick={runStaleDealsScan} title="Detect stale deals & follow-ups">
              <SparklesIcon size={13} />
              <span>ZORVI Stale Deals</span>
            </button>
            <button className="jira-btn jira-btn-primary" onClick={() => setShowDealModal(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create Deal</span>
            </button>
            <button className="jira-btn jira-btn-secondary" onClick={() => setShowActivityModal(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span>Log Activity</span>
            </button>
          </div>
        </div>

        {/* Jira Underline Navigation Tabs */}
        <div className="jira-tabs-nav-bar">
          <div className="jira-tabs-list">
            <button
              type="button"
              className={`jira-tab-btn ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => handleTabChange('home')}
            >
              <span className="jira-tab-icon"><HomeIcon size={16} /></span>
              <span className="jira-tab-label">Home Cockpit</span>
            </button>
            <button
              type="button"
              className={`jira-tab-btn ${activeTab === 'workqueue' ? 'active' : ''}`}
              onClick={() => handleTabChange('workqueue')}
            >
              <span className="jira-tab-icon"><WorkqueueIcon size={16} /></span>
              <span className="jira-tab-label">Workqueue</span>
            </button>
            <button
              type="button"
              className={`jira-tab-btn ${activeTab === 'pipeline' ? 'active' : ''}`}
              onClick={() => handleTabChange('pipeline')}
            >
              <span className="jira-tab-icon"><PipelineIcon size={16} /></span>
              <span className="jira-tab-label">Deals Pipeline</span>
              <span className="jira-tab-count">{stats?.total_deals || 0}</span>
            </button>
            <button
              type="button"
              className={`jira-tab-btn ${activeTab === 'leads' ? 'active' : ''}`}
              onClick={() => handleTabChange('leads')}
            >
              <span className="jira-tab-icon"><LeadsIcon size={16} /></span>
              <span className="jira-tab-label">Leads Pool</span>
            </button>
            <button
              type="button"
              className={`jira-tab-btn ${activeTab === 'accounts' ? 'active' : ''}`}
              onClick={() => handleTabChange('accounts')}
            >
              <span className="jira-tab-icon"><BuildingIcon size={16} /></span>
              <span className="jira-tab-label">Accounts (360°)</span>
            </button>
            <button
              type="button"
              className={`jira-tab-btn ${activeTab === 'contacts' ? 'active' : ''}`}
              onClick={() => handleTabChange('contacts')}
            >
              <span className="jira-tab-icon"><UsersIcon size={16} /></span>
              <span className="jira-tab-label">B2B Contacts</span>
            </button>
            <button
              type="button"
              className={`jira-tab-btn ${activeTab === 'quotes' ? 'active' : ''}`}
              onClick={() => handleTabChange('quotes')}
            >
              <span className="jira-tab-icon"><QuotesIcon size={16} /></span>
              <span className="jira-tab-label">Quotes & Products</span>
            </button>
            <button
              type="button"
              className={`jira-tab-btn ${activeTab === 'activities' ? 'active' : ''}`}
              onClick={() => handleTabChange('activities')}
            >
              <span className="jira-tab-icon"><CalendarIcon size={16} /></span>
              <span className="jira-tab-label">Activities & Calendar</span>
              <span className="jira-tab-count">{activities.length}</span>
            </button>
            <button
              type="button"
              className={`jira-tab-btn ${activeTab === 'analytics' || activeTab === 'summary' ? 'active' : ''}`}
              onClick={() => handleTabChange('analytics')}
            >
              <span className="jira-tab-icon"><ChartIcon size={16} /></span>
              <span className="jira-tab-label">Forecasting & Funnel</span>
            </button>
            <button
              type="button"
              className={`jira-tab-btn ${activeTab === 'automation' ? 'active' : ''}`}
              onClick={() => handleTabChange('automation')}
            >
              <span className="jira-tab-icon"><SettingsIcon size={16} /></span>
              <span className="jira-tab-label">Automation & Templates</span>
            </button>
          </div>
        </div>
      </div>

      {/* Jira Filter Toolbar (The iconic Jira Board Filter Bar) */}
      {activeTab === 'pipeline' && (
        <div className="jira-board-toolbar">
          <div className="jira-search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#626f86" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search this board..."
              value={boardSearch}
              onChange={(e) => setBoardSearch(e.target.value)}
            />
            {boardSearch && (
              <button type="button" className="jira-search-clear" onClick={() => setBoardSearch('')}>×</button>
            )}
          </div>

          <div className="jira-quick-filters">
            <span className="jira-filter-label">Quick Filters:</span>
            <button
              type="button"
              className={`jira-filter-pill ${quickFilter === 'all' ? 'active' : ''}`}
              onClick={() => setQuickFilter('all')}
            >
              All Deals
            </button>
            <button
              type="button"
              className={`jira-filter-pill ${quickFilter === 'high_val' ? 'active' : ''}`}
              onClick={() => setQuickFilter(quickFilter === 'high_val' ? 'all' : 'high_val')}
            >
              High Value (≥ ₹2L)
            </button>
            <button
              type="button"
              className={`jira-filter-pill ${quickFilter === 'high_prob' ? 'active' : ''}`}
              onClick={() => setQuickFilter(quickFilter === 'high_prob' ? 'all' : 'high_prob')}
            >
              Win Prob (≥ 70%)
            </button>
          </div>

          {stats && (
            <div className="jira-pipeline-stat-lozenge">
              <span className="stat-label">Total Pipeline:</span>
              <span className="stat-val">{fmtCurrency(stats.total_pipeline_value)}</span>
              <span className="stat-sep">•</span>
              <span className="stat-label">Won:</span>
              <span className="stat-val won">{fmtCurrency(stats.won_value)}</span>
            </div>
          )}
        </div>
      )}

      {/* AI CRM Insights Panels (Stale Deals or Single Deal Brief) */}
      {(staleOpen || dealAiOpen) && (
        <div style={{ padding: '10px 24px 0' }}>
          {staleOpen && (
            <AiInsightBox
              title="ZORVI Stale Deals & Follow-up Radar"
              subtitle="Identifies idle/overdue deals and prepares follow-up actions for confirmation."
              loading={staleLoading}
              error={staleError}
              uncertainty={staleData?.uncertainty}
              providerMeta={staleData?.meta}
              onRefresh={runStaleDealsScan}
              onClose={() => setStaleOpen(false)}
            >
              {staleData && (
                <div>
                  <p style={{ margin: '0 0 8px' }}>{staleData.summary}</p>
                  {staleData.staleDeals?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {staleData.staleDeals.map((sd) => (
                        <div key={sd.dealId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: '#ffffff', border: '1px solid #dfe1e6', borderRadius: '6px', padding: '8px 10px' }}>
                          <div>
                            <strong>DEAL-{sd.dealId}: {sd.title}</strong> ({sd.clientName}) — <span className="zx-ai-tag">{sd.stage}</span> <span className="zx-ai-tag at_risk">{sd.daysIdle}d idle</span>
                            <div style={{ fontSize: '12px', color: '#42526e', marginTop: '3px' }}>{sd.suggestedFollowUp}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="zx-ai-btn-sm"
                              onClick={() => {
                                setActivityForm({
                                  deal_id: sd.dealId,
                                  client_id: sd.clientId || '',
                                  type: 'call',
                                  title: `Follow up: ${sd.title}`,
                                  description: sd.suggestedFollowUp,
                                  due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 16)
                                });
                                setShowActivityModal(true);
                              }}
                            >
                              Log Activity
                            </button>
                            {sd.clientEmail && (
                              <button
                                type="button"
                                className="zx-ai-btn-primary"
                                onClick={() => setEmailModalConfig({
                                  isOpen: true,
                                  recipient: {
                                    email: sd.clientEmail,
                                    name: sd.clientName,
                                    company: sd.clientName,
                                    dealTitle: sd.title,
                                    amount: sd.value,
                                    goal: sd.suggestedFollowUp
                                  },
                                  relatedType: 'deal',
                                  relatedId: sd.dealId
                                })}
                              >
                                Draft Email
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </AiInsightBox>
          )}

          {dealAiOpen && (
            <AiInsightBox
              title={dealAiData?.entityId ? `ZORVI Deal Brief (DEAL-${dealAiData.entityId})` : 'ZORVI Deal Brief'}
              loading={dealAiLoading}
              error={dealAiErr}
              uncertainty={dealAiData?.uncertainty}
              providerMeta={dealAiData?.meta}
              onClose={() => setDealAiOpen(false)}
            >
              {dealAiData && (
                <div>
                  <p style={{ margin: '0 0 6px' }}>{dealAiData.summary}</p>
                  <div className="zx-ai-tags">
                    <span className={`zx-ai-tag ${dealAiData.healthStatus}`}>Health: {dealAiData.healthStatus}</span>
                    {(dealAiData.keySignals || []).map((s, idx) => <span key={idx} className="zx-ai-tag">{s}</span>)}
                  </div>
                  {dealAiData.nextSteps?.length > 0 && (
                    <ul className="zx-ai-list" style={{ fontSize: '12px', marginTop: '6px' }}>
                      {dealAiData.nextSteps.map((st, idx) => <li key={idx}>{st}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </AiInsightBox>
          )}
        </div>
      )}

      {/* VIEW 1: JIRA KANBAN BOARD */}
      {activeTab === 'pipeline' && (
        <div className="jira-kanban-board-canvas">
          {loading ? (
            <div> <div className="loader_container">
              <p className="loader_spinner"></p>
              <p>Loading Please Wait...</p>
            </div>
            </div>
          ) : (
            <div className="jira-kanban-board">
              {dealStages.map((st) => {
                const allStageDeals = dealsData?.[st.key] || [];
                const stageDeals = allStageDeals.filter((d) => {
                  if (boardSearch.trim()) {
                    const q = boardSearch.toLowerCase();
                    const matchTitle = (d.title || '').toLowerCase().includes(q);
                    const matchClient = (d.client_name || d.contact_name || '').toLowerCase().includes(q);
                    if (!matchTitle && !matchClient) return false;
                  }
                  if (quickFilter === 'high_val' && Number(d.value || 0) < 200000) return false;
                  if (quickFilter === 'high_prob' && Number(d.probability || 0) < 70) return false;
                  return true;
                });

                const stageTotalVal = stageDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);

                return (
                  <div className="jira-kanban-col" key={st.key}>
                    <div className="jira-col-header">
                      <div className="jira-col-title-wrap">
                        {st.icon && <st.icon size={14} color={st.color} />}
                        <span className="jira-col-title">{st.label}</span>
                        <span className="jira-col-count">{stageDeals.length}</span>
                      </div>
                      <span className="jira-col-val">{fmtCurrency(stageTotalVal)}</span>
                    </div>

                    <div className="jira-col-cards-list">
                      {stageDeals.length === 0 ? (
                        <div className="jira-col-empty">
                          <span>No deals</span>
                        </div>
                      ) : (
                        stageDeals.map((deal) => {
                          const stIdx = dealStages.findIndex((s) => s.key === (deal.stage || 'lead'));
                          const probVal = Math.min(100, Math.max(0, deal.probability || 50));
                          const initials = (deal.client_name || deal.contact_name || 'ZC').slice(0, 2).toUpperCase();
                          const daysInactive = Math.floor((Date.now() - new Date(deal.updated_at || deal.created_at || Date.now()).getTime()) / 86400000);

                          return (
                            <div
                              className={`jira-card ${selectedDeal?.id === deal.id ? 'deal-selected' : ''}`}
                              key={deal.id}
                              onClick={() => setSelectedDeal(deal)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedDeal(deal);
                                }
                              }}
                            >
                              {/* Top row: Type Icon + Issue Key + Delete */}
                              <div className="jira-card-top-row">
                                <div className="jira-issue-key-wrap">
                                  <span className="jira-issue-type-icon"><BriefcaseIcon size={13} /></span>
                                  <span className="jira-issue-key">DEAL-{deal.id}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    className="zx-ai-btn-sm"
                                    style={{ padding: '1px 6px', fontSize: '10px' }}
                                    onClick={() => runDealSummary(deal.id)}
                                    title="ZORVI Deal Brief & Next Steps"
                                  >
                                    ZORVI Brief
                                  </button>
                                  <button
                                    type="button"
                                    className="jira-card-del-btn"
                                    onClick={() => handleDeleteDeal(deal.id)}
                                    title="Delete Deal"
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>

                              {/* Title */}
                              <h4 className="jira-card-title">{deal.title}</h4>

                              {/* Client Tag */}
                              <div className="jira-client-tag">
                                <span className="jira-client-icon"><BuildingIcon size={13} /></span>
                                <span>{deal.client_name || deal.contact_name || 'Independent Client'}</span>
                              </div>

                              {/* Value, Probability & Rotting Alert */}
                              <div className="jira-card-meta-row">
                                <span className="jira-lozenge jira-lozenge-success">
                                  {fmtCurrency(deal.value)}
                                </span>
                                <span className={`jira-lozenge ${probVal >= 70 ? 'jira-lozenge-info' : 'jira-lozenge-default'}`}>
                                  {probVal}% Win
                                </span>
                                {daysInactive >= 14 && deal.stage !== 'won' && deal.stage !== 'lost' && (
                                  <span className="jira-lozenge jira-lozenge-danger" title="No activity updates for 14+ days" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <AlertTriangleIcon size={11} /> {daysInactive}d stagnant
                                  </span>
                                )}
                              </div>

                              {deal.expected_close_date && (
                                <div className="jira-card-date">
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarIcon size={12} /> Target: {new Date(deal.expected_close_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                </div>
                              )}

                              {deal.description && (
                                <div
                                  className="jira-card-desc"
                                  dangerouslySetInnerHTML={{ __html: renderSafeHtml(deal.description) }}
                                />
                              )}

                              {/* Card Footer: Fast Stage Navigation, Email & Assignee */}
                              <div className="jira-card-footer" onClick={(e) => e.stopPropagation()}>
                                <div className="jira-stage-arrows">
                                  <button
                                    type="button"
                                    className="jira-arrow-btn"
                                    disabled={stIdx <= 0}
                                    onClick={() => handleStageMove(deal.id, dealStages[stIdx - 1].key)}
                                    title="Move to previous stage"
                                  >
                                    ←
                                  </button>
                                  <select
                                    value={deal.stage || 'lead'}
                                    onChange={(e) => handleStageMove(deal.id, e.target.value)}
                                    className="jira-stage-select"
                                  >
                                    {dealStages.map((s) => (
                                      <option key={s.key} value={s.key}>
                                        {s.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="jira-arrow-btn"
                                    disabled={stIdx >= dealStages.length - 1}
                                    onClick={() => handleStageMove(deal.id, dealStages[stIdx + 1].key)}
                                    title="Advance to next stage"
                                  >
                                    →
                                  </button>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="jira-deal-email-btn"
                                    onClick={() => setEmailModalConfig({
                                      isOpen: true,
                                      recipient: {
                                        email: deal.client_email,
                                        name: deal.client_name,
                                        company: deal.client_name,
                                        dealTitle: deal.title,
                                        amount: deal.value,
                                        category: deal.stage === 'proposal' ? 'proposal' : deal.stage === 'negotiation' ? 'negotiation' : 'sales'
                                      },
                                      relatedType: 'deal',
                                      relatedId: deal.id
                                    })}
                                    title="Send Email to Client"
                                  >
                                    <MailIcon size={13} />
                                  </button>
                                  <div className="jira-card-avatar" title={deal.client_name || 'Client'}>
                                    {initials}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODULE: ZOHO ACTIVITIES & CALENDAR WORKSPACE (Photos 1, 4, 5, 6, 7) */}
      {activeTab === 'activities' && (
        <ActivitiesCalendarTab onSelectActivity={(act) => {}} />
      )}

      {/* MODULE 0: HOME COCKPIT */}
      {activeTab === 'home' && <CrmHomeTab onNavigateTab={handleTabChange} />}

      {/* MODULE 0.5: WORKQUEUE WORKSPACE */}
      {activeTab === 'workqueue' && <WorkqueueTab onSelectDeal={(d) => {}} onSelectLead={(l) => {}} />}

      {/* MODULE 2: LEADS & 1-CLICK CONVERSION */}
      {activeTab === 'leads' && (
        <LeadsTab
          onLeadConverted={handleLeadConverted}
          onNavigatePipeline={() => handleTabChange('pipeline')}
        />
      )}

      {/* MODULE 3: ACCOUNTS (ORGANIZATIONS 360°) */}
      {activeTab === 'accounts' && <AccountsTab />}

      {/* MODULE 4: B2B CONTACTS */}
      {activeTab === 'contacts' && <ContactsTab />}

      {/* MODULE 5: QUOTES & PRODUCTS (CPQ) */}
      {activeTab === 'quotes' && <QuotesTab />}

      {/* MODULE 6: SALES ANALYTICS & FORECASTING */}
      {(activeTab === 'analytics' || activeTab === 'summary') && <SalesAnalyticsTab />}

      {/* MODULE 7: AUTOMATION, EMAIL TEMPLATES & WEBFORMS */}
      {activeTab === 'automation' && <AutomationTab />}

      {/* CREATE DEAL MODAL (JIRA DIALOG STYLE) */}
      {showDealModal && (
        <div className="jira-modal-backdrop" onClick={() => setShowDealModal(false)}>
          <div className="jira-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="jira-modal-header">
              <h3>Create Deal</h3>
              <button className="jira-modal-close" onClick={() => setShowDealModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateDeal} className="jira-modal-form">
              <div className="jira-form-group">
                <label>Deal Summary / Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Enterprise Cloud Infrastructure & Support Contract"
                  value={dealForm.title}
                  onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })}
                  required
                />
              </div>

              <div className="jira-form-row">
                <div className="jira-form-group">
                  <label>Associated Client</label>
                  <select
                    value={dealForm.client_id}
                    onChange={(e) => setDealForm({ ...dealForm, client_id: e.target.value })}
                  >
                    <option value="">Select Client (Optional)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="jira-form-group">
                  <label>Deal Value (₹) *</label>
                  <input
                    type="number"
                    value={dealForm.value}
                    onChange={(e) => setDealForm({ ...dealForm, value: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="jira-form-row">
                <div className="jira-form-group">
                  <label>Initial Stage</label>
                  <select
                    value={dealForm.stage}
                    onChange={(e) => setDealForm({ ...dealForm, stage: e.target.value })}
                  >
                    {dealStages.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="jira-form-group">
                  <label>Win Probability (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={dealForm.probability}
                    onChange={(e) => setDealForm({ ...dealForm, probability: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="jira-form-group">
                <label>Target Closing Date</label>
                <input
                  type="date"
                  value={dealForm.expected_close_date}
                  onChange={(e) => setDealForm({ ...dealForm, expected_close_date: e.target.value })}
                />
              </div>

              <div className="jira-form-group">
                <label>Scope / Notes</label>
                <RichTextEditor
                  value={dealForm.description}
                  placeholder="Client requirements, deliverables, budget details..."
                  minHeight="100px"
                  aiFieldLabel="Deal Scope / Notes"
                  onChange={(content) => setDealForm((prev) => ({ ...prev, description: content }))}
                />
              </div>

              <div className="jira-modal-footer">
                <button type="button" className="jira-btn jira-btn-subtle" onClick={() => setShowDealModal(false)}>Cancel</button>
                <button type="submit" className="jira-btn jira-btn-primary" disabled={savingDeal}>
                  {savingDeal ? 'Creating...' : 'Create Deal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE ACTIVITY MODAL */}
      {showActivityModal && (
        <div className="jira-modal-backdrop" onClick={() => setShowActivityModal(false)}>
          <div className="jira-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="jira-modal-header">
              <h3>Log Client Activity</h3>
              <button className="jira-modal-close" onClick={() => setShowActivityModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateActivity} className="jira-modal-form">
              <div className="jira-form-group">
                <label>Activity Type</label>
                <select
                  value={activityForm.type}
                  onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })}
                >
                  <option value="call">Phone Call</option>
                  <option value="meeting">Client Meeting / Pitch</option>
                  <option value="email">Email Follow-up</option>
                  <option value="note">Strategic Note</option>
                  <option value="task">Action Item</option>
                </select>
              </div>

              <div className="jira-form-group">
                <label>Summary / Subject *</label>
                <input
                  type="text"
                  placeholder="e.g. Discussed SLA terms and cloud infrastructure pricing"
                  value={activityForm.title}
                  onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                  required
                />
              </div>

              <div className="jira-form-group">
                <label>Associated Client</label>
                <select
                  value={activityForm.client_id}
                  onChange={(e) => setActivityForm({ ...activityForm, client_id: e.target.value })}
                >
                  <option value="">Select Client (Optional)</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="jira-form-group">
                <label>Due Date & Time</label>
                <input
                  type="datetime-local"
                  value={activityForm.due_date}
                  onChange={(e) => setActivityForm({ ...activityForm, due_date: e.target.value })}
                />
              </div>

              <div className="jira-form-group">
                <label>Notes</label>
                <RichTextEditor
                  value={activityForm.description}
                  placeholder="Key discussion points, customer feedback, next steps..."
                  minHeight="100px"
                  aiFieldLabel="CRM Activity Notes"
                  onChange={(content) => setActivityForm((prev) => ({ ...prev, description: content }))}
                />
              </div>

              <div className="jira-modal-footer">
                <button type="button" className="jira-btn jira-btn-subtle" onClick={() => setShowActivityModal(false)}>Cancel</button>
                <button type="submit" className="jira-btn jira-btn-primary" disabled={savingActivity}>
                  {savingActivity ? 'Logging...' : 'Save Activity'}
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
        onSuccess={() => {
          fetchActivities();
          setDealTimelineKey((k) => k + 1);
        }}
      />

      {/* DEAL DETAIL SLIDE-OVER DRAWER */}
      <DealInspectorDrawer
        deal={selectedDeal}
        dealStages={dealStages}
        timelineRefreshKey={dealTimelineKey}
        onClose={() => setSelectedDeal(null)}
        onDealUpdated={(updatedDeal) => {
          setSelectedDeal(updatedDeal);
          fetchDeals();
          fetchStats();
        }}
        onStageChange={handleStageMove}
        onDeleteDeal={handleDeleteDeal}
        onRunSummary={(id) => {
          setSelectedDeal(null);
          runDealSummary(id);
        }}
        onOpenEmail={(dealItem) =>
          setEmailModalConfig({
            isOpen: true,
            recipient: {
              email: dealItem.client_email || '',
              name: dealItem.contact_name || dealItem.client_name || '',
              company: dealItem.client_name || '',
              dealTitle: dealItem.title,
              amount: dealItem.value,
              category:
                dealItem.stage === 'proposal'
                  ? 'proposal'
                  : dealItem.stage === 'negotiation'
                  ? 'negotiation'
                  : 'lead_followup'
            },
            relatedType: 'deal',
            relatedId: dealItem.id
          })
        }
        onActivityCreated={() => fetchActivities()}
      />

      {/* PHASE 2: LOST DEAL REASON MODAL (BLUEPRINT RULE VALIDATION) */}
      {lostDealModal.isOpen && (
        <div className="jira-modal-backdrop" onClick={() => setLostDealModal({ ...lostDealModal, isOpen: false })}>
          <div className="jira-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="jira-modal-header">
              <h3>Mandatory Loss Reason Required</h3>
              <button className="jira-modal-close" onClick={() => setLostDealModal({ ...lostDealModal, isOpen: false })}>×</button>
            </div>
            <form onSubmit={handleConfirmLostDeal} className="jira-modal-form">
              <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#5e6c84' }}>
                Per Zorvixe sales workflow rules, please specify why this deal was marked lost to ensure accurate forecasting analytics.
              </p>
              <div className="jira-form-group">
                <label>Primary Reason for Loss *</label>
                <select
                  value={lostDealModal.reason}
                  onChange={(e) => setLostDealModal({ ...lostDealModal, reason: e.target.value })}
                  required
                >
                  <option value="Price Too High">Price Too High / Budget Constraints</option>
                  <option value="Competitor Won">Competitor Selected</option>
                  <option value="Project Cancelled">Project Cancelled / Deprioritized</option>
                  <option value="Timeline Mismatch">Timeline / Delivery Date Mismatch</option>
                  <option value="Feature / Scope Gap">Feature or Scope Capability Gap</option>
                  <option value="Other">Other / Unspecified</option>
                </select>
              </div>

              <div className="jira-form-group">
                <label>Loss Debrief Notes</label>
                <RichTextEditor
                  value={lostDealModal.notes}
                  placeholder="Details on client decision, competitor pricing, or future re-engagement timing..."
                  minHeight="100px"
                  aiFieldLabel="Loss Debrief Notes"
                  onChange={(content) => setLostDealModal((prev) => ({ ...prev, notes: content }))}
                />
              </div>

              <div className="jira-modal-footer">
                <button type="button" className="jira-btn jira-btn-subtle" onClick={() => setLostDealModal({ ...lostDealModal, isOpen: false })}>
                  Cancel
                </button>
                <button type="submit" className="jira-btn jira-btn-danger">
                  Confirm Deal Lost
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
