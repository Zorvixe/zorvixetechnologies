import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiGetAllLeaves, apiUpdateLeaveStatus, apiCarryForwardLeaves } from '../../api';
import './LeaveAdmin.css';


const LeaveAdmin = () => {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [carryForwardLoading, setCarryForwardLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    status: 'all',
    department: 'all',
    year: new Date().getFullYear()
  });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0
  });
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [actionDialog, setActionDialog] = useState(false);
  const [actionType, setActionType] = useState('');
  const [comments, setComments] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });

  // Toast system
  const toastTimer = useRef(null);
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' });
  
  const showToast = (message, type = 'success') => {
    setToast({ open: true, type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, open: false })), 4000);
  };
  
  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t => ({ ...t, open: false }));
  };
  
  useEffect(() => () => { 
    if (toastTimer.current) clearTimeout(toastTimer.current) 
  }, []);

  const departments = ['IT', 'HR', 'Finance', 'Marketing', 'Operations', 'Sales', 'Development'];

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiGetAllLeaves({
        ...filters,
        page: pagination.page,
        limit: 10
      });
      if (response.success) {
        setLeaves(response.leaves);
        setPagination({
          page: response.pagination.page,
          totalPages: response.pagination.totalPages,
          total: response.pagination.total
        });
        calculateStats(response.leaves);
      } else {
        showToast('Failed to fetch leaves', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error fetching leaves', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  const calculateStats = (leavesData) => {
    const statsData = {
      total: leavesData.length,
      pending: leavesData.filter(l => l.status === 'pending').length,
      approved: leavesData.filter(l => l.status === 'approved').length,
      rejected: leavesData.filter(l => l.status === 'rejected').length
    };
    setStats(statsData);
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const getLeaveTypeText = (type) => type.charAt(0).toUpperCase() + type.slice(1) + ' Leave';
  const getStatusText = (status) => status.charAt(0).toUpperCase() + status.slice(1);

  // Status badge component
  const StatusBadge = ({ status }) => (
    <div className={`status-badge ${status}`}>
      <span className="status-dot"></span>
      {getStatusText(status)}
    </div>
  );

  // Leave type badge component
  const LeaveTypeBadge = ({ type }) => (
    <div className={`leave-type-badge ${type}`}>
      {getLeaveTypeText(type)}
    </div>
  );

  const handleAction = (leave, type) => {
    setSelectedLeave(leave);
    setActionType(type);
    setActionDialog(true);
    setComments('');
  };

  const submitAction = async () => {
    try {
      const response = await apiUpdateLeaveStatus(selectedLeave.id, {
        status: actionType,
        comments
      });
      if (response.success) {
        showToast(`Leave ${actionType} successfully`, 'success');
        setActionDialog(false);
        fetchLeaves();
      } else {
        showToast(response.message, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to update leave status', 'error');
    }
  };

  const handleCarryForward = async () => {
    if (!window.confirm('Are you sure you want to carry forward annual leaves to the next year? This action cannot be undone.')) return;
    try {
      setCarryForwardLoading(true);
      const response = await apiCarryForwardLeaves();
      if (response.success) {
        showToast(response.message, 'success');
        fetchLeaves();
      } else {
        showToast(response.message, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to carry forward leaves', 'error');
    } finally {
      setCarryForwardLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Employee', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Total Days', 'Status', 'Approver', 'Applied On'];
    const csvData = leaves.map(l => [
      l.employee_name, 
      l.employee_department || 'N/A', 
      getLeaveTypeText(l.leave_type),
      formatDate(l.start_date), 
      formatDate(l.end_date), 
      l.total_days, 
      getStatusText(l.status),
      l.approver_name, 
      formatDate(l.applied_on)
    ]);
    const csvContent = [headers.join(','), ...csvData.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leaves-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showToast('Leaves data exported successfully', 'success');
  };

  return (
    <div className="leave-admin-container">
      <div className="leave-admin-header">
        <div className="header-content">
          <h1 className="page-title">Leave Administration</h1>
          <p className="page-subtitle">Manage all employee leave requests and system operations</p>
        </div>
        <div className="header-stats">
          <div className="stat-card total">
            <span className="stat-number">{stats.total}</span>
            <span className="stat-label">Total Leaves</span>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      <div className={`toast-notification ${toast.type} ${toast.open ? 'show' : ''}`}>
        <div className="toast-icon">
          {toast.type === 'success' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          )}
        </div>
        <div className="toast-content">
          <div className="toast-title">
            {toast.type === 'success' ? 'Success' : 'Error'}
          </div>
          <div className="toast-message">{toast.message}</div>
        </div>
        <button className="toast-close" onClick={hideToast} aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          {error}
        </div>
      )}

      {/* Stats Overview */}
      <div className="stats-overview">
        <div className="stats-grid">
          <div className="stat-item total">
            <div className="stat-content">
              <span className="stat-number">{stats.total}</span>
              <span className="stat-label">Total Leaves</span>
            </div>
          </div>
          <div className="stat-item pending">
            <div className="stat-content">
              <span className="stat-number">{stats.pending}</span>
              <span className="stat-label">Pending</span>
            </div>
          </div>
          <div className="stat-item approved">
            <div className="stat-content">
              <span className="stat-number">{stats.approved}</span>
              <span className="stat-label">Approved</span>
            </div>
          </div>
          <div className="stat-item rejected">
            <div className="stat-content">
              <span className="stat-number">{stats.rejected}</span>
              <span className="stat-label">Rejected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="admin-actions">
        <div className="action-buttons">
          <button 
            className="btn btn-outline-primary"
            onClick={exportToCSV}
            disabled={leaves.length === 0 || loading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <path d="M16 13H8"/>
              <path d="M16 17H8"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Export CSV
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleCarryForward}
            disabled={carryForwardLoading}
          >
            {carryForwardLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Processing...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Carry Forward Leaves
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filters Section */}
      <div className="filters-section">
        <div className="filter-group">
          <div className="filter-item">
            <label className="filter-label">Status</label>
            <select
              className="filter-select"
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="filter-item">
            <label className="filter-label">Department</label>
            <select
              className="filter-select"
              value={filters.department}
              onChange={(e) => handleFilterChange("department", e.target.value)}
            >
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="filter-item">
            <label className="filter-label">Year</label>
            <select
              className="filter-select"
              value={filters.year}
              onChange={(e) => handleFilterChange("year", e.target.value)}
            >
              {[2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Leaves Table */}
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading leave records...</p>
        </div>
      ) : leaves.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <h3 className="empty-title">No leave records found</h3>
          <p className="empty-description">
            {filters.status !== "all" || filters.department !== "all" || filters.year !== new Date().getFullYear()
              ? "Try adjusting your filters to see more results"
              : "There are no leave applications in the system"}
          </p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <div className="table-responsive">
              <table className="leaves-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Leave Type</th>
                    <th>Period</th>
                    <th>Duration</th>
                    <th>Approver</th>
                    <th>Applied On</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map(leave => (
                    <tr key={leave.id} className="leave-row">
                      <td>
                        <div className="employee-info">
                          <div className="employee-name">{leave.employee_name}</div>
                          <div className="employee-email">{leave.employee_email}</div>
                        </div>
                      </td>
                      <td>
                        <div className="department">
                          {leave.employee_department || 'N/A'}
                        </div>
                      </td>
                      <td>
                        <LeaveTypeBadge type={leave.leave_type} />
                      </td>
                      <td>
                        <div className="date-period">
                          <span className="date-from">{formatDate(leave.start_date)}</span>
                          <span className="date-separator">→</span>
                          <span className="date-to">{formatDate(leave.end_date)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="duration">
                          <span className="days-count">{leave.total_days}</span>
                          <span className="days-label">day{leave.total_days !== 1 ? 's' : ''}</span>
                        </div>
                      </td>
                      <td>
                        <div className="approver-info">
                          <div className="approver-name">{leave.approver_name}</div>
                          <div className="approver-email">{leave.approver_email}</div>
                        </div>
                      </td>
                      <td>
                        <div className="applied-date">
                          {formatDate(leave.applied_on)}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={leave.status} />
                      </td>
                      <td>
                        <div className="action-buttons">
                          {leave.status === 'pending' && (
                            <>
                              <button 
                                className="btn-approve"
                                onClick={() => handleAction(leave, 'approved')}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M20 6L9 17l-5-5"/>
                                </svg>
                                
                              </button>
                              <button  
                                className="btn-reject"
                                onClick={() => handleAction(leave, 'rejected')}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                                
                              </button>
                            </>
                          )}
                          {leave.status !== 'pending' && (
                            <span className="action-completed">
                              Action Taken
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination-btn prev"
                disabled={pagination.page === 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                Previous
              </button>
              
              <div className="pagination-pages">
                {Array.from({ length: pagination.totalPages }).map((_, i) => (
                  <button
                    key={i + 1}
                    className={`pagination-page ${pagination.page === i + 1 ? "active" : ""}`}
                    onClick={() => handlePageChange(i + 1)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                className="pagination-btn next"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          )}
        </>
      )}

      {/* Bootstrap Action Modal */}
      <div 
        className={`modal fade ${actionDialog ? 'show' : ''}`} 
        style={{ display: actionDialog ? 'block' : 'none', backgroundColor: 'rgba(0,0,0,0.5)' }}
        tabIndex="-1" 
        role="dialog"
        aria-labelledby="actionModalLabel"
        aria-hidden={!actionDialog}
      >
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content">
            <div className={`modal-header ${actionType === 'approved' ? 'bg-success text-white' : 'bg-danger text-white'}`}>
              <h5 className="modal-title" id="actionModalLabel">
                {actionType === 'approved' ? 'Approve' : 'Reject'} Leave Application
              </h5>
              <button 
                type="button" 
                className="btn-close btn-close-white" 
                onClick={() => setActionDialog(false)}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              {selectedLeave && (
                <>
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold text-muted">Employee</label>
                      <p className="mb-0">{selectedLeave.employee_name}</p>
                      <small className="text-muted">{selectedLeave.employee_email}</small>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold text-muted">Department</label>
                      <p className="mb-0">{selectedLeave.employee_department || 'N/A'}</p>
                    </div>
                  </div>
                  
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold text-muted">Leave Type</label>
                      <p className="mb-0">{getLeaveTypeText(selectedLeave.leave_type)}</p>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold text-muted">Duration</label>
                      <p className="mb-0">{selectedLeave.total_days} working days</p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold text-muted">Period</label>
                    <p className="mb-0">
                      {formatDate(selectedLeave.start_date)} to {formatDate(selectedLeave.end_date)}
                    </p>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold text-muted">Reason</label>
                    <div className="border rounded p-3 bg-light">
                      <p className="mb-0">{selectedLeave.reason}</p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold">Comments</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      placeholder="Add comments for the employee..."
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                    ></textarea>
                    <div className="form-text">
                      These comments will be shared with the employee
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-outline-secondary" 
                onClick={() => setActionDialog(false)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className={`btn ${actionType === 'approved' ? 'btn-success' : 'btn-danger'}`}
                onClick={submitAction}
              >
                {actionType === 'approved' ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    Confirm Approval
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    Confirm Rejection
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bootstrap Modal Backdrop */}
      {actionDialog && <div className="modal-backdrop fade show"></div>}
    </div>
  );
};

export default LeaveAdmin;