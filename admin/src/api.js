// src/api.js
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:5001"
const TOKEN_KEY = "admin_token"

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

function qs(params = {}) {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return
    sp.set(k, v)
  })
  const s = sp.toString()
  return s ? `?${s}` : ""
}

async function request(path, { method = "GET", body, params, headers } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}${qs(params)}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...headers,
    },
    credentials: "omit",
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = "Request failed"
    let errorData = null
    try {
      errorData = await res.json()
      msg = errorData.message || msg
    } catch {}
    const error = new Error(msg)
    error.status = res.status
    error.data = errorData
    throw error
  }
  const ct = res.headers.get("content-type") || ""
  if (ct.includes("application/json")) return res.json()
  return res.text()
}

/* --------------------------- Auth --------------------------- */
export const apiLogin = (identifier, password) =>
  request("/api/admin/login", { method: "POST", body: { identifier, password } })

export const apiMe = () => request("/api/admin/me")

export const apiLogout = (body = {}) => request("/api/admin/logout", { method: "POST", body })

/* --------------------------- Contacts --------------------------- */
export const apiListContacts = (params) => request("/api/contacts", { params })
export const apiUpdateContact = (id, body) => request(`/api/contacts/${id}`, { method: "PATCH", body })
export const apiDeleteContact = (id) => request(`/api/contacts/${id}`, { method: "DELETE" })
export async function apiExportContactsCsv(params = {}) {
  const url = `${API_BASE_URL}/api/contacts/export.csv${qs(params)}`
  const res = await fetch(url, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  })
  if (!res.ok) throw new Error("Export failed")
  return res.blob()
}

/* --------------------------- Stats --------------------------- */
export async function apiStats() {
  return request("/api/stats/dashboard");
}

export async function apiStatsNotifications() {
  return request("/api/stats/notifications");
}

export async function apiStatsTickets () {
  return request("/api/stats/tickets");
}

export const apiResetNotificationCount = (body = { markAll: true }) => {
  return request("/api/notifications/mark-read", { method: "POST", body });
};

export const apiMarkNotificationRead = (body) => {
  return request("/api/notifications/mark-read", { method: "POST", body });
};

export const apiMarkTicketActivityRead = (body = { markAll: true }) => {
  return request("/api/tickets-activity/mark-read", { method: "POST", body });
};

/* --------------------------- Users (Admin) --------------------------- */
export const apiListUsers = (params) => request("/api/admin/users", { params })
export const apiCreateUser = (body) => request("/api/admin/users", { method: "POST", body })
export const apiPatchUser = (id, body) => request(`/api/admin/users/${id}`, { method: "PATCH", body })
export const apiDeleteUser = (id) => request(`/api/admin/users/${id}`, { method: "DELETE" })

/* --------------------------- Candidates --------------------------- */
export const getCandidates = () => request("/api/admin/candidates")
export const createCandidate = (body) => request("/api/admin/candidates", { method: "POST", body })
export const apiParseCandidateResume = async (file) => {
  const formData = new FormData()
  formData.append("resume", file)
  const token = getToken()
  const res = await fetch(`${API_BASE_URL}/api/admin/candidates/parse-resume`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to parse resume")
  }
  return data
}
export const generateCandidateLink = (candidateId) =>
  request("/api/admin/candidate-links", { method: "POST", body: { candidateId } })
export const toggleCandidateLink = (candidateId, active) =>
  request(`/api/admin/candidate-links/${candidateId}/toggle`, { method: "PUT", body: { active } })
export const updateCandidateStatus = (id, status) =>
  request(`/api/admin/candidates/${id}/status`, { method: "PUT", body: { status } })
