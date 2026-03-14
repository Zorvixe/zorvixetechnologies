import React, { useState, useEffect, useRef } from "react";
import "./ApplyLeave.css";
import { apiGetApprovers, apiApplyLeave } from "../../api";

const ApplyLeave = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    leaveType: "",
    startDate: "",
    endDate: "",
    reason: "",
    approverId: "",
  });
  const [approvers, setApprovers] = useState([]);
  const [totalDays, setTotalDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // In ApplyLeave.js, find the leaveTypes array and change the casual label
  const leaveTypes = [
    { value: "sick", label: "Sick Leave (1 day/month limit)" },
    { value: "casual", label: "Casual Leave (1 day/month limit)" },  // changed from 2 to 1
    { value: "annual", label: "Annual Leave" },
    { value: "maternity", label: "Maternity Leave" },
    { value: "paternity", label: "Paternity Leave / Loss of Pay (LOP)" },
  ];

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

  useEffect(() => {
    fetchApprovers();
  }, []);

  const fetchApprovers = async () => {
    try {
      setLoading(true);
      const response = await apiGetApprovers();
      if (response.success) {
        setApprovers(response.approvers);
      } else {
        showToast("Failed to load approvers", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error fetching approvers", "error");
    } finally {
      setLoading(false);
    }
  };

  // Calculate working days (including Saturdays, excluding Sundays)
  const calculateWorkingDays = (start, end) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    if (endDate < startDate) return 0;

    let total = 0;
    const current = new Date(startDate);
    while (current <= endDate) {
      const day = current.getDay();
      // Count all days except Sunday (0)
      if (day !== 0) {
        total++;
      }
      current.setDate(current.getDate() + 1);
    }
    return total;
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.leaveType) errors.leaveType = "Leave type is required";
    if (!formData.approverId) errors.approverId = "Approver is required";
    if (!formData.startDate) errors.startDate = "Start date is required";
    if (!formData.endDate) errors.endDate = "End date is required";
    if (!formData.reason) errors.reason = "Reason is required";

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (end < start) {
        errors.endDate = "End date cannot be before start date";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updated = { ...formData, [name]: value };
    setFormData(updated);

    // Clear error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }

    if (updated.startDate && updated.endDate) {
      setTotalDays(calculateWorkingDays(updated.startDate, updated.endDate));
    } else {
      setTotalDays(0);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast("Please fix the form errors before submitting", "error");
      return;
    }

    setLoading(true);

    try {
      const response = await apiApplyLeave(formData);
      if (response.success) {
        showToast("Leave application submitted successfully!", "success");
        setFormData({
          leaveType: "",
          startDate: "",
          endDate: "",
          reason: "",
          approverId: "",
        });
        setTotalDays(0);
        setFormErrors({});
        if (onSuccess) onSuccess();
      } else {
        showToast(response.message || "Failed to submit leave application", "error");
      }
    } catch (error) {
      console.error("Error submitting leave:", error);
      // Check if it's a monthly limit error and show appropriate message
      if (error.message.includes('Monthly') && error.message.includes('limit exceeded')) {
        showToast(error.message, "error");
      } else {
        showToast("Failed to submit leave application", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFormData({
      leaveType: "",
      startDate: "",
      endDate: "",
      reason: "",
      approverId: "",
    });
    setTotalDays(0);
    setFormErrors({});
    showToast("Form cleared", "success");
  };

  const isFormValid = formData.leaveType && formData.startDate && formData.endDate &&
    formData.reason && formData.approverId && totalDays > 0;

  return (
    <div className="apply-leave-container">
      <div className="apply-leave-header">
        <h1 className="page-title">Apply for Leave</h1>
        <p className="page-subtitle">Submit a new leave application for approval</p>
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

      <div className="form-card">
        <form className="leave-form" onSubmit={handleSubmit}>
          <div className="apply_leave_row_con">
            <div className="col-6">
              <div className="mb-3">
                <label htmlFor="leaveType" className="form-label">
                  Leave Type <span className="text-danger">*</span>
                </label>
                <select
                  id="leaveType"
                  name="leaveType"
                  value={formData.leaveType}
                  onChange={handleChange}
                  className={`form-select ${formErrors.leaveType ? 'is-invalid' : ''}`}
                  required
                >
                  <option value="">Select Leave Type</option>
                  {leaveTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                {formErrors.leaveType && (
                  <div className="invalid-feedback">
                    {formErrors.leaveType}
                  </div>
                )}
              </div>
            </div>

            <div className="col-6">
              <div className="mb-3">
                <label htmlFor="approverId" className="form-label">
                  Approver <span className="text-danger">*</span>
                </label>
                <select
                  id="approverId"
                  name="approverId"
                  value={formData.approverId}
                  onChange={handleChange}
                  className={`form-select ${formErrors.approverId ? 'is-invalid' : ''}`}
                  required
                >
                  <option value="">Select Approver</option>
                  {approvers.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.department || "No department"})
                    </option>
                  ))}
                </select>
                {formErrors.approverId && (
                  <div className="invalid-feedback">
                    {formErrors.approverId}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="apply_leave_row_con">
            <div className="col-6">
              <div className="mb-3">
                <label htmlFor="startDate" className="form-label">
                  Start Date <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  className={`form-control ${formErrors.startDate ? 'is-invalid' : ''}`}
                  required
                />
                {formErrors.startDate && (
                  <div className="invalid-feedback">
                    {formErrors.startDate}
                  </div>
                )}
              </div>
            </div>

            <div className="col-6">
              <div className="mb-3">
                <label htmlFor="endDate" className="form-label">
                  End Date <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  className={`form-control ${formErrors.endDate ? 'is-invalid' : ''}`}
                  required
                />
                {formErrors.endDate && (
                  <div className="invalid-feedback">
                    {formErrors.endDate}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">Total Working Days</label>
            <div className="days-display">
              <span className="days-count">{totalDays}</span>
              <span className="days-label">working day{totalDays !== 1 ? 's' : ''}</span>
            </div>
            <div className="form-text">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              Note: Saturdays are counted as working days, Sundays are excluded
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="reason" className="form-label">
              Reason for Leave <span className="text-danger">*</span>
            </label>
            <textarea
              id="reason"
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              rows="4"
              className={`form-control ${formErrors.reason ? 'is-invalid' : ''}`}
              placeholder="Please provide a detailed reason for your leave application..."
              required
            />
            {formErrors.reason && (
              <div className="invalid-feedback">
                {formErrors.reason}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={handleClear}
              disabled={loading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Clear Form
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!isFormValid || loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Submitting...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  Submit Application
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ApplyLeave;