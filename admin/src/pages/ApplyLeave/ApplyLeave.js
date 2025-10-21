// src/components/ApplyLeave.js
import React, { useState, useEffect } from "react";
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
  const [message, setMessage] = useState({ type: "", text: "" });
  const [totalDays, setTotalDays] = useState(0);
  const [loading, setLoading] = useState(false);

  const leaveTypes = [
    { value: "sick", label: "Sick Leave" },
    { value: "casual", label: "Casual Leave" },
    { value: "annual", label: "Annual Leave" },
    { value: "maternity", label: "Maternity Leave" },
    { value: "paternity", label: "Paternity Leave / Loss of Pay (LOP)" },
  ];

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
        setMessage({ type: "error", text: "Failed to load approvers" });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Error fetching approvers" });
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalDays = (start, end) => {
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
      if (day !== 0 && day !== 6) total++;
      current.setDate(current.getDate() + 1);
    }
    return total;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updated = { ...formData, [name]: value };
    setFormData(updated);

    if (updated.startDate && updated.endDate) {
      setTotalDays(calculateTotalDays(updated.startDate, updated.endDate));
    } else {
      setTotalDays(0);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await apiApplyLeave(formData);
      if (response.success) {
        setMessage({
          type: "success",
          text: "Leave application submitted successfully!",
        });
        setFormData({
          leaveType: "",
          startDate: "",
          endDate: "",
          reason: "",
          approverId: "",
        });
        setTotalDays(0);
        if (onSuccess) onSuccess();
      } else {
        setMessage({ type: "error", text: response.message });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to submit leave application" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="leave-container-ApplyLeave">
      <h2>Apply for Leave</h2>

      {message.text && (
        <div className={`alert-ApplyLeave ${message.type}`}>{message.text}</div>
      )}

      <form className="leave-form-ApplyLeave" onSubmit={handleSubmit}>
        <div className="form-group-ApplyLeave">
          <label>Leave Type</label>
          <select
            name="leaveType"
            value={formData.leaveType}
            onChange={handleChange}
            required
          >
            <option value="">Select Leave Type</option>
            {leaveTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group-ApplyLeave">
          <label>Approver</label>
          <select
            name="approverId"
            value={formData.approverId}
            onChange={handleChange}
            required
          >
            <option value="">Select Approver</option>
            {approvers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.department || "No department"})
              </option>
            ))}
          </select>
        </div>

        <div className="form-row-ApplyLeave">
          <div className="form-group-ApplyLeave">
            <label>Start Date</label>
            <input
              type="date"
              name="startDate"
              value={formData.startDate}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group-ApplyLeave">
            <label>End Date</label>
            <input
              type="date"
              name="endDate"
              value={formData.endDate}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-group-ApplyLeave">
          <label>Total Days</label>
          <input type="text" value={totalDays} readOnly />
        </div>

        <div className="form-group-ApplyLeave">
          <label>Reason</label>
          <textarea
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            rows="4"
            placeholder="Enter reason for leave..."
            required
          />
        </div>

        <div className="form-actions-ApplyLeave">
          <button
            type="button"
            className="btn-secondary-ApplyLeave"
            onClick={() => {
              setFormData({
                leaveType: "",
                startDate: "",
                endDate: "",
                reason: "",
                approverId: "",
              });
              setTotalDays(0);
              setMessage({ type: "", text: "" });
            }}
          >
            Clear
          </button>
          <button
            type="submit"
            className="btn-primary-ApplyLeave"
            disabled={!formData.leaveType || !formData.startDate || !formData.endDate || !formData.reason || !formData.approverId}
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ApplyLeave;