export const downloadCandidatePdf = async (candidateId) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/candidate-download/${candidateId}`, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  })
  if (res.status === 404) throw new Error("No uploaded file found")
  if (!res.ok) throw new Error("Download failed")
  return res.blob()
}

/* --------------------------- Clients --------------------------- */
export const apiListClients = () => request("/api/admin/clients")
export const apiCreateClient = (body) => request("/api/admin/clients", { method: "POST", body })
export const apiGetClient = (id) => request(`/api/admin/clients/${id}`)

// NEW
export const apiPatchClient = (id, body) => request(`/api/admin/clients/${id}`, { method: "PATCH", body })
export const apiDeleteClient = (id) => request(`/api/admin/clients/${id}`, { method: "DELETE" })

/* --------------------------- Projects --------------------------- */
export const apiListAllProjects = (params) => request("/api/admin/projects", { params })
export const apiListClientProjects = (clientId) => request(`/api/admin/clients/${clientId}/projects`)
export const apiCreateProject = (body) => request("/api/admin/projects", { method: "POST", body })
export const apiGetProject = (id) => request(`/api/admin/projects/${id}`)
export const apiPatchProject = (id, body) => request(`/api/admin/projects/${id}`, { method: "PATCH", body })
export const apiDeleteProject = (id) => request(`/api/admin/projects/${id}`, { method: "DELETE" })

/* --------------------------- Project Members --------------------------- */
export const apiListProjectMembers = (projectId) => request(`/api/admin/projects/${projectId}/members`)
export const apiAddProjectMember = (projectId, body) =>
  request(`/api/admin/projects/${projectId}/members`, { method: "POST", body })
export const apiPatchProjectMember = (projectId, userId, body) =>
  request(`/api/admin/projects/${projectId}/members/${userId}`, { method: "PATCH", body })
export const apiRemoveProjectMember = (projectId, userId) =>
  request(`/api/admin/projects/${projectId}/members/${userId}`, { method: "DELETE" })

/* --------------------------- Payment Links --------------------------- */
// kind: 'registration' | 'project'
export const apiCreatePaymentLink = async (projectId, kind = "project") => {
  const res = await request(`/api/admin/projects/${projectId}/payment-links`, {
    method: "POST",
    body: { kind },
  })
  return { ...res, url: res.link || res.url }
}

// Toggle by projectId (enable/disable all links of this project)
export const apiTogglePaymentLink = (projectId, active) =>
  request(`/api/admin/payment-links/${projectId}/toggle`, {
    method: "PUT",
    body: { active },
  })

// List all links for a project (both kinds)
export const apiListPaymentLinks = (projectId) =>
  request(`/api/admin/projects/${projectId}/payment-links`)

// Delete a payment link by id (admin-only)
export const apiDeletePaymentLink = (linkId) =>
  request(`/api/admin/payment-links/${linkId}`, { method: "DELETE" })

// ✅ NEW: per-link helpers that Payments.js uses (Bearer token, no cookies)
export const apiUpdatePaymentLinkMeta = (linkId, body) =>
  request(`/api/payment-links/${linkId}`, { method: "PATCH", body })

export const apiRegeneratePaymentLink = (linkId) =>
  request(`/api/payment-links/${linkId}/regenerate`, { method: "POST" })

export const apiListLinkSubmissions = (linkId) =>
  request(`/api/payment-links/${linkId}/submissions`)

// Optional: create with amount in one shot
export const apiCreatePaymentLinkWithMeta = (projectId, { kind, amount }) =>
  request(`/api/admin/projects/${projectId}/payment-links`, {
    method: "POST",
    body: { kind, amount },
  })

 export const downloadPaymentReceipt = async (registrationId) => {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/payment-registrations/${registrationId}/receipt`,
    { headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) } }
  );
  if (res.status === 404) throw new Error("No receipt found");
  if (!res.ok) throw new Error("Download failed");

  const blob = await res.blob();

  // Try to read filename from Content-Disposition
  let filename = `payment-receipt-${registrationId}`;
  const cd = res.headers.get("Content-Disposition") || res.headers.get("content-disposition") || "";
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i.exec(cd);
  if (m && m[1]) {
    filename = decodeURIComponent(m[1]);
  } else {
    // Fallback from MIME type
    const type = (blob.type || "").toLowerCase();
    const ext =
      type === "application/pdf" ? ".pdf" :
      type === "image/png" ? ".png" :
      type === "image/jpeg" ? ".jpg" :
      "";
    filename += ext;
  }

  return { blob, filename };
};


