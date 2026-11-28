import React, { useState, useEffect, useCallback } from 'react';
import {
  apiListPayrollRuns,
  apiGeneratePayroll,
  apiUpdatePayroll,
  apiGetPayslip,
  apiGetMyPayslips,
  apiListSalaryStructures,
  apiUpdateSalaryStructure,
  apiAiPayrollAudit
} from '../../api';
import AiInsightBox from '../../components/AiInsightBox';
import PayslipModal from './PayslipModal';
import { showToast } from '../../utils/toast';
import {
  DollarIcon,
  SettingsIcon,
  FileTextIcon,
  CheckIcon,
  CalendarIcon,
  PrinterIcon,
  ChartIcon,
  SparklesIcon
} from '../../components/CrmHrmsIcons';
import './PayrollTab.css';

export default function PayrollTab({ isAdmin, user }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState('');

  // Runs data
  const [payrolls, setPayrolls] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // My payslips (for non-admin or personal view)
  const [myPayslips, setMyPayslips] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState(isAdmin ? 'runs' : 'my_payslips');
  const [payslipYearFilter, setPayslipYearFilter] = useState('all');
  const [payslipViewMode, setPayslipViewMode] = useState('cards'); // 'cards' | 'table'

  // Payslip Modal
  const [selectedPayslipData, setSelectedPayslipData] = useState(null);
  const [payslipLoading, setPayslipLoading] = useState(false);

  // Salary structures
  const [structures, setStructures] = useState([]);
  const [structuresLoading, setStructuresLoading] = useState(false);
  const [editingStructure, setEditingStructure] = useState(null);
  const [savingStructure, setSavingStructure] = useState(false);
  const [structForm, setStructForm] = useState({
    ctc_annual: 600000,
    basic_monthly: 25000,
    hra_monthly: 10000,
    special_allowance_monthly: 10000,
    conveyance_monthly: 2500,
    medical_allowance_monthly: 2500,
    pf_employee_monthly: 1800,
    esi_employee_monthly: 0,
    professional_tax_monthly: 200,
    tds_monthly: 0,
    effective_from: ''
  });

  // Edit Payroll record (bonus, other deductions, status)
  const [editingPayroll, setEditingPayroll] = useState(null);
  const [adjustForm, setAdjustForm] = useState({
    status: 'draft',
    bonus: 0,
    other_deductions: 0,
    payment_mode: 'Bank Transfer',
    notes: ''
  });

  // AI Payroll Discrepancy Checker (Admin Review Only)
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditErr, setAuditErr] = useState('');
  const [auditData, setAuditData] = useState(null);

  const runPayrollAiAudit = async () => {
    if (!isAdmin) return;
    setAuditOpen(true);
    setAuditLoading(true);
    setAuditErr('');
    try {
      const res = await apiAiPayrollAudit({ month: selectedMonth, year: selectedYear });
      setAuditData(res);
    } catch (err) {
      setAuditErr(err.message || 'Failed to audit payroll');
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchPayrollRuns = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const res = await apiListPayrollRuns({
        month: selectedMonth,
        year: selectedYear,
        status: statusFilter
      });
      setPayrolls(res.payrolls || []);
      setSummary(res.summary || null);
    } catch (err) {
      console.error('Failed to load payroll runs:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedMonth, selectedYear, statusFilter]);

  const fetchMyPayslips = useCallback(async () => {
    try {
      const res = await apiGetMyPayslips();
      setMyPayslips(res.payslips || []);
    } catch (err) {
      console.error('Failed to load my payslips:', err);
    }
  }, []);

  const fetchStructures = useCallback(async () => {
    if (!isAdmin) return;
    setStructuresLoading(true);
    try {
      const res = await apiListSalaryStructures();
      setStructures(res.structures || []);
    } catch (err) {
      console.error('Failed to load structures:', err);
    } finally {
      setStructuresLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchPayrollRuns();
      fetchStructures();
    }
    fetchMyPayslips();
  }, [isAdmin, fetchPayrollRuns, fetchStructures, fetchMyPayslips]);

  const handleGeneratePayroll = async () => {
    if (!window.confirm(`Generate and calculate payroll for ${selectedMonth}/${selectedYear} across all active employees?`)) return;
    setGenerating(true);
    try {
      const res = await apiGeneratePayroll({ month: selectedMonth, year: selectedYear });
      showToast(res.message || 'Payroll generated successfully!', 'success');
      fetchPayrollRuns();
    } catch (err) {
      showToast(err.message || 'Payroll generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const openPayslip = async (payrollId) => {
    setPayslipLoading(true);
    try {
      const res = await apiGetPayslip(payrollId);
      setSelectedPayslipData(res.payslip);
    } catch (err) {
      showToast(err.message || 'Failed to load payslip preview', 'error');
    } finally {
      setPayslipLoading(false);
    }
  };

  const handleMarkPaid = async (payrollId) => {
    if (!window.confirm('Mark this payroll record as PAID?')) return;
    try {
      await apiUpdatePayroll(payrollId, {
        status: 'paid',
        payment_date: new Date().toISOString().slice(0, 10)
      });
      fetchPayrollRuns();
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  const openEditStructure = (item) => {
    setEditingStructure(item);
    const hasConfigured = Number(item.ctc_annual || 0) > 0 || Number(item.basic_monthly || 0) > 0;
    setStructForm({
      ctc_annual: hasConfigured ? Number(item.ctc_annual ?? 0) : 600000,
      basic_monthly: hasConfigured ? Number(item.basic_monthly ?? 0) : 25000,
      hra_monthly: hasConfigured ? Number(item.hra_monthly ?? 0) : 10000,
      special_allowance_monthly: hasConfigured ? Number(item.special_allowance_monthly ?? 0) : 10000,
      conveyance_monthly: hasConfigured ? Number(item.conveyance_monthly ?? 0) : 2500,
      medical_allowance_monthly: hasConfigured ? Number(item.medical_allowance_monthly ?? 0) : 2500,
      pf_employee_monthly: hasConfigured ? Number(item.pf_employee_monthly ?? 0) : 1800,
      esi_employee_monthly: Number(item.esi_employee_monthly ?? 0),
      professional_tax_monthly: Number(item.professional_tax_monthly ?? 200),
      tds_monthly: Number(item.tds_monthly ?? 0),
      effective_from: item.effective_from ? String(item.effective_from).slice(0, 10) : ''
    });
  };

  const handleCtcChange = (ctc) => {
    if (ctc === '') {
      setStructForm((prev) => ({ ...prev, ctc_annual: '' }));
      return;
    }
    const num = Math.max(0, Number(ctc || 0));
    const monthlyGross = Math.round(num / 12);
    const basic = Math.round(monthlyGross * 0.5); // 50% basic
    const hra = Math.round(basic * 0.4); // 20% of gross
    const conv = monthlyGross >= 15000 ? 2500 : Math.round(monthlyGross * 0.1);
    const med = monthlyGross >= 15000 ? 2500 : Math.round(monthlyGross * 0.1);
    const special = Math.max(0, monthlyGross - (basic + hra + conv + med));
    const pf = Math.min(1800, Math.round(basic * 0.12));
    const esi = monthlyGross > 0 && monthlyGross <= 21000 ? Math.round(monthlyGross * 0.0075) : 0;

    setStructForm((prev) => ({
      ...prev,
      ctc_annual: num,
      basic_monthly: basic,
      hra_monthly: hra,
      special_allowance_monthly: special,
      conveyance_monthly: conv,
      medical_allowance_monthly: med,
      pf_employee_monthly: pf,
      esi_employee_monthly: esi,
      professional_tax_monthly: monthlyGross > 10000 ? 200 : 0,
    }));
  };

  const handleSaveStructure = async (e) => {
    e.preventDefault();
    if (!editingStructure || savingStructure) return;
    setSavingStructure(true);
    try {
      await apiUpdateSalaryStructure(editingStructure.user_id, {
        ...structForm,
        ctc_annual: Number(structForm.ctc_annual || 0),
        basic_monthly: Number(structForm.basic_monthly || 0),
        hra_monthly: Number(structForm.hra_monthly || 0),
        special_allowance_monthly: Number(structForm.special_allowance_monthly || 0),
        conveyance_monthly: Number(structForm.conveyance_monthly || 0),
        medical_allowance_monthly: Number(structForm.medical_allowance_monthly || 0),
        pf_employee_monthly: Number(structForm.pf_employee_monthly || 0),
        esi_employee_monthly: Number(structForm.esi_employee_monthly || 0),
        professional_tax_monthly: Number(structForm.professional_tax_monthly || 0),
        tds_monthly: Number(structForm.tds_monthly || 0),
        effective_from: structForm.effective_from || null,
      });
      setEditingStructure(null);
      fetchStructures();
    } catch (err) {
      showToast(err.message || 'Failed to save salary structure', 'error');
    } finally {
      setSavingStructure(false);
    }
  };

  const openAdjustModal = (item) => {
    setEditingPayroll(item);
    setAdjustForm({
      status: item.status || 'draft',
      bonus: item.bonus || 0,
      other_deductions: item.other_deductions || 0,
      payment_mode: item.payment_mode || 'Bank Transfer',
      notes: item.notes || ''
    });
  };

  const handleSaveAdjustment = async (e) => {
    e.preventDefault();
    if (!editingPayroll) return;
    try {
      await apiUpdatePayroll(editingPayroll.id, adjustForm);
      showToast('Payroll record updated', 'success');
      setEditingPayroll(null);
      fetchPayrollRuns();
    } catch (err) {
      showToast(err.message || 'Failed to update record', 'error');
    }
  };

  const fmtCurrency = (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`;

  const monthNames = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="payroll-tab">
      {/* Sub Tabs: Payroll Runs | Salary Structures | My Payslips (Jira Subtab Style) */}
      <div className="payroll-subtabs-nav">
        {isAdmin && (
          <>
            <button
              type="button"
              className={`subtab-btn ${activeSubTab === 'runs' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('runs')}
            >
              <DollarIcon size={14} style={{ marginRight: '6px' }} />
              Monthly Payroll Runs
            </button>
            <button
              type="button"
              className={`subtab-btn ${activeSubTab === 'structures' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('structures')}
            >
              <SettingsIcon size={14} style={{ marginRight: '6px' }} />
              Salary Structures
            </button>
          </>
        )}
        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'my_payslips' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('my_payslips')}
        >
          <FileTextIcon size={14} style={{ marginRight: '6px' }} />
          My Payslips
        </button>
      </div>

      {/* VIEW 1: MONTHLY PAYROLL RUNS (ADMIN) */}
      {isAdmin && activeSubTab === 'runs' && (
        <div className="payroll-runs-section">
          {/* Controls Bar */}
          <div className="payroll-controls-bar">
            <div className="period-controls">
              <label>Payroll Month:</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="select-period"
              >
                {monthNames.slice(1).map((m, idx) => (
                  <option key={idx} value={idx + 1}>{m}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="select-period"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="select-period"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="processed">Processed</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div className="action-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="zx-ai-pill-btn"
                onClick={runPayrollAiAudit}
                title="Explain potential payroll discrepancies against salary structure, attendance, and leaves"
              >
                <SparklesIcon size={13} />
                <span>ZORVI Discrepancy Check</span>
              </button>
              <button
                className="btn-generate-payroll"
                onClick={handleGeneratePayroll}
                disabled={generating}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{generating ? 'Calculating...' : 'Run / Recalculate Payroll'}</span>
              </button>
            </div>
          </div>

          {auditOpen && (
            <AiInsightBox
              title={`ZORVI Payroll Discrepancy Audit (${monthNames[selectedMonth]} ${selectedYear})`}
              subtitle="Advisory review only — does not alter payroll numbers or release funds."
              loading={auditLoading}
              error={auditErr}
              uncertainty={auditData?.uncertainty}
              providerMeta={auditData?.meta}
              onRefresh={runPayrollAiAudit}
              onClose={() => setAuditOpen(false)}
            >
              {auditData && (
                <div>
                  <p style={{ margin: '0 0 8px' }}>{auditData.summary}</p>
                  {auditData.discrepancies?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {auditData.discrepancies.map((d) => (
                        <div key={d.payrollId} style={{ background: '#ffffff', border: '1px solid #dfe1e6', borderRadius: '6px', padding: '8px 10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <strong>{d.employeeName} ({d.department})</strong>
                            <span className={`zx-ai-tag ${d.severity}`}>{d.severity} risk</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#42526e', marginTop: '4px' }}>{d.aiExplanation}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </AiInsightBox>
          )}

          {/* Aggregate KPI Summary Cards */}
          {summary && (
            <div className="payroll-summary-grid">
              <div className="p-sum-card card-gross">
                <span className="p-sum-label">Total Gross Earnings</span>
                <span className="p-sum-val">{fmtCurrency(summary.totalGross)}</span>
                <span className="p-sum-sub">{summary.totalEmployees} Employees</span>
              </div>
              <div className="p-sum-card card-ded">
                <span className="p-sum-label">Total Statutory Deductions</span>
                <span className="p-sum-val text-danger">{fmtCurrency(summary.totalDeductions)}</span>
                <span className="p-sum-sub">PF, ESI, PT & TDS</span>
              </div>
              <div className="p-sum-card card-net">
                <span className="p-sum-label">Net Payroll Disbursement</span>
                <span className="p-sum-val text-primary">{fmtCurrency(summary.totalNet)}</span>
                <span className="p-sum-sub">Paid: {summary.paidCount} • Draft: {summary.draftCount}</span>
              </div>
            </div>
          )}

          {/* Payroll Table */}
          <div className="payroll-table-wrap">
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Paid Days</th>
                  <th>Basic Pay</th>
                  <th>Gross Earnings</th>
                  <th>Deductions</th>
                  <th>Net Take-Home</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9">
                      <div className="loader_container">
                        <p className="loader_spinner"></p>
                        <p>Loading Please Wait...</p>
                      </div>
                    </td>
                  </tr>
                ) : payrolls.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center p-4">
                      No payroll generated yet for {monthNames[selectedMonth]} {selectedYear}. Click "Run / Recalculate Payroll" above to generate!
                    </td>
                  </tr>
                ) : (
                  payrolls.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="p-emp-cell">
                          <strong>{p.name}</strong>
                          <span className="p-emp-code">{p.employee_code || p.email}</span>
                        </div>
                      </td>
                      <td>{p.department || 'General'}</td>
                      <td>
                        <strong>{p.paid_days}</strong> / {p.working_days}
                        {Number(p.unpaid_days) > 0 && <span className="lop-tag"> ({p.unpaid_days} LOP)</span>}
                      </td>
                      <td>{fmtCurrency(p.basic_pay)}</td>
                      <td>
                        <strong>{fmtCurrency(p.gross_earnings)}</strong>
                        {Number(p.bonus) > 0 && <span className="bonus-tag"> +{fmtCurrency(p.bonus)}</span>}
                      </td>
                      <td className="text-danger">-{fmtCurrency(p.total_deductions)}</td>
                      <td>
                        <strong className="net-salary-highlight">{fmtCurrency(p.net_salary)}</strong>
                      </td>
                      <td>
                        <span className={`p-status-badge p-status-${p.status}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>
                        <div className="p-actions-cell">
                          <button
                            className="btn-p-action btn-view-slip"
                            onClick={() => openPayslip(p.id)}
                            disabled={payslipLoading}
                            title="View / Print Payslip"
                          >
                            <FileTextIcon size={12} style={{ marginRight: '4px' }} />
                            {payslipLoading ? 'Loading...' : 'Slip'}
                          </button>
                          {p.status !== 'paid' && (
                            <button
                              className="btn-p-action btn-mark-paid"
                              onClick={() => handleMarkPaid(p.id)}
                              title="Mark as Paid"
                            >
                              <CheckIcon size={12} style={{ marginRight: '4px' }} />
                              Pay
                            </button>
                          )}
                          <button
                            className="btn-p-action btn-adjust"
                            onClick={() => openAdjustModal(p)}
                            title="Adjust Bonus / Deductions"
                          >
                            <SettingsIcon size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: SALARY STRUCTURES (ADMIN) */}
      {isAdmin && activeSubTab === 'structures' && (
        <div className="structures-section">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">Employee Compensation & Salary Structures</h3>
              <p className="section-sub">Configure annual CTC and automated monthly breakdown (Basic, HRA, Allowances, PF, ESI, Tax)</p>
            </div>
          </div>

          <div className="structures-table-wrap">
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department & Role</th>
                  <th>Annual CTC</th>
                  <th>Basic Monthly</th>
                  <th>HRA Monthly</th>
                  <th>Allowances</th>
                  <th>EPF (Employee)</th>
                  <th>PT & TDS</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {structuresLoading ? (
                  <tr>
                    <td colSpan="9">
                      <div className="loader_container">
                        <p className="loader_spinner"></p>
                        <p>Loading Please Wait...</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  structures.map((s) => (
                    <tr key={s.user_id}>
                      <td>
                        <strong>{s.name}</strong>
                        <div className="p-emp-code">{s.employee_code || s.email}</div>
                      </td>
                      <td>
                        <div>{s.department || 'Engineering'}</div>
                        <span className="p-emp-sub">{s.position || 'Staff'}</span>
                      </td>
                      <td><strong className="text-primary">{fmtCurrency(s.ctc_annual)}</strong></td>
                      <td>{fmtCurrency(s.basic_monthly)}</td>
                      <td>{fmtCurrency(s.hra_monthly)}</td>
                      <td>{fmtCurrency(Number(s.special_allowance_monthly || 0) + Number(s.conveyance_monthly || 0) + Number(s.medical_allowance_monthly || 0))}</td>
                      <td>{fmtCurrency(s.pf_employee_monthly)}</td>
                      <td>{fmtCurrency(Number(s.professional_tax_monthly || 200) + Number(s.tds_monthly || 0))}</td>
                      <td>
                        <button className="btn-edit-struct" onClick={() => openEditStructure(s)}>
                          Edit Structure
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: MY PAYSLIPS (EMPLOYEE SELF SERVICE) */}
      {activeSubTab === 'my_payslips' && (() => {
        const totalEarnings = myPayslips.reduce((sum, p) => sum + Number(p.net_salary || 0), 0);
        const totalDeductions = myPayslips.reduce((sum, p) => sum + Number(p.total_deductions || 0), 0);
        const latestSalary = myPayslips.length > 0 ? myPayslips[0].net_salary : 0;
        const yearsList = [...new Set(myPayslips.map((p) => p.year))].sort((a, b) => b - a);
        const filteredPayslips = myPayslips.filter((p) => {
          if (payslipYearFilter !== 'all' && String(p.year) !== String(payslipYearFilter)) {
            return false;
          }
          return true;
        });

        return (
          <div className="my-payslips-section">
            {/* Header Controls Bar */}
            <div className="payslip-header-bar">
              <div className="payslip-header-left">
                <div className="payslip-header-icon">
                  <FileTextIcon size={22} color="#0052cc" />
                </div>
                <div>
                  <h3 className="section-title">My Payslip & Compensation History</h3>
                  <p className="section-sub">View, verify, and download official monthly salary statements & tax reports</p>
                </div>
              </div>

              <div className="payslip-header-tools">
                {yearsList.length > 1 && (
                  <div className="payslip-year-select-wrap">
                    <span className="tool-label">Year:</span>
                    <select
                      className="select-period"
                      value={payslipYearFilter}
                      onChange={(e) => setPayslipYearFilter(e.target.value)}
                    >
                      <option value="all">All Statements</option>
                      {yearsList.map((yr) => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>
                )}

                {myPayslips.length > 0 && (
                  <div className="view-mode-toggle">
                    <button
                      type="button"
                      className={`btn-mode-toggle ${payslipViewMode === 'cards' ? 'active' : ''}`}
                      onClick={() => setPayslipViewMode('cards')}
                      title="Cards Grid View"
                    >
                      Cards
                    </button>
                    <button
                      type="button"
                      className={`btn-mode-toggle ${payslipViewMode === 'table' ? 'active' : ''}`}
                      onClick={() => setPayslipViewMode('table')}
                      title="Statements Table View"
                    >
                      Table
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Metrics Ribbon (Only if employee has statements) */}
            {myPayslips.length > 0 && (
              <div className="payslip-kpi-ribbon">
                <div className="payslip-kpi-card card-highlight">
                  <div className="kpi-icon-pill">
                    <DollarIcon size={16} color="#006644" />
                  </div>
                  <div>
                    <span className="kpi-label">Latest Take-Home Pay</span>
                    <div className="kpi-value text-success">{fmtCurrency(latestSalary)}</div>
                    <span className="kpi-sub">
                      {monthNames[myPayslips[0].month]} {myPayslips[0].year} Statement
                    </span>
                  </div>
                </div>

                <div className="payslip-kpi-card">
                  <div className="kpi-icon-pill">
                    <ChartIcon size={16} color="#0052cc" />
                  </div>
                  <div>
                    <span className="kpi-label">Total Net Disbursed</span>
                    <div className="kpi-value text-primary">{fmtCurrency(totalEarnings)}</div>
                    <span className="kpi-sub">Across {myPayslips.length} statement(s)</span>
                  </div>
                </div>

                <div className="payslip-kpi-card">
                  <div className="kpi-icon-pill">
                    <SettingsIcon size={16} color="#de350b" />
                  </div>
                  <div>
                    <span className="kpi-label">Statutory Deductions</span>
                    <div className="kpi-value text-danger">-{fmtCurrency(totalDeductions)}</div>
                    <span className="kpi-sub">EPF, ESIC, PT & TDS contributions</span>
                  </div>
                </div>

                <div className="payslip-kpi-card">
                  <div className="kpi-icon-pill">
                    <CalendarIcon size={16} color="#6554c0" />
                  </div>
                  <div>
                    <span className="kpi-label">Compliance & Tax Status</span>
                    <div className="kpi-value text-purple">Compliant</div>
                    <span className="kpi-sub">Tax Withholdings Tracked</span>
                  </div>
                </div>
              </div>
            )}

            {/* Main Content: Empty State vs Cards vs Table */}
            {filteredPayslips.length === 0 ? (
              <div className="empty-payslips-box">
                <div className="empty-icon-wrap">
                  <FileTextIcon size={44} color="#0052cc" />
                </div>
                <h4>No Payslips Available</h4>
                <p>Your monthly salary statements and official payment advice will appear here automatically once processed by the Accounts & HR department.</p>
                <div className="empty-help-pill">
                  <span>Direct inquiries: <strong>zorvixetechnologies@gmail.com</strong></span>
                </div>
              </div>
            ) : payslipViewMode === 'table' ? (
              <div className="payroll-table-wrap">
                <table className="payroll-table">
                  <thead>
                    <tr>
                      <th>Pay Period</th>
                      <th>Status</th>
                      <th>Working / Paid Days</th>
                      <th>Gross Earnings</th>
                      <th>Deductions</th>
                      <th>Net Disbursed</th>
                      <th>Payment Date</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayslips.map((ps) => (
                      <tr key={ps.id}>
                        <td>
                          <strong className="ps-period-title">
                            {monthNames[ps.month]} {ps.year}
                          </strong>
                        </td>
                        <td>
                          <span className={`p-status-badge p-status-${ps.status}`}>
                            {ps.status}
                          </span>
                        </td>
                        <td>
                          <span>{ps.paid_days || 30} / {ps.working_days || 30} Days</span>
                        </td>
                        <td>
                          <span className="text-muted">{fmtCurrency(ps.gross_earnings)}</span>
                        </td>
                        <td>
                          <span className="text-danger">-{fmtCurrency(ps.total_deductions)}</span>
                        </td>
                        <td>
                          <strong className="net-salary-highlight">{fmtCurrency(ps.net_salary)}</strong>
                        </td>
                        <td>
                          <span className="text-muted">
                            {ps.payment_date ? new Date(ps.payment_date).toLocaleDateString() : 'Auto Processed'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-p-action btn-view-slip"
                            onClick={() => openPayslip(ps.id)}
                            title="View / Print Salary Slip"
                          >
                            <FileTextIcon size={12} style={{ marginRight: '4px' }} />
                            View Slip
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="my-payslips-grid">
                {filteredPayslips.map((ps) => (
                  <div className="payslip-summary-card" key={ps.id}>
                    <div className="ps-card-top">
                      <div className="ps-header-meta">
                        <div className="ps-doc-icon">
                          <FileTextIcon size={18} color="#0052cc" />
                        </div>
                        <div>
                          <span className="ps-month">{monthNames[ps.month]} {ps.year}</span>
                          <span className="ps-type-tag">Salary Statement</span>
                        </div>
                      </div>
                      <span className={`p-status-badge p-status-${ps.status}`}>
                        <CheckIcon size={10} style={{ marginRight: '3px' }} />
                        {ps.status}
                      </span>
                    </div>

                    <div className="ps-net-banner">
                      <span className="net-caption">Net Disbursed Take-Home</span>
                      <div className="ps-net-figure">
                        <span className="net-currency">₹</span>
                        <span className="net-val">{Number(ps.net_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    <div className="ps-card-meta-grid">
                      <div className="meta-box">
                        <span className="meta-lbl">Gross Pay</span>
                        <strong className="meta-val text-dark">{fmtCurrency(ps.gross_earnings)}</strong>
                      </div>
                      <div className="meta-box">
                        <span className="meta-lbl">Total Deductions</span>
                        <strong className="meta-val text-danger">-{fmtCurrency(ps.total_deductions)}</strong>
                      </div>
                      <div className="meta-box">
                        <span className="meta-lbl">Paid Days</span>
                        <strong className="meta-val">{ps.paid_days || 30} Days</strong>
                      </div>
                      <div className="meta-box">
                        <span className="meta-lbl">Payment Mode</span>
                        <strong className="meta-val">{ps.payment_mode || 'Bank Transfer'}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-download-payslip"
                      onClick={() => openPayslip(ps.id)}
                    >
                      <PrinterIcon size={14} />
                      <span>View & Download Payslip</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* EDIT SALARY STRUCTURE MODAL */}
      {editingStructure && (() => {
        const monthlyGross =
          Number(structForm.basic_monthly || 0) +
          Number(structForm.hra_monthly || 0) +
          Number(structForm.special_allowance_monthly || 0) +
          Number(structForm.conveyance_monthly || 0) +
          Number(structForm.medical_allowance_monthly || 0);
        const monthlyDed =
          Number(structForm.pf_employee_monthly || 0) +
          Number(structForm.esi_employee_monthly || 0) +
          Number(structForm.professional_tax_monthly || 0) +
          Number(structForm.tds_monthly || 0);
        const monthlyNet = monthlyGross - monthlyDed;

        return (
          <div className="pay-modal-backdrop" onClick={() => setEditingStructure(null)}>
            <div className="pay-modal-card pay-modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit Salary Structure">
              <div className="pay-modal-header">
                <div>
                  <h4>Salary Structure: {editingStructure.name}</h4>
                  <span className="pay-modal-sub">
                    {editingStructure.employee_code || editingStructure.email} &bull; {editingStructure.department || 'General'}
                  </span>
                </div>
                <button type="button" className="pay-modal-close" onClick={() => setEditingStructure(null)} aria-label="Close">×</button>
              </div>
              <form onSubmit={handleSaveStructure} className="pay-modal-form">
                <div className="pay-highlight-row">
                  <div className="pay-form-group pay-highlight-group">
                    <label>Annual CTC (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      value={structForm.ctc_annual}
                      onChange={(e) => handleCtcChange(e.target.value)}
                      required
                    />
                    <small className="pay-help-text">
                      Updating CTC automatically balances Basic (50%), HRA (20%), Allowances, PF &amp; ESIC.
                    </small>
                  </div>
                  <div className="pay-form-group pay-highlight-group">
                    <label>Effective From</label>
                    <input
                      type="date"
                      value={structForm.effective_from}
                      onChange={(e) => setStructForm({ ...structForm, effective_from: e.target.value })}
                    />
                  </div>
                </div>

                {/* Live Computed Summary Strip */}
                <div className="pay-struct-preview">
                  <div className="pay-preview-item">
                    <span>Monthly Gross</span>
                    <strong>{fmtCurrency(monthlyGross)}</strong>
                  </div>
                  <div className="pay-preview-item">
                    <span>Monthly Deductions</span>
                    <strong className="text-danger">-{fmtCurrency(monthlyDed)}</strong>
                  </div>
                  <div className="pay-preview-item">
                    <span>Est. Net Pay / Mo</span>
                    <strong className="net-salary-highlight">{fmtCurrency(monthlyNet)}</strong>
                  </div>
                </div>

                <div className="pay-section-divider">Earnings Breakdown (Monthly)</div>
                <div className="pay-form-row-3">
                  <div className="pay-form-group">
                    <label>Basic Pay (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={structForm.basic_monthly}
                      onChange={(e) => setStructForm({ ...structForm, basic_monthly: e.target.value === '' ? '' : Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="pay-form-group">
                    <label>HRA (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={structForm.hra_monthly}
                      onChange={(e) => setStructForm({ ...structForm, hra_monthly: e.target.value === '' ? '' : Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="pay-form-group">
                    <label>Special Allowance (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={structForm.special_allowance_monthly}
                      onChange={(e) => setStructForm({ ...structForm, special_allowance_monthly: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="pay-form-row-3">
                  <div className="pay-form-group">
                    <label>Conveyance (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={structForm.conveyance_monthly}
                      onChange={(e) => setStructForm({ ...structForm, conveyance_monthly: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="pay-form-group">
                    <label>Medical Allowance (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={structForm.medical_allowance_monthly}
                      onChange={(e) => setStructForm({ ...structForm, medical_allowance_monthly: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="pay-section-divider">Statutory Deductions (Monthly)</div>
                <div className="pay-form-row-3">
                  <div className="pay-form-group">
                    <label>EPF Employee (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={structForm.pf_employee_monthly}
                      onChange={(e) => setStructForm({ ...structForm, pf_employee_monthly: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="pay-form-group">
                    <label>ESIC Employee (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={structForm.esi_employee_monthly}
                      onChange={(e) => setStructForm({ ...structForm, esi_employee_monthly: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="pay-form-group">
                    <label>Professional Tax (PT) (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={structForm.professional_tax_monthly}
                      onChange={(e) => setStructForm({ ...structForm, professional_tax_monthly: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="pay-form-group">
                    <label>TDS / Tax Monthly (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={structForm.tds_monthly}
                      onChange={(e) => setStructForm({ ...structForm, tds_monthly: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="pay-modal-actions">
                  <button type="button" className="pay-btn-cancel" onClick={() => setEditingStructure(null)} disabled={savingStructure}>Cancel</button>
                  <button type="submit" className="pay-btn-save" disabled={savingStructure}>
                    {savingStructure ? 'Saving...' : 'Save Structure'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ADJUST PAYROLL MODAL */}
      {editingPayroll && (
        <div className="pay-modal-backdrop" onClick={() => setEditingPayroll(null)}>
          <div className="pay-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Adjust Payroll">
            <div className="pay-modal-header">
              <h4>Adjust Payroll: {editingPayroll.name}</h4>
              <button type="button" className="pay-modal-close" onClick={() => setEditingPayroll(null)} aria-label="Close">×</button>
            </div>
            <form onSubmit={handleSaveAdjustment} className="pay-modal-form">
              <div className="pay-form-group">
                <label>Status</label>
                <select
                  value={adjustForm.status}
                  onChange={(e) => setAdjustForm({ ...adjustForm, status: e.target.value })}
                >
                  <option value="draft">Draft</option>
                  <option value="processed">Processed</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div className="pay-form-row">
                <div className="pay-form-group">
                  <label>Incentives / Bonus (₹)</label>
                  <input
                    type="number"
                    value={adjustForm.bonus}
                    onChange={(e) => setAdjustForm({ ...adjustForm, bonus: Number(e.target.value) })}
                  />
                </div>
                <div className="pay-form-group">
                  <label>Other Deductions (₹)</label>
                  <input
                    type="number"
                    value={adjustForm.other_deductions}
                    onChange={(e) => setAdjustForm({ ...adjustForm, other_deductions: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="pay-form-group">
                <label>Payment Mode</label>
                <input
                  type="text"
                  value={adjustForm.payment_mode}
                  onChange={(e) => setAdjustForm({ ...adjustForm, payment_mode: e.target.value })}
                />
              </div>
              <div className="pay-form-group">
                <label>Remarks</label>
                <input
                  type="text"
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                />
              </div>
              <div className="pay-modal-actions">
                <button type="button" className="pay-btn-cancel" onClick={() => setEditingPayroll(null)}>Cancel</button>
                <button type="submit" className="pay-btn-save">Update Record</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAYSLIP MODAL PREVIEW */}
      {selectedPayslipData && (
        <PayslipModal
          payslipData={selectedPayslipData}
          onClose={() => setSelectedPayslipData(null)}
        />
      )}
    </div>
  );
}
