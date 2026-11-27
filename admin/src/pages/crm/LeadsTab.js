import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  apiListLeads,
  apiCreateLead,
  apiUpdateLead,
  apiDeleteLead,
  apiConvertLead,
  apiListCrmActivities,
  apiCreateCrmActivity,
  apiListCrmEmails,
  apiAiCrmSummarize
} from '../../api';
import AiInsightBox from '../../components/AiInsightBox';
import RichTextEditor from '../../components/RichTextEditor';
import SendEmailModal from './SendEmailModal';
import { renderSafeHtml, stripHtmlText } from '../../utils/safeHtml';
import {
  GlobeIcon,
  TrashIcon,
  BuildingIcon,
  UserIcon,
  UsersIcon,
  SparklesIcon,
  ZapIcon,
  MailIcon,
  EditIcon,
  CheckIcon,
  PhoneIcon,
  SearchIcon,
  PlusIcon,
  XIcon,
  FileTextIcon
} from '../../components/CrmHrmsIcons';
import './LeadsTab.css';

const STATUS_LABELS = {
  new: 'New',
  attempted_to_contact: 'Pending callback',
  contacted: 'Contacted',
  qualified: 'Qualified',
  junk: 'Junk',
  lost: 'Lost'
};

export default function LeadsTab({ onLeadConverted, onNavigatePipeline }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [convertedFilter, setConvertedFilter] = useState('false');
  const [groupBy, setGroupBy] = useState('status'); // 'status' | 'source' | 'industry' | 'conversion'
  const [viewMode, setViewMode] = useState('board'); // 'board' | 'table'

  // Right-side Lead Inspector Drawer
  const [selectedLead, setSelectedLead] = useState(null);
  const [drawerNote, setDrawerNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSavedMsg, setNoteSavedMsg] = useState('');
  const [leadActivities, setLeadActivities] = useState([]);
  const [leadEmails, setLeadEmails] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Inline quick activity logger inside drawer
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [quickActForm, setQuickActForm] = useState({
    type: 'call',
    title: '',
    description: ''
  });
  const [savingQuickAct, setSavingQuickAct] = useState(false);

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

  // 1-Click Convert Lead Modal
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

  // AI Lead Summary
  const [leadAiOpen, setLeadAiOpen] = useState(false);
  const [leadAiLoading, setLeadAiLoading] = useState(false);
  const [leadAiErr, setLeadAiErr] = useState('');
  const [leadAiData, setLeadAiData] = useState(null);
  const [aiTargetLead, setAiTargetLead] = useState(null);

  const fmtCurrency = (val) => (val ? `₹${Number(val).toLocaleString('en-IN')}` : '--');
  const formatShortDateTime = (dt) => {
    if (!dt) return '--';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '--';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListLeads({
        search,
        status: statusFilter,
        source: sourceFilter,
        converted: convertedFilter
      });
      const fetched = res.leads || [];
      setLeads(fetched);
      setSelectedLead((prev) => (prev ? fetched.find((l) => l.id === prev.id) || prev : null));
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sourceFilter, convertedFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const loadLeadTimeline = useCallback(async (lead) => {
    if (!lead) return;
    setTimelineLoading(true);
    try {
      const [actsRes, emailsRes] = await Promise.all([
        apiListCrmActivities().catch(() => ({ activities: [] })),
        apiListCrmEmails({ relatedType: 'lead', relatedId: lead.id }).catch(() => ({ emails: [] }))
      ]);

      const allActs = actsRes.activities || [];
      const leadEmailLower = (lead.email || '').toLowerCase();
      const leadNameLower = `${lead.first_name || ''} ${lead.last_name || ''}`.trim().toLowerCase();
      const filteredActs = allActs.filter((a) => {
        if (String(a.lead_id || '') === String(lead.id)) return true;
        if (a.related_type === 'lead' && String(a.related_id || '') === String(lead.id)) return true;
        if (leadEmailLower && (a.description || '').toLowerCase().includes(leadEmailLower)) return true;
        if (leadNameLower && leadNameLower.length > 2 && (a.title || '').toLowerCase().includes(leadNameLower)) return true;
        return false;
      });
      setLeadActivities(filteredActs);

      const allEmails = emailsRes.emails || [];
      const matchedEmails = allEmails.filter(
        (em) =>
          (em.related_type === 'lead' && String(em.related_id) === String(lead.id)) ||
          (leadEmailLower && (em.to_email || '').toLowerCase() === leadEmailLower)
      );
      setLeadEmails(matchedEmails);
    } catch (err) {
      console.error('Failed to load lead timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  const openLeadDrawer = (lead) => {
    setSelectedLead(lead);
    setDrawerNote(lead.description || '');
    setNoteSavedMsg('');
    setShowLogActivity(false);
    loadLeadTimeline(lead);
  };

  const closeLeadDrawer = () => {
    setSelectedLead(null);
    setShowLogActivity(false);
    setNoteSavedMsg('');
  };

  const runLeadSummary = async (lead) => {
    setAiTargetLead(lead);
    setLeadAiOpen(true);
    setLeadAiLoading(true);
    setLeadAiErr('');
    try {
      const res = await apiAiCrmSummarize({ entityType: 'lead', entityId: lead.id });
      setLeadAiData(res);
    } catch (err) {
      setLeadAiErr(err.message || 'Failed to summarize lead');
    } finally {
      setLeadAiLoading(false);
    }
  };

  const handleSaveDrawerNote = async () => {
    if (!selectedLead) return;
    setSavingNote(true);
    setNoteSavedMsg('');
    try {
      const payload = { ...selectedLead, description: drawerNote };
      await apiUpdateLead(selectedLead.id, payload);
      setSelectedLead(payload);
      setLeads((prev) => prev.map((l) => (l.id === selectedLead.id ? payload : l)));
      setNoteSavedMsg('Saved');
      setTimeout(() => setNoteSavedMsg(''), 2500);
    } catch (err) {
      alert(err.message || 'Failed to save note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleQuickStatusChange = async (lead, nextStatus) => {
    try {
      const payload = { ...lead, status: nextStatus };
      await apiUpdateLead(lead.id, payload);
      setSelectedLead((prev) => (prev?.id === lead.id ? payload : prev));
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? payload : l)));
    } catch (err) {
      alert(err.message || 'Failed to update status');
    }
  };

  const handleQuickActivitySubmit = async (e) => {
    e.preventDefault();
    if (!selectedLead || !quickActForm.title.trim()) return;
    setSavingQuickAct(true);
    try {
      await apiCreateCrmActivity({
        lead_id: selectedLead.id,
        related_type: 'lead',
        related_id: selectedLead.id,
        type: quickActForm.type,
        title: `${quickActForm.title.trim()} (${selectedLead.first_name || 'Lead'})`,
        description: quickActForm.description,
        due_date: new Date().toISOString().slice(0, 16)
      });
      setQuickActForm({ type: 'call', title: '', description: '' });
      setShowLogActivity(false);
      loadLeadTimeline(selectedLead);
    } catch (err) {
      alert(err.message || 'Failed to log interaction');
    } finally {
      setSavingQuickAct(false);
    }
  };

  const handleCreateLead = async (e) => {
    e.preventDefault();
    if (!leadForm.first_name) return alert('First name is required');
    setSavingLead(true);
    try {
      await apiCreateLead(leadForm);
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
      if (selectedLead?.id === editingLead.id) {
        setSelectedLead(editingLead);
        setDrawerNote(editingLead.description || '');
      }
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
      if (selectedLead?.id === id) closeLeadDrawer();
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
      const convertedId = convertingLead.id;
      const createdDeal = Boolean(convertForm.create_deal);
      const res = await apiConvertLead(convertedId, convertForm);
      setConvertingLead(null);
      setSelectedLead((prev) =>
        prev?.id === convertedId ? { ...prev, is_converted: true, status: 'converted' } : prev
      );
      await fetchLeads();
      if (onLeadConverted) onLeadConverted(res);
      if (createdDeal && onNavigatePipeline && window.confirm(`${res.message || 'Lead converted successfully into Account, Contact, and Deal!'}\n\nOpen Deals Pipeline now to view this deal?`)) {
        onNavigatePipeline();
      } else if (!createdDeal || !onNavigatePipeline) {
        alert(res.message || 'Lead converted successfully into Account, Contact, and Deal!');
      }
    } catch (err) {
      alert(err.message || 'Failed to convert lead');
    } finally {
      setConverting(false);
    }
  };

  // Summary Metrics
  const summaryCounts = useMemo(() => {
    const total = leads.length;
    const qualified = leads.filter((l) => l.status === 'qualified').length;
    const callbacks = leads.filter((l) => l.status === 'attempted_to_contact' || l.status === 'contacted').length;
    const converted = leads.filter((l) => Boolean(l.is_converted)).length;
    const totalBudget = leads.reduce((acc, l) => acc + Number(l.annual_revenue || 0), 0);
    return { total, qualified, callbacks, converted, totalBudget };
  }, [leads]);

  // Grouped Board Columns
  const groupedColumns = useMemo(() => {
    const map = new Map();
    const getGroupKey = (lead) => {
      if (groupBy === 'source') return lead.source || 'Direct';
      if (groupBy === 'industry') return lead.industry || 'General';
      if (groupBy === 'conversion') return lead.is_converted ? 'Converted' : 'Active Pipeline';
      return STATUS_LABELS[lead.status] || (lead.status || 'New');
    };

    leads.forEach((lead) => {
      const key = getGroupKey(lead);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(lead);
    });

    return Array.from(map.entries()).map(([label, items]) => ({
      key: label,
      label,
      items,
      budgetSum: items.reduce((s, x) => s + Number(x.annual_revenue || 0), 0)
    }));
  }, [leads, groupBy]);

  const hasActiveFilters = Boolean(search || statusFilter || sourceFilter || convertedFilter !== 'false');

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSourceFilter('');
    setConvertedFilter('false');
  };

  return (
    <div className="crm-leads-tab ld-results-workspace">
      {/* Top Workspace Header */}
      <div className="ld-header-bar">
        <div className="ld-header-title-wrap">
          <div className="ld-header-icon-box">
            <UsersIcon size={18} />
          </div>
          <div>
            <h2 className="ld-page-title">Leads</h2>
            <p className="ld-page-subtitle">Everyone your team has connected with and captured pipeline info.</p>
          </div>
        </div>

        <div className="ld-header-actions">
          <div className="ld-view-switch" role="group" aria-label="View mode">
            <button
              type="button"
              className={`ld-switch-btn ${viewMode === 'board' ? 'active' : ''}`}
              onClick={() => setViewMode('board')}
            >
              Cards
            </button>
            <button
              type="button"
              className={`ld-switch-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
          </div>

          <button
            type="button"
            className="ld-btn-secondary"
            onClick={() => { window.location.hash = 'automation'; }}
            title="Generate embeddable webform HTML code for website lead capture"
          >
            <GlobeIcon size={14} />
            <span>Webforms</span>
          </button>

          <button type="button" className="btn-create-lead" onClick={() => setShowCreateModal(true)}>
            <PlusIcon size={14} />
            <span>Create Lead</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Row (Interactive Filters matching Outpero design) */}
      <div className="ld-kpi-strip">
        <button
          type="button"
          className={`ld-kpi-card ${!statusFilter && convertedFilter === '' ? 'is-active' : ''}`}
          onClick={() => { setStatusFilter(''); setConvertedFilter(''); }}
        >
          <span className="ld-kpi-label">Total leads</span>
          <strong className="ld-kpi-count tabular-nums">{summaryCounts.total}</strong>
        </button>

        <button
          type="button"
          className={`ld-kpi-card ${statusFilter === 'qualified' ? 'is-active' : ''}`}
          onClick={() => {
            setConvertedFilter('false');
            setStatusFilter((prev) => (prev === 'qualified' ? '' : 'qualified'));
          }}
        >
          <span className="ld-kpi-label">Qualified</span>
          <strong className="ld-kpi-count ld-count-accent tabular-nums">{summaryCounts.qualified}</strong>
        </button>

        <button
          type="button"
          className={`ld-kpi-card ${statusFilter === 'attempted_to_contact' ? 'is-active' : ''}`}
          onClick={() => {
            setConvertedFilter('false');
            setStatusFilter((prev) => (prev === 'attempted_to_contact' ? '' : 'attempted_to_contact'));
          }}
        >
          <span className="ld-kpi-label">Pending callback</span>
          <strong className="ld-kpi-count tabular-nums">{summaryCounts.callbacks}</strong>
        </button>

        <button
          type="button"
          className={`ld-kpi-card ${convertedFilter === 'true' ? 'is-active' : ''}`}
          onClick={() => {
            setStatusFilter('');
            setConvertedFilter((prev) => (prev === 'true' ? 'false' : 'true'));
          }}
        >
          <span className="ld-kpi-label">Converted</span>
          <strong className="ld-kpi-count tabular-nums">{summaryCounts.converted}</strong>
        </button>
      </div>

      {/* Search & Filter Controls */}
      <div className="ld-controls-panel">
        <div className="ld-search-row">
          <div className="leads-search-box ld-search-full">
            <SearchIcon size={15} />
            <input
              type="text"
              placeholder="Search name, phone, email, company, or captured info"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="ld-clear-input" onClick={() => setSearch('')} aria-label="Clear search">
                <XIcon size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="ld-filter-pills-row">
          <select
            value={convertedFilter}
            onChange={(e) => setConvertedFilter(e.target.value)}
            className="leads-select"
            aria-label="Pipeline filter"
          >
            <option value="false">Open leads</option>
            <option value="true">Converted leads</option>
            <option value="">All leads</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="leads-select"
            aria-label="Status filter"
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="attempted_to_contact">Pending callback</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="junk">Junk / Spam</option>
            <option value="lost">Lost</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="leads-select"
            aria-label="Source filter"
          >
            <option value="">All sources</option>
            <option value="Website">Website</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Referral">Referral</option>
            <option value="Cold Call">Cold Call</option>
            <option value="Inbound">Inbound</option>
          </select>

          {viewMode === 'board' && (
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="leads-select ld-group-select"
              aria-label="Group leads by"
            >
              <option value="status">Group by Status</option>
              <option value="source">Group by Source</option>
              <option value="industry">Group by Industry</option>
              <option value="conversion">Group by Stage</option>
            </select>
          )}
        </div>

      </div>
      <div className="ld-results-meta-line">
        <span>
          Showing <strong className="tabular-nums">{leads.length}</strong> lead{leads.length === 1 ? '' : 's'}
        </span>
        <span className="ld-meta-dot">·</span>
        <span className="tabular-nums">Pipeline {fmtCurrency(summaryCounts.totalBudget)}</span>
        {hasActiveFilters && (
          <>
            <span className="ld-meta-dot">·</span>
            <button type="button" className="ld-clear-filters-btn" onClick={clearFilters}>
              Clear filters
            </button>
          </>
        )}
      </div>

      {/* AI Lead Summary Card */}
      {leadAiOpen && (
        <div style={{ marginBottom: '4px' }}>
          <AiInsightBox
            title={aiTargetLead ? `ZORVI Lead Brief: ${aiTargetLead.first_name} ${aiTargetLead.last_name || ''}`.trim() : 'ZORVI Lead Brief'}
            loading={leadAiLoading}
            error={leadAiErr}
            uncertainty={leadAiData?.uncertainty}
            providerMeta={leadAiData?.meta}
            onRefresh={() => aiTargetLead && runLeadSummary(aiTargetLead)}
            onClose={() => setLeadAiOpen(false)}
          >
            {leadAiData && (
              <div>
                <p style={{ margin: '0 0 6px' }}>{leadAiData.summary}</p>
                <div className="zx-ai-tags">
                  <span className={`zx-ai-tag ${leadAiData.healthStatus}`}>Status: {leadAiData.healthStatus}</span>
                  {(leadAiData.keySignals || []).map((s, idx) => <span key={idx} className="zx-ai-tag">{s}</span>)}
                </div>
                {leadAiData.nextSteps?.length > 0 && (
                  <ul className="zx-ai-list" style={{ fontSize: '12px', marginTop: '6px' }}>
                    {leadAiData.nextSteps.map((st, idx) => <li key={idx}>{st}</li>)}
                  </ul>
                )}
              </div>
            )}
          </AiInsightBox>
        </div>
      )}

      {/* VIEW 1: GROUPED LEAD CARDS (Default Outpero-style workspace) */}
      {viewMode === 'board' ? (
        loading ? (
          <div className="ld-empty-surface">
            <div className="loader_container">
              <p className="loader_spinner"></p>
              <p>Loading leads pool</p>
            </div>
          </div>
        ) : leads.length === 0 ? (
          <div className="ld-empty-surface">
            <p className="table-state-msg">No matching leads found. Click Create Lead to add one.</p>
          </div>
        ) : (
          <div className="ld-grouped-board">
            {groupedColumns.map((col) => (
              <div className="ld-group-col" key={col.key}>
                <div className="ld-group-col-header">
                  <div className="ld-group-col-left">
                    <span className="ld-group-pill">{col.label}</span>
                    <span className="ld-group-count tabular-nums">{col.items.length}</span>
                  </div>
                  <span className="ld-group-budget tabular-nums">
                    {col.budgetSum > 0 ? fmtCurrency(col.budgetSum) : `${col.items.length} lead${col.items.length === 1 ? '' : 's'}`}
                  </span>
                </div>

                <div className="ld-group-cards">
                  {col.items.map((lead) => {
                    const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.phone || 'Anonymous';
                    const isSelected = selectedLead?.id === lead.id;

                    return (
                      <div
                        key={lead.id}
                        className={`ld-lead-card ${isSelected ? 'is-selected' : ''} ${lead.is_converted ? 'is-converted' : ''}`}
                        onClick={() => openLeadDrawer(lead)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openLeadDrawer(lead);
                          }
                        }}
                      >
                        <div className="ld-card-top">
                          <div className="ld-card-identity">
                            <div className="lead-avatar ld-card-avatar">
                              <UserIcon size={14} />
                            </div>
                            <div className="ld-card-name-wrap">
                              <div className="ld-card-title">{lead.phone || fullName}</div>
                              <div className="ld-card-sub">
                                {lead.phone ? fullName : (lead.email || 'No email')}
                              </div>
                            </div>
                          </div>

                          <span className={`score-badge tabular-nums ${lead.lead_score >= 70 ? 'score-high' : lead.lead_score >= 40 ? 'score-med' : 'score-low'}`}>
                            {lead.lead_score || 10} pts
                          </span>
                        </div>

                        <div className="ld-captured-chips">
                          {lead.annual_revenue && (
                            <span className="ld-cap-chip">
                              <span className="ld-cap-k">Budget range:</span>
                              <strong className="ld-cap-v tabular-nums">{fmtCurrency(lead.annual_revenue)}</strong>
                            </span>
                          )}
                          {(lead.company || lead.industry) && (
                            <span className="ld-cap-chip">
                              <span className="ld-cap-k">Business:</span>
                              <strong className="ld-cap-v">{lead.company || lead.industry}</strong>
                            </span>
                          )}
                          {lead.source && (
                            <span className="ld-cap-chip">
                              <span className="ld-cap-k">Source:</span>
                              <strong className="ld-cap-v">{lead.source}</strong>
                            </span>
                          )}
                          {lead.email && (
                            <span className="ld-cap-chip">
                              <span className="ld-cap-k">Email:</span>
                              <strong className="ld-cap-v">{lead.email}</strong>
                            </span>
                          )}
                          {lead.description && (
                            <span className="ld-cap-chip ld-cap-snippet">
                              <span className="ld-cap-k">Notes:</span>
                              <strong className="ld-cap-v">{stripHtmlText(lead.description)}</strong>
                            </span>
                          )}
                        </div>

                        <div className="ld-card-footer">
                          <div className="ld-card-footer-left">
                            <span className={`status-pill status-${lead.status}`}>
                              {STATUS_LABELS[lead.status] || lead.status?.replace('_', ' ')}
                            </span>
                            <span className="ld-card-time tabular-nums">
                              {formatShortDateTime(lead.created_at)}
                            </span>
                          </div>

                          <div className="ld-card-quick-actions" onClick={(e) => e.stopPropagation()}>
                            {lead.email && (
                              <button
                                type="button"
                                className="btn-action-icon"
                                title="Send Email"
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
                              >
                                <MailIcon size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-action-icon"
                              title="ZORVI Brief"
                              onClick={() => runLeadSummary(lead)}
                            >
                              <SparklesIcon size={13} />
                            </button>
                            {!lead.is_converted ? (
                              <button
                                type="button"
                                className="btn-convert-lead"
                                onClick={() => openConvertModal(lead)}
                                title="Convert into Contact, Account, and Deal"
                              >
                                <ZapIcon size={11} />
                                <span>Convert</span>
                              </button>
                            ) : (
                              <span className="converted-tag">
                                <CheckIcon size={11} />
                                <span>Converted</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* VIEW 2: TABLE VIEW */
        <div className="leads-table-container">
          <table className="leads-table">
            <thead>
              <tr>
                <th>Lead name</th>
                <th>Company &amp; Industry</th>
                <th>Lead score</th>
                <th>Source</th>
                <th>Status</th>
                <th>Contact details</th>
                <th>Est. budget</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8">
                    <div className="loader_container">
                      <p className="loader_spinner"></p>
                      <p>Loading leads pool</p>
                    </div>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan="8" className="table-state-msg">No matching leads found. Click Create Lead to add one.</td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Anonymous';
                  const initials = (lead.first_name || 'L').slice(0, 1).toUpperCase();

                  return (
                    <tr
                      key={lead.id}
                      className={`${lead.is_converted ? 'lead-row-converted' : ''} ${selectedLead?.id === lead.id ? 'ld-row-selected' : ''}`}
                      onClick={() => openLeadDrawer(lead)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div className="lead-name-cell">
                          <div className="lead-avatar">{initials}</div>
                          <div>
                            <strong className="lead-name-text">{fullName}</strong>
                            <div className="lead-date-sub tabular-nums">{new Date(lead.created_at).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="lead-company">{lead.company || '--'}</div>
                        <div className="lead-industry">{lead.industry || 'General'}</div>
                      </td>
                      <td>
                        <span className={`score-badge tabular-nums ${lead.lead_score >= 70 ? 'score-high' : lead.lead_score >= 40 ? 'score-med' : 'score-low'}`}>
                          {lead.lead_score || 10} pts
                        </span>
                      </td>
                      <td>
                        <span className="source-pill">{lead.source || 'Website'}</span>
                      </td>
                      <td>
                        <span className={`status-pill status-${lead.status}`}>
                          {STATUS_LABELS[lead.status] || lead.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <div className="contact-info-block">
                          <span className="lead-email">{lead.email || '--'}</span>
                          <span className="lead-phone tabular-nums">{lead.phone || '--'}</span>
                        </div>
                      </td>
                      <td className="tabular-nums">
                        <strong>{fmtCurrency(lead.annual_revenue)}</strong>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="lead-action-btns">
                          {!lead.is_converted ? (
                            <button
                              type="button"
                              className="btn-convert-lead"
                              onClick={() => openConvertModal(lead)}
                              title="Convert into Contact, Account, and Deal"
                            >
                              <ZapIcon size={12} /> Convert
                            </button>
                          ) : (
                            <span className="converted-tag"><CheckIcon size={12} /> Converted</span>
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
                              <MailIcon size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-action-icon"
                            onClick={() => runLeadSummary(lead)}
                            title="ZORVI Lead Summary & Follow-up"
                          >
                            <SparklesIcon size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn-action-icon"
                            onClick={() => setEditingLead(lead)}
                            title="Edit Lead"
                          >
                            <EditIcon size={14} />
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
      )}

      {/* RIGHT-SIDE LEAD DETAIL SLIDE-OVER DRAWER (Exact Outpero Inspector UI) */}
      {selectedLead && (
        <div className="ld-drawer-backdrop" onClick={closeLeadDrawer}>
          <aside className="ld-drawer-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Lead details">
            {/* Drawer Header */}
            <div className="ld-drawer-header">
              <div className="ld-drawer-header-top">
                <div className="ld-drawer-identity">
                  <div className="ld-drawer-avatar">
                    <UserIcon size={18} />
                  </div>
                  <div>
                    <div className="ld-drawer-title-line">
                      <h3>{selectedLead.phone || `${selectedLead.first_name || ''} ${selectedLead.last_name || ''}`.trim() || 'Lead'}</h3>
                      <span className={`status-pill status-${selectedLead.status}`}>
                        {STATUS_LABELS[selectedLead.status] || selectedLead.status}
                      </span>
                    </div>
                    <div className="ld-drawer-subtitle">
                      <span>{`${selectedLead.first_name || ''} ${selectedLead.last_name || ''}`.trim() || 'Anonymous'}</span>
                      {selectedLead.company && <span> · {selectedLead.company}</span>}
                      {selectedLead.email && <span> · {selectedLead.email}</span>}
                    </div>
                  </div>
                </div>

                <button type="button" className="ld-drawer-close" onClick={closeLeadDrawer} aria-label="Close drawer">
                  <XIcon size={16} />
                </button>
              </div>

              <div className="ld-drawer-metrics-strip">
                <div className="ld-metric-cell">
                  <span>Interactions</span>
                  <strong className="tabular-nums">{leadActivities.length + leadEmails.length}</strong>
                </div>
                <div className="ld-metric-cell">
                  <span>Lead score</span>
                  <strong className="tabular-nums">{selectedLead.lead_score || 10} pts</strong>
                </div>
                <div className="ld-metric-cell">
                  <span>Est. budget</span>
                  <strong className="tabular-nums">{fmtCurrency(selectedLead.annual_revenue)}</strong>
                </div>
                <div className="ld-metric-cell">
                  <span>Source</span>
                  <strong>{selectedLead.source || 'Website'}</strong>
                </div>
              </div>
            </div>

            {/* Two-Column Split Body */}
            <div className="ld-drawer-body">
              {/* LEFT COLUMN: Known Info + Notes */}
              <div className="ld-drawer-left">
                <div className="ld-section-heading-row">
                  <span className="ld-section-eyebrow">Known info · 8 fields</span>
                  <select
                    className="ld-inline-status-select"
                    value={selectedLead.status || 'new'}
                    onChange={(e) => handleQuickStatusChange(selectedLead, e.target.value)}
                    aria-label="Update lead status"
                  >
                    <option value="new">New</option>
                    <option value="attempted_to_contact">Pending callback</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="junk">Junk / Spam</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>

                <div className="ld-known-info-grid">
                  <div className="ld-known-cell">
                    <span className="ld-k-label">Business type</span>
                    <span className="ld-k-val">{selectedLead.industry || 'General'}</span>
                  </div>
                  <div className="ld-known-cell">
                    <span className="ld-k-label">Source channel</span>
                    <span className="ld-k-val">{selectedLead.source || 'Website'}</span>
                  </div>
                  <div className="ld-known-cell">
                    <span className="ld-k-label">Lead person name</span>
                    <span className="ld-k-val">{`${selectedLead.first_name || ''} ${selectedLead.last_name || ''}`.trim() || '--'}</span>
                  </div>
                  <div className="ld-known-cell">
                    <span className="ld-k-label">Business name</span>
                    <span className="ld-k-val">{selectedLead.company || '--'}</span>
                  </div>
                  <div className="ld-known-cell">
                    <span className="ld-k-label">Phone number</span>
                    <span className="ld-k-val tabular-nums">{selectedLead.phone || '--'}</span>
                  </div>
                  <div className="ld-known-cell">
                    <span className="ld-k-label">Email address</span>
                    <span className="ld-k-val">{selectedLead.email || '--'}</span>
                  </div>
                  <div className="ld-known-cell">
                    <span className="ld-k-label">Budget range</span>
                    <span className="ld-k-val tabular-nums">{fmtCurrency(selectedLead.annual_revenue)}</span>
                  </div>
                  <div className="ld-known-cell">
                    <span className="ld-k-label">Captured on</span>
                    <span className="ld-k-val tabular-nums">{formatShortDateTime(selectedLead.created_at)}</span>
                  </div>
                </div>

                {/* Notes with RichTextEditor */}
                <div className="ld-notes-section">
                  <div className="ld-section-heading-row">
                    <span className="ld-section-eyebrow">
                      <FileTextIcon size={12} /> Notes &amp; requirements
                    </span>
                  </div>
                  <RichTextEditor
                    compact
                    className="ld-notes-editor"
                    minHeight="90px"
                    maxHeight="180px"
                    placeholder="Add notes about this lead"
                    aiFieldLabel="Lead Notes & Requirements"
                    aiContext={{
                      leadName: `${selectedLead.first_name || ''} ${selectedLead.last_name || ''}`.trim(),
                      company: selectedLead.company,
                      industry: selectedLead.industry
                    }}
                    value={drawerNote}
                    onChange={(val) => setDrawerNote(val)}
                    footerContent={
                      <div className="ld-notes-editor-footer">
                        {noteSavedMsg && <span className="ld-note-saved">{noteSavedMsg}</span>}
                        <button
                          type="button"
                          className="ld-btn-save-note"
                          onClick={handleSaveDrawerNote}
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
                    Interactions · {leadActivities.length + leadEmails.length}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="ld-btn-mini"
                      onClick={() => runLeadSummary(selectedLead)}
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
                        <option value="meeting">Meeting / Consultation</option>
                        <option value="email">Email follow-up</option>
                        <option value="note">Note</option>
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
                      placeholder="Call outcome, requirements, or next step"
                      aiFieldLabel="Lead Call Outcome"
                      value={quickActForm.description}
                      onChange={(val) => setQuickActForm((p) => ({ ...p, description: val }))}
                    />
                    <div className="ld-quick-log-actions">
                      <button type="button" className="btn-modal-cancel" onClick={() => setShowLogActivity(false)}>Cancel</button>
                      <button type="submit" className="btn-modal-submit" disabled={savingQuickAct}>
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
                    {leadActivities.map((act) => (
                      <div className="ld-timeline-card" key={`act-${act.id}`}>
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

                    {leadEmails.map((em) => (
                      <div className="ld-timeline-card" key={`em-${em.id}`}>
                        <div className="ld-tl-header">
                          <span className="status-pill status-contacted">Email sent</span>
                          <span className="ld-tl-time tabular-nums">{formatShortDateTime(em.sent_at || em.created_at)}</span>
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

                    {/* Initial Lead Capture Event */}
                    <div className="ld-timeline-card">
                      <div className="ld-tl-header">
                        <span className={`status-pill status-${selectedLead.status}`}>
                          {STATUS_LABELS[selectedLead.status] || selectedLead.status}
                        </span>
                        <span className="ld-tl-time tabular-nums">{formatShortDateTime(selectedLead.created_at)}</span>
                      </div>
                      <div className="ld-tl-title">
                        Lead captured via {selectedLead.source || 'Website'}
                      </div>
                      {selectedLead.description && (
                        <div
                          className="ld-tl-body"
                          dangerouslySetInnerHTML={{ __html: renderSafeHtml(selectedLead.description) }}
                        />
                      )}
                      <div className="ld-tl-chips">
                        {selectedLead.industry && <span className="ld-tl-chip">+ Industry: {selectedLead.industry}</span>}
                        {selectedLead.annual_revenue && <span className="ld-tl-chip">+ Budget: {fmtCurrency(selectedLead.annual_revenue)}</span>}
                        {selectedLead.company && <span className="ld-tl-chip">+ Company: {selectedLead.company}</span>}
                        <span className="ld-tl-chip">+ Score: {selectedLead.lead_score || 10}</span>
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
                  onClick={() => setEditingLead(selectedLead)}
                >
                  <EditIcon size={13} />
                  <span>Edit</span>
                </button>
                {selectedLead.email && (
                  <button
                    type="button"
                    className="ld-btn-secondary"
                    onClick={() => setEmailModalConfig({
                      isOpen: true,
                      recipient: {
                        email: selectedLead.email,
                        name: `${selectedLead.first_name || ''} ${selectedLead.last_name || ''}`.trim(),
                        company: selectedLead.company,
                        amount: selectedLead.annual_revenue,
                        category: 'lead_followup'
                      },
                      relatedType: 'lead',
                      relatedId: selectedLead.id
                    })}
                  >
                    <MailIcon size={13} />
                    <span>Send email</span>
                  </button>
                )}
                <button
                  type="button"
                  className="ld-btn-danger-subtle"
                  onClick={() => handleDeleteLead(selectedLead.id)}
                >
                  <TrashIcon size={13} />
                  <span>Delete</span>
                </button>
              </div>

              <div className="ld-drawer-footer-right">
                {selectedLead.phone && (
                  <a className="ld-btn-call-back" href={`tel:${selectedLead.phone}`}>
                    <PhoneIcon size={14} />
                    <span>Call back</span>
                  </a>
                )}
                {!selectedLead.is_converted ? (
                  <button
                    type="button"
                    className="btn-modal-convert"
                    onClick={() => openConvertModal(selectedLead)}
                  >
                    <ZapIcon size={13} style={{ marginRight: 5 }} />
                    Convert lead
                  </button>
                ) : (
                  <span className="converted-tag">
                    <CheckIcon size={12} /> Converted to deal
                  </span>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

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
                    <option value="Technology">Technology &amp; SaaS</option>
                    <option value="Financial Services">Financial Services</option>
                    <option value="Retail & eCommerce">Retail &amp; eCommerce</option>
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
                <RichTextEditor
                  value={leadForm.description}
                  placeholder="Client requirements, pain points, timeline"
                  minHeight="100px"
                  aiFieldLabel="Lead Requirements / Description"
                  onChange={(content) => setLeadForm((prev) => ({ ...prev, description: content }))}
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

      {/* 1-CLICK CONVERT LEAD MODAL */}
      {convertingLead && (
        <div className="crm-modal-backdrop" onClick={() => setConvertingLead(null)}>
          <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header convert-modal-header">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ZapIcon size={15} /> Convert Lead: {convertingLead.first_name} {convertingLead.last_name}</h4>
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
          <div className="crm-modal-card crm-modal-lg" onClick={(e) => e.stopPropagation()}>
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
                  <label>Company</label>
                  <input
                    type="text"
                    value={editingLead.company || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, company: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Industry</label>
                  <input
                    type="text"
                    value={editingLead.industry || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, industry: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editingLead.email || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Phone</label>
                  <input
                    type="text"
                    value={editingLead.phone || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, phone: e.target.value })}
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
                    <option value="attempted_to_contact">Pending callback</option>
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

              <div className="crm-form-group">
                <label>Notes &amp; Requirements</label>
                <RichTextEditor
                  compact
                  minHeight="90px"
                  aiFieldLabel="Lead Notes & Requirements"
                  value={editingLead.description || ''}
                  onChange={(content) => setEditingLead({ ...editingLead, description: content })}
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

      {/* SEND EMAIL MODAL */}
      <SendEmailModal
        isOpen={emailModalConfig.isOpen}
        onClose={() => setEmailModalConfig({ ...emailModalConfig, isOpen: false })}
        defaultRecipient={emailModalConfig.recipient}
        relatedType={emailModalConfig.relatedType}
        relatedId={emailModalConfig.relatedId}
        onSuccess={() => {
          if (selectedLead) loadLeadTimeline(selectedLead);
        }}
      />
    </div>
  );
}
