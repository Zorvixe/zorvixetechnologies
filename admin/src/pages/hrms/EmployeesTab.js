import React, { useState, useEffect, useCallback } from 'react';
import { apiListEmployees, apiGetEmployee, apiUpdateEmployee } from '../../api';
import { UserIcon, BuildingIcon, BankIcon, EditIcon } from '../../components/CrmHrmsIcons';
import { showToast } from '../../utils/toast';
import './EmployeesTab.css';

export default function EmployeesTab({ isAdmin, user }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Selected Employee for Detailed Drawer / Modal
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListEmployees({
        search,
        department: deptFilter,
        role: roleFilter
      });
      setEmployees(res.employees || []);
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setLoading(false);
    }
  }, [search, deptFilter, roleFilter]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const openEmployeeProfile = async (id) => {
    setSelectedEmpId(id);
    setIsEditing(false);
    setDetailsLoading(true);
    try {
      const res = await apiGetEmployee(id);
      setSelectedDetails(res.employee);
      setEditForm(res.employee || {});
    } catch (err) {
      showToast(err.message || 'Failed to load employee profile', 'error');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!selectedEmpId) return;
    setSaving(true);
    try {
      await apiUpdateEmployee(selectedEmpId, editForm);
      showToast('Employee records updated successfully', 'success');
      setIsEditing(false);
      const res = await apiGetEmployee(selectedEmpId);
      setSelectedDetails(res.employee);
      fetchEmployees();
    } catch (err) {
      showToast(err.message || 'Failed to save changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="employees-tab">
      {/* Top Controls: Search & Filter */}
      <div className="employees-filter-bar">
        <div className="emp-search-wrap">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, email, employee code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-dropdowns">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Departments</option>
            <option value="Engineering">Engineering</option>
            <option value="Design">Design</option>
            <option value="Product">Product</option>
            <option value="Marketing">Marketing</option>
            <option value="HR & Operations">HR & Operations</option>
          </select>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="employee">Employee</option>
          </select>
        </div>
      </div>

      {/* Directory Count */}
      <div className="directory-count-bar">
        <span>Showing <strong>{employees.length}</strong> employee records</span>
      </div>

      {/* Employee Cards Grid */}
      {loading ? (
        <div> <div className="loader_container">
          <p className="loader_spinner"></p>
          <p>Loading Please Wait...</p>
        </div>
        </div>
      ) : employees.length === 0 ? (
        <div className="empty-state">No matching employee records found.</div>
      ) : (
        <div className="employee-cards-grid">
          {employees.map((emp) => {
            const initials = (emp.name || 'U').slice(0, 2).toUpperCase();
            return (
              <div className="emp-card" key={emp.id} onClick={() => openEmployeeProfile(emp.id)}>
                <div className="emp-card-header">
                  <div className="emp-avatar-lg">{initials}</div>
                  <div className="emp-header-info">
                    <h4 className="emp-card-name">{emp.name}</h4>
                    <span className="emp-card-pos">{emp.position || 'Software Engineer'}</span>
                    <span className="emp-badge-code">{emp.employee_code || `ZOR-EMP-${emp.id}`}</span>
                  </div>
                </div>

                <div className="emp-card-body">
                  <div className="emp-info-row">
                    <span className="lbl">Department</span>
                    <span className="val">{emp.department || 'Engineering'}</span>
                  </div>
                  <div className="emp-info-row">
                    <span className="lbl">Email</span>
                    <span className="val email">{emp.email}</span>
                  </div>
                  <div className="emp-info-row">
                    <span className="lbl">Phone</span>
                    <span className="val">{emp.phone || 'N/A'}</span>
                  </div>
                  <div className="emp-info-row">
                    <span className="lbl">Type</span>
                    <span className="val capitalize">{emp.employment_type?.replace('_', ' ') || 'Full time'}</span>
                  </div>
                </div>

                <div className="emp-card-footer">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`emp-status-pill ${emp.is_active ? 'active' : 'inactive'}`}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {emp.is_active && (
                      <span
                        title={`Live Presence: ${emp.effective_status || 'Offline'}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '11px',
                          fontWeight: 600,
                          color:
                            emp.effective_status === 'Available' ? '#15803d' :
                            emp.effective_status === 'Away' ? '#b45309' :
                            emp.effective_status === 'Busy' || emp.effective_status === 'Do not disturb' ? '#b91c1c' :
                            '#64748b'
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background:
                              emp.effective_status === 'Available' ? '#36b37e' :
                              emp.effective_status === 'Away' ? '#ffab00' :
                              emp.effective_status === 'Busy' ? '#ff5630' :
                              emp.effective_status === 'Do not disturb' ? '#bf2600' :
                              '#94a3b8'
                          }}
                        />
                        {emp.effective_status || 'Offline'}
                      </span>
                    )}
                  </div>
                  <button className="btn-view-profile" onClick={(e) => { e.stopPropagation(); openEmployeeProfile(emp.id); }}>
                    Full Profile →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAILED PROFILE DRAWER / MODAL */}
      {selectedEmpId && (
        <div className="emp-modal-backdrop" onClick={() => setSelectedEmpId(null)}>
          <div className="emp-profile-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Employee Profile">
            <div className="emp-modal-header">
              <div className="profile-modal-title-box">
                <h4>{selectedDetails?.name || 'Employee Profile'}</h4>
                <span className="code-tag">{selectedDetails?.employee_code || `ZOR-EMP-${selectedEmpId}`}</span>
              </div>
              <div className="header-modal-actions">
                {isAdmin && !isEditing && (
                  <button type="button" className="btn-edit-mode" onClick={() => setIsEditing(true)}>
                    <EditIcon size={13} style={{ marginRight: 5 }} /> Edit Profile
                  </button>
                )}
                {isEditing && (
                  <button type="button" className="btn-cancel-edit" onClick={() => setIsEditing(false)}>
                    Cancel Edit
                  </button>
                )}
                <button type="button" className="emp-modal-close" onClick={() => setSelectedEmpId(null)} aria-label="Close">×</button>
              </div>
            </div>

            {detailsLoading ? (
              <div className="emp-modal-loading">Loading employee record details...</div>
            ) : selectedDetails ? (
              <form onSubmit={handleSaveProfile} className="profile-form-body">
                {/* Section 1: Personal Details */}
                <div className="profile-section-card">
                  <h5 className="section-subtitle"><UserIcon size={16} style={{ marginRight: '6px' }} /> Personal Information</h5>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        value={editForm.name || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Date of Birth</label>
                      <input
                        type="date"
                        value={editForm.dob ? new Date(editForm.dob).toISOString().slice(0, 10) : ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Gender</label>
                      <select
                        value={editForm.gender || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Blood Group</label>
                      <input
                        type="text"
                        placeholder="e.g. O+, B+"
                        value={editForm.blood_group || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, blood_group: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Contact Phone</label>
                      <input
                        type="text"
                        value={editForm.phone || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Residential Address</label>
                      <input
                        type="text"
                        placeholder="Current address"
                        value={editForm.address || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      />
                    </div>
                  </div>

                  <h6 className="emergency-title">Emergency Contact</h6>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>Contact Name</label>
                      <input
                        type="text"
                        value={editForm.emergency_contact_name || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, emergency_contact_name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Contact Phone</label>
                      <input
                        type="text"
                        value={editForm.emergency_contact_phone || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, emergency_contact_phone: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Relationship</label>
                      <input
                        type="text"
                        placeholder="Spouse / Parent / Sibling"
                        value={editForm.emergency_contact_relation || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, emergency_contact_relation: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Employment Details */}
                <div className="profile-section-card">
                  <h5 className="section-subtitle"><BuildingIcon size={16} style={{ marginRight: '6px' }} /> Employment Details</h5>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>Employee Code</label>
                      <input
                        type="text"
                        value={editForm.employee_code || ''}
                        disabled={!isEditing || !isAdmin}
                        onChange={(e) => setEditForm({ ...editForm, employee_code: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Department</label>
                      <input
                        type="text"
                        value={editForm.department || ''}
                        disabled={!isEditing || !isAdmin}
                        onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Designation / Role</label>
                      <input
                        type="text"
                        value={editForm.position || ''}
                        disabled={!isEditing || !isAdmin}
                        onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Employment Type</label>
                      <select
                        value={editForm.employment_type || 'full_time'}
                        disabled={!isEditing || !isAdmin}
                        onChange={(e) => setEditForm({ ...editForm, employment_type: e.target.value })}
                      >
                        <option value="full_time">Full Time</option>
                        <option value="part_time">Part Time</option>
                        <option value="intern">Internship</option>
                        <option value="contract">Contract</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Date of Joining</label>
                      <input
                        type="date"
                        value={editForm.joining_date ? new Date(editForm.joining_date).toISOString().slice(0, 10) : ''}
                        disabled={!isEditing || !isAdmin}
                        onChange={(e) => setEditForm({ ...editForm, joining_date: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Official Email</label>
                      <input
                        type="email"
                        value={editForm.email || ''}
                        disabled={true}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Banking & Statutory Compliance */}
                <div className="profile-section-card">
                  <h5 className="section-subtitle"><BankIcon size={16} style={{ marginRight: '6px' }} /> Banking & Statutory Information</h5>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>Bank Name</label>
                      <input
                        type="text"
                        value={editForm.bank_name || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, bank_name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Bank Account Number</label>
                      <input
                        type="text"
                        value={editForm.bank_account_no || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, bank_account_no: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>IFSC Code</label>
                      <input
                        type="text"
                        value={editForm.bank_ifsc || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, bank_ifsc: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>PAN Card Number</label>
                      <input
                        type="text"
                        value={editForm.pan_number || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, pan_number: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>EPF / UAN Number</label>
                      <input
                        type="text"
                        value={editForm.uan_number || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, uan_number: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>ESIC Insurance Number</label>
                      <input
                        type="text"
                        value={editForm.esi_number || ''}
                        disabled={!isEditing}
                        onChange={(e) => setEditForm({ ...editForm, esi_number: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="emp-modal-actions sticky-actions">
                    <button type="button" className="emp-btn-cancel" onClick={() => setIsEditing(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="emp-btn-save" disabled={saving}>
                      {saving ? 'Saving...' : 'Save Employee Profile'}
                    </button>
                  </div>
                )}
              </form>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
