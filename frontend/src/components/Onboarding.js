"use client"

import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import {
  CheckCircle, Upload, FileText, User, Mail, Phone, Briefcase, AlertCircle,
} from "lucide-react"
import "./Onboarding.css"

const API_BASE_URL = process.env.API_BACKEND_URL || "http://localhost:5001"

function normalizeCandidate(raw) {
  if (!raw) return null
  // allow both camelCase and snake_case from backend
  const c = raw.candidate || raw
  const upload = c.uploadDetails || c.upload_details || null
  const status = (c.status || c.link_status || "").toLowerCase()

  return {
    name: c.name || "",
    email: c.email || "",
    phone: c.phone || "",
    position: c.position || "",
    candidate_id: c.candidate_id || c.candidateId || "",
    hasUploaded: Boolean(c.hasUploaded ?? c.has_uploaded ?? false),
    status, // "active" | "inactive" | "expired" (optional)
    uploadDetails: upload && {
      file_name: upload.file_name || upload.fileName || "",
      file_size: Number(upload.file_size ?? upload.fileSize ?? 0),
      upload_date: upload.upload_date || upload.uploadedAt || upload.uploadDate || null,
      url: upload.url || upload.file_url || null,
    },
    // Optional: server can include nicer error message too
    message: raw.message || "",
  }
}

