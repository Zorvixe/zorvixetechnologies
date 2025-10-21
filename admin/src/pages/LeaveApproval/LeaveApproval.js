import React, { useState, useEffect } from "react";
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
  const [message, setMessage] = useState({ type: "", text: "" });

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
        setError("Failed to fetch leaves for approval");
      }
    } catch (error) {
      console.error("Error fetching leaves:", error);
      setError("Error fetching leaves for approval");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (leave, type) => {
    setSelectedLeave(leave);
    setActionType(type);
    setActionDialog(true);
    setComments("");
  };

  const submitAction = async () => {
    try {
      const response = await apiUpdateLeaveStatus(selectedLeave.id, {
        status: actionType,
        comments,
      });

      if (response.success) {
        setMessage({
          type: "success",
          text: `Leave ${actionType} successfully.`,
        });
        setActionDialog(false);
        fetchLeaves();
      } else {
        setMessage({ type: "error", text: response.message });
      }
    } catch (error) {
      console.error("Error updating leave:", error);
      setMessage({ type: "error", text: "Failed to update leave status." });
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="leave-approval-container-LeaveApproval">
      <h3 className="section-title-LeaveApproval">Leaves for My Approval</h3>

      {message.text && (
        <div className={`alert-LeaveApproval ${message.type}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage({ type: "", text: "" })}>×</button>
        </div>
      )}

      {error && (
        <div className="alert-LeaveApproval error">
          <span>{error}</span>
          <button onClick={() => setError("")}>×</button>
        </div>
      )}

      {/* Filters */}
      <div className="filters-box-LeaveApproval">
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, status: e.target.value }))
          }
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Loading */}
      {loading ? (
         <div className="loading-box-LeaveHistory">
          <div className="spinner-LeaveHistory"></div>
          <p>Loading...</p>
        </div>
      ) : leaves.length === 0 ? (
        <p className="no-data-LeaveApproval">No leaves found for approval.</p>
      ) : (
        <>
          {/* Table */}
          <div className="table-wrapper-LeaveApproval">
            <table className="approval-table-LeaveApproval">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Leave Type</th>
                  <th>Period</th>
                  <th>Total Days</th>
                  <th>Reason</th>
                  <th>Applied On</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave) => (
                  <tr key={leave.id}>
                    <td>
                      <div className="employee-info-LeaveApproval">
                        <span className="emp-name">{leave.employee_name}</span>
                        <small className="emp-dept">
                          {leave.employee_department || "No department"}
                        </small>
                      </div>
                    </td>
                    <td>{leave.leave_type}</td>
                    <td>
                      {formatDate(leave.start_date)} -{" "}
                      {formatDate(leave.end_date)}
                    </td>
                    <td>{leave.total_days}</td>
                    <td className="reason-cell-LeaveApproval">{leave.reason}</td>
                    <td>{formatDate(leave.applied_on)}</td>
                    <td>
                      <span className={`status-LeaveApproval ${leave.status}`}>
                        {leave.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-btns-LeaveApproval">
                        {leave.status === "pending" && (
                          <>
                            <button
                              className="approve-btn-LeaveApproval"
                              onClick={() => handleAction(leave, "approved")}
                            >
                              ✓ Approve
                            </button>
                            <button
                              className="reject-btn-LeaveApproval"
                              onClick={() => handleAction(leave, "rejected")}
                            >
                              ✗ Reject
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

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="pagination-LeaveApproval">
              {Array.from({ length: pagination.totalPages }).map((_, i) => (
                <button
                  key={i}
                  className={pagination.page === i + 1 ? "active" : ""}
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: i + 1 }))
                  }
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Action Dialog */}
      {actionDialog && (
        <div className="dialog-overlay-LeaveApproval">
          <div className="dialog-LeaveApproval">
            <h4>
              {actionType === "approved" ? "Approve" : "Reject"} Leave
              Application
            </h4>
            <p>
              <strong>Employee:</strong> {selectedLeave?.employee_name}
            </p>
            <p>
              <strong>Leave Type:</strong> {selectedLeave?.leave_type}
            </p>
            <p>
              <strong>Period:</strong>{" "}
              {formatDate(selectedLeave?.start_date)} to{" "}
              {formatDate(selectedLeave?.end_date)}
            </p>
            <p>
              <strong>Total Days:</strong> {selectedLeave?.total_days}
            </p>

            <textarea
              rows="3"
              placeholder="Add comments..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            ></textarea>

            <div className="dialog-actions-LeaveApproval">
              <button className="cancel-btn-LeaveApproval" onClick={() => setActionDialog(false)}>
                Cancel
              </button>
              <button
                className={
                  actionType === "approved" ? "approve-btn-LeaveApproval" : "reject-btn-LeaveApproval"
                }
                onClick={submitAction}
              >
                Confirm {actionType}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveApproval;