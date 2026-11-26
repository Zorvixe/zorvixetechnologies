import React, { useState, useEffect, useCallback } from 'react';
import { apiAttendanceToday, apiAttendancePunch, apiMyAttendance, apiListAttendance, apiSaveManualAttendance, apiAiAttendanceSummary } from '../../api';
import AiInsightBox from '../../components/AiInsightBox';
import { UsersIcon, CheckIcon, ClockIcon, CalendarIcon, FileTextIcon, SparklesIcon } from '../../components/CrmHrmsIcons';
import './AttendanceTab.css';

export default function AttendanceTab({ isAdmin, user }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [punchNote, setPunchNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  // Today state
  const [todayData, setTodayData] = useState(null);

  // My attendance history
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [myHistory, setMyHistory] = useState([]);
  const [myStats, setMyStats] = useState(null);

  // Admin view
  const [adminDate, setAdminDate] = useState(new Date().toISOString().slice(0, 10));
  const [adminDept, setAdminDept] = useState('');
  const [adminStatus, setAdminStatus] = useState('');
  const [adminRecords, setAdminRecords] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);

  // Manual adjustment modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    employee_id: '',
    date: new Date().toISOString().slice(0, 10),
    punch_in: '09:30',
    punch_out: '18:30',
    total_hours: 8.5,
    status: 'present',
    note: ''
  });
  const [manualSaving, setManualSaving] = useState(false);

  // AI Attendance Summary & Anomaly Flags
  const [attAiOpen, setAttAiOpen] = useState(false);
  const [attAiLoading, setAttAiLoading] = useState(false);
  const [attAiErr, setAttAiErr] = useState('');
  const [attAiData, setAttAiData] = useState(null);

  const runAttendanceAi = async () => {
    setAttAiOpen(true);
    setAttAiLoading(true);
    setAttAiErr('');
    try {
      const res = await apiAiAttendanceSummary({
        month: selectedMonth,
        year: selectedYear,
        department: isAdmin ? adminDept : ''
      });
      setAttAiData(res);
    } catch (err) {
      setAttAiErr(err.message || 'Failed to generate attendance insights');
    } finally {
      setAttAiLoading(false);
    }
  };

  // Real-time ticking clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchToday = useCallback(async () => {
    try {
      const res = await apiAttendanceToday();
      setTodayData(res);
    } catch (err) {
      console.error('Failed to load today attendance:', err);
    }
  }, []);

  const fetchMyHistory = useCallback(async () => {
    try {
      const res = await apiMyAttendance({ month: selectedMonth, year: selectedYear });
      setMyHistory(res.records || []);
      setMyStats(res.stats || null);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, [selectedMonth, selectedYear]);

  const fetchAdminAttendance = useCallback(async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const res = await apiListAttendance({
        date: adminDate,
        department: adminDept,
        status: adminStatus
      });
      setAdminRecords(res.records || []);
    } catch (err) {
      console.error('Admin attendance fetch failed:', err);
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin, adminDate, adminDept, adminStatus]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchToday(), fetchMyHistory()]);
      if (isAdmin) await fetchAdminAttendance();
      setLoading(false);
    };
    loadAll();
  }, [fetchToday, fetchMyHistory, fetchAdminAttendance, isAdmin]);

  const handlePunch = async (action) => {
    setPunching(true);
    try {
      const res = await apiAttendancePunch({ action, note: punchNote });
      alert(res.message || 'Attendance recorded successfully!');
      setPunchNote('');
      setShowNoteInput(false);
      await fetchToday();
      await fetchMyHistory();
      if (isAdmin) await fetchAdminAttendance();
    } catch (err) {
      alert(err.message || 'Punch action failed');
    } finally {
      setPunching(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualForm.employee_id) return alert('Please enter or select employee ID');
    setManualSaving(true);
    try {
      const fullPunchIn = `${manualForm.date}T${manualForm.punch_in}:00`;
      const fullPunchOut = manualForm.punch_out ? `${manualForm.date}T${manualForm.punch_out}:00` : null;
      await apiSaveManualAttendance({
        ...manualForm,
        punch_in: fullPunchIn,
        punch_out: fullPunchOut
      });
      alert('Attendance saved successfully');
      setShowManualModal(false);
      fetchAdminAttendance();
    } catch (err) {
      alert(err.message || 'Failed to save manual record');
    } finally {
      setManualSaving(false);
    }
  };

  const myRecord = todayData?.myRecord;
  const isPunchedIn = Boolean(myRecord?.punch_in);
  const isPunchedOut = Boolean(myRecord?.punch_out);

  const formatTimeStr = (dateVal) => {
    if (!dateVal) return '--:--';
    return new Date(dateVal).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (loading && !todayData) {
    return (
      <div> <div className="loader_container">
        <p className="loader_spinner"></p>
        <p>Loading Please Wait...</p>
      </div>
      </div>
    );
  }

  return (
    <div className="attendance-tab">
      {/* Top Banner: Quick Punch & Digital Clock */}
      <div className="att-punch-banner-card">
        <div className="att-punch-banner-left">
          <div className="att-live-clock">
            <span className="att-clock-digits">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="att-clock-date">
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          <div className="att-punch-status-indicator">
            <span className={`att-status-dot ${isPunchedOut ? 'out' : isPunchedIn ? 'in' : 'idle'}`} />
            <div className="att-status-text-wrap">
              <span className="att-status-title">
                {isPunchedOut
                  ? 'Completed Day'
                  : isPunchedIn
                    ? `Punched In (${myRecord?.status === 'late' ? 'Late Arrival' : 'On Time'})`
                    : 'Not Punched In Yet'}
              </span>
              <span className="att-status-meta">
                {isPunchedOut
                  ? `Total: ${myRecord?.total_hours || 0} hrs (Out at ${formatTimeStr(myRecord?.punch_out)})`
                  : isPunchedIn
                    ? `In at ${formatTimeStr(myRecord?.punch_in)} • Shift: 09:30 AM - 06:30 PM`
                    : 'Remember to punch in when beginning your workday'}
              </span>
            </div>
          </div>
        </div>

        <div className="att-punch-banner-right">
          {showNoteInput && (
            <input
              type="text"
              className="att-punch-note-input"
              placeholder="Add remark / note (optional)..."
              value={punchNote}
              onChange={(e) => setPunchNote(e.target.value)}
            />
          )}

          <div className="att-punch-buttons-group">
            {!isPunchedIn && (
              <button
                type="button"
                className="att-btn-punch att-btn-punch-in"
                onClick={() => handlePunch('in')}
                disabled={punching}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span>{punching ? 'Recording...' : 'Punch In Now'}</span>
              </button>
            )}

            {isPunchedIn && !isPunchedOut && (
              <button
                type="button"
                className="att-btn-punch att-btn-punch-out"
                onClick={() => handlePunch('out')}
                disabled={punching}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>{punching ? 'Recording...' : 'Punch Out (End Day)'}</span>
              </button>
            )}

            {isPunchedOut && (
              <div className="att-punch-completed-badge">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>Attendance Logged for Today</span>
              </div>
            )}

            {!isPunchedOut && (
              <button
                type="button"
                className="att-btn-toggle-note"
                onClick={() => setShowNoteInput((v) => !v)}
                title="Add Punch Note"
              >
                <FileTextIcon size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* AI Attendance Summary & Flagged Review Strip */}
      <div style={{ margin: '12px 0' }}>
        {!attAiOpen ? (
          <button type="button" className="zx-ai-pill-btn" onClick={runAttendanceAi}>
            <SparklesIcon size={13} />
            <span>{isAdmin ? 'ZORVI Workforce Attendance Summary & Flags' : 'ZORVI Summarize My Attendance'}</span>
          </button>
        ) : (
          <AiInsightBox
            title={isAdmin ? 'ZORVI Attendance Trends & Review Flags' : 'ZORVI Personal Attendance Summary'}
            loading={attAiLoading}
            error={attAiErr}
            uncertainty={attAiData?.uncertainty}
            providerMeta={attAiData?.meta}
            onRefresh={runAttendanceAi}
            onClose={() => setAttAiOpen(false)}
          >
            {attAiData && (
              <div>
                <p style={{ margin: '0 0 6px' }}>{attAiData.summary}</p>
                {attAiData.trends?.length > 0 && (
                  <ul className="zx-ai-list" style={{ fontSize: '12px' }}>
                    {attAiData.trends.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                )}
                {attAiData.flaggedForReview?.length > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '12px' }}>
                    <strong>Records Flagged for Review:</strong>
                    <ul className="zx-ai-list">
                      {attAiData.flaggedForReview.map((f, i) => (
                        <li key={i}><strong>{f.employeeName}</strong> ({f.department}): {f.reasons.join('; ')}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </AiInsightBox>
        )}
      </div>

      {/* Admin Live Overview Cards */}
      {isAdmin && todayData?.orgOverview && (
        <div className="att-org-kpis">
          <div className="att-kpi-card">
            <div className="att-kpi-icon att-icon-team">
              <UsersIcon size={20} color="#0052cc" />
            </div>
            <div className="att-kpi-info">
              <span className="att-kpi-val">{todayData.orgOverview.total_employees || 0}</span>
              <span className="att-kpi-lbl">Total Workforce</span>
            </div>
          </div>
          <div className="att-kpi-card">
            <div className="att-kpi-icon att-icon-present">
              <CheckIcon size={20} color="#006644" />
            </div>
            <div className="att-kpi-info">
              <span className="att-kpi-val att-text-success">{todayData.orgOverview.present_count || 0}</span>
              <span className="att-kpi-lbl">Present Today</span>
            </div>
          </div>
          <div className="att-kpi-card">
            <div className="att-kpi-icon att-icon-late">
              <ClockIcon size={20} color="#ffab00" />
            </div>
            <div className="att-kpi-info">
              <span className="att-kpi-val att-text-warning">{todayData.orgOverview.late_count || 0}</span>
              <span className="att-kpi-lbl">Late Arrivals</span>
            </div>
          </div>
          <div className="att-kpi-card">
            <div className="att-kpi-icon att-icon-half">
              <ClockIcon size={20} color="#00a3bf" />
            </div>
            <div className="att-kpi-info">
              <span className="att-kpi-val att-text-info">{todayData.orgOverview.half_day_count || 0}</span>
              <span className="att-kpi-lbl">Half Days</span>
            </div>
          </div>
          <div className="att-kpi-card">
            <div className="att-kpi-icon att-icon-leave">
              <CalendarIcon size={20} color="#6554c0" />
            </div>
            <div className="att-kpi-info">
              <span className="att-kpi-val att-text-purple">{todayData.orgOverview.on_leave_count || 0}</span>
              <span className="att-kpi-lbl">On Approved Leave</span>
            </div>
          </div>
        </div>
      )}

      {/* Admin Section: Workplace Attendance Filter & Logs */}
      {isAdmin && (
        <div className="att-section-card">
          <div className="att-section-header-row">
            <div>
              <h3 className="att-section-title">Organization Daily Attendance Tracker</h3>
              <p className="att-section-sub">Real-time attendance logs, late marks, and working hours across team</p>
            </div>
            <div className="att-section-actions">
              <button type="button" className="att-btn-manual-entry" onClick={() => setShowManualModal(true)}>
                <span>+ Manual Correction / Entry</span>
              </button>
            </div>
          </div>

          <div className="att-filter-bar">
            <div className="att-filter-group">
              <label className="att-filter-label">Date:</label>
              <input
                type="date"
                value={adminDate}
                onChange={(e) => setAdminDate(e.target.value)}
                className="att-filter-input"
              />
            </div>
            <div className="att-filter-group">
              <label className="att-filter-label">Department:</label>
              <select
                value={adminDept}
                onChange={(e) => setAdminDept(e.target.value)}
                className="att-filter-select"
              >
                <option value="">All Departments</option>
                <option value="Engineering">Engineering</option>
                <option value="Design">Design</option>
                <option value="Product">Product</option>
                <option value="Marketing">Marketing</option>
                <option value="HR & Operations">HR & Operations</option>
              </select>
            </div>
            <div className="att-filter-group">
              <label className="att-filter-label">Status:</label>
              <select
                value={adminStatus}
                onChange={(e) => setAdminStatus(e.target.value)}
                className="att-filter-select"
              >
                <option value="">All Statuses</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>
          </div>

          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department & Role</th>
                  <th>Date</th>
                  <th>Punch In</th>
                  <th>Punch Out</th>
                  <th>Total Hours</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {adminLoading ? (
                  <tr>
                    <td colSpan="8" className="att-table-loading">
                      Loading attendance logs...
                    </td>
                  </tr>
                ) : adminRecords.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="att-table-empty">
                      No attendance records found for selected date and filters.
                    </td>
                  </tr>
                ) : (
                  adminRecords.map((r) => (
                    <tr key={r.id || r.employee_id}>
                      <td>
                        <div className="att-emp-cell">
                          <div className="att-emp-avatar">
                            {(r.name || 'U').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="att-emp-name">{r.name}</div>
                            <div className="att-emp-code">{r.employee_code || r.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="att-emp-dept">{r.department || 'General'}</div>
                        <div className="att-emp-pos">{r.position || 'Employee'}</div>
                      </td>
                      <td>{r.date ? new Date(r.date).toLocaleDateString() : adminDate}</td>
                      <td>
                        <span className="att-punch-time">{r.punch_in ? formatTimeStr(r.punch_in) : '--'}</span>
                      </td>
                      <td>
                        <span className="att-punch-time">{r.punch_out ? formatTimeStr(r.punch_out) : '--'}</span>
                      </td>
                      <td>
                        <strong>{r.total_hours ? `${r.total_hours} hrs` : '--'}</strong>
                      </td>
                      <td>
                        <span className={`att-badge att-badge-${r.status || 'absent'}`}>
                          {r.status ? r.status.replace('_', ' ') : 'Absent'}
                        </span>
                      </td>
                      <td className="att-note-cell">
                        {r.punch_in_note || r.punch_out_note || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Personal Attendance History Section */}
      <div className="att-section-card">
        <div className="att-section-header-row">
          <div>
            <h3 className="att-section-title">My Attendance Records</h3>
            <p className="att-section-sub">Monthly log of punch-in timings, hours worked, and attendance summary</p>
          </div>

          <div className="att-month-picker-wrap">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="att-month-select"
            >
              {[
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
              ].map((m, idx) => (
                <option key={idx} value={idx + 1}>{m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="att-year-select"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {myStats && (
          <div className="att-my-stats-pills">
            <div className="att-stat-pill">
              <span>Days Present</span>
              <strong>{myStats.presentCount} days</strong>
            </div>
            <div className="att-stat-pill">
              <span>Late Marks</span>
              <strong className="att-text-warning">{myStats.lateCount}</strong>
            </div>
            <div className="att-stat-pill">
              <span>Half Days</span>
              <strong className="att-text-info">{myStats.halfDayCount}</strong>
            </div>
            <div className="att-stat-pill">
              <span>Total Worked</span>
              <strong>{myStats.totalHours} hrs</strong>
            </div>
            <div className="att-stat-pill">
              <span>Avg Daily</span>
              <strong>{myStats.avgHoursPerDay} hrs</strong>
            </div>
          </div>
        )}

        <div className="att-table-wrap">
          <table className="att-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Punch In</th>
                <th>Punch Out</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {myHistory.length === 0 ? (
                <tr>
                  <td colSpan="6" className="att-table-empty">
                    No attendance records for this month.
                  </td>
                </tr>
              ) : (
                myHistory.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                    </td>
                    <td>{formatTimeStr(item.punch_in)}</td>
                    <td>{item.punch_out ? formatTimeStr(item.punch_out) : '--'}</td>
                    <td>
                      <strong>{item.total_hours ? `${item.total_hours} hrs` : '--'}</strong>
                    </td>
                    <td>
                      <span className={`att-badge att-badge-${item.status}`}>
                        {item.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="att-note-cell">{item.punch_in_note || item.punch_out_note || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Entry Modal */}
      {showManualModal && (
        <div className="att-modal-backdrop" onClick={() => setShowManualModal(false)}>
          <div className="att-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="att-modal-header">
              <h4 className="att-modal-title">Manual Attendance Entry / Adjustment</h4>
              <button type="button" className="att-modal-close-btn" onClick={() => setShowManualModal(false)}>×</button>
            </div>
            <form onSubmit={handleManualSubmit} className="att-modal-form">
              <div className="att-form-group">
                <label className="att-form-label">Employee ID *</label>
                <input
                  type="number"
                  className="att-form-input"
                  placeholder="Employee user ID (e.g. 1)"
                  value={manualForm.employee_id}
                  onChange={(e) => setManualForm({ ...manualForm, employee_id: e.target.value })}
                  required
                />
              </div>
              <div className="att-form-group">
                <label className="att-form-label">Date *</label>
                <input
                  type="date"
                  className="att-form-input"
                  value={manualForm.date}
                  onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                  required
                />
              </div>
              <div className="att-form-row">
                <div className="att-form-group">
                  <label className="att-form-label">Punch In Time</label>
                  <input
                    type="time"
                    className="att-form-input"
                    value={manualForm.punch_in}
                    onChange={(e) => setManualForm({ ...manualForm, punch_in: e.target.value })}
                  />
                </div>
                <div className="att-form-group">
                  <label className="att-form-label">Punch Out Time</label>
                  <input
                    type="time"
                    className="att-form-input"
                    value={manualForm.punch_out}
                    onChange={(e) => setManualForm({ ...manualForm, punch_out: e.target.value })}
                  />
                </div>
              </div>
              <div className="att-form-row">
                <div className="att-form-group">
                  <label className="att-form-label">Status</label>
                  <select
                    className="att-form-select"
                    value={manualForm.status}
                    onChange={(e) => setManualForm({ ...manualForm, status: e.target.value })}
                  >
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="half_day">Half Day</option>
                    <option value="absent">Absent</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </div>
                <div className="att-form-group">
                  <label className="att-form-label">Total Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    className="att-form-input"
                    value={manualForm.total_hours}
                    onChange={(e) => setManualForm({ ...manualForm, total_hours: e.target.value })}
                  />
                </div>
              </div>
              <div className="att-form-group">
                <label className="att-form-label">Reason / Note</label>
                <input
                  type="text"
                  className="att-form-input"
                  placeholder="e.g. biometric machine offline, approved regularisation"
                  value={manualForm.note}
                  onChange={(e) => setManualForm({ ...manualForm, note: e.target.value })}
                />
              </div>
              <div className="att-modal-actions">
                <button type="button" className="att-btn-cancel" onClick={() => setShowManualModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="att-btn-save" disabled={manualSaving}>
                  {manualSaving ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
