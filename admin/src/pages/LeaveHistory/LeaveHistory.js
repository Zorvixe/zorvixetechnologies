import React, { useState, useEffect } from "react";
import "./LeaveHistory.css";
import { apiGetMyLeaves, apiCancelLeave } from "../../api";

const LeaveHistory = () => {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(null);
  const [filters, setFilters] = useState({
    status: "all",
    year: new Date().getFullYear(),
  });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });

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
        setError("Failed to fetch leaves");
      }
    } catch (error) {
      console.error("Error fetching leaves:", error);
      setError("Error fetching leaves");
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
    if (!window.confirm("Are you sure you want to cancel this leave?")) return;

    try {
      const response = await apiCancelLeave(leaveId);
      if (response.success) {
        setMessage({ type: "success", text: "Leave cancelled successfully" });
        fetchLeaves();
      } else {
        setMessage({ type: "error", text: response.message });
      }
    } catch (error) {
      console.error("Error cancelling leave:", error);
      setMessage({ type: "error", text: "Failed to cancel leave" });
    }
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

  return (
    <div className="leave-history-container-LeaveHistory">
      <h3 className="leave-history-title-LeaveHistory">My Leave History</h3>

      {error && <div className="error-box-LeaveHistory">{error}</div>}
      {message && (
        <div className={`message-box-LeaveHistory ${message.type}`}>{message.text}</div>
      )}

      {/* Filters */}
      <div className="filters-LeaveHistory">
        <div className="filter-item-LeaveHistory">
          <label>Status:</label>
          <select
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

        <div className="filter-item-LeaveHistory">
          <label>Year:</label>
          <select
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

      {/* Loading Spinner */}
      {loading ? (
        <div className="loading-box-LeaveHistory">
          <div className="spinner-LeaveHistory"></div>
          <p>Loading...</p>
        </div>
      ) : leaves.length === 0 ? (
        <div className="no-data-LeaveHistory">No leave applications found</div>
      ) : (
        <div className="table-wrapper-LeaveHistory">
          <table className="leave-table-LeaveHistory">
            <thead>
              <tr>
                <th>Leave Type</th>
                <th>Period</th>
                <th>Total Days</th>
                <th>Approver</th>
                <th>Applied On</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map((leave) => (
                <tr key={leave.id}>
                  <td>
                    <span className={`tag-LeaveHistory type-${leave.leave_type}`}>
                      {getLeaveTypeText(leave.leave_type)}
                    </span>
                  </td>
                  <td>
                    {formatDate(leave.start_date)} to{" "}
                    {formatDate(leave.end_date)}
                  </td>
                  <td>{leave.total_days} days</td>
                  <td>
                    <div className="approver-info-LeaveHistory">
                      <strong>{leave.approver_name}</strong>
                      <p>{leave.approver_email}</p>
                    </div>
                  </td>
                  <td>{formatDate(leave.applied_on)}</td>
                  <td>
                    <span className={`status-LeaveHistory ${leave.status}`}>
                      {getStatusText(leave.status)}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons-LeaveHistory">
                      {leave.status === "pending" && (
                        <>
                          <button
                            className="btn-LeaveHistory cancel"
                            onClick={() => handleCancelLeave(leave.id)}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination-LeaveHistory">
          {Array.from({ length: pagination.totalPages }).map((_, i) => (
            <button
              key={i + 1}
              className={`page-btn-LeaveHistory ${
                pagination.page === i + 1 ? "active" : ""
              }`}
              onClick={() => handlePageChange(i + 1)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LeaveHistory;