export default function Onboarding() {
  const { token } = useParams()

  const [candidate, setCandidate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    if (token) fetchCandidateDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function fetchCandidateDetails() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_BASE_URL}/api/candidate-details/${token}`)
      const data = await res.json()

      if (res.ok && data.success) {
        const norm = normalizeCandidate(data)
        setCandidate(norm)

        // if backend flagged link state, show contextual message
        if (norm?.status === "expired") {
          setError("This onboarding link has expired. Please contact HR for a new link.")
        } else if (norm?.status === "inactive") {
          setError("This onboarding link has been deactivated. Please contact HR for assistance.")
        }
      } else {
        const msg = (data?.message || "").toLowerCase()
        if (msg.includes("expired")) {
          setError("This onboarding link has expired. Please contact HR for a new link.")
        } else if (msg.includes("inactive")) {
          setError("This onboarding link has been deactivated. Please contact HR for assistance.")
        } else {
          setError(data?.message || "Failed to load candidate details")
        }
        setCandidate(null)
      }
    } catch (err) {
      setError("Error loading candidate details: " + err.message)
      setCandidate(null)
    } finally {
      setLoading(false)
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== "application/pdf") {
      setError("Please select a PDF file only")
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("File size must be less than 50MB")
      return
    }

    setSelectedFile(file)
    setError("")
  }

  function handleUpload() {
    if (!selectedFile) {
      setError("Please select a file to upload")
      return
    }

    setUploading(true)
    setError("")
    setSuccess("")
    setUploadProgress(0)

    const formData = new FormData()
    formData.append("certificate", selectedFile)

    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setUploadProgress((e.loaded / e.total) * 100)
      }
    })

    xhr.addEventListener("load", () => {
      try {
        const json = JSON.parse(xhr.responseText || "{}")
        if (xhr.status === 201 || (xhr.status >= 200 && xhr.status < 300 && json.success)) {
          setSuccess("Certificate uploaded successfully!")
          setSelectedFile(null)
          fetchCandidateDetails()
        } else {
          setError(json.message || "Upload failed")
        }
      } catch {
        setError("Upload failed")
      } finally {
        setUploading(false)
        setUploadProgress(0)
      }
    })

    xhr.addEventListener("error", () => {
      setError("Upload failed. Please try again.")
      setUploading(false)
      setUploadProgress(0)
    })

    xhr.open("POST", `${API_BASE_URL}/api/candidate/upload/${token}`)
    xhr.send(formData)
  }

  function formatFileSize(bytes) {
    if (!bytes) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  // ---------------- UI STATES ----------------
  if (loading) {
    return (
      <div className="onboarding-container-onb">
        <div className="loading-card-onb">
          <div className="loading-content-onb">
            <div className="loading-spinner-onb" />
            <p>Loading candidate details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="onboarding-container-onb">
        <div className="error-card-onb">
          <div className="alert-error-onb">
            <AlertCircle className="alert-icon-onb" />
            <div className="alert-description-onb">
              {error || "Onboarding link is invalid or has expired."}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const linkBlocked = candidate.status === "expired" || candidate.status === "inactive"

  return (
    <div className="onboarding-page-onb">
      <div className="header">
        <img
          src="/assets/img/zorvixe_logo_main.png"
          alt="Zorvixe Technologies Logo"
          className="logo_payment"
        />
      </div>

      <div className="onboarding-content-onb">
        {/* Header */}
        <div className="page-header-onb">
          <h1 className="page-title-onb">Welcome to Zorvixe Technologies</h1>
          <p className="page-subtitle-onb">Candidate Onboarding Portal</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="alert-error-onb">
            <AlertCircle className="alert-icon-onb" />
            <div className="alert-description-onb">{error}</div>
          </div>
        )}

        {success && (
          <div className="alert-success-onb">
            <CheckCircle className="alert-icon-onb" />
            <div className="alert-description-onb">{success}</div>
          </div>
        )}

        {!linkBlocked && !candidate.hasUploaded && (
          <div className="alert-warning-onb">
            <AlertCircle className="alert-icon-onb" />
            <div className="alert-description-onb">
              <strong>Important:</strong> This onboarding link will expire in 2 hours from when it was generated. Please
              upload your documents as soon as possible.
            </div>
          </div>
        )}

        <div className="cards-grid-onb">
          {/* Candidate Information */}
          <div className="card-onb">
            <div className="card-header-onb">
              <div className="card-title-onb">
                <User className="card-icon-onb" />
                Candidate Information
              </div>
              <div className="card-description-onb">Please verify your details below</div>
            </div>
            <div className="card-content-onb">
              <div className="info-item-onb">
                <User className="info-icon-onb" />
                <div className="info-details-onb">
                  <p className="info-value-onb">{candidate.name}</p>
                  <p className="info-label-onb">Full Name</p>
                </div>
              </div>

              <div className="info-item-onb">
                <Mail className="info-icon-onb" />
                <div className="info-details-onb">
                  <p className="info-value-onb">{candidate.email}</p>
                  <p className="info-label-onb">Email Address</p>
                </div>
              </div>

              <div className="info-item-onb">
                <Phone className="info-icon-onb" />
                <div className="info-details-onb">
                  <p className="info-value-onb">{candidate.phone}</p>
                  <p className="info-label-onb">Phone Number</p>
                </div>
              </div>

              <div className="info-item-onb">
                <Briefcase className="info-icon-onb" />
                <div className="info-details-onb">
                  <p className="info-value-onb">{candidate.position}</p>
                  <p className="info-label-onb">Position</p>
                </div>
              </div>

              <div className="candidate-id-section-onb">
                <div className="candidate-id-row-onb">
                  <span className="candidate-id-label-onb">Candidate ID:</span>
                  <span className="candidate-id-badge-onb">{candidate.candidate_id}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Document Upload */}
          <div className="card-onb">
            <div className="card-header-onb">
              <div className="card-title-onb">
                <FileText className="card-icon-onb" />
                Document Upload
              </div>
              <div className="card-description-onb">
                Upload your certificates and documents as a single PDF file
              </div>
            </div>

            <div className="card-content-onb">
              {candidate.hasUploaded ? (
                <div className="upload-success-onb">
                  <CheckCircle className="success-icon-onb" />
                  <h3 className="success-title-onb">Documents Already Uploaded!</h3>
                  <p className="success-description-onb">
                    Your documents have been successfully uploaded and are under review.
                  </p>

                  {candidate.uploadDetails && (
                    <div className="upload-details-onb">
                      <p className="upload-detail-onb">
                        <strong>File:</strong> {candidate.uploadDetails.file_name}
                      </p>
                      <p className="upload-detail-onb">
                        <strong>Uploaded:</strong>{" "}
                        {candidate.uploadDetails.upload_date
                          ? new Date(candidate.uploadDetails.upload_date).toLocaleString()
                          : "—"}
                      </p>
                      <p className="upload-detail-onb">
                        <strong>Size:</strong> {formatFileSize(candidate.uploadDetails.file_size)}
                      </p>
                      {candidate.uploadDetails.url && (
                        <p className="upload-detail-onb">
                          <a href={candidate.uploadDetails.url} target="_blank" rel="noreferrer">
                            View uploaded file
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : linkBlocked ? (
                <div className="alert-error-onb">
                  <AlertCircle className="alert-icon-onb" />
                  <div className="alert-description-onb">
                    Uploads are disabled because this link is {candidate.status}.
                  </div>
                </div>
              ) : (
                <div className="upload-section-onb">
                  <div className="upload-area-onb">
                    <Upload className="upload-icon-onb" />
                    <div className="upload-text-onb">
                      <p className="upload-title-onb">Upload Your Certificates</p>
                      <p className="upload-subtitle-onb">
                        Please combine all your certificates into a single PDF file
                      </p>
                      <p className="upload-note-onb">Maximum file size: 50MB | Format: PDF only</p>
                    </div>

                    <div className="upload-button-container-onb">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileSelect}
                        className="file-input-onb"
                        id="certificate-upload"
                        disabled={uploading}
                      />
                      <label htmlFor="certificate-upload" className="file-label-onb">
                        <Upload className="file-label-icon-onb" />
                        Choose PDF File
                      </label>
                    </div>
                  </div>

                  {selectedFile && (
                    <div className="selected-file-onb">
                      <div className="selected-file-info-onb">
                        <div className="selected-file-details-onb">
                          <p className="selected-file-name-onb">{selectedFile.name}</p>
                          <p className="selected-file-size-onb">{formatFileSize(selectedFile.size)}</p>
                        </div>
                        <FileText className="selected-file-icon-onb" />
                      </div>
                    </div>
                  )}

                  {uploading && (
                    <div className="upload-progress-onb">
                      <div className="progress-header-onb">
                        <span>Uploading...</span>
                        <span>{Math.round(uploadProgress)}%</span>
                      </div>
                      <div className="progress-bar-onb">
                        <div className="progress-fill-onb" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleUpload}
                    disabled={!selectedFile || uploading}
                    className="upload-btn-onb"
                  >
                    {uploading ? (
                      <>
                        <div className="btn-spinner-onb" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="btn-icon-onb" />
                        Upload Certificate
                      </>
                    )}
                  </button>

                  <div className="upload-disclaimer-onb">
                    <p>
                      By uploading, you confirm that all documents are authentic and complete.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="card-onb instructions-card-onb">
          <div className="card-header-onb">
            <div className="card-title-onb">Upload Instructions</div>
          </div>
          <div className="card-content-onb">
            <div className="instructions-grid-onb">
              <div className="instructions-section-onb">
                <h4 className="instructions-title-onb">Required Documents:</h4>
                <ul className="instructions-list-onb">
                  <li>• Educational certificates 10th to Degree</li>
                  <li>• Professional certifications</li>
                  <li>• Experience certificates</li>
                  <li>• Identity proof</li>
                  <li>• Address proof</li>
                  <li>• Signed Offer Letter</li>
                  <li>• Government-issued ID proof (Aadhar/Passport/PAN)</li>
                  <li>• Recent passport-sized photograph</li>
                  <li>• Any other relevant documents</li>
                  <li>• Bank account details for stipend processing</li>
                </ul>
              </div>
              <div className="instructions-section-onb">
                <h4 className="instructions-title-onb">Guidelines:</h4>
                <ul className="instructions-list-onb">
                  <li>• Combine all documents into one PDF</li>
                  <li>• Ensure documents are clear and readable</li>
                  <li>• Maximum file size: 50MB</li>
                  <li>• Only PDF format is accepted</li>
                  <li>• Upload once — modifications require admin assistance</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="container copyright text-center mt-4">
          <p>
            <span>Copyright &copy; {currentYear}</span>
            <strong className="px-1 sitename">ZORVIXE TECHNNOLOGIES</strong>
            <span>All Rights Reserved</span>
          </p>
        </div>
      </div>
    </div>
  )
}
