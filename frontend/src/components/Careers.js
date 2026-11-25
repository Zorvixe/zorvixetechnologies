import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Briefcase,
  MapPin,
  Clock,
  Users,
  Mail,
  ShieldCheck,
  Search,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  LogOut,
  ArrowRight,
  ChevronRight,
  X,
  Calendar,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import './Careers.css';

const API_BASE_URL =
  process.env.REACT_APP_API_BASE || 'https://api.zorvixetechnologies.in';
const ENV_GOOGLE_CLIENT_ID =
  (process.env.REACT_APP_GOOGLE_CLIENT_ID || '').trim();
const CAREERS_TOKEN_KEY = 'zorvixe_careers_token';

const isGmailAddress = (email) =>
  /^[^\s@]+@(gmail\.com|googlemail\.com)$/i.test(String(email || '').trim());

const STAGE_META = {
  applied: { label: 'Applied', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  screening: { label: 'In Screening', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
  interview: { label: 'Interview Scheduled', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  offer: { label: 'Offer Extended', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  hired: { label: 'Hired', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  rejected: { label: 'Not Selected', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
};

function formatBytes(bytes) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function Careers() {
  // Summary teaser (public before login)
  const [summary, setSummary] = useState({ openCount: 0, departments: [], googleClientId: '' });

  // Auth / Google & Gmail Login state
  const [token, setToken] = useState(() => localStorage.getItem(CAREERS_TOKEN_KEY) || '');
  const [applicant, setApplicant] = useState(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(localStorage.getItem(CAREERS_TOKEN_KEY)));

  const [loginEmail, setLoginEmail] = useState('');
  const [otpStep, setOtpStep] = useState('email'); // 'email' | 'otp'
  const [otpCode, setOtpCode] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [showGoogleSetupHint, setShowGoogleSetupHint] = useState(false);

  const googleBtnRef = useRef(null);
  const googleClientId = ENV_GOOGLE_CLIENT_ID || summary.googleClientId || '';

  // Logged-in Careers Board state
  const [activeTab, setActiveTab] = useState('openings'); // 'openings' | 'applications'
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [myApplications, setMyApplications] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  // Apply Modal state
  const [selectedJob, setSelectedJob] = useState(null);
  const [applyForm, setApplyForm] = useState({
    name: '',
    phone: '',
    experience_years: '',
    expected_salary: '',
    current_location: '',
    notice_period: 'Immediate',
    linkedin_url: '',
    portfolio_url: '',
    cover_letter: '',
  });
  const [resumeFile, setResumeFile] = useState(null);
  const [parsedResumeInfo, setParsedResumeInfo] = useState(null);
  const [parsingResume, setParsingResume] = useState(false);
  const [autofilledFields, setAutofilledFields] = useState([]);
  const [submittingApp, setSubmittingApp] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applySuccessMsg, setApplySuccessMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    document.title = 'Careers | Zorvixe Technologies';
    fetchSummary();
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const fetchSummary = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/careers/summary`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSummary({
          openCount: data.openCount || 0,
          departments: data.departments || [],
          googleClientId: data.googleClientId || '',
        });
      }
    } catch {
      // non-blocking
    }
  };

  const handleGoogleCredentialResponse = useCallback(async (response) => {
    if (!response?.credential) return;
    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/careers/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Google Sign-In failed.');
      }

      localStorage.setItem(CAREERS_TOKEN_KEY, data.token);
      setToken(data.token);
      setApplicant(data.applicant);
      setMyApplications(data.myApplications || []);
    } catch (err) {
      setAuthError(err.message || 'Unable to sign in with Google.');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Load Google Identity Services when unauthenticated and googleClientId is present
  useEffect(() => {
    if (token || !googleClientId) return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
        });
        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 340,
        });
      } catch (err) {
        console.error('Google Sign-In init error:', err);
      }
    };

    if (window.google?.accounts?.id) {
      initGoogle();
      return;
    }

    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', initGoogle);
      return () => existingScript.removeEventListener('load', initGoogle);
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.body.appendChild(script);
  }, [token, googleClientId, handleGoogleCredentialResponse]);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem(CAREERS_TOKEN_KEY);
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.disableAutoSelect();
      } catch { }
    }
    setToken('');
    setApplicant(null);
    setJobs([]);
    setMyApplications([]);
    setOtpStep('email');
    setOtpCode('');
    setAuthError('');
    setAuthSuccess('');
  }, []);

  const loadCareersData = useCallback(
    async (activeToken) => {
      const authTok = activeToken || token;
      if (!authTok) return;
      setJobsLoading(true);
      try {
        const [meRes, jobsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/careers/auth/me`, {
            headers: { Authorization: `Bearer ${authTok}` },
          }),
          fetch(`${API_BASE_URL}/api/careers/jobs`, {
            headers: { Authorization: `Bearer ${authTok}` },
          }),
        ]);

        if (meRes.status === 401 || meRes.status === 403 || jobsRes.status === 401 || jobsRes.status === 403) {
          handleSignOut();
          return;
        }

        const meData = await meRes.json();
        const jobsData = await jobsRes.json();

        if (meRes.ok && meData.success) {
          setApplicant(meData.applicant);
          setMyApplications(meData.myApplications || []);
        }
        if (jobsRes.ok && jobsData.success) {
          setJobs(jobsData.jobs || []);
        }
      } catch (err) {
        console.error('Load careers error:', err);
      } finally {
        setJobsLoading(false);
        setCheckingSession(false);
      }
    },
    [token, handleSignOut]
  );

  useEffect(() => {
    if (token) {
      loadCareersData(token);
    } else {
      setCheckingSession(false);
    }
  }, [token, loadCareersData]);

  // Step 1: Send OTP to Gmail account
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    if (!isGmailAddress(email)) {
      setAuthError('Please enter a valid @gmail.com email address.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/careers/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Unable to send verification code.');
      }

      setOtpStep('otp');
      setResendTimer(30);
      setAuthSuccess(
        data.devOtp
          ? `Verification code sent (Preview code: ${data.devOtp})`
          : `We sent a 6-digit login code to ${email}. Check your inbox.`
      );
    } catch (err) {
      setAuthError(err.message || 'Failed to send code.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 2: Verify OTP & Login
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const cleanOtp = otpCode.replace(/\D/g, '').trim();
    if (cleanOtp.length !== 6) {
      setAuthError('Please enter the 6-digit code from your email.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/careers/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim().toLowerCase(), otp: cleanOtp }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Invalid verification code.');
      }

      localStorage.setItem(CAREERS_TOKEN_KEY, data.token);
      setToken(data.token);
      setApplicant(data.applicant);
      setMyApplications(data.myApplications || []);
      setAuthSuccess('');
    } catch (err) {
      setAuthError(err.message || 'Verification failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Open Apply Modal for a Job
  const openJobApplyModal = (job) => {
    setSelectedJob(job);
    setApplyError('');
    setApplySuccessMsg('');
    setResumeFile(null);
    setParsedResumeInfo(null);
    setAutofilledFields([]);
    setApplyForm({
      name: applicant?.name || '',
      phone: applicant?.phone || '',
      experience_years: '',
      expected_salary: '',
      current_location: applicant?.current_location || '',
      notice_period: 'Immediate',
      linkedin_url: '',
      portfolio_url: '',
      cover_letter: '',
    });
  };

  const closeJobApplyModal = () => {
    setSelectedJob(null);
    setApplyError('');
    setApplySuccessMsg('');
  };

  // Resume upload + autofill inside Apply Modal
  const handleResumeSelect = async (file) => {
    if (!file) return;
    const ext = file.name ? `.${file.name.split('.').pop().toLowerCase()}` : '';
    const allowed = ['.pdf', '.doc', '.docx', '.txt'];
    if (!allowed.includes(ext)) {
      setApplyError('Please upload a PDF, DOC, DOCX, or TXT resume.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setApplyError('Resume file size must be under 5MB.');
      return;
    }

    setApplyError('');
    setResumeFile(file);
    setParsingResume(true);
    setAutofilledFields([]);

    try {
      const fd = new FormData();
      fd.append('resume', file);
      const res = await fetch(`${API_BASE_URL}/api/careers/parse-resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setParsedResumeInfo(data.file || null);
        const ex = data.extracted || {};
        const filled = [];
        setApplyForm((prev) => {
          const next = { ...prev };
          if (ex.name && !prev.name) {
            next.name = ex.name;
            filled.push('Name');
          } else if (ex.name && ex.name.length >= 3) {
            next.name = ex.name;
            filled.push('Name');
          }
          if (ex.phone) {
            next.phone = ex.phone;
            filled.push('Phone');
          }
          return next;
        });
        setAutofilledFields(filled);
      }
    } catch {
      // File stays attached even if autofill fails
    } finally {
      setParsingResume(false);
    }
  };

  const clearResume = () => {
    setResumeFile(null);
    setParsedResumeInfo(null);
    setAutofilledFields([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Submit Application
  const handleApplySubmit = async (e) => {
    e.preventDefault();
    if (!selectedJob) return;

    const cleanName = applyForm.name.trim();
    const cleanPhone = applyForm.phone.replace(/\D/g, '').slice(-10);

    if (cleanName.length < 2) {
      setApplyError('Please enter your full name.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setApplyError('Please enter a valid 10-digit mobile number starting with 6-9.');
      return;
    }

    setSubmittingApp(true);
    setApplyError('');

    try {
      const fd = new FormData();
      fd.append('job_id', selectedJob.id);
      fd.append('name', cleanName);
      fd.append('phone', cleanPhone);
      fd.append('experience_years', applyForm.experience_years);
      fd.append('expected_salary', applyForm.expected_salary);
      fd.append('current_location', applyForm.current_location);
      fd.append('notice_period', applyForm.notice_period);
      fd.append('linkedin_url', applyForm.linkedin_url);
      fd.append('portfolio_url', applyForm.portfolio_url);
      fd.append('cover_letter', applyForm.cover_letter);

      if (parsedResumeInfo) {
        fd.append('resume_file', JSON.stringify(parsedResumeInfo));
      } else if (resumeFile) {
        fd.append('resume', resumeFile);
      }

      const res = await fetch(`${API_BASE_URL}/api/careers/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit application.');
      }

      setApplySuccessMsg(data.message || 'Application submitted successfully!');
      setMyApplications(data.myApplications || []);
      setApplicant((prev) => ({
        ...prev,
        name: cleanName,
        phone: cleanPhone,
        current_location: applyForm.current_location || prev?.current_location || '',
      }));
      // Refresh jobs so `already_applied` updates
      loadCareersData(token);
    } catch (err) {
      setApplyError(err.message || 'Application submission failed.');
    } finally {
      setSubmittingApp(false);
    }
  };

  // Filtered jobs
  const departments = useMemo(() => {
    const set = new Set(jobs.map((j) => j.department).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return jobs.filter((job) => {
      if (deptFilter !== 'All' && job.department !== deptFilter) return false;
      if (typeFilter !== 'All' && job.job_type !== typeFilter) return false;
      if (!q) return true;
      return (
        (job.title || '').toLowerCase().includes(q) ||
        (job.department || '').toLowerCase().includes(q) ||
        (job.location || '').toLowerCase().includes(q) ||
        (job.description || '').toLowerCase().includes(q) ||
        (job.requirements || '').toLowerCase().includes(q)
      );
    });
  }, [jobs, searchTerm, deptFilter, typeFilter]);

  /* ---------------- RENDER: CHECKING SESSION ---------------- */
  if (checkingSession) {
    return (
      <main className="careers-page-main">
        <div className="careers-loading-screen">
          <div className="careers-spinner" />
          <p>Verifying your applicant session...</p>
        </div>
      </main>
    );
  }

  /* ---------------- RENDER: STEP 1 — EMAIL LOGIN GATE ---------------- */
  if (!token || !applicant) {
    return (
      <main className="careers-page-main">
        <section className="careers-login-hero">
          <div className="container">
            <div className="row align-items-center g-5">
              {/* Left Info / Teaser Column */}
              <div className="col-lg-6">
                <div className="careers-pill-badge">
                  <Sparkles size={15} />
                  <span>We're Hiring at Zorvixe Technologies</span>
                </div>
                <h1 className="careers-hero-title">
                  Build the Next Generation of{' '}
                  <span className="careers-accent-text">Digital Solutions</span> With Us
                </h1>
                <p className="careers-hero-sub">
                  Join a fast-moving team of engineers, designers, and strategists building scalable
                  software platforms, web applications, and digital experiences.
                </p>

                <div className="careers-teaser-stats">
                  <div className="teaser-stat-box">
                    <span className="teaser-stat-val">{summary.openCount}</span>
                    <span className="teaser-stat-lbl">Open Roles Right Now</span>
                  </div>
                  <div className="teaser-stat-box">
                    <span className="teaser-stat-val">
                      {summary.departments.length || 1}
                    </span>
                    <span className="teaser-stat-lbl">Active Teams Hiring</span>
                  </div>
                  <div className="teaser-stat-box">
                    <span className="teaser-stat-val">1-Click</span>
                    <span className="teaser-stat-lbl">Resume Autofill Apply</span>
                  </div>
                </div>

                {summary.departments.length > 0 && (
                  <div className="careers-teaser-depts">
                    <span className="depts-label">Hiring across:</span>
                    <div className="depts-chips">
                      {summary.departments.map((d) => (
                        <span key={d} className="dept-chip">{d}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Gmail / Google Sign-In Card */}
              <div className="col-lg-6">
                <div className="careers-auth-card">
                  <div className="auth-card-header">
                    <div className="auth-icon-circle">
                      <ShieldCheck size={24} />
                    </div>
                    <h2>Sign In with Gmail Account</h2>
                    <p>
                      {otpStep === 'email'
                        ? 'Authenticate using your Google / Gmail account to browse open careers and apply.'
                        : `Enter the 6-digit verification code sent to ${loginEmail}`}
                    </p>
                  </div>

                  {authError && (
                    <div className="careers-alert careers-alert-error">
                      <AlertCircle size={17} />
                      <span>{authError}</span>
                    </div>
                  )}

                  {authSuccess && (
                    <div className="careers-alert careers-alert-success">
                      <CheckCircle2 size={17} />
                      <span>{authSuccess}</span>
                    </div>
                  )}

                  {otpStep === 'email' ? (
                    <>
                      {/* Primary Google OAuth Sign-In */}
                      <div className="google-signin-section">
                        {googleClientId ? (
                          <div ref={googleBtnRef} className="google-gsi-btn-slot" />
                        ) : (
                          <>
                            <button
                              type="button"
                              className="careers-btn-google"
                              disabled={authLoading}
                              onClick={() => setShowGoogleSetupHint((v) => !v)}
                            >
                              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z" />
                                <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z" />
                                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z" />
                              </svg>
                              <span>Continue with Google (Gmail)</span>
                            </button>
                            {showGoogleSetupHint && (
                              <div className="gmail-setup-hint">
                                Try Again Later or Contact Administrator
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="auth-divider">
                        <span>or</span>
                      </div>

                      <form onSubmit={handleSendOtp} className="auth-form">
                        <div className="auth-field">
                          <label htmlFor="careerEmailInput">Gmail Address</label>
                          <div className="auth-input-wrap">
                            <Mail size={18} className="auth-input-icon" />
                            <input
                              id="careerEmailInput"
                              type="email"
                              required
                              placeholder="yourname@gmail.com"
                              value={loginEmail}
                              onChange={(e) => setLoginEmail(e.target.value)}
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="careers-btn-primary w-100"
                          disabled={authLoading}
                        >
                          {authLoading ? 'Sending Gmail Code...' : 'Verify Gmail & Continue'}
                          {!authLoading && <ArrowRight size={17} />}
                        </button>

                        <div className="auth-security-note">
                          <ShieldCheck size={15} />
                          <span>Verified @gmail.com login required before accessing careers</span>
                        </div>
                      </form>
                    </>
                  ) : (
                    <form onSubmit={handleVerifyOtp} className="auth-form">
                      <div className="auth-field">
                        <label htmlFor="careerOtpInput">6-Digit Gmail Verification Code</label>
                        <input
                          id="careerOtpInput"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          autoFocus
                          className="otp-code-input"
                          placeholder="••••••"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        />
                      </div>

                      <button
                        type="submit"
                        className="careers-btn-primary w-100"
                        disabled={authLoading || otpCode.length !== 6}
                      >
                        {authLoading ? 'Verifying...' : 'Verify & Explore Careers'}
                        {!authLoading && <ChevronRight size={18} />}
                      </button>

                      <div className="auth-otp-footer">
                        <button
                          type="button"
                          className="auth-link-btn"
                          onClick={() => {
                            setOtpStep('email');
                            setOtpCode('');
                            setAuthError('');
                            setAuthSuccess('');
                          }}
                        >
                          Change Gmail
                        </button>
                        <button
                          type="button"
                          className="auth-link-btn"
                          disabled={resendTimer > 0 || authLoading}
                          onClick={handleSendOtp}
                        >
                          {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  /* ---------------- RENDER: STEP 2 — LOGGED-IN CAREERS PORTAL ---------------- */
  return (
    <main className="careers-page-main careers-logged-in">
      {/* Top Applicant Session Banner */}
      <section className="careers-portal-header">
        <div className="container">
          <div className="portal-header-inner">
            <div>
              <div className="portal-verified-pill">
                {applicant.avatar ? (
                  <img src={applicant.avatar} alt="" className="portal-google-avatar" />
                ) : (
                  <ShieldCheck size={14} />
                )}
                <span>
                  Signed in with Gmail: <strong>{applicant.email}</strong>
                </span>
              </div>
              <h1 className="portal-title">Zorvixe Technologies Careers</h1>
              <p className="portal-subtitle">
                Browse active roles synced live from HR and submit your application in under a minute.
              </p>
            </div>

            <div className="portal-header-actions">
              <div className="portal-tabs-switch">
                <button
                  type="button"
                  className={`portal-tab-btn ${activeTab === 'openings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('openings')}
                >
                  <Briefcase size={15} />
                  Open Roles ({jobs.length})
                </button>
                <button
                  type="button"
                  className={`portal-tab-btn ${activeTab === 'applications' ? 'active' : ''}`}
                  onClick={() => setActiveTab('applications')}
                >
                  <FileText size={15} />
                  My Applications ({myApplications.length})
                </button>
              </div>

              <button
                type="button"
                className="btn-refresh-careers"
                onClick={() => loadCareersData(token)}
                title="Refresh jobs & status"
              >
                <RefreshCw size={15} className={jobsLoading ? 'spin' : ''} />
              </button>

              <button
                type="button"
                className="btn-careers-logout"
                onClick={handleSignOut}
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="careers-portal-body">
        <div className="container">
          {/* VIEW A: OPEN POSITIONS */}
          {activeTab === 'openings' && (
            <>
              {/* Filter Bar */}
              <div className="careers-filters-bar">
                <div className="careers-search-box">
                  <Search size={18} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search role, skills, or location..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="careers-dept-pills">
                  {departments.map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      className={`dept-filter-pill ${deptFilter === dept ? 'active' : ''}`}
                      onClick={() => setDeptFilter(dept)}
                    >
                      {dept}
                    </button>
                  ))}
                </div>

                <select
                  className="type-filter-select"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="All">All Job Types</option>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Internship">Internship</option>
                </select>
              </div>

              {/* Jobs Grid */}
              {jobsLoading ? (
                <div className="careers-loading-inline">
                  <div className="careers-spinner" />
                  <p>Loading open job positions...</p>
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="careers-empty-box">
                  <Briefcase size={38} />
                  <h3>No open positions match your filter</h3>
                  <p>
                    {jobs.length === 0
                      ? 'There are currently no active job openings published. Please check back soon!'
                      : 'Try clearing your search keyword or department filter.'}
                  </p>
                </div>
              ) : (
                <div className="careers-jobs-grid">
                  {filteredJobs.map((job) => (
                    <article key={job.id} className="career-job-card">
                      <div className="job-card-head">
                        <span className="job-dept-tag">{job.department}</span>
                        <span className="job-type-tag">{job.job_type || 'Full-time'}</span>
                      </div>

                      <h3 className="career-job-title">{job.title}</h3>

                      <div className="career-job-meta">
                        <span>
                          <MapPin size={14} /> {job.location || 'Hyderabad / Remote'}
                        </span>
                        {job.experience_required && (
                          <span>
                            <Clock size={14} /> {job.experience_required}
                          </span>
                        )}
                        <span>
                          <Users size={14} /> {job.vacancies || 1}{' '}
                          {Number(job.vacancies) === 1 ? 'Vacancy' : 'Vacancies'}
                        </span>
                      </div>

                      {job.salary_range && (
                        <div className="career-job-salary">{job.salary_range}</div>
                      )}

                      <p className="career-job-desc">
                        {job.description || 'Join our team to build impactful products at Zorvixe Technologies.'}
                      </p>

                      <div className="career-job-footer">
                        <span className="posted-date">
                          Posted {new Date(job.created_at).toLocaleDateString()}
                        </span>

                        {job.already_applied ? (
                          <button
                            type="button"
                            className="btn-applied-badge"
                            onClick={() => setActiveTab('applications')}
                          >
                            <CheckCircle2 size={15} />
                            Applied • Track Status
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-apply-role"
                            onClick={() => openJobApplyModal(job)}
                          >
                            View &amp; Apply
                            <ArrowRight size={15} />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {/* VIEW B: MY APPLICATIONS TRACKER */}
          {activeTab === 'applications' && (
            <div className="my-applications-panel">
              {myApplications.length === 0 ? (
                <div className="careers-empty-box">
                  <FileText size={38} />
                  <h3>You haven't applied to any roles yet</h3>
                  <p>Browse our open positions and apply in seconds with instant resume autofill.</p>
                  <button
                    type="button"
                    className="careers-btn-primary mt-2"
                    onClick={() => setActiveTab('openings')}
                  >
                    Browse Open Roles
                  </button>
                </div>
              ) : (
                <div className="applications-list">
                  {myApplications.map((app) => {
                    const stKey = (app.stage || 'applied').toLowerCase();
                    const st = STAGE_META[stKey] || STAGE_META.applied;
                    return (
                      <div key={app.id} className="application-track-card">
                        <div className="app-track-main">
                          <div className="app-ref-row">
                            <span className="app-ref-id">{app.candidate_id}</span>
                            <span
                              className="app-stage-pill"
                              style={{
                                color: st.color,
                                backgroundColor: st.bg,
                                borderColor: st.border,
                              }}
                            >
                              {st.label}
                            </span>
                          </div>
                          <h4 className="app-job-title">{app.job_title || app.position}</h4>
                          <div className="app-track-meta">
                            {app.job_department && <span>{app.job_department}</span>}
                            {app.job_location && <span>• {app.job_location}</span>}
                            <span>• Applied on {new Date(app.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="app-track-right">
                          {app.interview_date && (
                            <div className="app-interview-badge">
                              <Calendar size={14} />
                              <span>
                                Interview:{' '}
                                {new Date(app.interview_date).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          )}
                          {app.resume_file_name && (
                            <div className="app-resume-pill">
                              <FileText size={13} />
                              <span>{app.resume_file_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* JOB DETAILS & EASY APPLY MODAL */}
      {selectedJob && (
        <div className="careers-modal-backdrop" onClick={closeJobApplyModal}>
          <div className="careers-apply-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="careers-modal-close"
              onClick={closeJobApplyModal}
              aria-label="Close modal"
            >
              <X size={20} />
            </button>

            {applySuccessMsg ? (
              <div className="apply-success-screen">
                <div className="success-check-circle">
                  <CheckCircle2 size={40} />
                </div>
                <h3>Application Submitted!</h3>
                <p>{applySuccessMsg}</p>
                <p className="success-sub">
                  Our hiring team has received your profile in the Candidate ATS Pipeline and sent
                  a confirmation email to <strong>{applicant.email}</strong>.
                </p>
                <div className="success-actions">
                  <button
                    type="button"
                    className="careers-btn-secondary"
                    onClick={() => {
                      closeJobApplyModal();
                      setActiveTab('applications');
                    }}
                  >
                    Track Application Status
                  </button>
                  <button
                    type="button"
                    className="careers-btn-primary"
                    onClick={closeJobApplyModal}
                  >
                    Back to Open Roles
                  </button>
                </div>
              </div>
            ) : (
              <div className="apply-modal-grid">
                {/* Left Column: Full Job Description */}
                <div className="apply-job-overview">
                  <span className="job-dept-tag mb-2">{selectedJob.department}</span>
                  <h2 className="overview-job-title">{selectedJob.title}</h2>

                  <div className="overview-meta-list">
                    <div><MapPin size={15} /> {selectedJob.location || 'Hyderabad / Remote'}</div>
                    <div><Briefcase size={15} /> {selectedJob.job_type || 'Full-time'}</div>
                    {selectedJob.experience_required && (
                      <div><Clock size={15} /> {selectedJob.experience_required}</div>
                    )}
                    {selectedJob.salary_range && (
                      <div className="overview-salary">{selectedJob.salary_range}</div>
                    )}
                  </div>

                  <div className="overview-section">
                    <h4>About the Role</h4>
                    <p>{selectedJob.description || 'Details will be discussed during screening.'}</p>
                  </div>

                  {selectedJob.requirements && (
                    <div className="overview-section">
                      <h4>Requirements &amp; Key Skills</h4>
                      <p>{selectedJob.requirements}</p>
                    </div>
                  )}
                </div>

                {/* Right Column: Easy Apply Form */}
                <div className="apply-form-column">
                  <div className="apply-form-header">
                    <h3>Apply for this Position</h3>
                    <p>Upload your resume to autofill your details, or fill in directly.</p>
                  </div>

                  {applyError && (
                    <div className="careers-alert careers-alert-error">
                      <AlertCircle size={16} />
                      <span>{applyError}</span>
                    </div>
                  )}

                  {/* Quick Resume Dropzone */}
                  <div className="careers-resume-box">
                    {!resumeFile ? (
                      <div
                        className={`careers-dropzone ${dragOver ? 'drag-over' : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(false);
                          if (e.dataTransfer.files?.[0]) handleResumeSelect(e.dataTransfer.files[0]);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.txt"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleResumeSelect(e.target.files[0]);
                          }}
                        />
                        <Upload size={22} className="drop-icon" />
                        <div className="drop-title">
                          <strong>Upload Resume</strong> or drag &amp; drop
                        </div>
                        <div className="drop-sub">
                          PDF, DOC, DOCX, TXT (Max 5MB) • Auto-fills Name &amp; Phone
                        </div>
                      </div>
                    ) : (
                      <div className="careers-resume-attached">
                        <div className="attached-left">
                          <FileText size={18} className="text-primary" />
                          <div className="attached-meta">
                            <span className="attached-name">{resumeFile.name}</span>
                            <span className="attached-size">{formatBytes(resumeFile.size)}</span>
                          </div>
                        </div>
                        <div className="attached-right">
                          {parsingResume ? (
                            <span className="parsing-pill">Parsing...</span>
                          ) : autofilledFields.length > 0 ? (
                            <span className="autofill-pill">
                              ✓ Autofilled {autofilledFields.join(', ')}
                            </span>
                          ) : (
                            <span className="attached-pill">Attached</span>
                          )}
                          <button type="button" className="btn-clear-file" onClick={clearResume}>
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleApplySubmit} className="careers-apply-form">
                    <div className="apply-row-2">
                      <div className="apply-field">
                        <label>Full Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Rahul Sharma"
                          value={applyForm.name}
                          onChange={(e) => setApplyForm({ ...applyForm, name: e.target.value })}
                        />
                      </div>
                      <div className="apply-field">
                        <label>Verified Email</label>
                        <input
                          type="email"
                          readOnly
                          className="input-readonly"
                          value={applicant.email}
                        />
                      </div>
                    </div>

                    <div className="apply-row-2">
                      <div className="apply-field">
                        <label>Mobile Number *</label>
                        <input
                          type="tel"
                          required
                          maxLength={10}
                          placeholder="10-digit number (starts 6-9)"
                          value={applyForm.phone}
                          onChange={(e) =>
                            setApplyForm({ ...applyForm, phone: e.target.value.replace(/\D/g, '') })
                          }
                        />
                      </div>
                      <div className="apply-field">
                        <label>Total Experience</label>
                        <input
                          type="text"
                          placeholder="e.g. 2.5 years / Fresher"
                          value={applyForm.experience_years}
                          onChange={(e) =>
                            setApplyForm({ ...applyForm, experience_years: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="apply-row-2">
                      <div className="apply-field">
                        <label>Current Location</label>
                        <input
                          type="text"
                          placeholder="e.g. Hyderabad, India"
                          value={applyForm.current_location}
                          onChange={(e) =>
                            setApplyForm({ ...applyForm, current_location: e.target.value })
                          }
                        />
                      </div>
                      <div className="apply-field">
                        <label>Expected Annual CTC</label>
                        <input
                          type="text"
                          placeholder="e.g. ₹8 LPA"
                          value={applyForm.expected_salary}
                          onChange={(e) =>
                            setApplyForm({ ...applyForm, expected_salary: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="apply-row-2">
                      <div className="apply-field">
                        <label>Notice Period</label>
                        <select
                          value={applyForm.notice_period}
                          onChange={(e) =>
                            setApplyForm({ ...applyForm, notice_period: e.target.value })
                          }
                        >
                          <option value="Immediate">Immediate Joiner</option>
                          <option value="15 Days">15 Days</option>
                          <option value="30 Days">30 Days</option>
                          <option value="60 Days">60 Days</option>
                          <option value="90 Days">90 Days</option>
                        </select>
                      </div>
                      <div className="apply-field">
                        <label>LinkedIn Profile URL</label>
                        <input
                          type="url"
                          placeholder="https://linkedin.com/in/..."
                          value={applyForm.linkedin_url}
                          onChange={(e) =>
                            setApplyForm({ ...applyForm, linkedin_url: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="apply-field">
                      <label>Portfolio / GitHub URL (Optional)</label>
                      <input
                        type="url"
                        placeholder="https://github.com/..."
                        value={applyForm.portfolio_url}
                        onChange={(e) =>
                          setApplyForm({ ...applyForm, portfolio_url: e.target.value })
                        }
                      />
                    </div>

                    <div className="apply-field">
                      <label>Why are you a great fit? (Optional)</label>
                      <textarea
                        rows={3}
                        placeholder="Briefly highlight relevant projects or achievements..."
                        value={applyForm.cover_letter}
                        onChange={(e) =>
                          setApplyForm({ ...applyForm, cover_letter: e.target.value })
                        }
                      />
                    </div>

                    <button
                      type="submit"
                      className="careers-btn-primary w-100 mt-2"
                      disabled={submittingApp || parsingResume}
                    >
                      {submittingApp ? 'Submitting Application...' : 'Submit Application'}
                      {!submittingApp && <ExternalLink size={16} />}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
