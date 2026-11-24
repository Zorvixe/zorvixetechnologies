import React, { useState, useEffect, useCallback } from 'react';
import { apiListCrmContacts, apiCreateCrmContact, apiDeleteCrmContact, apiListAccounts } from '../../api';
import { GlobeIcon, TrashIcon } from '../../components/CrmHrmsIcons';
import './ContactsTab.css';

export default function ContactsTab() {
  const [contacts, setContacts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('');

  // Create Contact Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [contactForm, setContactForm] = useState({
    client_id: '',
    name: '',
    email: '',
    phone: '',
    position: 'Decision Maker',
    department: 'Executive',
    is_primary: false,
    linkedin_url: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListCrmContacts({ client_id: accountFilter || undefined });
      setContacts(res.contacts || []);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [accountFilter]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiListAccounts();
      setAccounts(res.accounts || []);
    } catch (err) {
      console.error('Failed to load accounts for dropdown:', err);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
    fetchAccounts();
  }, [fetchContacts, fetchAccounts]);

  const handleCreateContact = async (e) => {
    e.preventDefault();
    if (!contactForm.name) return alert('Contact name is required');
    setSaving(true);
    try {
      await apiCreateCrmContact(contactForm);
      alert('Contact created successfully!');
      setShowCreateModal(false);
      setContactForm({
        client_id: '',
        name: '',
        email: '',
        phone: '',
        position: 'Decision Maker',
        department: 'Executive',
        is_primary: false,
        linkedin_url: '',
        notes: ''
      });
      fetchContacts();
    } catch (err) {
      alert(err.message || 'Failed to create contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async (id) => {
    if (!window.confirm('Delete this contact?')) return;
    try {
      await apiDeleteCrmContact(id);
      fetchContacts();
    } catch (err) {
      alert(err.message || 'Failed to delete contact');
    }
  };

  const filteredContacts = contacts.filter(co => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (co.name && co.name.toLowerCase().includes(s)) ||
      (co.email && co.email.toLowerCase().includes(s)) ||
      (co.phone && co.phone.includes(s)) ||
      (co.position && co.position.toLowerCase().includes(s)) ||
      (co.client_company && co.client_company.toLowerCase().includes(s))
    );
  });

  return (
    <div className="crm-contacts-tab">
      {/* Top Controls */}
      <div className="contacts-filter-bar">
        <div className="contacts-search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by contact name, email, company, role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="contacts-filter-dropdowns">
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="contacts-select"
          >
            <option value="">All Accounts / Companies</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.company || acc.name}</option>
            ))}
          </select>

          <button className="btn-create-contact" onClick={() => setShowCreateModal(true)}>
            + Create Contact
          </button>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="contacts-table-container">
        <table className="contacts-table">
          <thead>
            <tr>
              <th>Contact Name</th>
              <th>Company Account</th>
              <th>Position & Role</th>
              <th>Email</th>
              <th>Phone</th>
              <th>LinkedIn</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="table-state-msg">Loading business contacts...</td>
              </tr>
            ) : filteredContacts.length === 0 ? (
              <tr>
                <td colSpan="7" className="table-state-msg">No contacts found. Click "+ Create Contact" to add one.</td>
              </tr>
            ) : (
              filteredContacts.map((co) => {
                const initials = (co.name || 'C').slice(0, 2).toUpperCase();

                return (
                  <tr key={co.id}>
                    <td>
                      <div className="contact-name-cell">
                        <div className="contact-avatar">{initials}</div>
                        <div>
                          <strong className="contact-name-bold">{co.name}</strong>
                          {co.is_primary && <span className="primary-badge">PRIMARY</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong className="company-text">{co.client_company || co.client_name || 'Independent'}</strong>
                    </td>
                    <td>
                      <div className="position-text">{co.position || 'Executive'}</div>
                      <div className="dept-sub">{co.department || 'Operations'}</div>
                    </td>
                    <td>
                      <a href={`mailto:${co.email}`} className="email-link">{co.email || '--'}</a>
                    </td>
                    <td>
                      <span className="phone-text">{co.phone || '--'}</span>
                    </td>
                    <td>
                      {co.linkedin_url ? (
                        <a href={co.linkedin_url} target="_blank" rel="noreferrer" className="linkedin-link">
                          <GlobeIcon size={12} style={{ marginRight: '4px' }} />
                          Profile
                        </a>
                      ) : '--'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-delete-contact"
                        onClick={() => handleDeleteContact(co.id)}
                        title="Delete Contact"
                      >
                        <TrashIcon size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE CONTACT MODAL */}
      {showCreateModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h4>Create B2B Business Contact</h4>
              <button type="button" className="crm-modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateContact} className="crm-modal-form">
              <div className="crm-form-group">
                <label>Company / Account *</label>
                <select
                  required
                  value={contactForm.client_id}
                  onChange={(e) => setContactForm({ ...contactForm, client_id: e.target.value })}
                >
                  <option value="">-- Select Company Account --</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.company || acc.name}</option>
                  ))}
                </select>
              </div>

              <div className="crm-form-group">
                <label>Contact Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Meera Nambiar"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                />
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Designation / Position</label>
                  <input
                    type="text"
                    placeholder="e.g. VP of Product"
                    value={contactForm.position}
                    onChange={(e) => setContactForm({ ...contactForm, position: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Department</label>
                  <input
                    type="text"
                    placeholder="e.g. Technology"
                    value={contactForm.department}
                    onChange={(e) => setContactForm({ ...contactForm, department: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Work Email</label>
                  <input
                    type="email"
                    placeholder="meera@company.com"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Work Phone</label>
                  <input
                    type="text"
                    placeholder="+91 99887 76655"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-form-group">
                <label>LinkedIn Profile URL</label>
                <input
                  type="url"
                  placeholder="https://linkedin.com/in/username"
                  value={contactForm.linkedin_url}
                  onChange={(e) => setContactForm({ ...contactForm, linkedin_url: e.target.value })}
                />
              </div>

              <div className="crm-form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={contactForm.is_primary}
                    onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })}
                  />
                  <span>Mark as Primary Account Contact</span>
                </label>
              </div>

              <div className="crm-form-group">
                <label>Notes / Bio</label>
                <textarea
                  rows="2"
                  placeholder="Decision making power, communication preferences..."
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                />
              </div>

              <div className="crm-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn-modal-submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
