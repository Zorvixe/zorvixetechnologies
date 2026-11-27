import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import {
  getCandidates,
  createCandidate,
  generateCandidateLink,
  toggleCandidateLink,
  updateCandidateStatus,
  downloadCandidatePdf,
  formatDate,
  formatBytes,
  apiMe,
  apiParseCandidateResume,
} from "../api";
import Topbar from "../components/Topbar";
import "./Candidates.css";

function getInitials(name = '', email = '') {
  const src = String(name || email || 'C').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default function Candidates() {
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [linkFilter, setLinkFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [form, setForm] = useState({ name: "", email: "", phone: "", position: "" });
  const [creating, setCreating] = useState(false);
  const [linkInfo, setLinkInfo] = useState(null);

  // Resume Upload & Autofill State
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeInfo, setResumeInfo] = useState(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeParsed, setResumeParsed] = useState(false);
  const [extractedFields, setExtractedFields] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Toast
  const toastTimer = useRef(null);
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' });

  const showToast = useCallback((message, type = 'success') => {
    setToast({ open: true, type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast(t => ({ ...t, open: false }));
    }, 3000);
  }, []);

  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t => ({ ...t, open: false }));
  };

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const handleRemoveResume = () => {
    setResumeFile(null);
    setResumeInfo(null);
    setResumeParsing(false);
    setResumeParsed(false);
    setExtractedFields([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleResumeSelect = async (file) => {
    if (!file) return;
    const validExtensions = [".pdf", ".doc", ".docx", ".txt"];
    const ext = file.name ? "." + file.name.split(".").pop().toLowerCase() : "";
    if (
      !validExtensions.includes(ext) &&
      !file.type.includes("pdf") &&
      !file.type.includes("document") &&
      !file.type.includes("text")
    ) {
      showToast("Please upload a PDF, DOC, DOCX, or TXT file", "error");
      return;
    }

    setResumeFile(file);
    setResumeParsing(true);
    setResumeParsed(false);
    setExtractedFields([]);

    try {
      const data = await apiParseCandidateResume(file);
      setResumeInfo(data.file || null);
      const extracted = data.extracted || {};
      const filled = [];

      setForm((prev) => {
        const next = { ...prev };
        if (extracted.name && extracted.name.trim()) {
          next.name = extracted.name.trim();
          filled.push("Name");
        }
        if (extracted.email && extracted.email.trim()) {
          next.email = extracted.email.trim().toLowerCase();
          filled.push("Email");
        }
        if (extracted.phone && extracted.phone.trim()) {
          next.phone = extracted.phone.trim();
          filled.push("Phone");
        }
        if (extracted.position && extracted.position.trim()) {
          next.position = extracted.position.trim();
          filled.push("Position");
        }
        return next;
      });

      setExtractedFields(filled);
      setResumeParsed(true);
      if (filled.length > 0) {
        showToast(`Resume parsed! Autofilled: ${filled.join(", ")}`, "success");
      } else {
        showToast("Resume attached. Enter candidate details below.", "success");
      }
    } catch (err) {
      console.error("Resume parse error:", err);
      showToast(err.message || "Failed to extract from resume, but file is attached", "error");
    } finally {
      setResumeParsing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleResumeSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await apiMe();
        const role = (me.me?.role || me.user?.role || "").toLowerCase();
        setIsAdmin(role === "admin");
      } catch {
        setIsAdmin(false);
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCandidates();
      setCandidates(data.candidates || []);
    } catch (e) {
      setError(e.message || "Failed to load candidates");
      showToast(e.message || "Failed to load candidates", 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!showCreateModal && !linkInfo) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowCreateModal(false);
        setLinkInfo(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showCreateModal, linkInfo]);

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      if (!form.name || form.name.trim().length < 3) throw new Error("Name must be at least 3 characters");
      if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) throw new Error("Valid email required");
      if (!form.phone || !/^[6-9]\d{9}$/.test(form.phone)) throw new Error("Phone must start 6-9 and be 10 digits");
      if (!form.position || form.position.trim().length < 2) throw new Error("Position must be at least 2 characters");

      await createCandidate({ ...form, resume_file: resumeInfo });
      setForm({ name: "", email: "", phone: "", position: "" });
      handleRemoveResume();
      setShowCreateModal(false);
      await refresh();
      showToast('Candidate Created', 'success');
    } catch (e) {
      showToast(e.message || "Create failed", 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateLink = async (id) => {
    setError("");
    try {
      const data = await generateCandidateLink(id);
      setLinkInfo({ link: data.link, token: data.token, expiresAt: data.expiresAt });
      await refresh();
      showToast('Onboarding Link Generated', 'success');
    } catch (e) {
      showToast(e.message || "Failed to generate link", 'error');
    }
  };

  const handleToggleLink = async (id, nextActive) => {
    setError("");
    try {
      await toggleCandidateLink(id, nextActive);
      await refresh();
      showToast('Onboarding link deactivated', 'success');
    } catch (e) {
      showToast(e.message || "Failed to toggle link", 'error');
    }
  };

  const handleStatus = async (id, status) => {
    setError("");
    try {
      await updateCandidateStatus(id, status);
      await refresh();
      showToast(`Candidate status set to ${status}`, 'success');
    } catch (e) {
      showToast(e.message || "Failed to update status", 'error');
    }
  };

  const handleDownload = async (candidateId, name) => {
    setError("");
    try {
      const blob = await downloadCandidatePdf(candidateId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name || "candidate"}-certificates.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showToast(e.message || "Download failed", 'error');
    }
  };

  const copy = async (text, label = "Copied to clipboard") => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label, 'success');
    } catch {
      showToast("Copy failed", 'error');
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (statusFilter !== "all" && String(c.status || "pending").toLowerCase() !== statusFilter) {
        return false;
      }
      const hasLink = !!c.active_token && !!c.token_active;
      if (linkFilter === "active" && !hasLink) return false;
      if (linkFilter === "inactive" && hasLink) return false;
      if (q) {
        const hay = `${c.name || ""} ${c.email || ""} ${c.phone || ""} ${c.position || ""} ${c.candidate_id || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [candidates, search, statusFilter, linkFilter]);

  const totalCount = candidates.length;
  const pendingCount = candidates.filter((c) => c.status === "pending" || !c.status).length;
  const uploadedCount = candidates.filter((c) => !!c.file_name).length;
  const approvedCount = candidates.filter((c) => c.status === "approved").length;

  return (
    <div className="cnd-shell">
      <Topbar title="Candidates">
        {isAdmin && (
          <button
            type="button"
            className="cnd-btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New Candidate</span>
          </button>
        )}
      </Topbar>

      <div className="cnd-page">


        {/* Jira KPI Summary Ribbon */}
        <div className="cnd-kpi-grid">
          <div className="cnd-kpi-card kpi-blue">
            <span className="cnd-kpi-label">Total Candidates</span>
            <strong className="cnd-kpi-val">{totalCount}</strong>
            <span className="cnd-kpi-sub">All onboarding records</span>
          </div>
          <div className="cnd-kpi-card kpi-amber">
            <span className="cnd-kpi-label">Pending Review</span>
            <strong className="cnd-kpi-val">{pendingCount}</strong>
            <span className="cnd-kpi-sub">Awaiting submission/decision</span>
          </div>
          <div className="cnd-kpi-card kpi-teal">
            <span className="cnd-kpi-label">Documents Uploaded</span>
            <strong className="cnd-kpi-val">{uploadedCount}</strong>
            <span className="cnd-kpi-sub">Certificate packets ready</span>
          </div>
          <div className="cnd-kpi-card kpi-green">
            <span className="cnd-kpi-label">Approved</span>
            <strong className="cnd-kpi-val">{approvedCount}</strong>
            <span className="cnd-kpi-sub">Verified &amp; cleared</span>
          </div>
        </div>

        {/* Jira Toolbar */}
        <div className="cnd-toolbar">
          <div className="cnd-search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search candidates"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="cnd-clear-btn"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="cnd-filters">
            <select
              className="cnd-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="documents_uploaded">Documents Uploaded</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              className="cnd-filter-select"
              value={linkFilter}
              onChange={(e) => setLinkFilter(e.target.value)}
              aria-label="Filter by onboarding link"
            >
              <option value="all">All Link States</option>
              <option value="active">Active Link Only</option>
              <option value="inactive">No Active Link</option>
            </select>

            <button type="button" className="cnd-btn-subtle" onClick={refresh} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {error && <div className="cnd-error-banner" role="alert">{error}</div>}

        {/* Candidates Jira Table */}
        <div className="cnd-table-card">
          <div className="cnd-table-wrap">
            <table className="cnd-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Candidate</th>
                  <th>Contact</th>
                  <th>Candidate ID</th>
                  <th>Status</th>
                  <th>Onboarding Link</th>
                  <th>Certificates</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="cnd-loading-state">
                        <div className="loader_container">
                          <p className="loader_spinner"></p>
                          <p>Loading candidates...</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="cnd-empty-state">
                        <strong>No candidates found</strong>
                        <span>{candidates.length === 0 ? "Click '+ New Candidate' above to create your first onboarding record." : "Try adjusting your search or filter criteria."}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((c, idx) => {
                    const hasLink = !!c.active_token && c.token_active;
                    const uploaded = !!c.file_name;
                    const statusKey = String(c.status || "pending").toLowerCase();
                    return (
                      <tr key={c.id}>
                        <td><span className="cnd-id-num">{idx + 1}</span></td>
                        <td>
                          <div className="cnd-person-cell">
                            <div className="cnd-avatar">{getInitials(c.name, c.email)}</div>
                            <div>
                              <div className="cnd-name">{c.name}</div>
                              <div className="cnd-role">{c.position || "Unspecified Role"}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="cnd-contact-email">{c.email}</div>
                          <div className="cnd-contact-phone">{c.phone}</div>
                        </td>
                        <td>
                          <code className="cnd-code-tag">{c.candidate_id}</code>
                        </td>
                        <td>
                          <span className={`cnd-lozenge ${statusKey}`}>
                            {statusKey.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td>
                          {hasLink ? (
                            <div className="cnd-link-cell">
                              <div className="cnd-link-meta">
                                <code className="cnd-token-chip">{c.active_token.slice(0, 10)}…</code>
                                <span className="cnd-exp-text">exp {formatDate(c.token_expiry)}</span>
                              </div>
                              <div className="cnd-mini-actions">
                                <button
                                  type="button"
                                  className="cnd-btn-mini"
                                  onClick={() => copy(`https://zorvixetechnologies.in/onboarding/${c.active_token}`, 'Onboarding URL copied')}
                                >
                                  Copy URL
                                </button>
                                <button
                                  type="button"
                                  className="cnd-btn-mini danger"
                                  onClick={() => handleToggleLink(c.id, false)}
                                >
                                  Deactivate
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="cnd-btn-mini primary"
                              onClick={() => handleGenerateLink(c.id)}
                            >
                              Generate Link
                            </button>
                          )}
                        </td>
                        <td>
                          {uploaded ? (
                            <div className="cnd-file-cell">
                              <div className="cnd-file-name" title={c.file_name}>{c.file_name}</div>
                              <div className="cnd-file-meta">
                                {formatBytes(c.file_size)} &bull; {formatDate(c.upload_date)}
                              </div>
                            </div>
                          ) : (
                            <span className="cnd-muted">No upload</span>
                          )}
                        </td>
                        <td>
                          <div className="cnd-actions-cell">
                            <div className="cnd-actions-row">
                              <button
                                type="button"
                                className="cnd-btn-mini approve"
                                onClick={() => handleStatus(c.id, "approved")}
                                disabled={statusKey === "approved"}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="cnd-btn-mini danger"
                                onClick={() => handleStatus(c.id, "rejected")}
                                disabled={statusKey === "rejected"}
                              >
                                Reject
                              </button>
                            </div>
                            <div className="cnd-actions-row">
                              <button
                                type="button"
                                className="cnd-btn-mini"
                                onClick={() => handleStatus(c.id, "pending")}
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                className="cnd-btn-mini primary"
                                disabled={!uploaded}
                                onClick={() => handleDownload(c.id, c.name)}
                                title={uploaded ? "Download uploaded certificates PDF" : "Waiting for candidate upload"}
                              >
                                PDF
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="cnd-table-footer">
            Showing <strong>{filteredRows.length}</strong> of <strong>{totalCount}</strong> candidates
          </div>
        </div>
      </div>

      {/* CREATE CANDIDATE MODAL (Scoped React Jira Modal) */}
      {showCreateModal && (
        <div className="cnd-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="cnd-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create Candidate">
            <div className="cnd-modal-header">
              <div>
                <h4>New Onboarding Candidate</h4>
                <span className="cnd-modal-sub">Upload a resume to autofill details or enter manually.</span>
              </div>
              <button type="button" className="cnd-modal-close" onClick={() => setShowCreateModal(false)} aria-label="Close">×</button>
            </div>

            <form className="cnd-modal-form" onSubmit={onCreate}>
              {/* Resume Upload Dropzone */}
              <div className="candidate-resume-section">
                <div className="cnd-resume-head">
                  <label>Upload Resume (Optional)</label>
                  <span className="cnd-autofill-tag">Autofills Candidate Details</span>
                </div>

                {!resumeFile ? (
                  <div
                    className={`candidate-resume-dropzone ${dragOver ? "drag-over" : ""}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleResumeSelect(e.target.files[0]);
                        }
                      }}
                    />
                    <div className="resume-drop-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div className="resume-drop-text">
                      <span className="cnd-drop-link">Click to upload resume</span> or drag &amp; drop
                    </div>
                    <div className="resume-drop-subtext">
                      PDF, DOC, DOCX, TXT (up to 5MB) &bull; Auto-extracts name, email, phone &amp; role
                    </div>
                  </div>
                ) : (
                  <div className="candidate-resume-card">
                    <div className="cnd-resume-file-row">
                      <div className="cnd-resume-left">
                        <div className="resume-file-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0052cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                          </svg>
                        </div>
                        <div className="cnd-resume-meta">
                          <div className="cnd-resume-filename">{resumeFile.name}</div>
                          <div className="cnd-resume-filesize">{formatBytes(resumeFile.size || 0)}</div>
                        </div>
                      </div>
                      <div className="cnd-resume-right">
                        {resumeParsing ? (
                          <span className="cnd-lozenge pending">Parsing...</span>
                        ) : resumeParsed ? (
                          <span className="cnd-lozenge approved">Autofilled</span>
                        ) : null}
                        <button
                          type="button"
                          className="cnd-btn-mini danger"
                          title="Remove resume"
                          onClick={handleRemoveResume}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {resumeParsed && extractedFields.length > 0 && (
                      <div className="cnd-autofill-banner">
                        Extracted: {extractedFields.join(", ")} (editable below)
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="cnd-form-grid">
                <div className="cnd-form-group">
                  <label htmlFor="cFullName">Full Name *</label>
                  <input
                    id="cFullName"
                    placeholder="e.g. Jane Smith"
                    required
                    value={form.name}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    autoFocus
                  />
                </div>

                <div className="cnd-form-group">
                  <label htmlFor="cEmail">Email Address *</label>
                  <input
                    id="cEmail"
                    type="email"
                    placeholder="candidate@example.com"
                    required
                    value={form.email}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  />
                </div>

                <div className="cnd-form-group">
                  <label htmlFor="cPhone">Phone Number *</label>
                  <input
                    id="cPhone"
                    type="tel"
                    placeholder="10-digit phone (starts 6-9)"
                    required
                    value={form.phone}
                    onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                  />
                </div>

                <div className="cnd-form-group">
                  <label htmlFor="cPosition">Position / Role *</label>
                  <input
                    id="cPosition"
                    placeholder="e.g. Frontend Developer"
                    required
                    value={form.position}
                    onChange={(e) => setForm((s) => ({ ...s, position: e.target.value }))}
                  />
                </div>
              </div>

              <div className="cnd-modal-actions">
                <button type="button" className="cnd-btn-subtle" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="cnd-btn-primary" disabled={creating}>
                  {creating ? "Creating..." : "Create Candidate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ONBOARDING LINK POPUP MODAL (Scoped React Jira Modal) */}
      {linkInfo && (
        <div className="cnd-modal-backdrop" onClick={() => setLinkInfo(null)}>
          <div className="cnd-modal-card cnd-modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Onboarding Link">
            <div className="cnd-modal-header">
              <div>
                <h4>Onboarding Verification Link</h4>
                <span className="cnd-modal-sub">Share securely with the candidate to upload documents.</span>
              </div>
              <button type="button" className="cnd-modal-close" onClick={() => setLinkInfo(null)} aria-label="Close">×</button>
            </div>

            <div className="cnd-modal-form">
              <div className="cnd-form-group">
                <label>Verification URL</label>
                <div className="cnd-copy-row">
                  <input type="text" readOnly value={linkInfo.link} className="cnd-mono-input" />
                  <button
                    type="button"
                    className="cnd-btn-subtle"
                    onClick={() => copy(linkInfo.link, 'Verification URL copied')}
                  >
                    Copy URL
                  </button>
                </div>
              </div>

              <div className="cnd-form-group">
                <label>Access Token</label>
                <div className="cnd-copy-row">
                  <input type="text" readOnly value={linkInfo.token} className="cnd-mono-input" />
                  <button
                    type="button"
                    className="cnd-btn-subtle"
                    onClick={() => copy(linkInfo.token, 'Access token copied')}
                  >
                    Copy Token
                  </button>
                </div>
              </div>

              <div className="cnd-expiry-box">
                Expires on: <strong>{formatDate(linkInfo.expiresAt)}</strong>
              </div>

              <div className="cnd-modal-actions">
                <button type="button" className="cnd-btn-primary" onClick={() => setLinkInfo(null)}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`toastx ${toast.type} ${toast.open ? 'show' : ''}`} role="status" aria-live="polite">
        <div className="toastx-icon">
          {toast.type === 'success' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
          )}
        </div>
        <div className="toastx-body">
          <div className="toastx-title">{toast.type === 'success' ? 'Success' : 'Error'}</div>
          <div className="toastx-msg">{toast.message}</div>
        </div>
        <button type="button" className="toastx-close" onClick={hideToast} aria-label="Close">×</button>
      </div>
    </div>
  );
}
