import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

import AttendanceTab from './hrms/AttendanceTab';
import PayrollTab from './hrms/PayrollTab';
import EmployeesTab from './hrms/EmployeesTab';
import RecruitmentComplianceTab from './hrms/RecruitmentComplianceTab';
import WorkforceInsightsTab from './hrms/WorkforceInsightsTab';
import LeaveManagement from './LeaveManagement/LeaveManagement';
import {
  ClockIcon,
  PayrollIcon,
  UsersIcon,
  BriefcaseIcon,
  ChartIcon,
  CalendarIcon
} from '../components/CrmHrmsIcons';

import './HRMS.css';

export default function HRMS({ defaultTab }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const location = useLocation();

  // Determine active tab from URL path, hash, or defaultTab
  const getInitialTab = () => {
    if (defaultTab) return defaultTab;
    const path = location.pathname.replace(/^\//, '');
    if (['attendance', 'payroll', 'employees', 'recruitment', 'workforce-insights', 'leaves'].includes(path)) {
      return path;
    }
    const hash = window.location.hash.replace('#', '');
    if (['attendance', 'payroll', 'employees', 'recruitment', 'workforce-insights', 'leaves'].includes(hash)) {
      return hash;
    }
    return 'attendance';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    const currentPath = location.pathname.replace(/^\//, '');
    if (['attendance', 'payroll', 'employees', 'recruitment', 'workforce-insights', 'leaves'].includes(currentPath)) {
      setActiveTab(currentPath);
    }
  }, [location.pathname]);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    window.location.hash = tabKey;
  };

  const tabs = [
    { key: 'attendance', label: 'Attendance', icon: ClockIcon, count: null },
    { key: 'payroll', label: 'Payroll & Payslips', icon: PayrollIcon, count: null },
    { key: 'employees', label: 'Employees Directory', icon: UsersIcon, count: null },
    { key: 'recruitment', label: 'Recruitment & Compliance', icon: BriefcaseIcon, count: null },
    { key: 'workforce-insights', label: 'Workforce Insights', icon: ChartIcon, count: null },
    { key: 'leaves', label: 'Leave Portal', icon: CalendarIcon, count: null }
  ];

  return (
    <div className="jira-hrms-container">
      {/* Atlassian Jira Project Header */}
      <div className="jira-page-header">
        <div className="jira-breadcrumbs">
          <span>Projects</span>
          <span className="jira-bc-sep">/</span>
          <span>Zorvixe Technologies</span>
          <span className="jira-bc-sep">/</span>
          <span className="jira-bc-current">HRMS & Workforce Suite</span>
        </div>

        <div className="jira-title-row">
          <div className="jira-title-left">
            <div className="jira-project-avatar jira-avatar-hrms">
              <span>HR</span>
            </div>
            <div>
              <h1 className="jira-project-title">Human Resources & Payroll</h1>
              <span className="jira-project-key">ZORVIXE-HR • Enterprise Workforce Suite</span>
            </div>
          </div>
        </div>

        {/* Jira Underline Navigation Tabs */}
        <div className="jira-tabs-nav-bar">
          <div className="jira-tabs-list">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`jira-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.key)}
              >
                <span className="jira-tab-icon">{tab.icon ? <tab.icon size={16} /> : null}</span>
                <span className="jira-tab-label">{tab.label}</span>
                {tab.count !== null && <span className="jira-tab-count">{tab.count}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="jira-tab-content-area">
        {activeTab === 'attendance' && <AttendanceTab isAdmin={isAdmin} user={user} />}
        {activeTab === 'payroll' && <PayrollTab isAdmin={isAdmin} user={user} />}
        {activeTab === 'employees' && <EmployeesTab isAdmin={isAdmin} user={user} />}
        {activeTab === 'recruitment' && <RecruitmentComplianceTab isAdmin={isAdmin} user={user} />}
        {activeTab === 'workforce-insights' && <WorkforceInsightsTab isAdmin={isAdmin} user={user} />}
        {activeTab === 'leaves' && <LeaveManagement />}
      </div>
    </div>
  );
}
