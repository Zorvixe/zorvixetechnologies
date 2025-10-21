import React, { useState, useEffect, useCallback } from 'react';
import { apiGetAllLeaves, apiUpdateLeaveStatus, apiCarryForwardLeaves } from '../../api';
import './LeaveAdmin.css';

const LeaveAdmin = () => {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [carryForwardLoading, setCarryForwardLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    status: 'all',
    department: 'all',
    year: new Date().getFullYear()
  });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0
  });
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [actionDialog, setActionDialog] = useState(false);
  const [actionType, setActionType] = useState('');
  const [comments, setComments] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });

  const departments = ['IT', 'HR', 'Finance', 'Marketing', 'Operations', 'Sales', 'Development'];

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiGetAllLeaves({
        ...filters,
        page: pagination.page,
        limit: 10
      });
      if (response.success) {
        setLeaves(response.leaves);
        setPagination({
          page: response.pagination.page,
          totalPages: response.pagination.totalPages,
          total: response.pagination.total
        });
        calculateStats(response.leaves);
      } else {
        setError('Failed to fetch leaves');
      }
    } catch (err) {
      console.error(err);
      setError('Error fetching leaves');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  const calculateStats = (leavesData) => {
    const statsData = {
      total: leavesData.length,
      pending: leavesData.filter(l => l.status === 'pending').length,
      approved: leavesData.filter(l => l.status === 'approved').length,
      rejected: leavesData.filter(l => l.status === 'rejected').length
    };
    setStats(statsData);
  };


  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const getLeaveTypeText = (type) => type.charAt(0).toUpperCase() + type.slice(1) + ' Leave';

  const getStatusText = (status) => status.charAt(0).toUpperCase() + status.slice(1);

  const handleAction = (leave, type) => {
    setSelectedLeave(leave);
    setActionType(type);
    setActionDialog(true);
    setComments('');
  };

  const submitAction = async () => {
    try {
      const response = await apiUpdateLeaveStatus(selectedLeave.id, {
        status: actionType,
        comments
      });
      if (response.success) {
        setMessage({ type: 'success', text: `Leave ${actionType} successfully` });
        setActionDialog(false);
        fetchLeaves();
      } else {
        setMessage({ type: 'error', text: response.message });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to update leave status' });
    }
  };

  const handleCarryForward = async () => {
    if (!window.confirm('Are you sure you want to carry forward leaves?')) return;
    try {
      setCarryForwardLoading(true);
      const response = await apiCarryForwardLeaves();
      if (response.success) setMessage({ type: 'success', text: response.message });
      else setMessage({ type: 'error', text: response.message });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to carry forward leaves' });
    } finally {
      setCarryForwardLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Employee', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Total Days', 'Status', 'Approver', 'Applied On'];
    const csvData = leaves.map(l => [
      l.employee_name, l.employee_department || 'N/A', getLeaveTypeText(l.leave_type),
      formatDate(l.start_date), formatDate(l.end_date), l.total_days, getStatusText(l.status),
      l.approver_name, formatDate(l.applied_on)
    ]);
    const csvContent = [headers.join(','), ...csvData.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leaves-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="leave-admin-container-LeaveAdmin">
      {message.text && <div className={`message-LeaveAdmin ${message.type}`}>{message.text}</div>}
      {error && <div className="message-LeaveAdmin error">{error}</div>}

      {/* Stats Cards */}
      <div className="stats-cards-LeaveAdmin">
        {['total','pending','approved','rejected'].map(stat => (
          <div key={stat} className={`stat-card-LeaveAdmin ${stat}`}>
            <h3>{stats[stat]}</h3>
            <p>{stat.charAt(0).toUpperCase() + stat.slice(1)}</p>
          </div>
        ))}
      </div>

      {/* Admin Actions */}
      <div className="admin-actions-LeaveAdmin">
        <button onClick={exportToCSV} disabled={leaves.length === 0}>Export CSV</button>
        <button onClick={handleCarryForward} disabled={carryForwardLoading}>
          {carryForwardLoading ? 'Processing...' : 'Carry Forward Leaves'}
        </button>
      </div>

      {/* Filters */}
      <div className="filters-LeaveAdmin">
        <select value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}>
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={filters.department} onChange={e => setFilters(prev => ({ ...prev, department: e.target.value }))}>
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filters.year} onChange={e => setFilters(prev => ({ ...prev, year: e.target.value }))}>
          {[2023,2024,2025].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Leaves Table */}
      {loading ?  <div className="loading-box-LeaveHistory">
          <div className="spinner-LeaveHistory"></div>
          <p>Loading Leaves...</p>
        </div> : (
        <table className="leaves-table-LeaveAdmin">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Leave Type</th>
              <th>Period</th>
              <th>Total Days</th>
              <th>Approver</th>
              <th>Applied On</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leaves.length === 0 ? <tr><td colSpan="9">No leaves found</td></tr> :
              leaves.map(leave => (
                <tr key={leave.id}>
                  <td>{leave.employee_name}<br/><small>{leave.employee_email}</small></td>
                  <td>{leave.employee_department || 'N/A'}</td>
                  <td>{getLeaveTypeText(leave.leave_type)}</td>
                  <td>{formatDate(leave.start_date)} - {formatDate(leave.end_date)}</td>
                  <td>{leave.total_days}</td>
                  <td>{leave.approver_name}<br/><small>{leave.approver_email}</small></td>
                  <td>{formatDate(leave.applied_on)}</td>
                  <td>{getStatusText(leave.status)}</td>
                  <td>
                    {leave.status === 'pending' && (
                      <div className='row'>
                        <button onClick={() => handleAction(leave,'approved')} className="approve-btn-LeaveAdmin">✓</button>
                        <button onClick={() => handleAction(leave,'rejected')} className="reject-btn-LeaveAdmin">✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      )}

      {/* Action Modal */}
      {actionDialog && selectedLeave && (
        <div className="modal-LeaveAdmin">
          <div className="modal-content-LeaveAdmin">
            <h3>{actionType === 'approved' ? 'Approve' : 'Reject'} Leave</h3>
            <p><strong>Employee:</strong> {selectedLeave.employee_name}</p>
            <p><strong>Department:</strong> {selectedLeave.employee_department || 'N/A'}</p>
            <p><strong>Leave Type:</strong> {getLeaveTypeText(selectedLeave.leave_type)}</p>
            <p><strong>Period:</strong> {formatDate(selectedLeave.start_date)} - {formatDate(selectedLeave.end_date)}</p>
            <p><strong>Total Days:</strong> {selectedLeave.total_days}</p>
            <p><strong>Reason:</strong> {selectedLeave.reason}</p>
            <textarea placeholder="Add comments..." value={comments} onChange={e=>setComments(e.target.value)}></textarea>
            <div className="modal-actions-LeaveAdmin">
              <button onClick={()=>setActionDialog(false)}>Cancel</button>
              <button onClick={submitAction} className={actionType==='approved'?'approve-btn-LeaveAdmin':'reject-btn-LeaveAdmin'}>
                Confirm {actionType==='approved'?'Approval':'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveAdmin;