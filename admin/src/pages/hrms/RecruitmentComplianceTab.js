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
  apiCreateCompliance,
  apiUpdateCompliance,
  apiDeleteCompliance,
  downloadCandidatePdf,
  apiAiCompareCandidate
} from '../../api';
import AiInsightBox from '../../components/AiInsightBox';
import RichTextEditor from '../../components/RichTextEditor';
import { renderSafeHtml } from '../../utils/safeHtml';
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
  UsersIcon,
  SparklesIcon,
  GlobeIcon,
  MapPinIcon,
  MailIcon,
  FileTextIcon,
  ZapIcon,
  CheckIcon,
  AlertTriangleIcon,
  LinkIcon,
  PlusIcon,
  EditIcon,
  TrashIcon
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

  // AI Resume vs Job Requirements Comparison (Advisory Only)
  const [candAiOpen, setCandAiOpen] = useState(false);
  const [candAiLoading, setCandAiLoading] = useState(false);
  const [candAiErr, setCandAiErr] = useState('');
  const [candAiData, setCandAiData] = useState(null);

  useEffect(() => {
    setCandAiOpen(false);
    setCandAiData(null);
    setCandAiErr('');
  }, [selectedCandidate?.id]);

  const runCandidateAiCompare = async (candId) => {
    setCandAiOpen(true);
    setCandAiLoading(true);
    setCandAiErr('');
    try {
      const res = await apiAiCompareCandidate({ candidateId: candId });
      setCandAiData(res);
    } catch (err) {
      setCandAiErr(err.message || 'Failed to compare candidate with job requirements');
    } finally {
      setCandAiLoading(false);
    }
  };

  // Compliance
  const [complianceList, setComplianceList] = useState([]);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [compSearch, setCompSearch] = useState('');
  const [compCategoryFilter, setCompCategoryFilter] = useState('');
  const [compStatusFilter, setCompStatusFilter] = useState('');
  const [showCompModal, setShowCompModal] = useState(false);
  const [editingCompId, setEditingCompId] = useState(null);
  const defaultCompForm = {
    title: '',
    category: 'PF_ESI',
    frequency: 'monthly',
    due_date: new Date().toISOString().slice(0, 10),
    status: 'pending',
    document_ref: '',
    notes: ''
  };
  const [compForm, setCompForm] = useState(defaultCompForm);
  const [savingComp, setSavingComp] = useState(false);

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

  const openCreateCompModal = () => {
    setEditingCompId(null);
    setCompForm({
      ...defaultCompForm,
      due_date: new Date().toISOString().slice(0, 10)
    });
    setShowCompModal(true);
  };

  const openEditCompModal = (rec) => {
    setEditingCompId(rec.id);
    setCompForm({
      title: rec.title || '',
      category: rec.category || 'Labour_Law',
      frequency: rec.frequency || 'monthly',
      due_date: rec.due_date ? String(rec.due_date).slice(0, 10) : '',
      status: rec.status || 'pending',
      document_ref: rec.document_ref || '',
      notes: rec.notes || ''
    });
    setShowCompModal(true);
  };

  const handleSaveCompliance = async (e) => {
    e.preventDefault();
    if (!compForm.title.trim()) return alert('Compliance requirement title is required');
    setSavingComp(true);
    try {
      if (editingCompId) {
        await apiUpdateCompliance(editingCompId, compForm);
      } else {
        await apiCreateCompliance(compForm);
      }
      setShowCompModal(false);
      fetchCompliance();
    } catch (err) {
      alert(err.message || 'Failed to save compliance record');
    } finally {
      setSavingComp(false);
    }
  };

  const handleDeleteCompliance = async (rec) => {
    if (!window.confirm(`Delete compliance requirement "${rec.title}"?`)) return;
    try {
      await apiDeleteCompliance(rec.id);
      fetchCompliance();
    } catch (err) {
      alert(err.message || 'Failed to delete compliance record');
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
                              <span className="cand-source-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><GlobeIcon size={11} /> Careers Portal</span>
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
                                {cand.current_location && <span className="cand-meta-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPinIcon size={11} /> {cand.current_location}</span>}
                              </div>
                            )}
                            <div className="cand-contact-info">
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MailIcon size={12} /> {cand.email}</span>
                              <span><PhoneIcon size={12} style={{ marginRight: '4px' }} /> {cand.phone}</span>
                            </div>

                            {cand.interview_date && (
                              <div className="cand-interview-pill">
                                <CalendarIcon size={12} style={{ marginRight: '4px' }} />
                                {new Date(cand.interview_date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}

                            {cand.interview_notes && (
                              <div
                                className="cand-notes-snippet"
                                dangerouslySetInnerHTML={{ __html: renderSafeHtml(cand.interview_notes) }}
                              />
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
                                  <FileTextIcon size={12} style={{ marginRight: 4 }} /> Resume
                                </button>
                              )}
                              {(cand.stage === 'offer' || cand.stage === 'interview' || cand.stage === 'hired') && (
                                <button
                                  className="btn-cand-hire"
                                  onClick={() => handleHireCandidate(cand.id)}
                                  disabled={hiringId === cand.id}
                                >
                                  {hiringId === cand.id ? 'Hiring...' : <><ZapIcon size={12} style={{ marginRight: 4 }} /> Hire</>}
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

                    <div
                      className="job-desc"
                      dangerouslySetInnerHTML={{ __html: renderSafeHtml(job.description) }}
                    />

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
      {subTab === 'compliance' && (() => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const isOverdueRec = (rec) =>
          rec.status !== 'compliant' && rec.due_date && new Date(rec.due_date) < todayStart;

        const totalComp = complianceList.length;
        const compliantCount = complianceList.filter((r) => r.status === 'compliant').length;
        const pendingCount = complianceList.filter((r) => r.status !== 'compliant').length;
        const overdueCount = complianceList.filter(isOverdueRec).length;

        const categoryOptions = Array.from(
          new Set(['PF_ESI', 'Tax_TDS', 'Labour_Law', 'Policy_Audit', ...complianceList.map((r) => r.category).filter(Boolean)])
        );

        const filteredCompliance = complianceList.filter((rec) => {
          if (compCategoryFilter && rec.category !== compCategoryFilter) return false;
          if (compStatusFilter === 'overdue' && !isOverdueRec(rec)) return false;
          if (compStatusFilter === 'compliant' && rec.status !== 'compliant') return false;
          if (compStatusFilter === 'pending' && rec.status === 'compliant') return false;
          if (compSearch.trim()) {
            const q = compSearch.toLowerCase();
            const text = `${rec.title || ''} ${rec.category || ''} ${rec.document_ref || ''} ${rec.notes || ''}`.toLowerCase();
            if (!text.includes(q)) return false;
          }
          return true;
        });

        return (
          <div className="compliance-section">
            <div className="section-header-row">
              <div>
                <h3 className="section-title">Statutory, Labour &amp; Legal Compliance Tracker</h3>
                <p className="section-sub">
                  Manage recurring EPF, ESIC, Professional Tax, TDS 24Q, Labour Welfare, and internal HR audit deadlines
                </p>
              </div>
              {isAdmin && (
                <button type="button" className="btn-post-job comp-add-btn" onClick={openCreateCompModal}>
                  <PlusIcon size={14} />
                  <span>Add Compliance Standard</span>
                </button>
              )}
            </div>

            {/* Summary KPI Cards */}
            <div className="comp-kpi-grid">
              <button
                type="button"
                className={`comp-kpi-card ${compStatusFilter === '' ? 'active' : ''}`}
                onClick={() => setCompStatusFilter('')}
              >
                <span className="comp-kpi-label">Total standards</span>
                <strong className="comp-kpi-val tabular-nums">{totalComp}</strong>
              </button>
              <button
                type="button"
                className={`comp-kpi-card ${compStatusFilter === 'compliant' ? 'active' : ''}`}
                onClick={() => setCompStatusFilter((v) => (v === 'compliant' ? '' : 'compliant'))}
              >
                <span className="comp-kpi-label">Compliant</span>
                <strong className="comp-kpi-val comp-val-pos tabular-nums">{compliantCount}</strong>
              </button>
              <button
                type="button"
                className={`comp-kpi-card ${compStatusFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setCompStatusFilter((v) => (v === 'pending' ? '' : 'pending'))}
              >
                <span className="comp-kpi-label">Pending filings</span>
                <strong className="comp-kpi-val comp-val-warn tabular-nums">{pendingCount}</strong>
              </button>
              <button
                type="button"
                className={`comp-kpi-card ${compStatusFilter === 'overdue' ? 'active' : ''}`}
                onClick={() => setCompStatusFilter((v) => (v === 'overdue' ? '' : 'overdue'))}
              >
                <span className="comp-kpi-label">Overdue</span>
                <strong className="comp-kpi-val comp-val-neg tabular-nums">{overdueCount}</strong>
              </button>
            </div>

            {/* Filter Toolbar */}
            <div className="comp-toolbar">
              <div className="comp-search-wrap">
                <SearchIcon size={14} className="comp-search-icon" />
                <input
                  type="text"
                  className="comp-search-input"
                  placeholder="Search filings, forms (e.g. Form 24Q, EPF), or notes..."
                  value={compSearch}
                  onChange={(e) => setCompSearch(e.target.value)}
                />
              </div>
              <select
                className="comp-filter-select"
                value={compCategoryFilter}
                onChange={(e) => setCompCategoryFilter(e.target.value)}
              >
                <option value="">All Categories</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <select
                className="comp-filter-select"
                value={compStatusFilter}
                onChange={(e) => setCompStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="compliant">Compliant</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            <div className="compliance-table-wrap">
              <table className="compliance-table">
                <thead>
                  <tr>
                    <th>Compliance Standard / Requirement</th>
                    <th>Category</th>
                    <th>Frequency</th>
                    <th>Next Due Date</th>
                    <th>Status</th>
                    <th>Filing Notes &amp; Reference</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {complianceLoading ? (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6}>
                        <div className="loader_container">
                          <p className="loader_spinner"></p>
                          <p>Loading compliance records...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredCompliance.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="comp-empty-cell">
                        No compliance records match your current filters.
                        {isAdmin && ' Click "+ Add Compliance Standard" to register one.'}
                      </td>
                    </tr>
                  ) : (
                    filteredCompliance.map((rec) => {
                      const overdue = isOverdueRec(rec);
                      return (
                        <tr key={rec.id} className={overdue ? 'comp-row-overdue' : ''}>
                          <td>
                            <div className="comp-title-cell">
                              <strong>{rec.title}</strong>
                              {rec.document_ref && (
                                <span className="comp-doc-ref">Ref: {rec.document_ref}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="comp-category-tag">{(rec.category || 'General').replace(/_/g, ' ')}</span>
                          </td>
                          <td className="comp-freq-cell">{(rec.frequency || 'monthly').replace(/_/g, ' ')}</td>
                          <td className="tabular-nums">
                            <div className="comp-due-wrap">
                              <strong>{rec.due_date ? new Date(rec.due_date).toLocaleDateString() : 'N/A'}</strong>
                              {overdue && <span className="comp-overdue-pill">Overdue</span>}
                            </div>
                          </td>
                          <td>
                            <span className={`comp-status-badge status-${rec.status === 'compliant' ? 'compliant' : overdue ? 'overdue' : 'pending'}`}>
                              {rec.status === 'compliant' ? (
                                <><CheckIcon size={12} /> Compliant</>
                              ) : overdue ? (
                                <><AlertTriangleIcon size={12} /> Overdue</>
                              ) : (
                                <><AlertTriangleIcon size={12} /> Pending</>
                              )}
                            </span>
                          </td>
                          <td className="comp-note-cell">
                            {rec.notes ? (
                              <div
                                className="comp-note-html"
                                dangerouslySetInnerHTML={{ __html: renderSafeHtml(rec.notes) }}
                              />
                            ) : (
                              <span className="comp-note-empty">--</span>
                            )}
                          </td>
                          {isAdmin && (
                            <td>
                              <div className="comp-actions-group">
                                <button
                                  type="button"
                                  className={`btn-comp-toggle ${rec.status === 'compliant' ? 'is-compliant' : ''}`}
                                  onClick={() => handleToggleCompliance(rec.id, rec.status)}
                                >
                                  {rec.status === 'compliant' ? 'Mark Pending' : 'Mark Complied'}
                                </button>
                                <button
                                  type="button"
                                  className="btn-comp-icon"
                                  onClick={() => openEditCompModal(rec)}
                                  title="Edit Compliance Record"
                                >
                                  <EditIcon size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-comp-icon danger"
                                  onClick={() => handleDeleteCompliance(rec)}
                                  title="Delete Compliance Record"
                                >
                                  <TrashIcon size={13} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* POST / EDIT JOB MODAL */}
      {showJobModal && (
        <div className="rc-modal-backdrop" onClick={() => setShowJobModal(false)}>
          <div className="rc-modal-card rc-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="rc-modal-header">
              <h4 className="rc-modal-title">{editingJobId ? 'Edit Job Opening' : 'Post New Job Opening'}</h4>
              <button type="button" className="rc-modal-close-btn" onClick={() => setShowJobModal(false)}>×</button>
            </div>
            <form onSubmit={handleSaveJob} className="rc-modal-form">
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
                <RichTextEditor
                  value={jobForm.description}
                  placeholder="Key responsibilities, role overview, and team details..."
                  minHeight="100px"
                  aiFieldLabel="Job Description"
                  aiContext={{ jobTitle: jobForm.title, department: jobForm.department, experience: jobForm.experience_range }}
                  onChange={(content) => setJobForm((prev) => ({ ...prev, description: content }))}
                />
              </div>
              <div className="rc-form-group form-group">
                <label className="rc-form-label">Requirements &amp; Key Skills</label>
                <RichTextEditor
                  value={jobForm.requirements}
                  placeholder="e.g. React.js, Node.js, PostgreSQL, REST APIs..."
                  minHeight="90px"
                  aiFieldLabel="Requirements & Key Skills"
                  aiContext={{ jobTitle: jobForm.title, department: jobForm.department }}
                  onChange={(content) => setJobForm((prev) => ({ ...prev, requirements: content }))}
                />
              </div>
              <div className="rc-modal-actions">
                <button type="button" className="rc-btn-cancel" onClick={() => setShowJobModal(false)}>Cancel</button>
                <button type="submit" className="rc-btn-save" disabled={savingJob}>
                  {savingJob ? 'Saving...' : editingJobId ? 'Update Job Opening' : 'Publish Job Opening'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANDIDATE INTERVIEW / EDIT MODAL */}
      {selectedCandidate && (
        <div className="rc-modal-backdrop" onClick={() => setSelectedCandidate(null)}>
          <div className="rc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="rc-modal-header">
              <h4 className="rc-modal-title">Candidate: {selectedCandidate.name}</h4>
              <button type="button" className="rc-modal-close-btn" onClick={() => setSelectedCandidate(null)}>×</button>
            </div>
            <form onSubmit={handleUpdateCandidate} className="rc-modal-form">
              {/* Advisory AI Resume vs Job Comparison */}
              <div className='zorvi-btn-candidate-detail'>
                {!candAiOpen ? (
                  <button
                    type="button"
                    className="zx-ai-pill-btn"
                    onClick={() => runCandidateAiCompare(selectedCandidate.id)}
                  >
                    <SparklesIcon size={13} />
                    <span>ZORVI</span>
                  </button>
                ) : (
                  <AiInsightBox
                    title="ZORVI Candidate vs Job Fit (Advisory Only)"
                    subtitle="Helps screen resumes faster — hiring & stage."
                    loading={candAiLoading}
                    error={candAiErr}
                    uncertainty={candAiData?.uncertainty}
                    providerMeta={candAiData?.meta}
                    onRefresh={() => runCandidateAiCompare(selectedCandidate.id)}
                    onClose={() => setCandAiOpen(false)}
                  >
                    {candAiData && (
                      <div>
                        <p style={{ margin: '0 0 6px' }}>{candAiData.summary}</p>
                        {typeof candAiData.advisoryMatchScore === 'number' && (
                          <div className="zx-ai-tags">
                            <span className="zx-ai-tag">Advisory Match Score: {candAiData.advisoryMatchScore}/100</span>
                          </div>
                        )}
                        {candAiData.matchingStrengths?.length > 0 && (
                          <div style={{ marginTop: '6px', fontSize: '12px' }}>
                            <strong>Observed Matches:</strong>
                            <ul className="zx-ai-list">{candAiData.matchingStrengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                          </div>
                        )}
                        {candAiData.gapsOrUnclear?.length > 0 && (
                          <div style={{ marginTop: '6px', fontSize: '12px' }}>
                            <strong>Gaps / Unverified Requirements:</strong>
                            <ul className="zx-ai-list">{candAiData.gapsOrUnclear.map((g, i) => <li key={i}>{g}</li>)}</ul>
                          </div>
                        )}
                        {candAiData.suggestedInterviewQuestions?.length > 0 && (
                          <div style={{ marginTop: '6px', fontSize: '12px' }}>
                            <strong>Suggested Interview Questions:</strong>
                            <ul className="zx-ai-list">{candAiData.suggestedInterviewQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    )}
                  </AiInsightBox>
                )}
              </div>
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
                        <FileTextIcon size={13} style={{ marginRight: 5 }} /> Download Resume ({selectedCandidate.resume_file_name})
                      </button>
                    )}
                    {selectedCandidate.linkedin_url && (
                      <a href={selectedCandidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="cand-app-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <LinkIcon size={13} /> LinkedIn Profile
                      </a>
                    )}
                    {selectedCandidate.portfolio_url && (
                      <a href={selectedCandidate.portfolio_url} target="_blank" rel="noopener noreferrer" className="cand-app-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <GlobeIcon size={13} /> Portfolio / GitHub
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
                <RichTextEditor
                  value={interviewForm.interview_notes}
                  placeholder="Technical strengths, communication, culture fit..."
                  minHeight="100px"
                  aiFieldLabel="Interview Feedback & Evaluator Notes"
                  aiContext={{ candidate: selectedCandidate?.name, role: selectedCandidate?.job_title || selectedCandidate?.position }}
                  onChange={(content) => setInterviewForm((prev) => ({ ...prev, interview_notes: content }))}
                />
              </div>
              <div className="rc-modal-actions">
                <button type="button" className="rc-btn-cancel" onClick={() => setSelectedCandidate(null)}>Cancel</button>
                <button type="submit" className="rc-btn-save" disabled={updatingCandidate}>
                  {updatingCandidate ? 'Saving...' : 'Save Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT STATUTORY COMPLIANCE MODAL */}
      {showCompModal && (
        <div className="rc-modal-backdrop" onClick={() => setShowCompModal(false)}>
          <div className="rc-modal-card rc-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="rc-modal-header">
              <h4 className="rc-modal-title">
                {editingCompId ? 'Edit Compliance Requirement' : 'Add Statutory / Labour Compliance Requirement'}
              </h4>
              <button type="button" className="rc-modal-close-btn" onClick={() => setShowCompModal(false)}>×</button>
            </div>
            <form onSubmit={handleSaveCompliance} className="rc-modal-form">
              <div className="rc-form-group">
                <label className="rc-form-label">Compliance Standard / Requirement Title *</label>
                <input
                  type="text"
                  className="rc-form-input"
                  placeholder="e.g. POSH Annual Internal Committee Report / EPF Monthly ECR"
                  value={compForm.title}
                  onChange={(e) => setCompForm({ ...compForm, title: e.target.value })}
                  required
                />
              </div>

              <div className="rc-form-row">
                <div className="rc-form-group">
                  <label className="rc-form-label">Category</label>
                  <select
                    className="rc-form-select"
                    value={compForm.category}
                    onChange={(e) => setCompForm({ ...compForm, category: e.target.value })}
                  >
                    <option value="PF_ESI">PF / ESI (EPFO &amp; ESIC)</option>
                    <option value="Tax_TDS">Tax &amp; TDS (Form 24Q / PT)</option>
                    <option value="Labour_Law">Labour Law (LWF / Bonus / Shops Act)</option>
                    <option value="Policy_Audit">Internal HR Policy &amp; POSH Audit</option>
                    <option value="Other">Other Statutory Requirement</option>
                  </select>
                </div>
                <div className="rc-form-group">
                  <label className="rc-form-label">Filing Frequency</label>
                  <select
                    className="rc-form-select"
                    value={compForm.frequency}
                    onChange={(e) => setCompForm({ ...compForm, frequency: e.target.value })}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half_yearly">Half-Yearly</option>
                    <option value="annual">Annual</option>
                    <option value="one_time">One-Time</option>
                  </select>
                </div>
              </div>

              <div className="rc-form-row">
                <div className="rc-form-group">
                  <label className="rc-form-label">Next Due Date</label>
                  <input
                    type="date"
                    className="rc-form-input"
                    value={compForm.due_date}
                    onChange={(e) => setCompForm({ ...compForm, due_date: e.target.value })}
                  />
                </div>
                <div className="rc-form-group">
                  <label className="rc-form-label">Compliance Status</label>
                  <select
                    className="rc-form-select"
                    value={compForm.status}
                    onChange={(e) => setCompForm({ ...compForm, status: e.target.value })}
                  >
                    <option value="pending">Pending</option>
                    <option value="compliant">Compliant</option>
                  </select>
                </div>
              </div>

              <div className="rc-form-group">
                <label className="rc-form-label">Act / Form Reference / Challan Code</label>
                <input
                  type="text"
                  className="rc-form-input"
                  placeholder="e.g. Form 24Q / EPF ECR Sec 7A / Shops & Establishments Act"
                  value={compForm.document_ref}
                  onChange={(e) => setCompForm({ ...compForm, document_ref: e.target.value })}
                />
              </div>

              <div className="rc-form-group">
                <label className="rc-form-label">Filing Instructions &amp; Notes</label>
                <RichTextEditor
                  value={compForm.notes}
                  minHeight="100px"
                  maxHeight="200px"
                  aiFieldLabel="Statutory Compliance Filing Notes"
                  aiContext={{ title: compForm.title, category: compForm.category, frequency: compForm.frequency }}
                  placeholder="Describe statutory applicability, challan steps, or audit checklist..."
                  onChange={(val) => setCompForm((prev) => ({ ...prev, notes: val }))}
                />
              </div>

              <div className="rc-modal-actions">
                <button type="button" className="rc-btn-cancel" onClick={() => setShowCompModal(false)}>Cancel</button>
                <button type="submit" className="rc-btn-save" disabled={savingComp}>
                  {savingComp ? 'Saving...' : editingCompId ? 'Save Changes' : 'Create Standard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
