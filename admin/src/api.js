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
    try {
      const err = await res.json()
      msg = err.message || msg
    } catch {}
    throw new Error(msg)
  }
  const ct = res.headers.get("content-type") || ""
  if (ct.includes("application/json")) return res.json()
  return res.text()
}

/* --------------------------- Auth --------------------------- */
export const apiLogin = (identifier, password) =>
  request("/api/admin/login", { method: "POST", body: { identifier, password } })

export const apiMe = () => request("/api/admin/me")

export const apiLogout = () => request("/api/admin/logout", { method: "POST" })

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
  // if you have a request() wrapper that already adds the Bearer token:
  return request("/api/stats/dashboard");
}

export async function apiStatsNotifications() {
  // if you have a request() wrapper that already adds the Bearer token:
  return request("/api/stats/notifications");
}

export async function apiStatsTickets () {
  return request("/api/stats/tickets");
}

// Add this function to your api.js
export const apiResetNotificationCount = () => {
  // This is just a placeholder since we're using localStorage
  // You can implement backend tracking if needed
  return Promise.resolve({ success: true });
};

/* --------------------------- Users (Admin) --------------------------- */
export const apiListUsers = (params) => request("/api/admin/users", { params })
export const apiCreateUser = (body) => request("/api/admin/users", { method: "POST", body })
export const apiPatchUser = (id, body) => request(`/api/admin/users/${id}`, { method: "PATCH", body })
export const apiDeleteUser = (id) => request(`/api/admin/users/${id}`, { method: "DELETE" })

/* --------------------------- Candidates --------------------------- */
export const getCandidates = () => request("/api/admin/candidates")
export const createCandidate = (body) => request("/api/admin/candidates", { method: "POST", body })
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
export const apiListTickets = (params) => request("/api/tickets", { params });
export const apiGetTicket = (id) => request(`/api/tickets/${id}`);
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