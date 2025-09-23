"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  Building2, CreditCard, Upload, Check, Calendar, DollarSign, FileText,
  QrCode, Trash2, XCircle, User, FolderOpen, Info,
} from "lucide-react"
import "./payment.css"

// ---- Config (edit base if needed) ----
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  process.env.REACT_APP_API_BASE ||
  "http://localhost:5001"

// Normalize server response to a single shape
function normalizeDetails(data) {
  const c = data?.client || {}
  return {
    clientId: c.clientId ?? c.id ?? c.client_id ?? null,
    clientName: c.clientName ?? c.name ?? c.client_name ?? "",
    email: c.email ?? "",
    projectName: c.projectName ?? c.project_name ?? "",
    projectId: c.projectId ?? c.project_id ?? c.projectCode ?? "",
    projectDescription: c.projectDescription ?? c.project_description ?? "",
    zorvixeId: c.zorvixeId ?? c.zorvixe_id ?? "",
    amount: c.amount ?? 0,
    dueDate: c.dueDate ?? c.due_date ?? null,
    linkId: data?.linkId ?? c.linkId ?? null,
    paymentKind: String(data?.paymentKind ?? c.paymentKind ?? "project").toLowerCase(), // 'registration' | 'project'
  }
}

export default function Payment() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)

  // file handling (Multer upload)
  const [file, setFile] = useState(null) // File object
  const [filePreview, setFilePreview] = useState("") // objectURL for image preview
  const [submitting, setSubmitting] = useState(false)

  const [dragActive, setDragActive] = useState(false)
  const [referenceId, setReferenceId] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)
  const fileInputRef = useRef(null)

  const fetchClientDetails = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/api/client-details/${token}`)
      const data = await res.json()
      if (res.ok && data.success) {
        setDetails(normalizeDetails(data))
      } else {
        setDetails(null)
      }
    } catch {
      setDetails(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchClientDetails() }, [fetchClientDetails])

  // preview object URL for images
  useEffect(() => {
    if (file && file.type?.startsWith("image/")) {
      const url = URL.createObjectURL(file)
      setFilePreview(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setFilePreview("")
    }
  }, [file])

  // --- Loading ---
  if (loading) {
    return (
      <div className="payment-container links_status_loader">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading payment details...</p>
        </div>
      </div>
    )
  }

  // --- Invalid / Inactive link ---
  if (!details) {
    return (
      <div className="container vh-100 d-flex justify-content-center align-items-center">
        <div className="text-center border rounded shadow p-4" style={{ maxWidth: "450px", width: "100%" }}>
          <div className="text-danger mb-3"><XCircle size={48} /></div>
          <h2 className="mb-2">Payment Link Inactive</h2>
          <p className="text-muted mb-4">This link is inactive, expired, or not found.</p>
          <button className="btn btn-outline-primary" onClick={() => navigate("/")}>Go to Home</button>
        </div>
      </div>
    )
  }

  const isRegistration = details.paymentKind === "registration"

  // --- Drag & drop ---
  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true)
    else if (e.type === "dragleave") setDragActive(false)
  }
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) handleFileChange(f)
  }

  // --- File picker ---
  const handleFileChange = (f) => {
    if (!f) return
    const valid = ["image/jpeg", "image/png", "image/jpg", "application/pdf"]
    if (!valid.includes(f.type)) return alert("Upload JPG/PNG/PDF only")
    if (f.size > 5 * 1024 * 1024) return alert("File size exceeds 5MB")
    setFile(f)
  }

  // --- Submit (Multer: multipart/form-data) ---
  const handleSubmit = async () => {
    if (!file) return alert(`Please upload a ${isRegistration ? "registration" : "payment"} receipt before submitting`)
    try {
      setSubmitting(true)
      const form = new FormData()
      form.append("receipt", file) // Multer field name
      // meta (server can also infer most from token/link)
      form.append("token", token)
      form.append("linkId", details.linkId ?? "")
      form.append("clientId", details.clientId ?? "")
      form.append("projectId", details.projectId ?? "")
      form.append("paymentKind", details.paymentKind) // 'registration' | 'project'

      const res = await fetch(`${API_BASE}/api/payment/submit`, { method: "POST", body: form })
      const data = await res.json()
      if (res.ok && data?.success) {
        setReferenceId(data.referenceId)
        setIsSubmitted(true)
      } else {
        throw new Error(data?.message || "Failed to submit")
      }
    } catch (err) {
      alert(err.message || "Failed to submit. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // --- Success ---
  if (isSubmitted) {
    return (
      <div className="payment-container">
        <div className="success-wrapper">
          <div className="success-card">
            <div className="success-icon"><Check size={48} /></div>
            <h2>{isRegistration ? "Registration Submitted!" : "Payment Submitted Successfully!"}</h2>
            <p>
              {isRegistration
                ? "Your registration payment has been received and is being processed."
                : "Your project payment has been received and is being processed."}
            </p>
            <div className="reference-info">
              <span>Reference ID: <strong>{referenceId}</strong></span>
            </div>

            <div className="client-summary">
              <h4>{isRegistration ? "Registration Details:" : "Payment Details:"}</h4>
              <div className="summary-grid">
                <div><strong>Client:</strong> {details.clientName}</div>
                {details.projectName && <div><strong>Project:</strong> {details.projectName}</div>}
                {details.projectId && <div><strong>Project ID:</strong> {details.projectId}</div>}
                <div><strong>Zorvixe ID:</strong> {details.zorvixeId}</div>
                <div><strong>Amount:</strong> Rs. {Number(details.amount || 0).toLocaleString()}</div>
              </div>
            </div>

            <div className="next-steps">
              <h4>What happens next?</h4>
              <ul>
                <li>Verification within 2–4 hours</li>
                <li>{isRegistration ? "Account onboarding" : "Project coordinator assignment"}</li>
                <li>{isRegistration ? "Welcome email with next steps" : "Initial consultation scheduling"}</li>
              </ul>
            </div>

            <button className="back-btn" onClick={() => navigate("/")}>Go to Home</button>
          </div>
        </div>
      </div>
    )
  }

  // --- Main UI ---
  return (
    <div className="payment-container">
      {/* Header */}
      <div className="header">
        <img src="/assets/img/zorvixe_logo_main.png" alt="Zorvixe Technologies Logo" className="logo_payment" />
      </div>

      <div className="header-section">
        <div className="header-content">
          {isRegistration ? <User size={32} className="header-icon" /> : <Building2 size={32} className="header-icon" />}
          <div>
            <h1>{isRegistration ? "Registration Payment" : "Project Payment"}</h1>
            <p>{isRegistration ? "Complete your registration to get started." : "Complete your payment to begin your enterprise project."}</p>
          </div>
        </div>
        <div className="status-badge">
          <span>{isRegistration ? "Registration" : "Payment Required"}</span>
        </div>
      </div>

      {/* Details card */}
      <div className="card client-card">
        <div className="card-header">
          <div className="card-title">
            {isRegistration ? <User size={20} /> : <Building2 size={20} />}
            <span>{isRegistration ? "Registration Details" : "Client Payment Details"}</span>
          </div>
          <div className="card-badge">Active</div>
        </div>

        <div className="card-content">
          <div className="client-info-section">
            <div className="client-avatar"><User size={32} /></div>
            <div className="client-main-info">
              <h3 className="client-name">{details.clientName}</h3>
              {details.email ? <p className="client-email">{details.email}</p> : null}
            </div>
          </div>

          <div className="details-grid-improved">
            {(details.projectName || details.projectId || details.zorvixeId) && (
              <div className="detail-section">
                <div className="section-header"><FolderOpen size={18} /><h4>{isRegistration ? "Account / Project" : "Project Information"}</h4></div>
                <div className="detail-items">
                  {details.projectName && (
                    <div className="detail-item-improved">
                      <div className="detail-label">Project Name</div>
                      <div className="detail-value">{details.projectName}</div>
                    </div>
                  )}
                  {details.projectId && (
                    <div className="detail-item-improved">
                      <div className="detail-label">Project ID</div>
                      <div className="detail-value project-id">{details.projectId}</div>
                    </div>
                  )}
                  <div className="detail-item-improved">
                    <div className="detail-label">Zorvixe ID</div>
                    <div className="detail-value zorvixe-id">{details.zorvixeId}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="detail-section">
              <div className="section-header"><DollarSign size={18} /><h4>{isRegistration ? "Registration Fee" : "Payment Information"}</h4></div>
              <div className="detail-items">
                <div className="detail-item-improved highlight">
                  <div className="detail-label">{isRegistration ? "Fee" : "Amount"}</div>
                  <div className="detail-value amount-value">Rs. {Number(details.amount || 0).toLocaleString()}</div>
                </div>
                {details.dueDate && (
                  <div className="detail-item-improved">
                    <div className="detail-label">Due Date</div>
                    <div className="detail-value due-date"><Calendar size={14} /> {new Date(details.dueDate).toLocaleDateString()}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {details.projectDescription && (
            <div className="project-description-section">
              <div className="section-header"><Info size={18} /><h4>{isRegistration ? "Notes" : "Project Description"}</h4></div>
              <div className="description-content"><p>{details.projectDescription}</p></div>
            </div>
          )}
        </div>
      </div>

      {/* Terms */}
      <div className="card terms-card">
        <div className="card-header"><div className="card-title"><FileText size={20} /><span>Terms & Conditions</span></div></div>
        <div className="card-content">
          <div className="terms-content">
            <div className="terms-list">
              <div className="term-item"><div className="term-number">01</div><div className="term-text"><strong>{isRegistration ? "Registration Requirement:" : "Payment Requirement:"}</strong> {isRegistration ? "Account activation requires registration fee payment." : "Project initiation requires full fee payment before development begins."}</div></div>
              <div className="term-item"><div className="term-number">02</div><div className="term-text"><strong>Non-Refundable:</strong> All payments are non-refundable once processing begins.</div></div>
              <div className="term-item"><div className="term-number">03</div><div className="term-text"><strong>Processing Time:</strong> Verification may take 1–2 business days.</div></div>
              <div className="term-item"><div className="term-number">04</div><div className="term-text"><strong>{isRegistration ? "Onboarding Timeline:" : "Project Timeline:"}</strong> {isRegistration ? "Account setup starts after verification." : "Schedules may shift for delayed payments."}</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="card payment-methods-card">
        <div className="card-header"><div className="card-title"><CreditCard size={20} /><span>Payment Methods</span></div></div>
        <div className="card-content">
          <div className="payment-options">
            <div className="payment-option">
              <div className="option-header">
                <div className="option-icon bank-icon"><Building2 size={24} /></div>
                <div className="option-info"><h4>Wire Transfer</h4><p>Direct bank transfer - Most secure</p></div>
              </div>
              <div className="bank-details">
                <div className="bank-info">
                  <div className="info-row"><span className="label">Name:</span><span className="value">Golla Ekambaram</span></div>
                  <div className="info-row"><span className="label">Bank Name:</span><span className="value">ICICI BANK</span></div>
                  <div className="info-row"><span className="label">Account Number:</span><span className="value">005301550916</span></div>
                  <div className="info-row"><span className="label">IFSC Code:</span><span className="value">ICIC0000053</span></div>
                  <div className="info-row"><span className="label">ZORVIXE Code:</span><span className="value">ZOR458A</span></div>
                </div>
              </div>
            </div>

            <div className="payment-divider"><span>OR</span></div>

            <div className="payment-option">
              <div className="option-header">
                <div className="option-icon qr-icon"><QrCode size={24} /></div>
                <div className="option-info"><h4>Digital Payment</h4><p>Instant payment via QR code</p></div>
              </div>
              <div className="qr-section">
                <div className="qr-code"><div className="qr-placeholder"><img src="/assets/img/payment_qr.jpg" className="qr_code_image" alt="QR Code" /></div></div>
                <div className="qr-instructions">
                  <h5>Scan to Pay Rs. {Number(details.amount || 0).toLocaleString()}</h5>
                  <p>Use your mobile banking app or digital wallet</p>
                  <div className="supported-apps"><span>Phonepe</span><span>Paytm</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Receipt (Multer) */}
      <div className="card upload-card">
        <div className="card-header"><div className="card-title"><Upload size={20} /><span>Payment Confirmation</span></div><div className="required-badge">Required</div></div>
        <div className="card-content">
          <div className="upload-section">
            {file ? (
              <div className="file-uploaded">
                <div className="file-preview">
                  <div className="file-icon">
                    {filePreview ? (<img src={filePreview} alt="Preview" className="file-preview-image" />) : (<FileText size={32} />)}
                  </div>
                  <div className="file-details">
                    <h4>{file.name}</h4>
                    <p>{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <button className="remove-file" onClick={() => setFile(null)}><Trash2 size={16} /></button>
                </div>
                <div className="upload-success"><Check size={16} /><span>Receipt ready to submit</span></div>
              </div>
            ) : (
              <div
                className={`upload-area ${dragActive ? "drag-active" : ""}`}
                onDragEnter={handleDrag} onDragLeave={handleDrag}
                onDragOver={handleDrag} onDrop={handleDrop}
              >
                <div className="upload-content">
                  <div className="upload-icon"><Upload size={48} /></div>
                  <h4>Upload {isRegistration ? "Registration" : "Payment"} Receipt</h4>
                  <p>Drag and drop your screenshot or receipt here</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    hidden
                    onChange={(e) => handleFileChange(e.target.files[0])}
                  />
                  <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>Choose File</button>
                  <div className="file-requirements"><span>Supports: JPG, PNG, PDF</span><span>Max size: 5MB</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation */}
      <div className="card confirmation-card">
        <div className="card-content">
          <div className="confirmation-content">
            <div className="confirmation-text">
              <h3>Ready to Submit {isRegistration ? "Registration" : "Payment"}</h3>
              <p>
                {isRegistration
                  ? "You will receive onboarding steps once your registration is verified."
                  : "Your coordinator will contact you within 24 hours of payment verification to begin development."}
              </p>
            </div>
            <button className="submit-button" onClick={handleSubmit} disabled={!file || submitting}>
              <Check size={20} />
              {submitting ? "Submitting..." : `Submit ${isRegistration ? "Registration" : "Payment"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
