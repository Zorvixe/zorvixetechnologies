import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth';
import { apiCrmStats, apiListDeals, apiListCrmActivities } from '../../api';
import { BuildingIcon, WorkqueueIcon, PipelineIcon } from '../../components/CrmHrmsIcons';
import './CrmHomeTab.css';

export default function CrmHomeTab({ onNavigateTab }) {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [deals, setDeals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);

  const userName = user?.name || user?.email?.split('@')[0] || 'Sales Executive';

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const [statsRes, dealsRes, actsRes] = await Promise.all([
          apiCrmStats().catch(() => ({ stats: {} })),
          apiListDeals().catch(() => ({ deals: [] })),
          apiListCrmActivities().catch(() => ({ activities: [] }))
        ]);

        setStats(statsRes.stats || {});
        
        // Flatten deals from stages object or array
        let allDeals = [];
        if (dealsRes.stages) {
          Object.values(dealsRes.stages).forEach(arr => {
            if (Array.isArray(arr)) allDeals.push(...arr);
          });
        } else if (Array.isArray(dealsRes.deals)) {
          allDeals = dealsRes.deals;
        }
        setDeals(allDeals);

        const activities = actsRes.activities || [];
        const taskItems = activities.filter(a => a.type === 'task' || !a.type);
        const meetingItems = activities.filter(a => a.type === 'meeting' || a.type === 'call');

        setTasks(taskItems);
        setMeetings(meetingItems);
      } catch (err) {
        console.error('Failed to load CRM Home data:', err);
      }
    };

    loadHomeData();
  }, []);

  // Untouched deals (stagnant for 14+ days)
  const untouchedDeals = deals.filter(d => {
    if (d.stage === 'won' || d.stage === 'lost') return false;
    const days = Math.floor((Date.now() - new Date(d.updated_at || d.created_at || Date.now()).getTime()) / 86400000);
    return days >= 14;
  });

  const openDeals = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
  const openDealsValue = openDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);

  // Calls & meetings today
  const todayStr = new Date().toISOString().slice(0, 10);
  const callsToday = meetings.filter(m => (m.due_date || '').startsWith(todayStr));

  const fmtCurrency = (val) => `Rs. ${Number(val || 0).toLocaleString('en-IN')}`;

  return (
    <div className="crm-home-tab">
      {/* Welcome Banner */}
      <div className="crm-welcome-banner">
        <div className="welcome-text-box">
          <div className="building-icon-box">
            <BuildingIcon size={24} color="#0052cc" />
          </div>
          <div>
            <h2>Welcome {userName}</h2>
            <p>Zorvixe CRM Cockpit • Real-time Executive Overview</p>
          </div>
        </div>
        <div className="welcome-actions">
          <button type="button" className="btn-cockpit-action" onClick={() => onNavigateTab && onNavigateTab('workqueue')}>
            <WorkqueueIcon size={14} style={{ marginRight: '6px' }} />
            Open Workqueue
          </button>
          <button type="button" className="btn-cockpit-action primary" onClick={() => onNavigateTab && onNavigateTab('pipeline')}>
            <PipelineIcon size={14} style={{ marginRight: '6px' }} />
            Pipeline Board
          </button>
        </div>
      </div>

      {/* KPI Cards Row (Matches Zoho CRM Top Ribbon) */}
      <div className="crm-kpi-ribbon">
        <div className="crm-kpi-card" onClick={() => onNavigateTab && onNavigateTab('pipeline')}>
          <div className="kpi-label">My Open Deals</div>
          <div className="kpi-value text-primary">{openDeals.length}</div>
          <div className="kpi-sub">{fmtCurrency(openDealsValue)}</div>
        </div>

        <div className="crm-kpi-card" onClick={() => onNavigateTab && onNavigateTab('workqueue')}>
          <div className="kpi-label">My Untouched Deals</div>
          <div className="kpi-value text-danger">{untouchedDeals.length}</div>
          <div className="kpi-sub">Stagnant 14+ Days</div>
        </div>

        <div className="crm-kpi-card" onClick={() => onNavigateTab && onNavigateTab('activities')}>
          <div className="kpi-label">My Calls Today</div>
          <div className="kpi-value text-success">{callsToday.length}</div>
          <div className="kpi-sub">Scheduled followups</div>
        </div>

        <div className="crm-kpi-card" onClick={() => onNavigateTab && onNavigateTab('leads')}>
          <div className="kpi-label">My Inbound Leads</div>
          <div className="kpi-value text-info">{stats?.total_leads || 0}</div>
          <div className="kpi-sub">Ready for qualification</div>
        </div>
      </div>

      {/* Split Workboards Row: My Open Tasks & My Meetings */}
      <div className="crm-home-split">
        {/* Left Board: My Open Tasks */}
        <div className="home-board-card">
          <div className="board-card-header">
            <h4>My Open Tasks</h4>
            <div className="board-header-right">
              <span className="sort-hint">⇅ Sort</span>
              <button
                type="button"
                className="btn-text-action"
                onClick={() => onNavigateTab && onNavigateTab('activities')}
              >
                View All
              </button>
            </div>
          </div>

          <div className="board-table-container">
            <table className="board-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: '24px', color: '#5e6c84' }}>
                      No open tasks found. Use "+ Log Activity" to add tasks.
                    </td>
                  </tr>
                ) : (
                  tasks.slice(0, 5).map(t => (
                    <tr key={t.id}>
                      <td>
                        <div className="task-title-cell">
                          <span className={`task-check-circle ${t.completed ? 'checked' : ''}`}>
                            {t.completed ? '✓' : ''}
                          </span>
                          <strong className="task-name">{t.title}</strong>
                        </div>
                      </td>
                      <td>
                        <span className="due-date-pill">
                          {t.due_date ? new Date(t.due_date).toLocaleDateString() : 'Today'}
                        </span>
                      </td>
                      <td>
                        <span className={`task-status-tag ${t.completed ? 'done' : 'open'}`}>
                          {t.completed ? 'COMPLETED' : 'PENDING'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Board: My Meetings */}
        <div className="home-board-card">
          <div className="board-card-header">
            <h4>My Meetings & Client Engagements</h4>
            <div className="board-header-right">
              <span className="sort-hint">⇅ Sort</span>
              <button
                type="button"
                className="btn-text-action"
                onClick={() => onNavigateTab && onNavigateTab('activities')}
              >
                View All
              </button>
            </div>
          </div>

          <div className="board-table-container">
            <table className="board-table">
              <thead>
                <tr>
                  <th>Title / Engagement</th>
                  <th>Type</th>
                  <th>Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {meetings.length === 0 ? (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: '24px', color: '#5e6c84' }}>
                      No scheduled meetings or client demos found.
                    </td>
                  </tr>
                ) : (
                  meetings.slice(0, 5).map(m => (
                    <tr key={m.id}>
                      <td>
                        <strong className="meeting-title">{m.title}</strong>
                      </td>
                      <td>
                        <span className="meeting-type-badge">{m.type || 'Demo'}</span>
                      </td>
                      <td>
                        <span className="meeting-time-text">
                          {m.due_date ? new Date(m.due_date).toLocaleDateString() : 'Today'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
