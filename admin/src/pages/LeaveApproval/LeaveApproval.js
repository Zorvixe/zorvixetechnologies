import React, { useState, useEffect, useRef } from "react";
import { apiGetLeavesForApproval, apiUpdateLeaveStatus } from "../../api";
import "./LeaveApproval.css";

const LeaveApproval = () => {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    status: "pending",
    year: new Date().getFullYear(),
  });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [actionDialog, setActionDialog] = useState(false);
  const [actionType, setActionType] = useState("");
  const [comments, setComments] = useState("");
  const [approvedDays, setApprovedDays] = useState(0);
  const [approvedStartDate, setApprovedStartDate] = useState("");
  const [approvedEndDate, setApprovedEndDate] = useState("");

  // Toast system
  const toastTimer = useRef(null);
  const [toast, setToast] = useState({ open: false, type: "success", message: "" });
  
  const showToast = (message, type = "success") => {
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

  useEffect(() => {
    fetchLeaves();
    // eslint-disable-next-line
  }, [filters, pagination.page]);

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await apiGetLeavesForApproval({
        ...filters,
        page: pagination.page,
        limit: 10,
      });

      if (response.success) {
        setLeaves(response.leaves);
        setPagination({
          page: response.pagination.page,
          totalPages: response.pagination.totalPages,
          total: response.pagination.total,
        });
      } else {
        showToast("Failed to fetch leaves for approval", "error");
      }
    } catch (error) {
      console.error("Error fetching leaves:", error);
      showToast("Error fetching leaves for approval", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleAction = (leave, type) => {
    setSelectedLeave(leave);
    setActionType(type);
    setActionDialog(true);
    setComments("");
    
    // Initialize with original leave dates
    const startDate = leave.start_date.split('T')[0];
    const endDate = leave.end_date.split('T')[0];
    
    setApprovedStartDate(startDate);
    setApprovedEndDate(endDate);
    setApprovedDays(leave.total_days);
  };

  const calculateWorkingDays = (start, end) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate < startDate) return 0;

    let total = 0;
    const current = new Date(startDate);
    while (current <= endDate) {
      const day = current.getDay();
      if (day !== 0) { // Exclude only Sundays
        total++;
      }
      current.setDate(current.getDate() + 1);
    }
    return total;
  };

  const handleDateChange = (field, value) => {
    if (field === 'startDate') {
      setApprovedStartDate(value);
    } else {
      setApprovedEndDate(value);
    }

    // Recalculate days when either date changes
    const newStart = field === 'startDate' ? value : approvedStartDate;
    const newEnd = field === 'endDate' ? value : approvedEndDate;
    
    if (newStart && newEnd) {
      const newDays = calculateWorkingDays(newStart, newEnd);
      setApprovedDays(newDays);
    }
  };

  const submitAction = async () => {
    try {
      const response = await apiUpdateLeaveStatus(selectedLeave.id, {
        status: actionType,
        comments,
        approvedDays: actionType === 'approved' ? approvedDays : selectedLeave.total_days,
        approvedStartDate: actionType === 'approved' ? approvedStartDate : selectedLeave.start_date,
        approvedEndDate: actionType === 'approved' ? approvedEndDate : selectedLeave.end_date
      });

      if (response.success) {
        showToast(`Leave ${actionType} successfully.`, "success");
        setActionDialog(false);
        fetchLeaves();
      } else {
        showToast(response.message, "error");
      }
    } catch (error) {
      console.error("Error updating leave:", error);
      showToast("Failed to update leave status.", "error");
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusText = (status) =>
    status.charAt(0).toUpperCase() + status.slice(1);

  const getLeaveTypeText = (type) =>
    type.charAt(0).toUpperCase() + type.slice(1) + " Leave";

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

  return (
    <div className="leave-approval-container">
      <div className="leave-approval-header">
        <div className="header-content">
          <h1 className="page-title">Leave Approval</h1>
          <p className="page-subtitle">Review and manage employee leave requests</p>
        </div>
        <div className="header-stats">
          <div className="stat-card">
            <span className="stat-number">{pagination.total}</span>
            <span className="stat-label">Total Requests</span>
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
              <option value="pending">Pending</option>
              <option value="all">All Status</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="filter-item">
            <label className="filter-label">Year</label>
            <select
              className="filter-select"
              value={filters.year}
              onChange={(e) => handleFilterChange("year", e.target.value)}
            >
              {[2023, 2024, 2025].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading leave requests...</p>
        </div>
      ) : leaves.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <h3 className="empty-title">No leave requests found</h3>
          <p className="empty-description">
            {filters.status !== "all" || filters.year !== new Date().getFullYear()
              ? "Try adjusting your filters to see more results"
              : "There are no pending leave requests for your approval"}
          </p>
        </div>
      ) : (
        <>
          {/* Leaves Table */}
          <div className="table-container">
            <div className="table-responsive">
              <table className="leaves-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Leave Type</th>
                    <th>Period</th>
                    <th>Duration</th>
                    <th>Reason</th>
                    <th>Applied On</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((leave) => (
                    <tr key={leave.id} className="leave-row">
                      <td>
                        <div className="employee-info">
                          <div className="employee-name">{leave.employee_name}</div>
                          <div className="employee-department">
                            {leave.employee_department || "No department"}
                          </div>
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
                        <div className="reason-text">
                          {leave.reason}
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
                          {leave.status === "pending" && (
                            <>
                              <button
                                className="btn-approve"
                                onClick={() => handleAction(leave, "approved")}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M20 6L9 17l-5-5"/>
                                </svg>
                                Approve
                              </button>
                              <button
                                className="btn-reject"
                                onClick={() => handleAction(leave, "rejected")}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                                Reject
                              </button>
                            </>
                          )}
                          {leave.status !== "pending" && (
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
                {actionType === "approved" ? "Approve" : "Reject"} Leave Application
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
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold text-muted">Leave Type</label>
                      <p className="mb-0">{getLeaveTypeText(selectedLeave.leave_type)}</p>
                    </div>
                  </div>
                  
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold text-muted">Original Period</label>
                      <p className="mb-0">
                        {formatDate(selectedLeave.start_date)} to {formatDate(selectedLeave.end_date)}
                      </p>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold text-muted">Duration</label>
                      <p className="mb-0">{selectedLeave.total_days} working days</p>
                    </div>
                  </div>

                  {actionType === "approved" && (
                    <div className="mb-4 p-3 border rounded bg-light">
                      <h6 className="mb-3">Modify Leave Dates (Optional)</h6>
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label">Start Date</label>
                          <input
                            type="date"
                            className="form-control"
                            value={approvedStartDate}
                            onChange={(e) => handleDateChange('startDate', e.target.value)}
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">End Date</label>
                          <input
                            type="date"
                            className="form-control"
                            value={approvedEndDate}
                            onChange={(e) => handleDateChange('endDate', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-semibold">Approved Days:</span>
                          <span className="badge bg-primary">{approvedDays} working days</span>
                        </div>
                        <small className="text-muted">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-1">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                          Saturdays are counted as working days, Sundays are excluded
                        </small>
                      </div>
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label fw-semibold">Comments</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      placeholder="Add comments that will be visible to the employee..."
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

export default LeaveApproval;