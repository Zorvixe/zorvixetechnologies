import React, { useState, useEffect, useCallback } from 'react';
import {
  apiListJobs,
  apiCreateJob,
  apiUpdateJob,
  apiDeleteJob,
  apiRecruitmentPipeline,
  apiUpdateCandidateStage,
  apiHireCandidate,
  apiListCompliance,
  apiUpdateCompliance,
  downloadCandidatePdf
} from '../../api';
import {
  LeadsIcon,
  SearchIcon,
  CalendarIcon,
  QuotesIcon,
  AwardIcon,
  FolderIcon,
  TargetIcon,
  BriefcaseIcon,
  ShieldIcon,
  PhoneIcon,
  UsersIcon
} from '../../components/CrmHrmsIcons';
import './RecruitmentComplianceTab.css';

export default function RecruitmentComplianceTab({ isAdmin, user }) {
  const [subTab, setSubTab] = useState('pipeline'); // 'pipeline' | 'jobs' | 'compliance'

  // Jobs
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const defaultJobForm = {
    title: '',
    department: 'Engineering',
    experience_required: '2-4 years',
    job_type: 'Full-time',
    vacancies: 1,
    location: 'Hyderabad / Remote',
    salary_range: '₹6,00,000 - ₹12,00,000',
    description: '',
    requirements: '',
    status: 'open'
  };
  const [jobForm, setJobForm] = useState(defaultJobForm);
  const [savingJob, setSavingJob] = useState(false);

  // Candidate Pipeline
  const [pipelineData, setPipelineData] = useState(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [interviewForm, setInterviewForm] = useState({
    stage: '',
    interview_date: '',
    interview_notes: '',
    rating: 4,
    expected_salary: ''
  });
  const [updatingCandidate, setUpdatingCandidate] = useState(false);
  const [hiringId, setHiringId] = useState(null);

  // Compliance
  const [complianceList, setComplianceList] = useState([]);
  const [complianceLoading, setComplianceLoading] = useState(false);

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await apiListJobs();
      setJobs(res.jobs || []);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const fetchPipeline = useCallback(async () => {
    setPipelineLoading(true);
    try {
      const res = await apiRecruitmentPipeline();
      setPipelineData(res.stages || {});
    } catch (err) {
      console.error('Failed to load pipeline:', err);
    } finally {
      setPipelineLoading(false);
    }
  }, []);

  const fetchCompliance = useCallback(async () => {
    setComplianceLoading(true);
    try {
      const res = await apiListCompliance();
      setComplianceList(res.records || []);
    } catch (err) {
      console.error('Failed to load compliance:', err);
    } finally {
      setComplianceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchPipeline();
    fetchCompliance();
  }, [fetchJobs, fetchPipeline, fetchCompliance]);

  const openCreateJobModal = () => {
    setEditingJobId(null);
    setJobForm(defaultJobForm);
    setShowJobModal(true);
  };

  const openEditJobModal = (job) => {
    setEditingJobId(job.id);
    setJobForm({
      title: job.title || '',
      department: job.department || 'Engineering',
      experience_required: job.experience_required || '',
      job_type: job.job_type || 'Full-time',
      vacancies: job.vacancies || 1,
      location: job.location || 'Hyderabad / Remote',
      salary_range: job.salary_range || '',
      description: job.description || '',
      requirements: job.requirements || '',
      status: job.status || 'open'
    });
    setShowJobModal(true);
  };

  const handleSaveJob = async (e) => {
    e.preventDefault();
    setSavingJob(true);
    try {
      if (editingJobId) {
        await apiUpdateJob(editingJobId, jobForm);
        alert('Job opening updated successfully');
      } else {
        await apiCreateJob(jobForm);
        alert('Job opening published successfully');
      }
      setShowJobModal(false);
      setEditingJobId(null);
      setJobForm(defaultJobForm);
      fetchJobs();
    } catch (err) {
      alert(err.message || 'Failed to save job');
    } finally {
      setSavingJob(false);
    }
  };

  const handleToggleJobStatus = async (job) => {
    const nextStatus = (job.status || 'open').toLowerCase() === 'open' ? 'closed' : 'open';
    try {
      await apiUpdateJob(job.id, { status: nextStatus });
      fetchJobs();
    } catch (err) {
      alert(err.message || 'Failed to update job status');
    }
  };

  const handleDownloadResume = async (cand) => {
    try {
      const blob = await downloadCandidatePdf(cand.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = cand.resume_file_name || `${cand.name || 'candidate'}-resume.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Resume download failed');
    }
  };

  const handleDeleteJob = async (id) => {
    if (!window.confirm('Delete this job opening?')) return;
    try {
      await apiDeleteJob(id);
      fetchJobs();
    } catch (err) {
      alert(err.message || 'Failed to delete job');
    }
  };

  const openCandidateModal = (cand) => {
    setSelectedCandidate(cand);
    setInterviewForm({
      stage: cand.stage || 'applied',
      interview_date: cand.interview_date ? new Date(cand.interview_date).toISOString().slice(0, 16) : '',
      interview_notes: cand.interview_notes || '',
      rating: cand.rating || 3,
      expected_salary: cand.expected_salary || ''
    });
  };

  const handleUpdateCandidate = async (e) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    setUpdatingCandidate(true);
    try {
      await apiUpdateCandidateStage(selectedCandidate.id, interviewForm);
      alert('Candidate details updated');
      setSelectedCandidate(null);
      fetchPipeline();
    } catch (err) {
      alert(err.message || 'Failed to update candidate');
    } finally {
      setUpdatingCandidate(false);
    }
  };

  const handleQuickStageMove = async (candId, newStage) => {
    try {
      await apiUpdateCandidateStage(candId, { stage: newStage });
      fetchPipeline();
    } catch (err) {
      alert(err.message || 'Failed to move stage');
    }
  };

  const handleHireCandidate = async (candId) => {
    if (!window.confirm('Convert this candidate to a Zorvixe Employee? This will provision their employee record and send welcome credentials to their email.')) return;
    setHiringId(candId);
    try {
      const res = await apiHireCandidate(candId);
      alert(res.message || 'Candidate converted to employee successfully!');
      fetchPipeline();
    } catch (err) {
      alert(err.message || 'Hiring action failed');
    } finally {
      setHiringId(null);
    }
  };

  const handleToggleCompliance = async (recId, currentStatus) => {
    const nextStatus = currentStatus === 'compliant' ? 'pending' : 'compliant';
    try {
      await apiUpdateCompliance(recId, { status: nextStatus });
      fetchCompliance();
    } catch (err) {
      alert(err.message || 'Failed to update compliance');
    }
  };

  const stagesList = [
    { key: 'applied', label: 'Applied', color: '#64748b', icon: LeadsIcon },
    { key: 'screening', label: 'Screening', color: '#0284c7', icon: SearchIcon },
    { key: 'interview', label: 'Interview Scheduled', color: '#d97706', icon: CalendarIcon },
    { key: 'offer', label: 'Offer Extended', color: '#7c3aed', icon: QuotesIcon },
    { key: 'hired', label: 'Hired', color: '#16a34a', icon: AwardIcon },
    { key: 'rejected', label: 'Archived', color: '#dc2626', icon: FolderIcon }
  ];

  return (
    <div className="recruitment-compliance-tab">
      {/* Sub Tabs */}
      <div className="rc-subtabs-nav">
        <button
          className={`rc-tab-btn ${subTab === 'pipeline' ? 'active' : ''}`}
          onClick={() => setSubTab('pipeline')}
        >
          <TargetIcon size={14} style={{ marginRight: '6px' }} />
          Candidate ATS Pipeline
        </button>
        <button
          className={`rc-tab-btn ${subTab === 'jobs' ? 'active' : ''}`}
          onClick={() => setSubTab('jobs')}
        >
          <BriefcaseIcon size={14} style={{ marginRight: '6px' }} />
          Job Openings ({jobs.length})
        </button>
        <button
          className={`rc-tab-btn ${subTab === 'compliance' ? 'active' : ''}`}
          onClick={() => setSubTab('compliance')}
        >
          <ShieldIcon size={14} style={{ marginRight: '6px' }} />
          Statutory & Labour Compliance
        </button>
      </div>

      {/* VIEW 1: CANDIDATE PIPELINE */}
      {subTab === 'pipeline' && (
        <div className="pipeline-section">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">Candidate Recruitment Pipeline</h3>
              <p className="section-sub">Track applicants, interview ratings, offer extensions, and 1-click employee onboarding</p>
            </div>
          </div>

          {pipelineLoading ? (
            <div> <div className="loader_container">
              <p className="loader_spinner"></p>
              <p>Loading Please Wait...</p>
            </div>
            </div>
          ) : (
            <div className="kanban-board">
              {stagesList.map((st) => {
                const candidatesInStage = pipelineData?.[st.key] || [];
                return (
                  <div className="kanban-column" key={st.key}>
                    <div className="kanban-col-header" style={{ borderTopColor: st.color }}>
                      <span className="col-title" style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {st.icon && <st.icon size={14} color={st.color} style={{ marginRight: '6px' }} />}
                        {st.label}
                      </span>
                      <span className="col-badge">{candidatesInStage.length}</span>
                    </div>

                    <div className="kanban-cards-list">
                      {candidatesInStage.length === 0 ? (
                        <div className="kanban-empty">No candidates</div>
                      ) : (
                        candidatesInStage.map((cand) => (
                          <div className="candidate-card" key={cand.id}>
                            {cand.source === 'careers_portal' && (
                              <span className="cand-source-badge">🌐 Careers Portal</span>
                            )}
                            <div className="cand-top-row">
                              <h5 className="cand-name">{cand.name}</h5>
                              {cand.rating > 0 && (
                                <span className="cand-stars">{'★'.repeat(cand.rating)}</span>
                              )}
                            </div>
                            <span className="cand-role">{cand.job_title || cand.position || 'Applicant'}</span>
                            {(cand.experience_years || cand.expected_salary || cand.current_location) && (
                              <div className="cand-meta-chips">
                                {cand.experience_years && <span className="cand-meta-chip">Exp: {cand.experience_years}</span>}
                                {cand.expected_salary && <span className="cand-meta-chip">CTC: {cand.expected_salary}</span>}
                                {cand.current_location && <span className="cand-meta-chip">📍 {cand.current_location}</span>}
                              </div>
                            )}
                            <div className="cand-contact-info">
                              <span>✉️ {cand.email}</span>
                              <span><PhoneIcon size={12} style={{ marginRight: '4px' }} /> {cand.phone}</span>
                            </div>

                            {cand.interview_date && (
                              <div className="cand-interview-pill">
                                <CalendarIcon size={12} style={{ marginRight: '4px' }} />
                                {new Date(cand.interview_date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}

                            {cand.interview_notes && (
                              <p className="cand-notes-snippet">"{cand.interview_notes}"</p>
                            )}

                            {(() => {
                              const stIdx = stagesList.findIndex((s) => s.key === (cand.stage || 'applied'));
                              return (
                                <div className="cand-stage-changer">
                                  <button
                                    type="button"
                                    className="cand-nav-arrow"
                                    disabled={stIdx <= 0}
                                    onClick={() => handleQuickStageMove(cand.id, stagesList[stIdx - 1].key)}
                                    title="Move to previous stage"
                                  >
                                    ←
                                  </button>
                                  <select
                                    value={cand.stage || 'applied'}
                                    onChange={(e) => handleQuickStageMove(cand.id, e.target.value)}
                                    className="stage-select"
                                  >
                                    {stagesList.map((s) => (
                                      <option key={s.key} value={s.key}>
                                        {s.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="cand-nav-arrow"
                                    disabled={stIdx >= stagesList.length - 1}
                                    onClick={() => handleQuickStageMove(cand.id, stagesList[stIdx + 1].key)}
                                    title="Advance to next stage"
                                  >
                                    →
                                  </button>
                                </div>
                              );
                            })()}

                            <div className="cand-card-actions">
                              <button className="btn-cand-details" onClick={() => openCandidateModal(cand)}>
                                Interview / Edit
                              </button>
                              {cand.resume_file_name && (
                                <button
                                  type="button"
                                  className="btn-cand-resume"
                                  onClick={() => handleDownloadResume(cand)}
                                  title={`Download ${cand.resume_file_name}`}
                                >
                                  📄 Resume
                                </button>
                              )}
                              {(cand.stage === 'offer' || cand.stage === 'interview' || cand.stage === 'hired') && (
                                <button
                                  className="btn-cand-hire"
                                  onClick={() => handleHireCandidate(cand.id)}
                                  disabled={hiringId === cand.id}
                                >
                                  {hiringId === cand.id ? 'Hiring...' : '⚡ Hire as Employee'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: JOB OPENINGS */}
      {subTab === 'jobs' && (
        <div className="jobs-section">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">Career Opportunities & Job Openings</h3>
              <p className="section-sub">Open positions appear automatically on the website Careers portal</p>
            </div>
            {isAdmin && (
              <button className="btn-post-job" onClick={openCreateJobModal}>
                + Post New Job Opening
              </button>
            )}
          </div>

          <div className="jobs-cards-grid">
            {jobsLoading ? (
              <div> <div className="loader_container">
                <p className="loader_spinner"></p>
                <p>Loading Please Wait...</p>
              </div>
              </div>
            ) : jobs.length === 0 ? (
              <div className="empty-state">No job openings created yet. Click "+ Post New Job Opening" to create one.</div>
            ) : (
              jobs.map((job) => {
                const isOpen = (job.status || 'open').toLowerCase() === 'open';
                return (
                  <div className="job-card" key={job.id}>
                    <div className="job-card-top">
                      <div>
                        <h4 className="job-title">{job.title}</h4>
                        <span className="job-dept">{job.department} • {job.location}</span>
                      </div>
                      <span className={`job-status-pill status-${job.status}`}>{job.status}</span>
                    </div>

                    <div className="job-meta-row">
                      <div className="meta-item"><span>Type:</span> <strong>{job.job_type}</strong></div>
                      <div className="meta-item"><span>Exp:</span> <strong>{job.experience_required}</strong></div>
                      <div className="meta-item"><span>Vacancies:</span> <strong>{job.vacancies}</strong></div>
                      <div className="meta-item"><span>Salary:</span> <strong>{job.salary_range}</strong></div>
                    </div>

                    <p className="job-desc">{job.description}</p>

                    <div className="job-card-bottom">
                      <span className="applicant-counter">
                        <UsersIcon size={14} style={{ marginRight: '5px' }} />
                        <strong>{job.applicants_count || 0}</strong> applicants
                      </span>
                      {isAdmin && (
                        <div className="job-card-actions">
                          <button type="button" className="btn-edit-job" onClick={() => openEditJobModal(job)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`btn-toggle-job ${isOpen ? 'is-open' : 'is-closed'}`}
                            onClick={() => handleToggleJobStatus(job)}
                          >
                            {isOpen ? 'Close' : 'Reopen'}
                          </button>
                          <button className="btn-delete-job" onClick={() => handleDeleteJob(job.id)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }))}
          </div>
        </div>
      )}

      {/* VIEW 3: STATUTORY & LABOUR COMPLIANCE */}
      {subTab === 'compliance' && (
        <div className="compliance-section">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">Statutory, Labour & Legal Compliance Tracker</h3>
              <p className="section-sub">EPF, ESIC, Professional Tax, TDS 24Q, and Internal Policy audit readiness</p>
            </div>
          </div>

          <div className="compliance-table-wrap">
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>Compliance Standard / Requirement</th>
                  <th>Category</th>
                  <th>Frequency</th>
                  <th>Next Due Date</th>
                  <th>Status</th>
                  <th>Description & Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {complianceLoading ? (
                  <tr><div> <div className="loader_container">
                    <p className="loader_spinner"></p>
                    <p>Loading Please Wait...</p>
                  </div>
                  </div></tr>
                ) : (
                  complianceList.map((rec) => (
                    <tr key={rec.id}>
                      <td>
                        <strong>{rec.title}</strong>
                      </td>
                      <td>
                        <span className="comp-category-tag">{rec.category}</span>
                      </td>
                      <td className="capitalize">{rec.frequency}</td>
                      <td>
                        <strong>{rec.due_date ? new Date(rec.due_date).toLocaleDateString() : 'N/A'}</strong>
                      </td>
                      <td>
                        <span className={`comp-status-badge status-${rec.status}`}>
                          {rec.status === 'compliant' ? '✓ Compliant' : '⚠️ Pending'}
                        </span>
                      </td>
                      <td className="note-cell">{rec.notes || '-'}</td>
                      <td>
                        {isAdmin && (
                          <button
                            className="btn-comp-toggle"
                            onClick={() => handleToggleCompliance(rec.id, rec.status)}
                          >
                            {rec.status === 'compliant' ? 'Mark Pending' : 'Mark Complied'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* POST / EDIT JOB MODAL */}
      {showJobModal && (
        <div className="rc-modal-backdrop modal-backdrop" onClick={() => setShowJobModal(false)}>
          <div className="rc-modal-card rc-modal-lg modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="rc-modal-header modal-header">
              <h4 className="rc-modal-title">{editingJobId ? 'Edit Job Opening' : 'Post New Job Opening'}</h4>
              <button type="button" className="rc-modal-close-btn btn-close" onClick={() => setShowJobModal(false)}>×</button>
            </div>
            <form onSubmit={handleSaveJob} className="rc-modal-form modal-form">
              <div className="rc-form-group form-group">
                <label className="rc-form-label">Job Title *</label>
                <input
                  type="text"
                  className="rc-form-input"
                  placeholder="e.g. Senior Backend Node.js Developer"
                  value={jobForm.title}
                  onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                  required
                />
              </div>
              <div className="rc-form-row form-row">
                <div className="rc-form-group form-group">
                  <label className="rc-form-label">Department *</label>
                  <select
                    className="rc-form-select"
                    value={jobForm.department}
                    onChange={(e) => setJobForm({ ...jobForm, department: e.target.value })}
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Design">Design</option>
                    <option value="Product">Product</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Sales">Sales</option>
                    <option value="HR & Operations">HR & Operations</option>
                  </select>
                </div>
                <div className="rc-form-group form-group">
                  <label className="rc-form-label">Experience Required</label>
                  <input
                    type="text"
                    className="rc-form-input"
                    placeholder="e.g. 3+ years"
                    value={jobForm.experience_required}
                    onChange={(e) => setJobForm({ ...jobForm, experience_required: e.target.value })}
                  />
                </div>
              </div>
              <div className="rc-form-row form-row">
                <div className="rc-form-group form-group">
                  <label className="rc-form-label">Job Type</label>
                  <select
                    className="rc-form-select"
                    value={jobForm.job_type}
                    onChange={(e) => setJobForm({ ...jobForm, job_type: e.target.value })}
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
                <div className="rc-form-group form-group">
                  <label className="rc-form-label">Vacancies</label>
                  <input
                    type="number"
                    min="1"
                    className="rc-form-input"
                    value={jobForm.vacancies}
                    onChange={(e) => setJobForm({ ...jobForm, vacancies: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="rc-form-row form-row">
                <div className="rc-form-group form-group">
                  <label className="rc-form-label">Work Location</label>
                  <input
                    type="text"
                    className="rc-form-input"
                    placeholder="e.g. Hyderabad / Remote"
                    value={jobForm.location}
                    onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                  />
                </div>
                <div className="rc-form-group form-group">
                  <label className="rc-form-label">Salary Range (Annual CTC)</label>
                  <input
                    type="text"
                    className="rc-form-input"
                    placeholder="e.g. ₹12 - ₹18 LPA"
                    value={jobForm.salary_range}
                    onChange={(e) => setJobForm({ ...jobForm, salary_range: e.target.value })}
                  />
                </div>
              </div>
              <div className="rc-form-group form-group">
                <label className="rc-form-label">Job Description</label>
                <textarea
                  rows="3"
                  className="rc-form-textarea"
                  placeholder="Key responsibilities, role overview, and team details..."
                  value={jobForm.description}
                  onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                />
              </div>
              <div className="rc-form-group form-group">
                <label className="rc-form-label">Requirements &amp; Key Skills</label>
                <textarea
                  rows="2"
                  className="rc-form-textarea"
                  placeholder="e.g. React.js, Node.js, PostgreSQL, REST APIs..."
                  value={jobForm.requirements}
                  onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })}
                />
              </div>
              <div className="rc-modal-actions modal-actions">
                <button type="button" className="rc-btn-cancel btn-cancel" onClick={() => setShowJobModal(false)}>Cancel</button>
                <button type="submit" className="rc-btn-save btn-save" disabled={savingJob}>
                  {savingJob ? 'Saving...' : editingJobId ? 'Update Job Opening' : 'Publish Job Opening'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANDIDATE INTERVIEW / EDIT MODAL */}
      {selectedCandidate && (
        <div className="rc-modal-backdrop modal-backdrop" onClick={() => setSelectedCandidate(null)}>
          <div className="rc-modal-card modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="rc-modal-header modal-header">
              <h4 className="rc-modal-title">Candidate: {selectedCandidate.name}</h4>
              <button type="button" className="rc-modal-close-btn btn-close" onClick={() => setSelectedCandidate(null)}>×</button>
            </div>
            <form onSubmit={handleUpdateCandidate} className="rc-modal-form modal-form">
              {(selectedCandidate.source === 'careers_portal' || selectedCandidate.resume_file_name || selectedCandidate.cover_letter || selectedCandidate.linkedin_url || selectedCandidate.portfolio_url) && (
                <div className="cand-application-summary">
                  <div>
                    <strong>Applied For:</strong> {selectedCandidate.job_title || selectedCandidate.position || 'Applicant'}
                    {selectedCandidate.experience_years && <> • <strong>Exp:</strong> {selectedCandidate.experience_years}</>}
                    {selectedCandidate.notice_period && <> • <strong>Notice:</strong> {selectedCandidate.notice_period}</>}
                  </div>
                  {selectedCandidate.current_location && (
                    <div><strong>Location:</strong> {selectedCandidate.current_location}</div>
                  )}
                  <div className="cand-app-links">
                    {selectedCandidate.resume_file_name && (
                      <button type="button" className="btn-cand-resume" onClick={() => handleDownloadResume(selectedCandidate)}>
                        📄 Download Resume ({selectedCandidate.resume_file_name})
                      </button>
                    )}
                    {selectedCandidate.linkedin_url && (
                      <a href={selectedCandidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="cand-app-link">
                        🔗 LinkedIn Profile
                      </a>
                    )}
                    {selectedCandidate.portfolio_url && (
                      <a href={selectedCandidate.portfolio_url} target="_blank" rel="noopener noreferrer" className="cand-app-link">
                        🌐 Portfolio / GitHub
                      </a>
                    )}
                  </div>
                  {selectedCandidate.cover_letter && (
                    <div style={{ color: '#42526e', fontStyle: 'italic' }}>
                      <strong>Applicant Note:</strong> "{selectedCandidate.cover_letter}"
                    </div>
                  )}
                </div>
              )}
              <div className="rc-form-group form-group">
                <label className="rc-form-label">Pipeline Stage</label>
                <select
                  className="rc-form-select"
                  value={interviewForm.stage}
                  onChange={(e) => setInterviewForm({ ...interviewForm, stage: e.target.value })}
                >
                  {stagesList.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="rc-form-group form-group">
                <label className="rc-form-label">Interview Scheduled Date & Time</label>
                <input
                  type="datetime-local"
                  className="rc-form-input"
                  value={interviewForm.interview_date}
                  onChange={(e) => setInterviewForm({ ...interviewForm, interview_date: e.target.value })}
                />
              </div>
              <div className="rc-form-group form-group">
                <label className="rc-form-label">Candidate Rating (1 to 5 Stars)</label>
                <select
                  className="rc-form-select"
                  value={interviewForm.rating}
                  onChange={(e) => setInterviewForm({ ...interviewForm, rating: Number(e.target.value) })}
                >
                  <option value={1}>★☆☆☆☆ (1 Star)</option>
                  <option value={2}>★★☆☆☆ (2 Stars)</option>
                  <option value={3}>★★★☆☆ (3 Stars)</option>
                  <option value={4}>★★★★☆ (4 Stars)</option>
                  <option value={5}>★★★★★ (5 Stars)</option>
                </select>
              </div>
              <div className="rc-form-group form-group">
                <label className="rc-form-label">Expected CTC / Salary</label>
                <input
                  type="text"
                  className="rc-form-input"
                  placeholder="e.g. ₹10 LPA"
                  value={interviewForm.expected_salary}
                  onChange={(e) => setInterviewForm({ ...interviewForm, expected_salary: e.target.value })}
                />
              </div>
              <div className="rc-form-group form-group">
                <label className="rc-form-label">Interview Feedback & Evaluator Notes</label>
                <textarea
                  rows="3"
                  className="rc-form-textarea"
                  placeholder="Technical strengths, communication, culture fit..."
                  value={interviewForm.interview_notes}
                  onChange={(e) => setInterviewForm({ ...interviewForm, interview_notes: e.target.value })}
                />
              </div>
              <div className="rc-modal-actions modal-actions">
                <button type="button" className="rc-btn-cancel btn-cancel" onClick={() => setSelectedCandidate(null)}>Cancel</button>
                <button type="submit" className="rc-btn-save btn-save" disabled={updatingCandidate}>
                  {updatingCandidate ? 'Saving...' : 'Save Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
