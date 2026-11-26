import React, { useState, useEffect } from "react";
import { useAuth } from "../../auth";
import { apiAiLeaveSummary } from "../../api";
import AiInsightBox from "../../components/AiInsightBox";
import { SparklesIcon } from "../../components/CrmHrmsIcons";

import LeaveBalance from "../LeaveBalance/LeaveBalance";
import ApplyLeave from "../ApplyLeave/ApplyLeave";
import LeaveHistory from "../LeaveHistory/LeaveHistory";
import LeaveApproval from "../LeaveApproval/LeaveApproval";
import LeaveAdmin from "../LeaveAdmin/LeaveAdmin";

import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "./LeaveManagement.css";

const LeaveManagement = () => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const isAdmin = user?.role === "admin";
  const [leaveAiOpen, setLeaveAiOpen] = useState(false);
  const [leaveAiLoading, setLeaveAiLoading] = useState(false);
  const [leaveAiErr, setLeaveAiErr] = useState("");
  const [leaveAiData, setLeaveAiData] = useState(null);

  const runLeaveAiSummary = async () => {
    setLeaveAiOpen(true);
    setLeaveAiLoading(true);
    setLeaveAiErr("");
    try {
      const res = await apiAiLeaveSummary({ status: "pending" });
      setLeaveAiData(res);
    } catch (err) {
      setLeaveAiErr(err.message || "Failed to summarize leave requests");
    } finally {
      setLeaveAiLoading(false);
    }
  };

  const refreshBalance = async () => {
    try {
      console.log("Refreshing balance...");
    } catch (error) {
      console.error("Error refreshing balance:", error);
    }
  };

  const getTabs = () => {
    const tabs = [
      {
        label: "Dashboard",
        component: (
          <div className="leave-dashboard-container">
            <div className="leave-balance-section">
              <LeaveBalance />
            </div>
            <div className="calendar-section">
                <Calendar
                  value={selectedDate}
                  onChange={setSelectedDate}
                  className="custom-calendar"
                />
            </div>
          </div>
        ),
      },
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
        <h2 className="page-title-LeaveManagement" style={{ marginBottom: 0 }}>Leave Management</h2>
        <button type="button" className="zx-ai-pill-btn" onClick={runLeaveAiSummary}>
          <SparklesIcon size={13} />
          <span>ZORVI Summarize Leave Queue</span>
        </button>
      </div>

      {leaveAiOpen && (
        <AiInsightBox
          title="ZORVI Leave Requests Overview"
          subtitle="Role-scoped summary • Approvals/rejections always require human confirmation."
          loading={leaveAiLoading}
          error={leaveAiErr}
          uncertainty={leaveAiData?.uncertainty}
          providerMeta={leaveAiData?.meta}
          onRefresh={runLeaveAiSummary}
          onClose={() => setLeaveAiOpen(false)}
        >
          {leaveAiData && (
            <div>
              <p style={{ margin: "0 0 6px" }}>{leaveAiData.summary}</p>
              {leaveAiData.coverageAlerts?.length > 0 && (
                <div style={{ fontSize: "12px", marginTop: "4px" }}>
                  <strong>Overlap / Coverage Alerts:</strong>
                  <ul className="zx-ai-list">{leaveAiData.coverageAlerts.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </div>
              )}
              {leaveAiData.highlights?.length > 0 && (
                <ul className="zx-ai-list" style={{ fontSize: "12px" }}>
                  {leaveAiData.highlights.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              )}
            </div>
          )}
        </AiInsightBox>
      )}

      {error && (
        <div className="alert-LeaveManagement">
          <span>{error}</span>
          <button onClick={() => setError("")}>×</button>
        </div>
      )}

      <div className="main-content-LeaveManagement">
        <div className="tabs-LeaveManagement">
          {tabs.map((tab, index) => (
            <button
              key={index}
              className={`tab-btn-LeaveManagement ${
                currentTab === index ? "active" : ""
              }`}
              onClick={() => setCurrentTab(index)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tab-content-LeaveManagement">{tabs[currentTab]?.component}</div>
      </div>
    </div>
  );
};

export default LeaveManagement;
