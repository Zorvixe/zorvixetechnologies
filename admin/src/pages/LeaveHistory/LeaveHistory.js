import React, { useState, useEffect, useRef } from "react";
import "./LeaveHistory.css";
import { apiGetMyLeaves, apiCancelLeave } from "../../api";


const LeaveHistory = () => {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [filters, setFilters] = useState({
    status: "all",
    year: new Date().getFullYear(),
  });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });

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
  }, [filters, pagination.page]);

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await apiGetMyLeaves({
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
        showToast("Failed to fetch leaves", "error");
      }
    } catch (error) {
      console.error("Error fetching leaves:", error);
      showToast("Error fetching leaves", "error");
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

  const handleCancelLeave = async (leaveId) => {
    if (!window.confirm("Are you sure you want to cancel this leave request?")) return;

    try {
      const response = await apiCancelLeave(leaveId);
      if (response.success) {
        showToast("Leave request cancelled successfully", "success");
        fetchLeaves();
      } else {
        showToast(response.message, "error");
      }
    } catch (error) {
      console.error("Error cancelling leave:", error);
      showToast("Failed to cancel leave request", "error");
    }
  };

  const viewComments = (leave) => {
    setSelectedLeave(leave);
    setShowComments(true);
  };

  const closeComments = () => {
    setShowComments(false);
    setSelectedLeave(null);
  };

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

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
    <div className="leave-history-container">
      <div className="leave-history-header">
        <div className="header-content">
          <h1 className="page-title">Leave History</h1>
          <p className="page-subtitle">View and manage your leave applications</p>
        </div>
        <div className="header-stats">
          <div className="stat-card">
            <span className="stat-number">{pagination.total}</span>
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
          <p className="loading-text">Loading your leave history...</p>
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
          <h3 className="empty-title">No leave applications found</h3>
          <p className="empty-description">
            {filters.status !== "all" || filters.year !== new Date().getFullYear()
              ? "Try adjusting your filters to see more results"
              : "You haven't applied for any leave yet"}
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
                    <th>Leave Type</th>
                    <th>Period</th>
                    <th>Duration</th>
                    <th>Approver</th>
                    <th>Applied On</th>
                    <th>Status</th>
                    <th>Approved By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((leave) => (
                    <tr key={leave.id} className="leave-row">
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
                        {leave.approved_by_name ? (
                          <div className="approval-info">
                            <div className="approver-name">{leave.approved_by_name}</div>
                            <div className="approver-email">{leave.approved_by_email}</div>
                            {leave.comments && (
                              <button 
                                className="comments-btn"
                                onClick={() => viewComments(leave)}
                                title="View comments"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                                </svg>
                                View Comments
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="not-available">-</span>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          {leave.status === "pending" && (
                            <button
                              className="btn-cancel"
                              onClick={() => handleCancelLeave(leave.id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="15" y1="9" x2="9" y2="15"></line>
                                <line x1="9" y1="9" x2="15" y2="15"></line>
                              </svg>
                              Cancel
                            </button>
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

      {/* Bootstrap Comments Modal */}
      <div 
        className={`modal fade ${showComments ? 'show' : ''}`} 
        style={{ display: showComments ? 'block' : 'none', backgroundColor: 'rgba(0,0,0,0.5)' }}
        tabIndex="-1" 
        role="dialog"
        aria-labelledby="commentsModalLabel"
        aria-hidden={!showComments}
      >
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content">
            <div className="modal-header bg-primary text-white">
              <h5 className="modal-title" id="commentsModalLabel">
                Approver Comments
              </h5>
              <button 
                type="button" 
                className="btn-close btn-close-white" 
                onClick={closeComments}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              {selectedLeave && (
                <>
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold text-muted">Leave Type</label>
                      <p className="mb-0">{getLeaveTypeText(selectedLeave.leave_type)}</p>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold text-muted">Duration</label>
                      <p className="mb-0">{selectedLeave.total_days} day{selectedLeave.total_days !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  
                  <div className="row mb-3">
                    <div className="col-12">
                      <label className="form-label fw-semibold text-muted">Period</label>
                      <p className="mb-0">
                        {formatDate(selectedLeave.start_date)} to {formatDate(selectedLeave.end_date)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="row mb-3">
                    <div className="col-12">
                      <label className="form-label fw-semibold text-muted">Approved By</label>
                      <p className="mb-0">
                        {selectedLeave.approved_by_name} ({selectedLeave.approved_by_email})
                      </p>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <label className="form-label fw-semibold text-muted">Comments</label>
                    <div className="border rounded p-3 bg-light">
                      {selectedLeave.comments ? (
                        <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                          {selectedLeave.comments}
                        </p>
                      ) : (
                        <p className="mb-0 text-muted fst-italic">
                          No comments provided by the approver.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={closeComments}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bootstrap Modal Backdrop */}
      {showComments && <div className="modal-backdrop fade show"></div>}
    </div>
  );
};

export default LeaveHistory;