/* --------------------------- Project Comments --------------------------- */
export const apiGetProjectComments = (projectId) => 
  request(`/api/projects/${projectId}/comments`)

export const apiPostProjectComment = (projectId, commentText, parentId = null) =>
  request(`/api/projects/${projectId}/comments`, {
    method: "POST",
    body: { comment_text: commentText, parent_id: parentId }
  })

export const apiUpdateComment = (commentId, commentText) =>
  request(`/api/comments/${commentId}`, {
    method: "PUT",
    body: { comment_text: commentText }
  })

export const apiDeleteComment = (commentId) =>
  request(`/api/comments/${commentId}`, {
    method: "DELETE"
  })

/* --------------------------- Tickets --------------------------- */
/* --------------------------- Ticket Export --------------------------- */
export async function apiExportTicketsCsv(params = {}) {
  const url = `${API_BASE_URL}/api/admin/tickets/export.csv${qs(params)}`;
  const res = await fetch(url, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
}

export const apiListTickets = (params = {}) => {
  // Ensure dates are formatted correctly and default limit is large so tickets don't get truncated
  const formattedParams = { limit: 1000, ...params };
  if (params.startDate) {
    formattedParams.startDate = formatDateForAPI(params.startDate);
  }
  if (params.endDate) {
    formattedParams.endDate = formatDateForAPI(params.endDate);
  }
  return request("/api/tickets", { params: formattedParams });
};export const apiGetTicket = (id) => request(`/api/tickets/${id}`);
export const apiCreateTicket = (body) => request("/api/tickets", { method: "POST", body });
export const apiUpdateTicket = (id, body) => request(`/api/tickets/${id}`, { method: "PATCH", body });
export const apiCreateTicketComment = (ticketId, body) =>
  request(`/api/tickets/${ticketId}/comments`, { method: "POST", body });
export const apiUpdateTicketComment = (commentId, body) =>
  request(`/api/ticket-comments/${commentId}`, { method: "PATCH", body });
export const apiDeleteTicketComment = (commentId) =>
  request(`/api/ticket-comments/${commentId}`, { method: "DELETE" });

// ✅ NEW
export const apiDeleteTicket = (id) =>
  request(`/api/tickets/${id}`, { method: "DELETE" });

/* --------------------------- Users for Assignment --------------------------- */
export const apiGetUsersForAssignment = () => request("/api/admin/users/for-assignment");


// In api.js - Add these API functions

// Track ticket view
export const apiRecordTicketView = (ticketId) =>
  request(`/api/tickets/${ticketId}/view`, { method: 'POST' });

// Get ticket viewers
export const apiGetTicketViewers = (ticketId) =>
  request(`/api/tickets/${ticketId}/viewers`);



/* --------------------------- Leave Management --------------------------- */

// Get available approvers
export const apiGetApprovers = () => request('/api/leaves/approvers');

// Apply for leave
export const apiApplyLeave = (body) => request('/api/leaves/apply', { method: 'POST', body });

// Get my leaves (as applicant)
export const apiGetMyLeaves = (params) => request('/api/leaves/my-leaves', { params });

// Get leaves for my approval (as approver)
export const apiGetLeavesForApproval = (params) => request('/api/leaves/for-approval', { params });

// Get all leaves (admin view)
export const apiGetAllLeaves = (params) => request('/api/admin/leaves', { params });

// Get leave balance
export const apiGetLeaveBalance = () => request('/api/leaves/balance');

// Update leave status (approve/reject) - FIXED
export const apiUpdateLeaveStatus = (id, body) => 
  request(`/api/leaves/${id}/status`, { method: 'PATCH', body });

// Cancel leave
export const apiCancelLeave = (id) => request(`/api/leaves/${id}/cancel`, { method: 'PATCH' });

// Carry forward leaves (admin only)
export const apiCarryForwardLeaves = () => request('/api/admin/leaves/carry-forward', { method: 'POST' });

export const apiMonthlyReset = () => 
  request('/api/admin/leaves/monthly-reset', { method: 'POST' });


/* --------------------------- Login / Logout Timings --------------------------- */
export const apiListLoginLogs = (params = {}) =>
  request("/api/admin/login-logs", { params });

export async function apiExportLoginLogsCsv(params = {}) {
  const url = `${API_BASE_URL}/api/admin/login-logs/export.csv${qs(params)}`;
  const res = await fetch(url, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  if (!res.ok) throw new Error("Failed to export login logs");
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = `login-timings-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

// Helper function to format dates for API
const formatDateForAPI = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

/* --------------------------- My Account --------------------------- */
export const apiGetMyAccount = () => request("/api/admin/account");
export const apiUpdateMyAccount = (body) => request("/api/admin/account", { method: "PATCH", body });
export const apiChangePassword = (body) => request("/api/admin/account/change-password", { method: "POST", body });

/* --------------------------- Chat / Discussions --------------------------- */
export const apiGetChatUsers = () => request("/api/chat/users");
export const apiGetChatUnreadCount = () => request("/api/chat/unread-count");
export const apiGetChatMessages = (otherUserId) => request(`/api/chat/messages/${otherUserId}`);
export const apiSendChatMessage = (body) => request("/api/chat/messages", { method: "POST", body });
export const apiEditChatMessage = (messageId, messageText) =>
  request(`/api/chat/messages/${messageId}`, {
    method: "PUT",
    body: { message_text: messageText },
  });
export const apiDeleteChatMessage = (messageId) =>
  request(`/api/chat/messages/${messageId}`, {
    method: "DELETE",
  });
export const apiMarkChatRead = (senderId) => request(`/api/chat/read/${senderId}`, { method: "PATCH" });

/* --------------------------- Global Search --------------------------- */
export const apiGlobalSearch = (q) =>
  request("/api/global-search", { params: { q } });

/* --------------------------- HRMS & Attendance --------------------------- */
export const apiAttendanceToday = () => request("/api/hrms/attendance/today");
export const apiAttendancePunch = (body) => request("/api/hrms/attendance/punch", { method: "POST", body });
export const apiMyAttendance = (params) => request("/api/hrms/attendance/my", { params });
export const apiListAttendance = (params) => request("/api/hrms/attendance", { params });
export const apiSaveManualAttendance = (body) => request("/api/hrms/attendance/manual", { method: "POST", body });

/* --------------------------- HRMS Employees --------------------------- */
export const apiListEmployees = (params) => request("/api/hrms/employees", { params });
export const apiGetEmployee = (id) => request(`/api/hrms/employees/${id}`);
export const apiUpdateEmployee = (id, body) => request(`/api/hrms/employees/${id}`, { method: "PUT", body });

/* --------------------------- HRMS Payroll --------------------------- */
export const apiListSalaryStructures = () => request("/api/hrms/payroll/structures");
export const apiUpdateSalaryStructure = (userId, body) => request(`/api/hrms/payroll/structures/${userId}`, { method: "PUT", body });
export const apiListPayrollRuns = (params) => request("/api/hrms/payroll/runs", { params });
export const apiGeneratePayroll = (body) => request("/api/hrms/payroll/generate", { method: "POST", body });
export const apiUpdatePayroll = (id, body) => request(`/api/hrms/payroll/${id}`, { method: "PATCH", body });
export const apiGetPayslip = (id) => request(`/api/hrms/payroll/payslip/${id}`);
export const apiGetMyPayslips = () => request("/api/hrms/payroll/my-payslips");

/* --------------------------- HRMS Recruitment & Compliance --------------------------- */
export const apiListJobs = () => request("/api/hrms/recruitment/jobs");
export const apiCreateJob = (body) => request("/api/hrms/recruitment/jobs", { method: "POST", body });
export const apiUpdateJob = (id, body) => request(`/api/hrms/recruitment/jobs/${id}`, { method: "PUT", body });
export const apiDeleteJob = (id) => request(`/api/hrms/recruitment/jobs/${id}`, { method: "DELETE" });
export const apiRecruitmentPipeline = () => request("/api/hrms/recruitment/pipeline");
export const apiUpdateCandidateStage = (id, body) => request(`/api/hrms/recruitment/candidate/${id}`, { method: "PATCH", body });
export const apiHireCandidate = (id) => request(`/api/hrms/recruitment/hire/${id}`, { method: "POST" });
export const apiListCompliance = (params) => request("/api/hrms/compliance", { params });
export const apiUpdateCompliance = (id, body) => request(`/api/hrms/compliance/${id}`, { method: "PATCH", body });

/* --------------------------- Workforce Insights --------------------------- */
export const apiWorkforceInsights = () => request("/api/hrms/insights");

/* --------------------------- CRM Deals & Activities --------------------------- */
export const apiCrmStats = () => request("/api/crm/stats");
export const apiListDeals = (params) => request("/api/crm/deals", { params });
export const apiCreateDeal = (body) => request("/api/crm/deals", { method: "POST", body });
export const apiUpdateDeal = (id, body) => request(`/api/crm/deals/${id}`, { method: "PATCH", body });
export const apiDeleteDeal = (id) => request(`/api/crm/deals/${id}`, { method: "DELETE" });
export const apiListCrmActivities = (params) => request("/api/crm/activities", { params });
export const apiCreateCrmActivity = (body) => request("/api/crm/activities", { method: "POST", body });
export const apiUpdateCrmActivity = (id, body) => request(`/api/crm/activities/${id}`, { method: "PATCH", body });
export const apiDeleteCrmActivity = (id) => request(`/api/crm/activities/${id}`, { method: "DELETE" });

/* --------------------------- Zoho-Grade Enterprise CRM APIs --------------------------- */
// Leads
export const apiListLeads = (params) => request("/api/crm/leads", { params });
export const apiGetLead = (id) => request(`/api/crm/leads/${id}`);
export const apiCreateLead = (body) => request("/api/crm/leads", { method: "POST", body });
export const apiUpdateLead = (id, body) => request(`/api/crm/leads/${id}`, { method: "PUT", body });
export const apiDeleteLead = (id) => request(`/api/crm/leads/${id}`, { method: "DELETE" });
export const apiConvertLead = (id, body) => request(`/api/crm/leads/${id}/convert`, { method: "POST", body });

// Accounts (Clients 360)
export const apiListAccounts = (params) => request("/api/crm/accounts", { params });
export const apiGetAccount360 = (id) => request(`/api/crm/accounts/${id}/360`);
export const apiCreateAccount = (body) => request("/api/crm/accounts", { method: "POST", body });

// B2B Contacts
export const apiListCrmContacts = (params) => request("/api/crm/contacts", { params });
export const apiCreateCrmContact = (body) => request("/api/crm/contacts", { method: "POST", body });
export const apiDeleteCrmContact = (id) => request(`/api/crm/contacts/${id}`, { method: "DELETE" });

// Products & Services Catalog
export const apiListProducts = (params) => request("/api/crm/products", { params });
export const apiCreateProduct = (body) => request("/api/crm/products", { method: "POST", body });

// Quotations (CPQ)
export const apiListQuotes = (params) => request("/api/crm/quotes", { params });
export const apiGetQuote = (id) => request(`/api/crm/quotes/${id}`);
export const apiCreateQuote = (body) => request("/api/crm/quotes", { method: "POST", body });
export const apiUpdateQuoteStatus = (id, status) => request(`/api/crm/quotes/${id}/status`, { method: "PATCH", body: { status } });
export const apiDeleteQuote = (id) => request(`/api/crm/quotes/${id}`, { method: "DELETE" });

// Sales Analytics & Funnel
export const apiCrmAnalytics = () => request("/api/crm/analytics");

// CRM Phase 2: Email Templates & Communication Engine
export const apiListEmailTemplates = () => request("/api/crm/email-templates");
export const apiCreateEmailTemplate = (body) => request("/api/crm/email-templates", { method: "POST", body });
export const apiUpdateEmailTemplate = (id, body) => request(`/api/crm/email-templates/${id}`, { method: "PUT", body });
export const apiDeleteEmailTemplate = (id) => request(`/api/crm/email-templates/${id}`, { method: "DELETE" });
export const apiSendCrmEmail = (body) => request("/api/crm/send-email", { method: "POST", body });
export const apiListCrmEmails = (params) => request("/api/crm/emails", { params });

// CRM Team Members for Rep Assignment
export const apiListCrmTeam = () => request("/api/crm/team");

// CRM Deals Stage & Loss Reasons Automation
export const apiUpdateDealStage = (id, body) => request(`/api/crm/deals/${id}/stage`, { method: "PATCH", body });

/* --------------------------- Presence & Status --------------------------- */
export const apiGetMyPresence = () => request("/api/presence/me");
export const apiUpdateMyPresence = (body) => request("/api/presence/me", { method: "PATCH", body });
export const apiPresenceHeartbeat = () => request("/api/presence/heartbeat", { method: "POST" });

/* --------------------------- AI Intelligence Suite --------------------------- */
export const apiAiStatus = () => request("/api/ai/status");
export const apiAiUpdateSettings = (body) => request("/api/ai/settings", { method: "PATCH", body });
export const apiAiAuditLogs = (params) => request("/api/ai/audit-logs", { params });
export const apiAiAssistantChat = (body) => request("/api/ai/assistant/chat", { method: "POST", body });
export const apiAiCopilotSession = (params) => request("/api/ai/copilot/session", { params });
export const apiAiCopilotReset = () => request("/api/ai/copilot/session/reset", { method: "POST" });
export const apiAiCopilotConfirm = (body) => request("/api/ai/copilot/confirm", { method: "POST", body });
export const apiAiCopilotCancel = (body) => request("/api/ai/copilot/cancel", { method: "POST", body });
export const apiAiAnalyzeTicket = (ticketId) => request(`/api/ai/tickets/${ticketId}/analyze`, { method: "POST" });
export const apiAiDraftTicketReply = (ticketId, body) => request(`/api/ai/tickets/${ticketId}/draft-reply`, { method: "POST", body });
export const apiAiRecommendTicketAssignments = (body = {}) => request("/api/ai/tickets/recommend-assignments", { method: "POST", body });
export const apiAiConfirmTicketAssignment = (body) => request("/api/ai/tickets/confirm-assignment", { method: "POST", body });
export const apiAiCrmSummarize = (body) => request("/api/ai/crm/summarize", { method: "POST", body });
export const apiAiCrmStaleDeals = () => request("/api/ai/crm/stale-deals", { method: "POST" });
export const apiAiCrmDraftEmail = (body) => request("/api/ai/crm/draft-email", { method: "POST", body });
export const apiAiAttendanceSummary = (body = {}) => request("/api/ai/hrms/attendance-summary", { method: "POST", body });
export const apiAiCompareCandidate = (body) => request("/api/ai/hrms/compare-candidate", { method: "POST", body });
export const apiAiLeaveSummary = (body = {}) => request("/api/ai/hrms/leave-summary", { method: "POST", body });
export const apiAiPayrollAudit = (body = {}) => request("/api/ai/hrms/payroll-audit", { method: "POST", body });
export const apiAiClientSummary = (clientId) => request(`/api/ai/clients/${clientId}/summary`, { method: "POST" });
export const apiAiProjectSummary = (projectId) => request(`/api/ai/projects/${projectId}/summary`, { method: "POST" });
export const apiAiContactAssist = (contactId) => request(`/api/ai/contacts/${contactId}/assist`, { method: "POST" });
export const apiAiDashboardDigest = () => request("/api/ai/dashboard/digest", { method: "POST" });
export const apiAiNotificationsSummary = (body = {}) => request("/api/ai/notifications/summary", { method: "POST", body });
export const apiAiAssistField = (body = {}) => request("/api/ai/assist-field", { method: "POST", body });

/* --------------------------- Helpers --------------------------- */
export const formatDate = (d) => {
  if (!d) return "-"
  const dt = typeof d === "string" ? new Date(d) : d
  return dt.toLocaleString()
}

export const formatBytes = (bytes = 0) => {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}