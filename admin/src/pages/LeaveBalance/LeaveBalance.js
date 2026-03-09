import React, { useState, useEffect, useRef } from "react";
import "./LeaveBalance.css";
import { apiGetLeaveBalance } from "../../api";

const LeaveBalance = () => {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Toast system
  const toastTimer = useRef(null);
  const [toast, setToast] = useState({ open: false, type: "success", message: "" });
  const showToast = (message, type = "success") => {
    setToast({ open: true, type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, open: false })), 3000);
  };
  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t => ({ ...t, open: false }));
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, []);

  const leaveTypes = {
    sick: {
      name: "Sick Leave",
      color: "#f44336",
      total: 1,   // monthly accrual, not fixed annual
      tooltip:
        "Granted when employee is genuinely sick. Accrues 1 day per month. Monthly limit: 1 day.",
    },
    casual: {
      name: "Casual Leave",
      color: "#2196f3",
      total: 2,   // monthly accrual
      tooltip:
        "For short personal matters or emergencies. Accrues 2 days per month. Monthly limit: 2 days.",
    },
    annual: {
      name: "Annual Leave",
      color: "#4caf50",
      total: 21,
      tooltip:
        "For vacations or long personal time off. Fixed 21 days per year.",
    },
    maternity: {
      name: "Maternity Leave",
      color: "#e91e63",
      total: 180,
      tooltip:
        "As per government law (e.g., maternity leave 26 weeks in India).",
    },
    paternity: {
      name: "Paternity Leave/LOP",
      color: "#ff9800",
      total: 15,
      tooltip:
        "When employee takes more leaves than available balance or is absent without approval. Salary deduction.",
    },
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await apiGetLeaveBalance();
      if (response.success) {
        setBalance(response.balance);
      } else {
        showToast("Failed to fetch leave balance", "error");
      }
    } catch (error) {
      console.error("Error fetching leave balance:", error);
      showToast("Error fetching leave balance", "error");
    } finally {
      setLoading(false);
    }
  };

  const calculatePercentage = (current, total) => {
    return (current / total) * 100;
  };

  const getBalanceValue = (type) => {
    if (!balance) return 0;
    return balance[`${type}_balance`] || 0;
  };

  const getCarryForward = (type) => {
    if (!balance) return 0;
    return balance[`${type}_carry_forward`] || 0;
  };

  const getMonthlyUsage = (type) => {
    if (!balance) return { used: 0, limit: 0 };

    if (type === 'sick') {
      return { 
        used: balance.sick_used_this_month || 0, 
        limit: 1 
      };
    }

    if (type === 'casual') {
      return { 
        used: balance.casual_used_this_month || 0, 
        limit: 2 
      };
    }

    return { used: 0, limit: 0 };
  };

  if (loading) {
    return (
      <div className="leave-balance-card-LeaveBalance center-LeaveBalance">
        <div className="spinner-LeaveBalance"></div>
        <p>Loading balance...</p>
      </div>
    );
  }

  if (error) {
    return <div className="leave-error-LeaveBalance">{error}</div>;
  }

  return (
    <div className="leave-balance-card-LeaveBalance">
      <h3 className="leave-title-LeaveBalance">Leave Balance</h3>

      {Object.entries(leaveTypes).map(([key, leave]) => {
        const currentBalance = getBalanceValue(key);
        const carryForward = getCarryForward(key);
        // For sick and casual we show only the balance (no progress bar because they accrue monthly)
        const showProgress = ['annual', 'maternity', 'paternity'].includes(key);
        const monthlyUsage = getMonthlyUsage(key);

        return (
          <div key={key} className="leave-item-LeaveBalance">
            <div className="leave-header-LeaveBalance">
              <div className="leave-info-LeaveBalance">
                <div
                  className="leave-icon-LeaveBalance"
                  style={{ backgroundColor: leave.color }}
                ></div>
                <div>
                  <h4 className="leave-name-with-tooltip-LeaveBalance">
                    {leave.name}
                    <span className="tooltip-container-LeaveBalance">
                      <span className="question-icon-LeaveBalance">?</span>
                      <span className="tooltip-text-LeaveBalance">
                        {leave.tooltip}
                      </span>
                    </span>
                  </h4>
                  {showProgress && (
                    <p className="leave-subtext-LeaveBalance">
                      {leave.total} days + {carryForward} carried
                    </p>
                  )}
                </div>
              </div>
              <div className="leave-count-LeaveBalance">
                <span className="count">{currentBalance}</span>
                <p className="leave-subtext-LeaveBalance">available</p>
              </div>
            </div>

            {["sick", "casual"].includes(key) && (
              <div className="monthly-usage-LeaveBalance">
                <small>Used this month: {monthlyUsage.used}/{monthlyUsage.limit} days</small>
              </div>
            )}

            {showProgress && (
              <>
                <div className="progress-bar-LeaveBalance">
                  <div
                    className="progress-fill-LeaveBalance"
                    style={{
                      width: `${calculatePercentage(currentBalance, leave.total + carryForward)}%`,
                      backgroundColor: leave.color,
                    }}
                  ></div>
                </div>
                <div className="leave-usage-LeaveBalance">
                  <span>Used: {leave.total + carryForward - currentBalance} days</span>
                  <span>Total: {leave.total + carryForward} days</span>
                </div>
              </>
            )}
          </div>
        );
      })}

      {balance?.last_reset && (
        <p className="last-updated-LeaveBalance">
          Last updated: {new Date(balance.last_reset).toLocaleDateString()}
        </p>
      )}

      {/* Toast */}
      <div className={`toastx ${toast.type} ${toast.open ? 'show' : ''}`} role="status" aria-live="polite">
        <div className="toastx-icon">
          {toast.type === 'success' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
          )}
        </div>
        <div className="toastx-body">
          <div className="toastx-title">{toast.type === 'success' ? 'Success' : 'Error'}</div>
          <div className="toastx-msg">{toast.message}</div>
        </div>
        <button className="toastx-close" onClick={hideToast} aria-label="Close">×</button>
      </div>
    </div>
  );
};

export default LeaveBalance;