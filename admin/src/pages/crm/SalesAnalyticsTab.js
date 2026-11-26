import React, { useState, useEffect, useCallback } from 'react';
import { apiCrmAnalytics } from '../../api';
import { TargetIcon, AwardIcon, FolderIcon } from '../../components/CrmHrmsIcons';
import './SalesAnalyticsTab.css';

export default function SalesAnalyticsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCrmAnalytics();
      setData(res.analytics || null);
    } catch (err) {
      console.error('Failed to load CRM analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const fmtCurrency = (val) => val ? `₹${Number(val).toLocaleString('en-IN')}` : '₹0';

  if (loading) {
    return <div className="loader_container">
      <p className="loader_spinner"></p>
      <p>Loading Sales Forecasting...</p>
    </div>
  }

  const leads = data?.leads || {};
  const deals = data?.deals || {};
  const lossReasons = data?.loss_reasons || [];
  const reps = data?.reps_leaderboard || [];
  const quotes = data?.quotes || {};

  const totalLeads = Number(leads.total_leads || 1);
  const convLeads = Number(leads.converted_leads || 0);
  const leadConvRate = Math.round((convLeads / totalLeads) * 100);

  return (
    <div className="crm-analytics-tab">
      {/* Top Metric Tiles */}
      <div className="analytics-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Pipeline Value</span>
            <span className="kpi-pill pill-blue">Unweighted</span>
          </div>
          <div className="kpi-main-val text-primary">{fmtCurrency(deals.pipeline_value)}</div>
          <div className="kpi-sub-text">{deals.total_deals || 0} Total Active Deals</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Weighted Revenue Forecast</span>
            <span className="kpi-pill pill-purple">Probability Adjusted</span>
          </div>
          <div className="kpi-main-val">{fmtCurrency(deals.weighted_forecast_value)}</div>
          <div className="kpi-sub-text">Expected cash realization</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Closed Won Revenue</span>
            <span className="kpi-pill pill-green">{deals.win_rate || 0}% Win Rate</span>
          </div>
          <div className="kpi-main-val text-success">{fmtCurrency(deals.won_revenue)}</div>
          <div className="kpi-sub-text">{deals.won_deals || 0} Deals Won</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Quotes Accepted</span>
            <span className="kpi-pill pill-amber">CPQ Proposals</span>
          </div>
          <div className="kpi-main-val text-amber">{fmtCurrency(quotes.accepted_quotes_value)}</div>
          <div className="kpi-sub-text">{quotes.accepted_quotes || 0} of {quotes.total_quotes || 0} Proposals Accepted</div>
        </div>
      </div>

      {/* Two Column Layout: Funnel & Reps */}
      <div className="analytics-two-col">
        {/* Sales Conversion Funnel */}
        <div className="analytics-panel">
          <div className="panel-header">
            <h4><TargetIcon size={16} style={{ marginRight: '6px' }} /> Lead-to-Revenue Conversion Funnel</h4>
            <span className="panel-sub">End-to-end efficiency across stages</span>
          </div>

          <div className="crm-funnel-container">
            <div className="funnel-bar-step">
              <div className="funnel-bar f-step-1" style={{ width: '100%' }}>
                <span>Total Leads Ingested: {leads.total_leads || 0} (100%)</span>
              </div>
            </div>
            <div className="funnel-bar-step">
              <div className="funnel-bar f-step-2" style={{ width: '78%' }}>
                <span>Contacted & Outreach: {leads.contacted_leads || 0}</span>
              </div>
            </div>
            <div className="funnel-bar-step">
              <div className="funnel-bar f-step-3" style={{ width: '56%' }}>
                <span>Qualified Prospects: {leads.qualified_leads || 0}</span>
              </div>
            </div>
            <div className="funnel-bar-step">
              <div className="funnel-bar f-step-4" style={{ width: `${Math.max(25, leadConvRate)}%` }}>
                <span>Converted to Deal & Account: {leads.converted_leads || 0} ({leadConvRate}%)</span>
              </div>
            </div>
            <div className="funnel-bar-step">
              <div className="funnel-bar f-step-5" style={{ width: `${Math.max(15, Number(deals.win_rate || 10))}%` }}>
                <span>Closed Won Revenue: {deals.won_deals || 0} ({deals.win_rate || 0}% Won)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rep Leaderboard */}
        <div className="analytics-panel">
          <div className="panel-header">
            <h4><AwardIcon size={16} style={{ marginRight: '6px' }} /> Sales Rep Performance Leaderboard</h4>
            <span className="panel-sub">Revenue generated by team members</span>
          </div>

          <div className="reps-list">
            {reps.length === 0 ? (
              <div className="empty-panel">No sales reps assigned yet.</div>
            ) : (
              reps.map((r, idx) => (
                <div key={r.id || idx} className="rep-row">
                  <div className="rep-rank">#{idx + 1}</div>
                  <div className="rep-info">
                    <strong>{r.name || r.email}</strong>
                    <span className="rep-meta">{r.deals_count || 0} Deals Managed • {r.won_count || 0} Won</span>
                  </div>
                  <div className="rep-revenue">
                    <strong>{fmtCurrency(r.won_revenue)}</strong>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Loss Reasons Analysis */}
      <div className="analytics-panel">
        <div className="panel-header">
          <h4><FolderIcon size={16} style={{ marginRight: '6px' }} /> Deal Loss Reasons & Disqualification Analytics</h4>
          <span className="panel-sub">Root cause feedback on lost opportunities to optimize product and pricing</span>
        </div>

        <div className="loss-reasons-grid">
          {lossReasons.length === 0 ? (
            <div className="empty-panel">No lost deals recorded yet.</div>
          ) : (
            lossReasons.map((lr, idx) => (
              <div key={idx} className="loss-reason-card">
                <span className="loss-reason-title">{lr.reason}</span>
                <strong className="loss-reason-val">{lr.count} Deals Lost</strong>
                <span className="loss-amount">Lost Pipeline: {fmtCurrency(lr.value)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
