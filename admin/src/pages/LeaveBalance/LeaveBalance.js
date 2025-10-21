import React, { useState, useEffect } from "react";
import "./LeaveBalance.css";
import { apiGetLeaveBalance } from "../../api";

const LeaveBalance = () => {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const leaveTypes = {
    sick: {
      name: "Sick Leave",
      color: "#f44336",
      total: 12,
      tooltip:
        "Granted when employee is genuinely sick. Usually 12 days/year. Doctor’s note may be required. No deduction.",
    },
    casual: {
      name: "Casual Leave",
      color: "#2196f3",
      total: 12,
      tooltip:
        "For short personal matters or emergencies (e.g., family event). Usually 24 days/year (12 days/6 months). No deduction.",
    },
    annual: {
      name: "Annual Leave",
      color: "#4caf50",
      total: 21,
      tooltip:
        "For vacations or long personal time off. Usually 21 days/year. Deduction. Often can be carried forward or encashed.",
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
        setError("Failed to fetch leave balance");
      }
    } catch (error) {
      console.error("Error fetching leave balance:", error);
      setError("Error fetching leave balance");
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
        const totalAllocation = leave.total + carryForward;
        const percentage = calculatePercentage(currentBalance, totalAllocation);

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
                  <p className="leave-subtext-LeaveBalance">
                    {leave.total} days + {carryForward} carried
                  </p>
                </div>
              </div>
              <div className="leave-count-LeaveBalance">
                <span className="count">{currentBalance}</span>
                <p className="leave-subtext-LeaveBalance">available</p>
              </div>
            </div>

            {["sick", "casual", "annual"].includes(key) && (
              <>
                <div className="progress-bar-LeaveBalance">
                  <div
                    className="progress-fill-LeaveBalance"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: leave.color,
                    }}
                  ></div>
                </div>
                <div className="leave-usage-LeaveBalance">
                  <span>Used: {totalAllocation - currentBalance} days</span>
                  <span>Total: {totalAllocation} days</span>
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
    </div>
  );
};

export default LeaveBalance;
