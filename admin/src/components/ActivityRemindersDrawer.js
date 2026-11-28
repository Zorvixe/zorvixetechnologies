import React, { useState, useEffect, useCallback } from 'react';
import { apiListCrmActivities, apiUpdateCrmActivity } from '../api';
import { AlarmClockIcon } from './CrmHrmsIcons';
import { showToast } from '../utils/toast';
import './ActivityRemindersDrawer.css';

export default function ActivityRemindersDrawer({ collapsed = false }) {
  const [reminders, setReminders] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  const fetchReminders = useCallback(async () => {
    try {
      const res = await apiListCrmActivities();
      const all = res.activities || [];
      const todayStr = new Date().toISOString().slice(0, 10);
      const now = new Date();

      // Filter activities due today or overdue and not completed
      const pending = all.filter(a => {
        if (a.completed) return false;
        if (!a.due_date) return false;
        const d = new Date(a.due_date);
        return a.due_date.startsWith(todayStr) || d < now;
      });

      setReminders(pending);
    } catch (err) {
      console.error('Failed to load reminders:', err);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
    const interval = setInterval(fetchReminders, 30000);
    return () => clearInterval(interval);
  }, [fetchReminders]);

  const handleComplete = async (reminder) => {
    try {
      await apiUpdateCrmActivity(reminder.id, { completed: true });
      setReminders(prev => prev.filter(r => r.id !== reminder.id));
    } catch (err) {
      console.error('Failed to complete reminder:', err);
    }
  };

  const reminderCount = reminders.length;

  return (
    <>
      {/* ---------------- ACTIVITY REMINDERS DRAWER / TOAST (Photo 2) ---------------- */}
      {isOpen && (
        <div className="activity-reminders-toast">
          <div className="reminders-toast-header">
            <div className="reminders-header-left">
              <AlarmClockIcon size={16} color="#ffffff" />
              <span>Reminders</span>
              <span className="reminders-header-pill">{reminderCount}</span>
            </div>
            <div className="reminders-header-actions">
              <button
                type="button"
                className="reminders-header-btn"
                onClick={() => setIsOpen(false)}
                title="Minimize"
              >
                —
              </button>
              <button
                type="button"
                className="reminders-header-btn"
                onClick={() => setIsOpen(false)}
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          <div className="reminders-toast-body">
            <h5 className="reminders-group-title">TODAY</h5>

            {reminderCount === 0 ? (
              <div className="reminders-empty">
                No pending activity reminders for today.
              </div>
            ) : (
              reminders.map(rem => {
                const dateObj = new Date(rem.due_date);
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = dateObj.toLocaleDateString();
                const typeName = (rem.type || 'task').charAt(0).toUpperCase() + (rem.type || 'task').slice(1);

                return (
                  <div key={rem.id} className="reminder-item-row">
                    <input
                      type="checkbox"
                      className="reminder-checkbox"
                      checked={Boolean(rem.completed)}
                      onChange={() => handleComplete(rem)}
                      title="Mark as completed"
                    />
                    <div className="reminder-item-content">
                      <span className="reminder-item-title">{rem.title}</span>
                      <span className="reminder-item-meta">
                        <span className="type-pill">{typeName}</span>
                        <span>•</span>
                        <span>{dateStr} {timeStr}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ---------------- ZOHO GLOBAL BOTTOM UTILITY DOCK BAR (Photos 2 & 3) ---------------- */}
      <footer className={`zoho-bottom-dock-bar ${collapsed ? 'collapsed' : ''}`}>
        <div className="dock-icons-cluster">
          {!collapsed ? (
            <>
              {/* Feeds / Screen */}
              <button type="button" className="dock-utility-btn" title="Feeds">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
              </button>

              {/* Signals / Trends */}
              <button type="button" className="dock-utility-btn" title="Signals & Trends">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
              </button>

              {/* Refresh / Sync */}
              <button type="button" className="dock-utility-btn" title="Sync Data" onClick={fetchReminders}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              </button>

              {/* Activity Reminders Alarm Clock Button (Photo 2 & 3) */}
              <button
                type="button"
                className={`dock-utility-btn ${isOpen ? 'active' : ''}`}
                title="Activity Reminders"
                onClick={() => setIsOpen(v => !v)}
              >
                <AlarmClockIcon size={16} color={reminderCount > 0 ? '#de350b' : '#5e6c84'} />
                {reminderCount > 0 && (
                  <span className="dock-reminders-badge">{reminderCount}</span>
                )}
              </button>

              {/* Recent Items / Clock */}
              <button type="button" className="dock-utility-btn" title="Recent Items">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              </button>

              {/* Help Button */}
              <button type="button" className="dock-help-btn" title="Help & Support" onClick={() => showToast('Zorvixe Technologies Help & Knowledgebase — press Ctrl+J for ZORVI AI support.', 'info', 'Help')}>
                <span>?</span> Help
              </button>
            </>
          ) : (
            <>
              {/* Collapsed State: Essential Icons Only */}
              <button
                type="button"
                className={`dock-utility-btn ${isOpen ? 'active' : ''}`}
                title="Activity Reminders"
                onClick={() => setIsOpen(v => !v)}
              >
                <AlarmClockIcon size={18} color={reminderCount > 0 ? '#de350b' : '#5e6c84'} />
                {reminderCount > 0 && (
                  <span className="dock-reminders-badge">{reminderCount}</span>
                )}
              </button>

              <button type="button" className="dock-utility-btn" title="Sync Data" onClick={fetchReminders}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              </button>

              <button type="button" className="dock-utility-btn" title="Help" onClick={() => showToast('Zorvixe Technologies Help & Knowledgebase — press Ctrl+J for ZORVI AI support.', 'info', 'Help')}>
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>?</span>
              </button>
            </>
          )}
        </div>
      </footer>
    </>
  );
}
