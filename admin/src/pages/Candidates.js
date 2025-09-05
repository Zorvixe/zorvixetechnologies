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

      await createCandidate(form);
      setForm({ name: "", email: "", phone: "", position: "" });
      setShowForm(false);
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

        <div className="modal fade" id="create_candidate" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create Candidate</h5>
                <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div className="modal-body">
                <form onSubmit={onCreate} className="row" >
                  <div className='column'>
                    <input
                      id='cFullName'
                      className="input"

                      placeholder="Full name*"
                      value={form.name}
                      onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    />
                    <input
                      id='cEmail'
                      className="input"

                      placeholder="Email*"
                      value={form.email}
                      onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    />

                    <input
                      id='cPhone'
                      className="input"

                      placeholder="Phone*"
                      value={form.phone}
                      onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                    />
                    <input
                      id='cPosition'
                      className="input"

                      placeholder="Position*"
                      value={form.position}
                      onChange={(e) => setForm((s) => ({ ...s, position: e.target.value }))}
                    />
                  </div>

                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" className="btn btn-primary"> Create</button>
                  </div>
                </form>
              </div>

            </div>
          </div>
        </div>

        {/* Link popup */}
        {linkInfo && (
          <div className="modal-cand">
            <div className="modal-card-cand">
              <div className="modal-header-cand">
                <h3>Onboarding Link</h3>
                <button className="close-cand" onClick={() => setLinkInfo(null)}>×</button>
              </div>

              <div className="modal-body-cand">
                <div className="info-block-cand">
                  <label>URL</label>
                  <code className="code-cand full-cand">{linkInfo.link}</code>
                  <button className="btn-cand small-cand" onClick={() => copy(linkInfo.link)}>Copy URL</button>
                </div>

                <div className="info-block-cand">
                  <label>Token</label>
                  <code className="code-cand full-cand">{linkInfo.token}</code>
                  <button className="btn-cand small-cand" onClick={() => copy(linkInfo.token)}>Copy Token</button>
                </div>

                <p className="muted-cand mt-cand">
                  Expires on: <strong>{formatDate(linkInfo.expiresAt)}</strong>
                </p>
              </div>

              <div className="modal-footer-cand">
                <button className="btn-cand danger-cand" onClick={() => setLinkInfo(null)}>Close</button>
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
                                  onClick={() => copy(`https://zorvixetechnologies.com/onboarding/${c.active_token}`)}
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
