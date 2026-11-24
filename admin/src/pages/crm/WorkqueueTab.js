import React, { useState, useEffect } from 'react';
import { apiListDeals, apiListLeads, apiListCrmContacts, apiListCrmActivities } from '../../api';
import {
  CheckSquareIcon,
  HandshakeIcon,
  PhoneIcon,
  SettingsIcon,
  LeadsIcon,
  ClockIcon,
  UsersIcon,
  BriefcaseIcon,
  CalendarIcon,
  RefreshIcon,
  SearchIcon,
  FilterIcon
} from '../../components/CrmHrmsIcons';
import './WorkqueueTab.css';

export default function WorkqueueTab({ onSelectDeal, onSelectLead }) {
  const [selectedQueueItem, setSelectedQueueItem] = useState('my_deals'); // 'my_deals' | 'closing_month' | 'my_leads' | 'leads_recent' | 'my_contacts' | 'tasks' | 'meetings' | 'calls' | 'blueprint'
  const [recordsScope, setRecordsScope] = useState('my_records'); // 'my_records' | 'all_records'
  const [deals, setDeals] = useState([]);
  const [leads, setLeads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [dealsRes, leadsRes, contactsRes, actsRes] = await Promise.all([
        apiListDeals().catch(() => ({ stages: {} })),
        apiListLeads().catch(() => ({ leads: [] })),
        apiListCrmContacts().catch(() => ({ contacts: [] })),
        apiListCrmActivities().catch(() => ({ activities: [] }))
      ]);

      let allDeals = [];
      if (dealsRes.stages) {
        Object.values(dealsRes.stages).forEach(arr => {
          if (Array.isArray(arr)) allDeals.push(...arr);
        });
      } else if (Array.isArray(dealsRes.deals)) {
        allDeals = dealsRes.deals;
      }
      setDeals(allDeals);
      setLeads(leadsRes.leads || []);
      setContacts(contactsRes.contacts || []);
      setActivities(actsRes.activities || []);
    } catch (err) {
      console.error('Failed to load workqueue records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const tasksList = activities.filter(a => a.type === 'task' || !a.type);
  const meetingsList = activities.filter(a => a.type === 'meeting');
  const callsList = activities.filter(a => a.type === 'call');
  const myLeadsList = leads;
  const recentLeadsList = leads.filter(l => l.created_at && (Date.now() - new Date(l.created_at).getTime() <= 3 * 3600000));
  const contactsList = contacts;
  const dealsList = deals;
  const closingMonthDealsList = deals.filter(d => {
    if (!d.expected_close_date) return false;
    const dDate = new Date(d.expected_close_date);
    const now = new Date();
    return dDate.getFullYear() === now.getFullYear() && dDate.getMonth() === now.getMonth();
  });

  const tasksCount = tasksList.length;
  const meetingsCount = meetingsList.length;
  const callsCount = callsList.length;
  const leadsCount = myLeadsList.length;
  const recentLeadsCount = recentLeadsList.length;
  const contactsCount = contactsList.length;
  const dealsCount = dealsList.length;
  const closingMonthCount = closingMonthDealsList.length;

  const fmtCurrency = (val) => `Rs. ${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getDateBadge = (dateStr) => {
    if (!dateStr) return { text: 'Active', bg: '#0052cc' };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { text: 'Active', bg: '#0052cc' };
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return { text: 'Today', bg: '#ff7452' };
    }
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 3600 * 24));
    if (diffDays >= 0 && diffDays <= 7) {
      return { text: `${month} ${day}`, bg: '#00a3bf' }; // teal
    }
    if (diffDays < 0) {
      return { text: `${month} ${day}`, bg: '#e56b82' }; // pink/rose
    }
    return { text: `${month} ${day}`, bg: '#5243aa' }; // purple
  };

  // Determine current active queue slice
  let activeList = [];
  let queueTitle = 'My Deals';
  let queuePill = 'Deals';
  let queueKind = 'deals';

  if (selectedQueueItem === 'tasks') {
    activeList = tasksList;
    queueTitle = 'My Open Tasks';
    queuePill = 'Activities';
    queueKind = 'tasks';
  } else if (selectedQueueItem === 'meetings') {
    activeList = meetingsList;
    queueTitle = 'My Meetings';
    queuePill = 'Activities';
    queueKind = 'meetings';
  } else if (selectedQueueItem === 'calls') {
    activeList = callsList;
    queueTitle = 'My Calls';
    queuePill = 'Activities';
    queueKind = 'calls';
  } else if (selectedQueueItem === 'my_leads') {
    activeList = myLeadsList;
    queueTitle = 'My Leads';
    queuePill = 'Leads';
    queueKind = 'leads';
  } else if (selectedQueueItem === 'leads_recent') {
    activeList = recentLeadsList;
    queueTitle = 'Leads Assigned in Last 3 Hours';
    queuePill = 'Leads';
    queueKind = 'leads';
  } else if (selectedQueueItem === 'my_contacts') {
    activeList = contactsList;
    queueTitle = 'My Contacts';
    queuePill = 'Contacts';
    queueKind = 'contacts';
  } else if (selectedQueueItem === 'closing_month') {
    activeList = closingMonthDealsList;
    queueTitle = 'Deals Closing This Month';
    queuePill = 'Deals';
    queueKind = 'deals';
  } else if (selectedQueueItem === 'blueprint') {
    activeList = [];
    queueTitle = 'Blueprint Jobs';
    queuePill = 'Jobs';
    queueKind = 'blueprint';
  } else {
    activeList = dealsList;
    queueTitle = 'My Deals';
    queuePill = 'Deals';
    queueKind = 'deals';
  }

  const filteredRecords = activeList.filter(item => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return Object.values(item).some(val =>
      val !== null && val !== undefined && String(val).toLowerCase().includes(term)
    );
  });

  return (
    <div className="workqueue-container">
      {/* LEFT NAVIGATION PANE (Zoho Workqueue Submenu) */}
      <aside className="workqueue-sidebar">
        {/* Section: My Open Activity */}
        <div className="wq-nav-section">
          <div className="wq-section-header">
            <span className="wq-section-title">My Open Activity</span>
            <select className="wq-activity-filter-select">
              <option>Today & Overdue</option>
              <option>This Week</option>
              <option>All Pending</option>
            </select>
          </div>
          <div className="wq-nav-items">
            <button
              type="button"
              className={`wq-nav-item ${selectedQueueItem === 'tasks' ? 'active' : ''}`}
              onClick={() => setSelectedQueueItem('tasks')}
            >
              <div className="wq-item-left">
                <span className="wq-icon"><CheckSquareIcon size={15} /></span>
                <span>Tasks</span>
              </div>
              <span className="wq-count-badge">{tasksCount}</span>
            </button>
            <button
              type="button"
              className={`wq-nav-item ${selectedQueueItem === 'meetings' ? 'active' : ''}`}
              onClick={() => setSelectedQueueItem('meetings')}
            >
              <div className="wq-item-left">
                <span className="wq-icon"><HandshakeIcon size={15} /></span>
                <span>Meetings</span>
              </div>
              <span className="wq-count-badge">{meetingsCount}</span>
            </button>
            <button
              type="button"
              className={`wq-nav-item ${selectedQueueItem === 'calls' ? 'active' : ''}`}
              onClick={() => setSelectedQueueItem('calls')}
            >
              <div className="wq-item-left">
                <span className="wq-icon"><PhoneIcon size={15} /></span>
                <span>Calls</span>
              </div>
              <span className="wq-count-badge">{callsCount}</span>
            </button>
          </div>
        </div>

        {/* Section: My Jobs */}
        <div className="wq-nav-section">
          <div className="wq-section-header">
            <span className="wq-section-title">My Jobs</span>
          </div>
          <div className="wq-nav-items">
            <button
              type="button"
              className={`wq-nav-item ${selectedQueueItem === 'blueprint' ? 'active' : ''}`}
              onClick={() => setSelectedQueueItem('blueprint')}
            >
              <div className="wq-item-left">
                <span className="wq-icon"><SettingsIcon size={15} /></span>
                <span>Blueprint</span>
              </div>
              <span className="wq-count-badge muted">0</span>
            </button>
          </div>
        </div>

        {/* Section: My Workqueue */}
        <div className="wq-nav-section">
          <div className="wq-section-header">
            <span className="wq-section-title">My Workqueue</span>
            <button type="button" className="wq-settings-btn" title="Configure Queue">
              <SettingsIcon size={13} />
            </button>
          </div>

          {/* Group: Leads */}
          <div className="wq-group-label">Leads</div>
          <div className="wq-nav-items">
            <button
              type="button"
              className={`wq-nav-item ${selectedQueueItem === 'my_leads' ? 'active' : ''}`}
              onClick={() => setSelectedQueueItem('my_leads')}
            >
              <div className="wq-item-left">
                <span className="wq-icon"><LeadsIcon size={15} /></span>
                <span>My Leads</span>
              </div>
              <span className="wq-count-badge">{leadsCount}</span>
            </button>
            <button
              type="button"
              className={`wq-nav-item ${selectedQueueItem === 'leads_recent' ? 'active' : ''}`}
              onClick={() => setSelectedQueueItem('leads_recent')}
            >
              <div className="wq-item-left">
                <span className="wq-icon"><ClockIcon size={15} /></span>
                <span>Leads assigned in last 3 hours</span>
              </div>
              <span className="wq-count-badge">{recentLeadsCount}</span>
            </button>
          </div>

          {/* Group: Contacts */}
          <div className="wq-group-label">Contacts</div>
          <div className="wq-nav-items">
            <button
              type="button"
              className={`wq-nav-item ${selectedQueueItem === 'my_contacts' ? 'active' : ''}`}
              onClick={() => setSelectedQueueItem('my_contacts')}
            >
              <div className="wq-item-left">
                <span className="wq-icon"><UsersIcon size={15} /></span>
                <span>My Contacts</span>
              </div>
              <span className="wq-count-badge">{contactsCount}</span>
            </button>
          </div>

          {/* Group: Deals */}
          <div className="wq-group-label">Deals</div>
          <div className="wq-nav-items">
            <button
              type="button"
              className={`wq-nav-item ${selectedQueueItem === 'my_deals' ? 'active' : ''}`}
              onClick={() => setSelectedQueueItem('my_deals')}
            >
              <div className="wq-item-left">
                <span className="wq-icon"><BriefcaseIcon size={15} /></span>
                <span>My Deals</span>
              </div>
              <span className="wq-count-badge">{dealsCount}</span>
            </button>
            <button
              type="button"
              className={`wq-nav-item ${selectedQueueItem === 'closing_month' ? 'active' : ''}`}
              onClick={() => setSelectedQueueItem('closing_month')}
            >
              <div className="wq-item-left">
                <span className="wq-icon"><CalendarIcon size={15} /></span>
                <span>Deals Closing This Month</span>
              </div>
              <span className="wq-count-badge">{closingMonthCount}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN DATA WORKSPACE */}
      <main className="workqueue-main">
        {/* Top Header Bar */}
        <div className="wq-header-row">
          <div className="wq-title-block">
            <h3 className="wq-view-title">{queueTitle}</h3>
            <span className="wq-title-pill">{queuePill}</span>
            <select
              value={recordsScope}
              onChange={(e) => setRecordsScope(e.target.value)}
              className="wq-records-scope-select"
            >
              <option value="my_records">My Records</option>
              <option value="all_records">All Team Records</option>
            </select>
            <button type="button" className="wq-tool-icon-btn" onClick={loadData} title="Refresh">
              <RefreshIcon size={14} />
            </button>
          </div>

          <div className="wq-header-tools">
            <div className="wq-search-box">
              <SearchIcon size={14} color="#6b778c" />
              <input
                type="text"
                placeholder="Search records..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>
            <button type="button" className="wq-filter-btn" title="Advanced Filters">
              <FilterIcon size={13} style={{ marginRight: '5px' }} />
              Filter
            </button>
          </div>
        </div>

        {/* Data Grid Table */}
        <div className="wq-table-container">
          <table className="wq-table">
            <thead>
              {queueKind === 'deals' && (
                <tr>
                  <th style={{ width: '40px' }}><input type="checkbox" /></th>
                  <th style={{ width: '100px' }}>Date</th>
                  <th>Deal Name</th>
                  <th>Amount</th>
                  <th>Stage</th>
                  <th>Closing Date</th>
                  <th>Account Name</th>
                  <th>Contact Name</th>
                </tr>
              )}
              {queueKind === 'leads' && (
                <tr>
                  <th style={{ width: '40px' }}><input type="checkbox" /></th>
                  <th style={{ width: '100px' }}>Created Date</th>
                  <th>Lead Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Score</th>
                </tr>
              )}
              {queueKind === 'contacts' && (
                <tr>
                  <th style={{ width: '40px' }}><input type="checkbox" /></th>
                  <th style={{ width: '100px' }}>Date</th>
                  <th>Contact Name</th>
                  <th>Account / Company</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Title / Department</th>
                </tr>
              )}
              {(queueKind === 'tasks' || queueKind === 'meetings' || queueKind === 'calls') && (
                <tr>
                  <th style={{ width: '40px' }}><input type="checkbox" /></th>
                  <th style={{ width: '100px' }}>Due Date</th>
                  <th>Subject / Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Related To</th>
                  <th>Notes</th>
                </tr>
              )}
              {queueKind === 'blueprint' && (
                <tr>
                  <th style={{ width: '40px' }}><input type="checkbox" /></th>
                  <th>Process / Blueprint Name</th>
                  <th>Current State</th>
                  <th>Next Transition</th>
                  <th>Status</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="wq-state-msg">Loading records...</td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="8" className="wq-state-msg" style={{ textAlign: 'center', padding: '36px', color: '#5e6c84' }}>
                    No records found in this workqueue.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item) => {
                  if (queueKind === 'deals') {
                    const badge = getDateBadge(item.expected_close_date || item.created_at);
                    return (
                      <tr key={item.id} className="wq-row">
                        <td><input type="checkbox" /></td>
                        <td>
                          <span className="wq-date-chip" style={{ backgroundColor: badge.bg }}>
                            {badge.text}
                          </span>
                        </td>
                        <td>
                          <strong
                            className="wq-deal-link"
                            onClick={() => onSelectDeal && onSelectDeal(item)}
                          >
                            {item.title}
                          </strong>
                        </td>
                        <td>
                          <span className="wq-amount-text">{fmtCurrency(item.value)}</span>
                        </td>
                        <td>
                          <span className={`wq-stage-badge stage-${(item.stage || 'lead').toLowerCase().replace(/[^a-z]/g, '')}`}>
                            {item.stage || 'Lead'}
                          </span>
                        </td>
                        <td>
                          <span className="wq-date-text">
                            {item.expected_close_date ? new Date(item.expected_close_date).toLocaleDateString() : '—'}
                          </span>
                        </td>
                        <td>
                          <span className="wq-account-text">{item.client_name || item.account_name || '—'}</span>
                        </td>
                        <td>
                          <span className="wq-contact-text">{item.contact_name || item.primary_contact || '—'}</span>
                        </td>
                      </tr>
                    );
                  }

                  if (queueKind === 'leads') {
                    const leadFullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.company;
                    const badge = getDateBadge(item.created_at);
                    return (
                      <tr key={item.id} className="wq-row">
                        <td><input type="checkbox" /></td>
                        <td>
                          <span className="wq-date-chip" style={{ backgroundColor: badge.bg }}>
                            {badge.text}
                          </span>
                        </td>
                        <td>
                          <strong
                            className="wq-deal-link"
                            onClick={() => onSelectLead && onSelectLead(item)}
                          >
                            {leadFullName}
                          </strong>
                        </td>
                        <td>
                          <span className="wq-account-text">{item.company || '—'}</span>
                        </td>
                        <td>
                          <span className="wq-contact-text">{item.email || '—'}</span>
                        </td>
                        <td>
                          <span className="wq-date-text">{item.phone || '—'}</span>
                        </td>
                        <td>
                          <span className="wq-stage-badge">{item.status || 'New'}</span>
                        </td>
                        <td>
                          <span className="wq-amount-text">{item.lead_score ?? 0}</span>
                        </td>
                      </tr>
                    );
                  }

                  if (queueKind === 'contacts') {
                    const contactName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.name;
                    const badge = getDateBadge(item.created_at);
                    return (
                      <tr key={item.id} className="wq-row">
                        <td><input type="checkbox" /></td>
                        <td>
                          <span className="wq-date-chip" style={{ backgroundColor: badge.bg }}>
                            {badge.text}
                          </span>
                        </td>
                        <td>
                          <strong className="wq-deal-link">{contactName}</strong>
                        </td>
                        <td>
                          <span className="wq-account-text">{item.company || item.account_name || '—'}</span>
                        </td>
                        <td>
                          <span className="wq-contact-text">{item.email || '—'}</span>
                        </td>
                        <td>
                          <span className="wq-date-text">{item.phone || '—'}</span>
                        </td>
                        <td>
                          <span className="wq-account-text">{item.title || item.department || '—'}</span>
                        </td>
                      </tr>
                    );
                  }

                  // Activities (tasks, meetings, calls)
                  return (
                    <tr key={item.id} className="wq-row">
                      <td><input type="checkbox" /></td>
                      <td>
                        <span className="wq-date-chip" style={{ backgroundColor: '#00875a' }}>
                          {item.due_date ? new Date(item.due_date).toLocaleDateString() : 'Today'}
                        </span>
                      </td>
                      <td>
                        <strong className="wq-deal-link">{item.title}</strong>
                      </td>
                      <td>
                        <span className="wq-stage-badge">{(item.type || 'Task').toUpperCase()}</span>
                      </td>
                      <td>
                        <span className="wq-stage-badge">{item.completed ? 'COMPLETED' : 'PENDING'}</span>
                      </td>
                      <td>
                        <span className="wq-account-text">
                          {item.related_type ? `${item.related_type} #${item.related_id}` : 'General'}
                        </span>
                      </td>
                      <td>
                        <span className="wq-contact-text">{item.description || '—'}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with pagination & total count */}
        <div className="wq-table-footer">
          <div className="wq-total-records">
            Total Records: <strong>{filteredRecords.length}</strong>
          </div>
          <div className="wq-pagination">
            <span>{filteredRecords.length > 0 ? `1 to ${filteredRecords.length}` : '0 to 0'}</span>
            <button type="button" className="wq-page-btn" disabled>&lt;</button>
            <button type="button" className="wq-page-btn" disabled>&gt;</button>
          </div>
        </div>
      </main>
    </div>
  );
}
