import React, { useEffect, useMemo, useState, useRef } from 'react'
import {
  getCandidates,
  createCandidate,
  generateCandidateLink,
  toggleCandidateLink,
  updateCandidateStatus,
  downloadCandidatePdf,
  formatDate,
  formatBytes,
  apiMe, // ✅ added
  apiParseCandidateResume,
} from "../api";
import Topbar from "../components/Topbar"

import "./Candidates.css";

export default function Candidates() {
  const [isAdmin, setIsAdmin] = useState(false)

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({ name: "", email: "", phone: "", position: "" });
  const [creating, setCreating] = useState(false);
  const [linkInfo, setLinkInfo] = useState(null);

  // --- Resume Upload & Autofill State ---
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeInfo, setResumeInfo] = useState(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeParsed, setResumeParsed] = useState(false);
  const [extractedFields, setExtractedFields] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

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
        showToast("Resume attached. Candidate details can be entered below.", "info");
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

  // --- Toast (bottom-right) ---
  const toastTimer = useRef(null)
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' })

  const showToast = (message, type = 'success') => {
    setToast({ open: true, type, message })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => {
      setToast(t => ({ ...t, open: false }))
    }, 3000)
  }

  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(t => ({ ...t, open: false }))
  }

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  // ✅ determine role once on mount
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

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCandidates();
      setCandidates(data.candidates || []);
    } catch (e) {
      showToast(e.message || "Failed to load candidates", 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

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
      setShowForm(false);
      const modalEl = document.getElementById('create_candidate');
      if (modalEl) {
        if (window.bootstrap?.Modal) {
          const inst = window.bootstrap.Modal.getInstance(modalEl);
          if (inst) inst.hide();
        }
        const closeBtn = modalEl.querySelector('[data-bs-dismiss="modal"]');
        if (closeBtn) closeBtn.click();
      }
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
      showToast('Candidate Link Generated', 'success')
    } catch (e) {
      showToast(e.message || "Failed to generate link", 'error');
    }
  };

  const handleToggleLink = async (id, nextActive) => {
    setError("");
    try {
      await toggleCandidateLink(id, nextActive);
      await refresh();
    } catch (e) {
      setError(e.message || "Failed to toggle link");
    }
  };

  const handleStatus = async (id, status) => {
    setError("");
    try {
      await updateCandidateStatus(id, status);
      await refresh();
      showToast('Update Candidate Status', 'success')
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

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied!");
    } catch {
      alert("Copy failed");
    }
  };



  const rows = useMemo(() => candidates, [candidates]);



  return (
    <div>
      <Topbar title="Onboarding">
        {isAdmin && (
          <button className="btn btn-primary" data-bs-toggle="modal"
            data-bs-target="#create_candidate" onClick={() => setShowForm(v => !v)}>
            New Candidate
          </button>
        )}
      </Topbar>

      <div className="page-cand mt-2">

        {/* Error Alert */}
        {error && <div className="alert-cand error-cand">{error}</div>}

        <div className="modal fade" id="create_candidate" tabIndex="-1" aria-labelledby="createCandidateModalLabel" aria-hidden="true">
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <form className="modal-content" onSubmit={onCreate}>
              <div className="modal-header">
                <h5 className="modal-title" id="createCandidateModalLabel">Create Candidate</h5>
                <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>

              <div className="modal-body">
                {/* Optional Resume Upload Dropzone */}
                <div className="candidate-resume-section mb-3">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <label className="form-label mb-0 fw-semibold text-secondary small d-flex align-items-center gap-1">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                      Upload Resume (Optional)
                    </label>
                    <span className="badge bg-light text-muted border" style={{ fontSize: "11px" }}>Autofills Candidate Details</span>
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
                            handleResumeSelect(e.target.files[0])
                          }
                        }}
                      />
                      <div className="resume-drop-icon">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <div className="resume-drop-text">
                        <span className="fw-semibold text-primary">Click to upload resume</span> or drag & drop
                      </div>
                      <div className="resume-drop-subtext">
                        PDF, DOC, DOCX, TXT (up to 5MB) • Auto-extracts name, email, phone & role
                      </div>
                    </div>
                  ) : (
                    <div className="candidate-resume-card">
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="d-flex align-items-center gap-2 overflow-hidden">
                          <div className="resume-file-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                          </div>
                          <div className="resume-file-info text-truncate">
                            <div className="fw-semibold text-dark text-truncate small">
                              {resumeFile.name}
                            </div>
                            <div className="text-muted" style={{ fontSize: "11px" }}>
                              {formatBytes(resumeFile.size || 0)}
                            </div>
                          </div>
                        </div>

                        <div className="d-flex align-items-center gap-2 flex-shrink-0">
                          {resumeParsing ? (
                            <span className="badge bg-warning-subtle text-warning d-flex align-items-center gap-1">
                              <span className="spinner-border spinner-border-sm" role="status" style={{ width: "11px", height: "11px" }}></span>
                              Parsing...
                            </span>
                          ) : resumeParsed ? (
                            <span className="badge bg-success-subtle text-success border border-success-subtle">
                              ✓ Autofilled
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger p-1"
                            title="Remove resume"
                            onClick={handleRemoveResume}
                            style={{ lineHeight: 1 }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      </div>

                      {resumeParsing && (
                        <div className="resume-parsing-indicator mt-2">
                          <div className="progress" style={{ height: "4px" }}>
                            <div className="progress-bar progress-bar-striped progress-bar-animated bg-primary" style={{ width: "100%" }}></div>
                          </div>
                          <div className="text-muted text-center mt-1" style={{ fontSize: "11px" }}>
                            Analyzing resume and extracting candidate details...
                          </div>
                        </div>
                      )}

                      {resumeParsed && extractedFields.length > 0 && (
                        <div className="resume-autofill-hint mt-2 p-2 bg-success-subtle rounded border border-success-subtle">
                          <div className="d-flex align-items-center justify-content-between">
                            <span className="text-success fw-medium small">
                              ✨ Extracted: {extractedFields.join(", ")}
                            </span>
                            <span className="text-muted" style={{ fontSize: "10.5px" }}>
                              Editable below
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label htmlFor="cFullName" className="form-label">
                      Full Name <span className="text-danger">*</span>
                    </label>
                    <input
                      id="cFullName"
                      className="form-control"
                      placeholder="e.g. Jane Smith"
                      required
                      value={form.name}
                      onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                      autoFocus
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label htmlFor="cEmail" className="form-label">
                      Email Address <span className="text-danger">*</span>
                    </label>
                    <input
                      id="cEmail"
                      type="email"
                      className="form-control"
                      placeholder="candidate@example.com"
                      required
                      value={form.email}
                      onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label htmlFor="cPhone" className="form-label">
                      Phone Number <span className="text-danger">*</span>
                    </label>
                    <input
                      id="cPhone"
                      type="tel"
                      className="form-control"
                      placeholder="10-digit phone (starts 6-9)"
                      required
                      value={form.phone}
                      onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label htmlFor="cPosition" className="form-label">
                      Position / Role <span className="text-danger">*</span>
                    </label>
                    <input
                      id="cPosition"
                      className="form-control"
                      placeholder="e.g. Frontend Developer"
                      required
                      value={form.position}
                      onChange={(e) => setForm((s) => ({ ...s, position: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? "Creating…" : "Create Candidate"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Link popup */}
        {linkInfo && (
          <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0, 0, 0, 0.5)" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Onboarding Link</h5>
                  <button type="button" className="btn-close" onClick={() => setLinkInfo(null)} aria-label="Close"></button>
                </div>

                <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Verification URL</label>
                  <div className="d-flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={linkInfo.link}
                      className="form-control font-monospace"
                      style={{ fontSize: "0.85rem" }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary flex-shrink-0"
                      onClick={() => copy(linkInfo.link)}
                    >
                      Copy URL
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Access Token</label>
                  <div className="d-flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={linkInfo.token}
                      className="form-control font-monospace"
                      style={{ fontSize: "0.85rem" }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary flex-shrink-0"
                      onClick={() => copy(linkInfo.token)}
                    >
                      Copy Token
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-3 bg-light border text-muted small">
                  <i className="bi bi-clock me-1"></i>
                  Expires on: <strong className="text-dark">{formatDate(linkInfo.expiresAt)}</strong>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-primary" onClick={() => setLinkInfo(null)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* Candidates Table */}
        <div className="card-cand">
          <h5>All Candidates</h5>
          {loading ? (

            <div className="loader_container">
              <p className="loader_spinner"></p>
              <p>Loading…</p>
            </div>
          ) : rows.length === 0 ? (
            <p>No candidates yet.</p>
          ) : (
            <div className="table-wrap-cand">
              <table className="table-cand">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name / Position</th>
                    <th>Contact</th>
                    <th>Candidate ID</th>
                    <th>Status</th>
                    <th>Active Link</th>
                    <th>Upload</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c, idx) => {
                    const hasLink = !!c.active_token && c.token_active;
                    const uploaded = !!c.file_name;
                    return (
                      <tr key={c.id}>
                        <td>{idx + 1}</td>
                        <td>
                          <div className="bold-cand">{c.name}</div>
                          <div className="muted-cand">{c.position || "-"}</div>
                        </td>
                        <td>
                          <div>{c.email}</div>
                          <div className="muted-cand">{c.phone}</div>
                        </td>
                        <td><code className="code-cand">{c.candidate_id}</code></td>
                        <td><span className={`badge-cand ${c.status}`}>{c.status.replace("_", " ")}</span></td>
                        <td>
                          {hasLink ? (
                            <>
                              <div className="mono-cand small-cand">{c.active_token.slice(0, 10)}…</div>
                              <div className="muted-cand small-cand">expires {formatDate(c.token_expiry)}</div>
                              <div className="row-cand gap-cand">
                                <button
                                  className="btn-cand xs-cand"
                                  onClick={() => copy(`https://zorvixetechnologies.in/onboarding/${c.active_token}`)}
                                >
                                  Copy URL
                                </button>
                                <button
                                  className="btn-cand danger-cand xs-cand"
                                  onClick={() => handleToggleLink(c.id, false)}
                                >
                                  Deactivate
                                </button>
                              </div>
                            </>
                          ) : (
                            <button
                              className="btn-cand primary-cand xs-cand"
                              onClick={() => handleGenerateLink(c.id)}
                            >
                              Generate
                            </button>
                          )}
                        </td>
                        <td>
                          {uploaded ? (
                            <>
                              <div className="mono-cand small-cand">{c.file_name}</div>
                              <div className="muted-cand small-cand">
                                {formatBytes(c.file_size)} · {formatDate(c.upload_date)}
                              </div>
                            </>
                          ) : (
                            <span className="muted-cand">no file</span>
                          )}
                        </td>
                        <td>
                          <div className="col-cand gap-cand">
                            <div className="row-cand gap-cand">
                              <button
                                className="btn-cand primary-cand xs-cand"
                                onClick={() => handleStatus(c.id, "approved")}
                              >
                                Approve
                              </button>
                              <button
                                className="btn-cand danger-cand xs-cand"
                                onClick={() => handleStatus(c.id, "rejected")}
                              >
                                Reject
                              </button>
                            </div>
                            <div className="row-cand gap-cand">
                              <button className="btn-cand xs-cand" onClick={() => handleStatus(c.id, "pending")}>
                                Reset
                              </button>
                              <button
                                className="btn-cand xs-cand"
                                disabled={!uploaded}
                                onClick={() => handleDownload(c.id, c.name)}
                              >
                                Download PDF
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
          <button className="toastx-close" onClick={hideToast} aria-label="Close">×</button>
        </div>
      </div>
    </div>
  );
}
