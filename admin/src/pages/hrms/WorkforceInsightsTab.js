import React, { useState, useEffect, useCallback } from 'react';
import { apiWorkforceInsights } from '../../api';
import './WorkforceInsightsTab.css';

export default function WorkforceInsightsTab({ isAdmin, user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiWorkforceInsights();
      setData(res);
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading) {
    return <div> <div className="loader_container">
      <p className="loader_spinner"></p>
      <p>Loading Please Wait...</p>
    </div>
    </div>;
  }

  const {
    headcount = {},
    departmentDistribution = [],
    designationDistribution = [],
    attendanceMetrics = {},
    payrollMetrics = {},
    recruitmentFunnel = {}
  } = data || {};

  const totalEmp = Number(headcount.total_employees || 1);
  const fmtCurrency = (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`;

  // Attendance rate %
  const totalPunches = Number(attendanceMetrics.total_punches || 0);
  const presentPunches = Number(attendanceMetrics.present_count || 0);
  const attRate = totalPunches > 0 ? Math.round((presentPunches / totalPunches) * 100) : 96;

  return (
    <div className="workforce-insights-tab">
      {/* Top Banner KPI Cards */}
      <div className="insights-kpi-grid">
        <div className="insight-card">
          <div className="card-top">
            <span className="card-label">Total Workforce</span>
            <span className="card-badge bg-blue">Live</span>
          </div>
          <div className="card-main-val">{headcount.total_employees || 0}</div>
          <div className="card-sub-info">
            <span>{headcount.active_employees || 0} Active • {headcount.new_hires_month || 0} New this month</span>
          </div>
        </div>

        <div className="insight-card">
          <div className="card-top">
            <span className="card-label">Attendance Health</span>
            <span className="card-badge bg-green">{attRate}% On-Time</span>
          </div>
          <div className="card-main-val text-success">{attRate}%</div>
          <div className="card-sub-info">
            <span>{attendanceMetrics.late_count || 0} late marks • {attendanceMetrics.total_hours_worked || 0} hrs logged</span>
          </div>
        </div>

        <div className="insight-card">
          <div className="card-top">
            <span className="card-label">Monthly Payroll Spend</span>
            <span className="card-badge bg-purple">₹ Disbursed</span>
          </div>
          <div className="card-main-val text-primary">{fmtCurrency(payrollMetrics.total_gross_spend)}</div>
          <div className="card-sub-info">
            <span>Avg Salary: {fmtCurrency(payrollMetrics.avg_salary)}</span>
          </div>
        </div>

        <div className="insight-card">
          <div className="card-top">
            <span className="card-label">Recruitment Funnel</span>
            <span className="card-badge bg-amber">{recruitmentFunnel.hired || 0} Hires</span>
          </div>
          <div className="card-main-val text-amber">{recruitmentFunnel.total_candidates || 0}</div>
          <div className="card-sub-info">
            <span>{recruitmentFunnel.interview || 0} in interview • {recruitmentFunnel.offer || 0} offered</span>
          </div>
        </div>
      </div>

      {/* Row 1: Department Distribution & Designation Breakdown */}
      <div className="insights-two-col">
        {/* Department Distribution */}
        <div className="insights-panel">
          <div className="panel-header">
            <h4>🏢 Department Distribution</h4>
            <span className="panel-sub">Workforce headcount across business units</span>
          </div>

          <div className="dept-bars-list">
            {departmentDistribution.length === 0 ? (
              <div className="empty-panel">No department data yet.</div>
            ) : (
              departmentDistribution.map((d, idx) => {
                const pct = Math.round((Number(d.count) / totalEmp) * 100);
                return (
                  <div className="dept-bar-row" key={idx}>
                    <div className="dept-bar-info">
                      <span className="dept-name">{d.department}</span>
                      <span className="dept-count">{d.count} ({pct}%)</span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.max(5, pct)}%`, backgroundColor: getDeptColor(idx) }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Roles & Designations */}
        <div className="insights-panel">
          <div className="panel-header">
            <h4>💼 Role & Seniority Distribution</h4>
            <span className="panel-sub">Key functional roles across teams</span>
          </div>

          <div className="pos-list">
            {designationDistribution.map((p, idx) => (
              <div className="pos-item" key={idx}>
                <div className="pos-icon">⚡</div>
                <div className="pos-info">
                  <span className="pos-title">{p.position}</span>
                  <span className="pos-meta">{p.count} Team Members</span>
                </div>
                <span className="pos-pill">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Payroll Breakdown & Recruitment Conversion Funnel */}
      <div className="insights-two-col">
        {/* Payroll Statutory Contribution */}
        <div className="insights-panel">
          <div className="panel-header">
            <h4>💵 Monthly Compensation & Deductions Breakdown</h4>
            <span className="panel-sub">Statutory contributions and take-home disbursement</span>
          </div>

          <div className="payroll-stat-items">
            <div className="p-stat-box">
              <span className="p-stat-title">Net Salary Disbursed</span>
              <strong className="text-success">{fmtCurrency(payrollMetrics.total_net_disbursed)}</strong>
            </div>
            <div className="p-stat-box">
              <span className="p-stat-title">EPF Employee Contribution</span>
              <strong>{fmtCurrency(payrollMetrics.total_pf_contribution)}</strong>
            </div>
            <div className="p-stat-box">
              <span className="p-stat-title">ESIC Insurance</span>
              <strong>{fmtCurrency(payrollMetrics.total_esi_contribution)}</strong>
            </div>
            <div className="p-stat-box">
              <span className="p-stat-title">Income Tax (TDS)</span>
              <strong>{fmtCurrency(payrollMetrics.total_tds_deducted)}</strong>
            </div>
          </div>
        </div>

        {/* Recruitment Funnel Visual */}
        <div className="insights-panel">
          <div className="panel-header">
            <h4>🎯 Recruitment ATS Conversion Funnel</h4>
            <span className="panel-sub">End-to-end applicant conversion rate</span>
          </div>

          <div className="funnel-container">
            <div className="funnel-step">
              <div className="funnel-bar bg-slate" style={{ width: '100%' }}>
                <span>Applied: {recruitmentFunnel.applied || 0}</span>
              </div>
            </div>
            <div className="funnel-step">
              <div className="funnel-bar bg-blue" style={{ width: '75%' }}>
                <span>Screening: {recruitmentFunnel.screening || 0}</span>
              </div>
            </div>
            <div className="funnel-step">
              <div className="funnel-bar bg-amber" style={{ width: '55%' }}>
                <span>Interview: {recruitmentFunnel.interview || 0}</span>
              </div>
            </div>
            <div className="funnel-step">
              <div className="funnel-bar bg-purple" style={{ width: '35%' }}>
                <span>Offer Extended: {recruitmentFunnel.offer || 0}</span>
              </div>
            </div>
            <div className="funnel-step">
              <div className="funnel-bar bg-green" style={{ width: '22%' }}>
                <span>Hired 🎉: {recruitmentFunnel.hired || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDeptColor(idx) {
  const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
  return colors[idx % colors.length];
}
