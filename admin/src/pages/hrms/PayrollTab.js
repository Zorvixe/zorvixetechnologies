import React, { useState, useEffect, useCallback } from 'react';
import {
  apiListPayrollRuns,
  apiGeneratePayroll,
  apiUpdatePayroll,
  apiGetPayslip,
  apiGetMyPayslips,
  apiListSalaryStructures,
  apiUpdateSalaryStructure
} from '../../api';
import PayslipModal from './PayslipModal';
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

  // Payslip Modal
  const [selectedPayslipData, setSelectedPayslipData] = useState(null);
  const [payslipLoading, setPayslipLoading] = useState(false);

  // Salary structures
  const [structures, setStructures] = useState([]);
  const [structuresLoading, setStructuresLoading] = useState(false);
  const [editingStructure, setEditingStructure] = useState(null);
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
    tds_monthly: 0
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
      alert(res.message || 'Payroll generated successfully!');
      fetchPayrollRuns();
    } catch (err) {
      alert(err.message || 'Payroll generation failed');
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
      alert(err.message || 'Failed to load payslip preview');
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
      alert(err.message || 'Failed to update status');
    }
  };

  const openEditStructure = (item) => {
    setEditingStructure(item);
    setStructForm({
      ctc_annual: item.ctc_annual || 600000,
      basic_monthly: item.basic_monthly || 25000,
      hra_monthly: item.hra_monthly || 10000,
      special_allowance_monthly: item.special_allowance_monthly || 10000,
      conveyance_monthly: item.conveyance_monthly || 2500,
      medical_allowance_monthly: item.medical_allowance_monthly || 2500,
      pf_employee_monthly: item.pf_employee_monthly || 1800,
      esi_employee_monthly: item.esi_employee_monthly || 0,
      professional_tax_monthly: item.professional_tax_monthly || 200,
      tds_monthly: item.tds_monthly || 0
    });
  };

  const handleCtcChange = (ctc) => {
    const num = Number(ctc || 0);
    const monthlyGross = Math.round(num / 12);
    const basic = Math.round(monthlyGross * 0.5); // 50% basic
    const hra = Math.round(basic * 0.4); // 40% of basic
    const conv = 2500;
    const med = 2500;
    const special = Math.max(0, monthlyGross - (basic + hra + conv + med));
    const pf = Math.min(1800, Math.round(basic * 0.12));
    const esi = monthlyGross <= 21000 ? Math.round(monthlyGross * 0.0075) : 0;

    setStructForm({
      ctc_annual: num,
      basic_monthly: basic,
      hra_monthly: hra,
      special_allowance_monthly: special,
      conveyance_monthly: conv,
      medical_allowance_monthly: med,
      pf_employee_monthly: pf,
      esi_employee_monthly: esi,
      professional_tax_monthly: 200,
      tds_monthly: structForm.tds_monthly
    });
  };

  const handleSaveStructure = async (e) => {
    e.preventDefault();
    if (!editingStructure) return;
    try {
      await apiUpdateSalaryStructure(editingStructure.user_id, structForm);
      alert('Salary structure saved successfully');
      setEditingStructure(null);
      fetchStructures();
    } catch (err) {
      alert(err.message || 'Failed to save salary structure');
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
      alert('Payroll record updated');
      setEditingPayroll(null);
      fetchPayrollRuns();
    } catch (err) {
      alert(err.message || 'Failed to update record');
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
              💵 Monthly Payroll Runs
            </button>
            <button
              type="button"
              className={`subtab-btn ${activeSubTab === 'structures' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('structures')}
            >
              ⚙️ Salary Structures
            </button>
          </>
        )}
        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'my_payslips' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('my_payslips')}
        >
          📄 My Payslips
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

            <div className="action-controls">
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
                    <div> <div className="loader_container">
                      <p className="loader_spinner"></p>
                      <p>Loading Please Wait...</p>
                    </div>
                    </div>
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
                            📄 {payslipLoading ? 'Loading...' : 'Slip'}
                          </button>
                          {p.status !== 'paid' && (
                            <button
                              className="btn-p-action btn-mark-paid"
                              onClick={() => handleMarkPaid(p.id)}
                              title="Mark as Paid"
                            >
                              ✓ Pay
                            </button>
                          )}
                          <button
                            className="btn-p-action btn-adjust"
                            onClick={() => openAdjustModal(p)}
                            title="Adjust Bonus / Deductions"
                          >
                            ⚙️
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
                  <tr><div> <div className="loader_container">
                    <p className="loader_spinner"></p>
                    <p>Loading Please Wait...</p>
                  </div>
                  </div></tr>
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
      {activeSubTab === 'my_payslips' && (
        <div className="my-payslips-section">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">My Payslip History</h3>
              <p className="section-sub">View, verify, and download your monthly salary statements</p>
            </div>
          </div>

          {myPayslips.length === 0 ? (
            <div className="empty-payslips-box">
              <div className="empty-icon">📂</div>
              <h4>No Payslips Available</h4>
              <p>Your monthly payslips will appear here once processed by the HR & Accounts department.</p>
            </div>
          ) : (
            <div className="my-payslips-grid">
              {myPayslips.map((ps) => (
                <div className="payslip-summary-card" key={ps.id}>
                  <div className="ps-card-top">
                    <span className="ps-month">{monthNames[ps.month]} {ps.year}</span>
                    <span className={`p-status-badge p-status-${ps.status}`}>{ps.status}</span>
                  </div>
                  <div className="ps-net-figure">
                    <span className="net-currency">₹</span>
                    <span className="net-val">{Number(ps.net_salary || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="ps-card-meta">
                    <div>Gross: {fmtCurrency(ps.gross_earnings)}</div>
                    <div>Deductions: -{fmtCurrency(ps.total_deductions)}</div>
                    <div>Paid Days: {ps.paid_days} days</div>
                  </div>
                  <button className="btn-download-payslip" onClick={() => openPayslip(ps.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>View & Download Payslip</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EDIT SALARY STRUCTURE MODAL */}
      {editingStructure && (
        <div className="modal-backdrop" onClick={() => setEditingStructure(null)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Salary Structure: {editingStructure.name}</h4>
              <button className="btn-close" onClick={() => setEditingStructure(null)}>×</button>
            </div>
            <form onSubmit={handleSaveStructure} className="modal-form">
              <div className="form-group highlight-group">
                <label>Annual CTC (₹) *</label>
                <input
                  type="number"
                  value={structForm.ctc_annual}
                  onChange={(e) => handleCtcChange(e.target.value)}
                  required
                />
                <small className="help-text">Changing CTC will automatically balance Basic (50%), HRA (20%), Special Allowances & PF.</small>
              </div>

              <div className="form-row-3">
                <div className="form-group">
                  <label>Basic Pay Monthly (₹)</label>
                  <input
                    type="number"
                    value={structForm.basic_monthly}
                    onChange={(e) => setStructForm({ ...structForm, basic_monthly: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>HRA Monthly (₹)</label>
                  <input
                    type="number"
                    value={structForm.hra_monthly}
                    onChange={(e) => setStructForm({ ...structForm, hra_monthly: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Special Allowance (₹)</label>
                  <input
                    type="number"
                    value={structForm.special_allowance_monthly}
                    onChange={(e) => setStructForm({ ...structForm, special_allowance_monthly: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-row-3">
                <div className="form-group">
                  <label>Conveyance (₹)</label>
                  <input
                    type="number"
                    value={structForm.conveyance_monthly}
                    onChange={(e) => setStructForm({ ...structForm, conveyance_monthly: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>Medical Allowance (₹)</label>
                  <input
                    type="number"
                    value={structForm.medical_allowance_monthly}
                    onChange={(e) => setStructForm({ ...structForm, medical_allowance_monthly: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>EPF Employee (₹)</label>
                  <input
                    type="number"
                    value={structForm.pf_employee_monthly}
                    onChange={(e) => setStructForm({ ...structForm, pf_employee_monthly: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-row-3">
                <div className="form-group">
                  <label>ESIC Employee (₹)</label>
                  <input
                    type="number"
                    value={structForm.esi_employee_monthly}
                    onChange={(e) => setStructForm({ ...structForm, esi_employee_monthly: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>Professional Tax (PT) (₹)</label>
                  <input
                    type="number"
                    value={structForm.professional_tax_monthly}
                    onChange={(e) => setStructForm({ ...structForm, professional_tax_monthly: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>TDS / Tax Monthly (₹)</label>
                  <input
                    type="number"
                    value={structForm.tds_monthly}
                    onChange={(e) => setStructForm({ ...structForm, tds_monthly: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setEditingStructure(null)}>Cancel</button>
                <button type="submit" className="btn-save">Save Structure</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST PAYROLL MODAL */}
      {editingPayroll && (
        <div className="modal-backdrop" onClick={() => setEditingPayroll(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Adjust Payroll: {editingPayroll.name}</h4>
              <button className="btn-close" onClick={() => setEditingPayroll(null)}>×</button>
            </div>
            <form onSubmit={handleSaveAdjustment} className="modal-form">
              <div className="form-group">
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
              <div className="form-row">
                <div className="form-group">
                  <label>Incentives / Bonus (₹)</label>
                  <input
                    type="number"
                    value={adjustForm.bonus}
                    onChange={(e) => setAdjustForm({ ...adjustForm, bonus: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>Other Deductions (₹)</label>
                  <input
                    type="number"
                    value={adjustForm.other_deductions}
                    onChange={(e) => setAdjustForm({ ...adjustForm, other_deductions: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Payment Mode</label>
                <input
                  type="text"
                  value={adjustForm.payment_mode}
                  onChange={(e) => setAdjustForm({ ...adjustForm, payment_mode: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Remarks</label>
                <input
                  type="text"
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setEditingPayroll(null)}>Cancel</button>
                <button type="submit" className="btn-save">Update Record</button>
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
