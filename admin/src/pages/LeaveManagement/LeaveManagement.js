import React, { useState, useEffect } from "react";
import { useAuth } from "../../auth";

import LeaveBalance from "../LeaveBalance/LeaveBalance";
import ApplyLeave from "../ApplyLeave/ApplyLeave";
import LeaveHistory from "../LeaveHistory/LeaveHistory";
import LeaveApproval from "../LeaveApproval/LeaveApproval";
import LeaveAdmin from "../LeaveAdmin/LeaveAdmin";
import "./LeaveManagement.css";

const LeaveManagement = () => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";

  const refreshBalance = async () => {
    try {
      console.log("Refreshing balance...");
    } catch (error) {
      console.error("Error refreshing balance:", error);
    }
  };

  const getTabs = () => {
    const tabs = [
      { label: "Dashboard", component: <LeaveBalance /> },
      { label: "Apply Leave", component: <ApplyLeave onSuccess={refreshBalance} /> },
      { label: "My Leaves", component: <LeaveHistory /> },
      { label: "For Approval", component: <LeaveApproval /> },
    ];

    if (isAdmin) {
      tabs.push({ label: "Admin", component: <LeaveAdmin /> });
    }

    return tabs;
  };

  const tabs = getTabs();

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="loading-container-LeaveManagement">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="leave-management-container-LeaveManagement">
      <h2 className="page-title-LeaveManagement">Leave Management</h2>

      {error && (
        <div className="alert-LeaveManagement">
          <span>{error}</span>
          <button onClick={() => setError("")}>×</button>
        </div>
      )}


        {/* Main Content */}
        <div className="main-content-LeaveManagement">
          <div className="tabs-LeaveManagement">
            {tabs.map((tab, index) => (
              <button
                key={index}
                className={`tab-btn-LeaveManagement ${currentTab === index ? "active" : ""}`}
                onClick={() => setCurrentTab(index)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tab-content-LeaveManagement">
            {tabs[currentTab]?.component}
          </div>
        </div>
    </div>
  );
};

export default LeaveManagement;