import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  apiListCrmActivities,
  apiCreateCrmActivity,
  apiUpdateCrmActivity,
  apiDeleteCrmActivity
} from '../../api';
import RichTextEditor from '../../components/RichTextEditor';
import { renderSafeHtml, stripHtmlText } from '../../utils/safeHtml';
import {
  CalendarIcon,
  PhoneIcon,
  CheckSquareIcon,
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AlertCircleIcon,
  TrashIcon,
  ClockIcon,
  CheckIcon,
  SettingsIcon,
  ChevronDownIcon,
  BanIcon,
  PlusIcon,
  UploadIcon,
  DownloadIcon,
  XIcon
} from '../../components/CrmHrmsIcons';
import './ActivitiesCalendarTab.css';

const renderActivityIcon = (type, size = 12, color) => {
  const props = color ? { size, color } : { size };
  if (type === 'call') return <PhoneIcon {...props} />;
  if (type === 'meeting') return <CalendarIcon {...props} />;
  return <CheckSquareIcon {...props} />;
};

export default function ActivitiesCalendarTab({ onSelectActivity }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('month'); // 'day' | 'week' | 'month' | 'list'
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  // Filter types in sidebar
  const [filterTypes, setFilterTypes] = useState({
    meeting: true,
    call: true,
    task: true,
    overdue: true
  });
  const [sidebarSearch, setSidebarSearch] = useState('');

  // Dropdowns
  const [createDropdownOpen, setCreateDropdownOpen] = useState(false);
  const [optionsDropdownOpen, setOptionsDropdownOpen] = useState(false);
  const [cellQuickPopup, setCellQuickPopup] = useState(null); // { dateStr, top, left }

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('meeting'); // 'meeting' | 'call' | 'task'
  const [modalForm, setModalForm] = useState({
    title: '',
    type: 'meeting',
    due_date: new Date().toISOString().slice(0, 16),
    description: '',
    client_name: '',
    deal_title: ''
  });
  const [saving, setSaving] = useState(false);
  const [viewDetailAct, setViewDetailAct] = useState(null);

  // Live time for Day view
  const [liveTime, setLiveTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Fetch activities
  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListCrmActivities();
      setActivities(res.activities || []);
    } catch (err) {
      console.error('Failed to load CRM activities:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  // Close popups on click outside
  useEffect(() => {
    const handleGlobalClick = () => {
      setCreateDropdownOpen(false);
      setOptionsDropdownOpen(false);
      setCellQuickPopup(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Filtered activities
  const filteredActivities = useMemo(() => {
    return activities.filter(act => {
      const type = act.type || 'task';
      if (!filterTypes[type]) return false;
      if (sidebarSearch.trim()) {
        const q = sidebarSearch.toLowerCase();
        const matchTitle = act.title?.toLowerCase().includes(q);
        const matchDesc = act.description?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc) return false;
      }
      return true;
    });
  }, [activities, filterTypes, sidebarSearch]);

  // Overdue activities list
  const overdueActivities = useMemo(() => {
    const now = new Date();
    return filteredActivities.filter(a => !a.completed && a.due_date && new Date(a.due_date) < now);
  }, [filteredActivities]);

  // Date Navigation Helpers
  const handleNavPrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else if (viewMode === 'day') d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNavNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else if (viewMode === 'day') d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const handleJumpToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDay(now);
  };

  // Header Title Formatting
  const getHeaderTitle = () => {
    if (viewMode === 'month') {
      return currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay() || 7;
      startOfWeek.setDate(startOfWeek.getDate() - day + 1);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      return `${startOfWeek.getDate()} ${startOfWeek.toLocaleString('en-US', { month: 'short' })} ${startOfWeek.getFullYear()} - ${endOfWeek.getDate()} ${endOfWeek.toLocaleString('en-US', { month: 'short' })} ${endOfWeek.getFullYear()}`;
    }
    if (viewMode === 'day') {
      return `${currentDate.getDate()} ${currentDate.toLocaleString('en-US', { month: 'short' })} ${currentDate.getFullYear()} ${currentDate.toLocaleString('en-US', { weekday: 'long' })}`;
    }
    return 'Cadence & Engagements';
  };

  // Mini Calendar Generation
  const miniCalDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Mon = 0
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const cells = [];
    // Prev month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({ day: prevMonthTotalDays - i, isOtherMonth: true });
    }
    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
      const isSelected = selectedDay.toDateString() === new Date(year, month, d).toDateString();
      cells.push({ day: d, isOtherMonth: false, isToday, isSelected });
    }
    // Next month padding
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ day: i, isOtherMonth: true });
    }
    return cells;
  }, [currentDate, selectedDay]);

  // Month View Calendar Cells
  const monthCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = (firstDay.getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells = [];
    // Previous Month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dNum = prevMonthDays - i;
      const dObj = new Date(year, month - 1, dNum);
      cells.push({
        dayNum: dNum,
        dateStr: dObj.toISOString().slice(0, 10),
        isOtherMonth: true,
        events: []
      });
    }
    // Current Month days
    for (let d = 1; d <= totalDays; d++) {
      const dObj = new Date(year, month, d);
      const dateStr = dObj.toISOString().slice(0, 10);
      const isToday = new Date().toDateString() === dObj.toDateString();
      const dayEvents = filteredActivities.filter(a => a.due_date && a.due_date.startsWith(dateStr));
      cells.push({
        dayNum: d,
        dateStr,
        isOtherMonth: false,
        isToday,
        events: dayEvents
      });
    }
    // Next month padding
    const remainder = 35 - cells.length > 0 ? 35 - cells.length : 42 - cells.length;
    for (let i = 1; i <= remainder; i++) {
      const dObj = new Date(year, month + 1, i);
      cells.push({
        dayNum: i,
        dateStr: dObj.toISOString().slice(0, 10),
        isOtherMonth: true,
        events: []
      });
    }
    return cells;
  }, [currentDate, filteredActivities]);

  // Week View Columns
  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleString('en-US', { weekday: 'short' }).toUpperCase();
      const isToday = new Date().toDateString() === d.toDateString();
      const dayEvents = filteredActivities.filter(a => a.due_date && a.due_date.startsWith(dateStr));
      days.push({
        dayName,
        dayNum: d.getDate(),
        dateStr,
        isToday,
        events: dayEvents
      });
    }
    return days;
  }, [currentDate, filteredActivities]);

  // Day View Hours & Events
  const dayEventsList = useMemo(() => {
    const targetStr = currentDate.toISOString().slice(0, 10);
    return filteredActivities.filter(a => a.due_date && a.due_date.startsWith(targetStr));
  }, [currentDate, filteredActivities]);

  // Hours: 08:00 AM to 11:00 PM
  const hoursList = [
    { label: '08:00 AM', hour24: 8 },
    { label: '09:00 AM', hour24: 9 },
    { label: '10:00 AM', hour24: 10 },
    { label: '11:00 AM', hour24: 11 },
    { label: '12:00 PM', hour24: 12 },
    { label: '01:00 PM', hour24: 13 },
    { label: '02:00 PM', hour24: 14 },
    { label: '03:00 PM', hour24: 15 },
    { label: '04:00 PM', hour24: 16 },
    { label: '05:00 PM', hour24: 17 },
    { label: '06:00 PM', hour24: 18 },
    { label: '07:00 PM', hour24: 19 },
    { label: '08:00 PM', hour24: 20 },
    { label: '09:00 PM', hour24: 21 },
    { label: '10:00 PM', hour24: 22 },
    { label: '11:00 PM', hour24: 23 }
  ];

  // Open modal prefilled with date and type
  const handleOpenCreateModal = (type = 'meeting', datePrefill = null) => {
    setModalType(type);
    const dateObj = datePrefill ? new Date(datePrefill) : new Date(currentDate);
    dateObj.setHours(new Date().getHours() + 1, 0, 0, 0);
    setModalForm({
      title: '',
      type,
      due_date: dateObj.toISOString().slice(0, 16),
      description: '',
      client_name: '',
      deal_title: ''
    });
    setShowModal(true);
  };

  // Submit modal form
  const handleSaveActivity = async (e) => {
    e.preventDefault();
    if (!modalForm.title.trim()) return;
    setSaving(true);
    try {
      await apiCreateCrmActivity(modalForm);
      setShowModal(false);
      loadActivities();
    } catch (err) {
      console.error('Failed to create activity:', err);
    } finally {
      setSaving(false);
    }
  };

  // Toggle complete
  const handleToggleComplete = async (act) => {
    try {
      await apiUpdateCrmActivity(act.id, { completed: !act.completed });
      setActivities(prev =>
        prev.map(a => (a.id === act.id ? { ...a, completed: !a.completed } : a))
      );
    } catch (err) {
      console.error('Failed to toggle activity completion:', err);
    }
  };

  // Delete activity
  const handleDeleteActivity = async (id) => {
    if (!window.confirm('Are you sure you want to delete this activity?')) return;
    try {
      await apiDeleteCrmActivity(id);
      setActivities(prev => prev.filter(a => a.id !== id));
      setViewDetailAct(null);
    } catch (err) {
      console.error('Failed to delete activity:', err);
    }
  };

  // Format Time Range e.g. "08:51 PM to 09:51 PM"
  const formatTimeRange = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const startStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const end = new Date(d.getTime() + 60 * 60 * 1000);
    const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${startStr} to ${endStr}`;
  };

  return (
    <div className="activities-calendar-container">
      {/* ---------------- LEFT CALENDAR SIDEBAR (Photo 4) ---------------- */}
      <aside className="cal-sidebar">
        <h3 className="cal-sidebar-title">
          <CalendarIcon size={18} color="#38bdf8" />
          <span>Calendar</span>
        </h3>

        <div className="cal-sidebar-search">
          <SearchIcon size={14} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search activities..."
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
          />
        </div>

        <div className="cal-my-cal-label">
          <CalendarIcon size={14} color="#38bdf8" />
          <span>My Calendar</span>
        </div>

        {/* Mini Month Calendar Widget (Photo 4) */}
        <div className="mini-cal-card">
          <div className="mini-cal-header">
            <span className="mini-cal-month-title">
              {currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className="mini-cal-nav-btn"
                onClick={handleNavPrev}
                title="Previous month"
              >
                <ChevronLeftIcon size={14} />
              </button>
              <button
                type="button"
                className="mini-cal-nav-btn"
                onClick={handleNavNext}
                title="Next month"
              >
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>

          <div className="mini-cal-grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
              <span key={idx} className="mini-cal-day-header">{day}</span>
            ))}
            {miniCalDays.map((c, idx) => (
              <button
                key={idx}
                type="button"
                className={`mini-cal-cell ${c.isOtherMonth ? 'other-month' : ''} ${c.isToday ? 'today' : ''} ${c.isSelected ? 'selected' : ''}`}
                onClick={() => {
                  const target = new Date(currentDate.getFullYear(), currentDate.getMonth(), c.day);
                  setSelectedDay(target);
                  setCurrentDate(target);
                }}
              >
                {c.day}
              </button>
            ))}
          </div>
        </div>

        {/* Activity Category Filters in Sidebar */}
        <div className="cal-filters-group">
          <label className="cal-filter-item">
            <input
              type="checkbox"
              checked={filterTypes.meeting}
              onChange={(e) => setFilterTypes(prev => ({ ...prev, meeting: e.target.checked }))}
            />
            <span className="cal-filter-dot meeting"></span>
            <span>My Meetings</span>
          </label>

          <label className="cal-filter-item">
            <input
              type="checkbox"
              checked={filterTypes.call}
              onChange={(e) => setFilterTypes(prev => ({ ...prev, call: e.target.checked }))}
            />
            <span className="cal-filter-dot call"></span>
            <span>My Calls</span>
          </label>

          <label className="cal-filter-item">
            <input
              type="checkbox"
              checked={filterTypes.task}
              onChange={(e) => setFilterTypes(prev => ({ ...prev, task: e.target.checked }))}
            />
            <span className="cal-filter-dot task"></span>
            <span>My Tasks</span>
          </label>

          <label className="cal-filter-item">
            <input
              type="checkbox"
              checked={filterTypes.overdue}
              onChange={(e) => setFilterTypes(prev => ({ ...prev, overdue: e.target.checked }))}
            />
            <span className="cal-filter-dot overdue"></span>
            <span>Overdue ({overdueActivities.length})</span>
          </label>
        </div>
      </aside>

      {/* ---------------- MAIN CALENDAR VIEWSPACE ---------------- */}
      <main className="cal-main">
        {/* Top Header Bar (Photos 1, 4, 6, 7) */}
        <div className="cal-header-bar">
          <div className="cal-header-left">
            <h3 className="cal-header-title">My Calendar</h3>

            <div className="cal-date-nav-wrap">
              <button type="button" className="cal-nav-arrow-btn" onClick={handleNavPrev} title="Previous">
                <ChevronLeftIcon size={14} />
              </button>
              <button type="button" className="cal-nav-arrow-btn" onClick={handleNavNext} title="Next">
                <ChevronRightIcon size={14} />
              </button>
              <button type="button" className="cal-btn-today" onClick={handleJumpToday}>
                Today
              </button>
              <span className="cal-current-label">
                <CalendarIcon size={15} color="#0052cc" />
                {getHeaderTitle()}
              </span>
            </div>
          </div>

          {/* View Mode Pills: Day, Week, Month, List (Photos 1, 4, 6, 7) */}
          <div className="cal-view-pills">
            <button
              type="button"
              className={`cal-view-pill-btn ${viewMode === 'day' ? 'active' : ''}`}
              onClick={() => setViewMode('day')}
            >
              Day
            </button>
            <button
              type="button"
              className={`cal-view-pill-btn ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
            <button
              type="button"
              className={`cal-view-pill-btn ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
            >
              Month
            </button>
            <button
              type="button"
              className={`cal-view-pill-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
          </div>

          {/* Action Buttons: Create ▾ & Options ▾ (Photos 1 & 4) */}
          <div className="cal-header-actions">
            {/* Create Dropdown (Photo 4) */}
            <div className="cal-dropdown-anchor" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="cal-btn-create"
                onClick={() => {
                  setCreateDropdownOpen(v => !v);
                  setOptionsDropdownOpen(false);
                }}
              >
                <PlusIcon size={14} />
                <span>Create</span>
                <ChevronDownIcon size={13} />
              </button>

              {createDropdownOpen && (
                <div className="cal-popup-menu">
                  <button
                    type="button"
                    className="cal-menu-item"
                    onClick={() => {
                      setCreateDropdownOpen(false);
                      handleOpenCreateModal('meeting');
                    }}
                  >
                    <CalendarIcon size={14} color="#d97706" />
                    <span>Meeting</span>
                  </button>
                  <button
                    type="button"
                    className="cal-menu-item"
                    onClick={() => {
                      setCreateDropdownOpen(false);
                      handleOpenCreateModal('call');
                    }}
                  >
                    <PhoneIcon size={14} color="#0052cc" />
                    <span>Call</span>
                  </button>
                  <button
                    type="button"
                    className="cal-menu-item"
                    onClick={() => {
                      setCreateDropdownOpen(false);
                      handleOpenCreateModal('task');
                    }}
                  >
                    <CheckSquareIcon size={14} color="#00875a" />
                    <span>Task</span>
                  </button>
                  <button
                    type="button"
                    className="cal-menu-item"
                    onClick={() => {
                      setCreateDropdownOpen(false);
                      alert('Marked as unavailable for this timeslot.');
                    }}
                  >
                    <BanIcon size={14} color="#de350b" />
                    <span>Mark As Unavailable</span>
                  </button>
                </div>
              )}
            </div>

            {/* Options Dropdown (Photo 1) */}
            <div className="cal-dropdown-anchor" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="cal-btn-options"
                onClick={() => {
                  setOptionsDropdownOpen(v => !v);
                  setCreateDropdownOpen(false);
                }}
              >
                <SettingsIcon size={14} />
                <span>Options</span>
                <ChevronDownIcon size={13} />
              </button>

              {optionsDropdownOpen && (
                <div className="cal-popup-menu">
                  <button type="button" className="cal-menu-item" onClick={() => { setOptionsDropdownOpen(false); alert('Import calendar events'); }}>
                    <UploadIcon size={14} />
                    <span>Import</span>
                  </button>
                  <button type="button" className="cal-menu-item" onClick={() => { setOptionsDropdownOpen(false); alert('Export calendar to .ics file'); }}>
                    <DownloadIcon size={14} />
                    <span>Export</span>
                  </button>
                  <button type="button" className="cal-menu-item" onClick={() => { setOptionsDropdownOpen(false); alert('Calendar Preferences'); }}>
                    <SettingsIcon size={14} />
                    <span>Preferences</span>
                  </button>
                  <button type="button" className="cal-menu-item" onClick={() => { setOptionsDropdownOpen(false); alert('Calendar Booking Links configured'); }}>
                    <CalendarIcon size={14} />
                    <span>Calendar Booking</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---------------- VIEW 1: MONTH VIEW (Photos 1, 4, 5) ---------------- */}
        {viewMode === 'month' && (
          <div className="cal-month-grid">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((dName, i) => (
              <div key={dName} className={`cal-month-col-header ${i >= 5 ? 'weekend' : ''}`}>
                {dName}
              </div>
            ))}

            {monthCells.map((c, idx) => (
              <div
                key={idx}
                className={`cal-month-cell ${c.isOtherMonth ? 'other-month' : ''} ${c.isToday ? 'today' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCellQuickPopup({
                    dateStr: c.dateStr,
                    dayNum: c.dayNum
                  });
                }}
              >
                <span className="cal-cell-day-num">{c.dayNum}</span>

                {/* Event Pills on Day Cell */}
                {c.events.slice(0, 3).map((act) => (
                  <div
                    key={act.id}
                    className={`cal-event-pill ${act.type || 'task'} ${act.completed ? 'completed' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewDetailAct(act);
                    }}
                    title={`${act.type?.toUpperCase()}: ${act.title}`}
                  >
                    {act.type === 'call' && <PhoneIcon size={11} />}
                    {act.type === 'meeting' && <CalendarIcon size={11} />}
                    {act.type === 'task' && <CheckSquareIcon size={11} />}
                    <span>{act.title}</span>
                  </div>
                ))}
                {c.events.length > 3 && (
                  <span style={{ fontSize: '10px', color: '#0052cc', fontWeight: 600 }}>
                    +{c.events.length - 3} more
                  </span>
                )}

                {/* Quick Popup on Cell Click (Photo 5) */}
                {cellQuickPopup && cellQuickPopup.dateStr === c.dateStr && (
                  <div className="cal-cell-quick-popup" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="cal-menu-item"
                      onClick={() => {
                        setCellQuickPopup(null);
                        handleOpenCreateModal('meeting', c.dateStr);
                      }}
                    >
                      <CalendarIcon size={14} color="#d97706" />
                      <span>New Meeting</span>
                    </button>
                    <button
                      type="button"
                      className="cal-menu-item"
                      onClick={() => {
                        setCellQuickPopup(null);
                        handleOpenCreateModal('call', c.dateStr);
                      }}
                    >
                      <PhoneIcon size={14} color="#0052cc" />
                      <span>New Call</span>
                    </button>
                    <button
                      type="button"
                      className="cal-menu-item"
                      onClick={() => {
                        setCellQuickPopup(null);
                        alert(`Marked as unavailable on ${c.dateStr}`);
                      }}
                    >
                      <BanIcon size={14} color="#de350b" />
                      <span>Mark As Unavailable</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ---------------- VIEW 2: WEEK VIEW (Photo 6) ---------------- */}
        {viewMode === 'week' && (
          <div className="cal-week-view">
            <div className="cal-week-header-row">
              <div className="cal-week-header-cell" style={{ color: '#6b778c' }}>Time</div>
              {weekDays.map((wd, i) => (
                <div key={i} className={`cal-week-header-cell ${wd.isToday ? 'today' : ''}`}>
                  {wd.dayName} {wd.dayNum}
                </div>
              ))}
            </div>

            {/* All-Day Events Row in Week View (Photo 6) */}
            <div className="cal-allday-row">
              <div className="cal-allday-label-box">
                All-Day ({overdueActivities.length + 1})
              </div>
              {weekDays.map((wd, i) => (
                <div key={i} className="cal-allday-cell">
                  {wd.isToday && overdueActivities.length > 0 && (
                    <span className="cal-event-pill overdue">
                      <AlertCircleIcon size={11} /> Overdue Activities ({overdueActivities.length})
                    </span>
                  )}
                  {wd.events.filter(e => !e.due_date?.includes('T')).map(act => (
                    <span key={act.id} className="cal-event-pill meeting">
                      <CalendarIcon size={11} /> {act.title}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            {/* Hourly Grid for Week */}
            <div className="cal-hourly-grid">
              {hoursList.map(h => (
                <React.Fragment key={h.hour24}>
                  <div className="cal-hour-label">{h.label}</div>
                  {weekDays.map((wd, dayIdx) => {
                    const slotEvents = wd.events.filter(e => {
                      if (!e.due_date) return false;
                      const d = new Date(e.due_date);
                      return d.getHours() === h.hour24;
                    });
                    return (
                      <div
                        key={dayIdx}
                        className="cal-hour-slot"
                        onClick={() => handleOpenCreateModal('meeting', `${wd.dateStr}T${String(h.hour24).padStart(2, '0')}:00`)}
                      >
                        {slotEvents.map(act => (
                          <div
                            key={act.id}
                            className={`cal-event-pill ${act.type || 'meeting'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewDetailAct(act);
                            }}
                          >
                            {renderActivityIcon(act.type, 11)}
                            <span>{act.title}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* ---------------- VIEW 3: DAY VIEW (Photo 7) ---------------- */}
        {viewMode === 'day' && (
          <div className="cal-day-view">
            {/* Top Banners (Photo 7) */}
            <div className="cal-day-top-alerts">
              {overdueActivities.length > 0 && (
                <div className="cal-overdue-banner">
                  <AlertCircleIcon size={16} />
                  <span>Overdue Activities ({overdueActivities.length})</span>
                </div>
              )}
              {dayEventsList.length > 0 && (
                <div className="cal-allday-banner">
                  <CalendarIcon size={15} />
                  <span>Scheduled Engagements ({dayEventsList.length})</span>
                </div>
              )}
            </div>

            {/* Day Hourly Grid */}
            <div className="cal-day-grid">
              {hoursList.map(h => {
                const isCurrentHour = liveTime.getHours() === h.hour24;
                const slotEvents = dayEventsList.filter(e => {
                  if (!e.due_date) return false;
                  const d = new Date(e.due_date);
                  return d.getHours() === h.hour24;
                });

                return (
                  <React.Fragment key={h.hour24}>
                    <div className="cal-day-hour-label">{h.label}</div>
                    <div
                      className="cal-day-hour-slot"
                      onClick={() => handleOpenCreateModal('meeting', `${currentDate.toISOString().slice(0, 10)}T${String(h.hour24).padStart(2, '0')}:00`)}
                    >
                      {/* Live Current Time Red Indicator Line (Photo 7) */}
                      {isCurrentHour && (
                        <div
                          className="cal-live-time-indicator"
                          style={{ top: `${(liveTime.getMinutes() / 60) * 100}%` }}
                        >
                          <span className="cal-live-time-badge">
                            {liveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}

                      {/* Event Cards in Day View (Photo 7) */}
                      {slotEvents.map(act => (
                        <div
                          key={act.id}
                          className={`cal-day-card ${act.type || 'meeting'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewDetailAct(act);
                          }}
                        >
                          {act.type === 'call' && <PhoneIcon size={16} color="#0052cc" />}
                          {act.type === 'meeting' && <CalendarIcon size={16} color="#ffab00" />}
                          {act.type === 'task' && <CheckSquareIcon size={16} color="#00875a" />}
                          <div>
                            <span className="cal-day-card-title">{act.title}</span>
                            <span className="cal-day-card-time" style={{ marginLeft: '8px' }}>
                              {formatTimeRange(act.due_date)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------------- VIEW 4: LIST VIEW ---------------- */}
        {viewMode === 'list' && (
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h4 style={{ margin: 0, color: '#172b4d' }}>All Client Engagements & Cadence ({filteredActivities.length})</h4>
              <button
                type="button"
                className="cal-btn-create"
                onClick={() => handleOpenCreateModal('task')}
              >
                <PlusIcon size={14} />
                <span>Log Engagement</span>
              </button>
            </div>

            {loading ? (
              <div className="loader_container">
                <p className="loader_spinner"></p>
                <p>Loading Activities...</p>
              </div>
            ) : filteredActivities.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#5e6c84', background: '#fafbfc', borderRadius: '8px' }}>
                No scheduled activities found. Click <strong>Create</strong> above to add a meeting, call, or task!
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f4f5f7', borderBottom: '1px solid #dfe1e6', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', width: '40px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}><CheckIcon size={14} /></span>
                    </th>
                    <th style={{ padding: '10px 12px', width: '80px' }}>Type</th>
                    <th style={{ padding: '10px 12px' }}>Subject / Activity</th>
                    <th style={{ padding: '10px 12px' }}>Scheduled Date & Time</th>
                    <th style={{ padding: '10px 12px' }}>Related Deal / Client</th>
                    <th style={{ padding: '10px 12px', width: '80px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map(act => (
                    <tr key={act.id} style={{ borderBottom: '1px solid #ebecf0' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(act.completed)}
                          onChange={() => handleToggleComplete(act)}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`cal-event-pill ${act.type || 'task'}`} style={{ display: 'inline-flex' }}>
                          {renderActivityIcon(act.type, 11)}
                          <span>{act.type?.toUpperCase()}</span>
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <strong
                          style={{
                            cursor: 'pointer',
                            color: act.completed ? '#6b778c' : '#0052cc',
                            textDecoration: act.completed ? 'line-through' : 'none'
                          }}
                          onClick={() => setViewDetailAct(act)}
                        >
                          {act.title}
                        </strong>
                        {act.description && <div style={{ fontSize: '11px', color: '#5e6c84' }}>{stripHtmlText(act.description)}</div>}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#42526e' }}>
                        {act.due_date ? new Date(act.due_date).toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#42526e' }}>
                        {act.client_name || act.deal_title || 'General Account'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: '#bf2600', cursor: 'pointer' }}
                          onClick={() => handleDeleteActivity(act.id)}
                          title="Delete activity"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {/* ---------------- CREATE / LOG ACTIVITY MODAL ---------------- */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(9, 30, 66, 0.54)',
            zIndex: 10010,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              width: '460px',
              maxWidth: '100%',
              boxShadow: '0 12px 36px rgba(9, 30, 66, 0.25)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #dfe1e6',
                background: '#fafbfc'
              }}
            >
              <h4 style={{ margin: 0, color: '#172b4d', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {renderActivityIcon(modalType, 16, modalType === 'meeting' ? '#d97706' : modalType === 'call' ? '#0052cc' : '#00875a')}
                <span>{modalType === 'meeting' ? 'Schedule New Meeting' : modalType === 'call' ? 'Log Phone Call' : 'Create New Task'}</span>
              </h4>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e6c84', display: 'inline-flex', alignItems: 'center', padding: '4px' }}
                onClick={() => setShowModal(false)}
                aria-label="Close"
              >
                <XIcon size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveActivity} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#172b4d', marginBottom: '4px' }}>
                  {modalType === 'meeting' ? 'Meeting Title / Subject *' : modalType === 'call' ? 'Call Subject / Purpose *' : 'Task Subject *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={modalType === 'meeting' ? 'e.g. CRM Product Webinar / Discovery Call' : modalType === 'call' ? 'e.g. Follow up with Lead' : 'e.g. Review Quote Proposal'}
                  value={modalForm.title}
                  onChange={(e) => setModalForm(prev => ({ ...prev, title: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#172b4d', marginBottom: '4px' }}>
                  Date & Scheduled Time *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={modalForm.due_date}
                  onChange={(e) => setModalForm(prev => ({ ...prev, due_date: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#172b4d', marginBottom: '4px' }}>
                  Related Client / Deal
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp / Enterprise Expansion Deal"
                  value={modalForm.client_name}
                  onChange={(e) => setModalForm(prev => ({ ...prev, client_name: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#172b4d', marginBottom: '4px' }}>
                  Agenda / Description / Notes
                </label>
                <RichTextEditor
                  value={modalForm.description}
                  placeholder="Key discussion points, dialing notes or follow-up commitments..."
                  minHeight="100px"
                  aiFieldLabel="Agenda / Description / Notes"
                  onChange={(content) => setModalForm(prev => ({ ...prev, description: content }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  style={{ padding: '8px 16px', border: '1px solid #dfe1e6', borderRadius: '4px', background: '#ffffff', cursor: 'pointer', fontSize: '13px' }}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', background: '#0052cc', color: '#ffffff', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
                >
                  {saving ? 'Saving...' : 'Save Activity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- ACTIVITY DETAILS VIEW MODAL ---------------- */}
      {viewDetailAct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(9, 30, 66, 0.54)',
            zIndex: 10010,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setViewDetailAct(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              width: '420px',
              boxShadow: '0 12px 36px rgba(9, 30, 66, 0.25)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #dfe1e6', background: '#fafbfc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={`cal-event-pill ${viewDetailAct.type || 'task'}`} style={{ display: 'inline-flex' }}>
                {renderActivityIcon(viewDetailAct.type, 12)}
                <span>{viewDetailAct.type?.toUpperCase()}</span>
              </span>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e6c84', display: 'inline-flex', alignItems: 'center', padding: '4px' }}
                onClick={() => setViewDetailAct(null)}
                aria-label="Close"
              >
                <XIcon size={16} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ margin: 0, color: '#172b4d', fontSize: '16px' }}>{viewDetailAct.title}</h4>
              <div style={{ fontSize: '13px', color: '#5e6c84' }}>
                <strong>Scheduled:</strong> {viewDetailAct.due_date ? new Date(viewDetailAct.due_date).toLocaleString() : 'Not scheduled'}
              </div>
              <div style={{ fontSize: '13px', color: '#5e6c84', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <strong>Status:</strong>
                {viewDetailAct.completed ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#00875a', fontWeight: 600 }}>
                    <CheckIcon size={14} /> Completed
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#d97706', fontWeight: 600 }}>
                    <ClockIcon size={14} /> Pending / Open
                  </span>
                )}
              </div>
              {viewDetailAct.description && (
                <div
                  style={{ background: '#f4f5f7', padding: '10px', borderRadius: '4px', fontSize: '12px', color: '#172b4d' }}
                  dangerouslySetInnerHTML={{ __html: renderSafeHtml(viewDetailAct.description) }}
                />
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                <button
                  type="button"
                  style={{ padding: '6px 12px', border: '1px solid #dfe1e6', borderRadius: '4px', background: '#ffffff', color: '#bf2600', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => handleDeleteActivity(viewDetailAct.id)}
                >
                  <TrashIcon size={13} />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  style={{
                    padding: '6px 14px',
                    border: 'none',
                    borderRadius: '4px',
                    background: viewDetailAct.completed ? '#42526e' : '#00875a',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onClick={() => {
                    handleToggleComplete(viewDetailAct);
                    setViewDetailAct(prev => ({ ...prev, completed: !prev.completed }));
                  }}
                >
                  {viewDetailAct.completed ? (
                    'Mark as Incomplete'
                  ) : (
                    <>
                      <CheckIcon size={14} />
                      <span>Mark Completed</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
