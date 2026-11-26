/**
 * Zorvixe Technologies Grounded AI Workflows
 *
 * Every function strictly enforces the signed-in user's permissions before retrieving
 * the minimum required DB records, isolates untrusted text inside <untrusted_record_data>,
 * validates structured LLM outputs against verified database IDs/enums, and provides a
 * deterministic grounded fallback that never fabricates metrics.
 */

const {
  sanitizeTextForPrompt,
  runStructuredAiTask,
  logAiAudit,
} = require('./aiService');

const ALLOWED_TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const SLA_THRESHOLD_HOURS = { urgent: 4, high: 24, medium: 72, low: 120 };

function isAdminUser(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

function asArray(val, max = 10) {
  if (!Array.isArray(val)) return [];
  return val.slice(0, max).map((v) => sanitizeTextForPrompt(v, 320)).filter(Boolean);
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'not', 'are', 'was', 'issue', 'need', 'please', 'help'].includes(w));
}

function jaccardSimilarity(aWords, bWords) {
  const a = new Set(aWords);
  const b = new Set(bWords);
  if (!a.size || !b.size) return 0;
  let intersect = 0;
  for (const w of a) if (b.has(w)) intersect++;
  return intersect / (a.size + b.size - intersect);
}

function hoursBetween(fromDate, toDate = new Date()) {
  if (!fromDate) return 0;
  const diff = toDate.getTime() - new Date(fromDate).getTime();
  return Math.max(0, Math.round((diff / 3600000) * 10) / 10);
}

function computeTicketSlaRisk(ticket) {
  const status = String(ticket.status || 'open').toLowerCase();
  if (status === 'resolved' || status === 'closed') {
    return { level: 'none', hoursElapsed: 0, thresholdHours: SLA_THRESHOLD_HOURS[ticket.priority] || 72, reason: 'Ticket is already resolved/closed.' };
  }
  const threshold = SLA_THRESHOLD_HOURS[ticket.priority] || 72;
  const ageHours = hoursBetween(ticket.created_at);
  const idleHours = hoursBetween(ticket.updated_at || ticket.created_at);
  const ratio = ageHours / threshold;

  let level = 'low';
  if (ratio >= 1) level = 'breached';
  else if (ratio >= 0.7 || idleHours >= threshold * 0.6) level = 'high';
  else if (ratio >= 0.4) level = 'medium';

  return {
    level,
    hoursElapsed: ageHours,
    idleHours,
    thresholdHours: threshold,
    reason:
      level === 'breached'
        ? `Open ${ageHours}h exceeds ${threshold}h SLA target for ${ticket.priority} priority.`
        : level === 'high'
          ? `${ageHours}h elapsed (${Math.round(ratio * 100)}% of ${threshold}h SLA window); ${idleHours}h since last update.`
          : `${ageHours}h elapsed within ${threshold}h SLA target.`,
  };
}

/* ============================================================================
 * 1. GLOBAL ROLE-AWARE AI ASSISTANT
 * ============================================================================ */
async function runAssistantChat({ pool, user, message, currentPath = '/stats', contextEntity = null }) {
  const admin = isAdminUser(user);
  const userId = Number(user?.sub);
  const question = sanitizeTextForPrompt(message, 1000);

  if (!question) {
    const err = new Error('Please enter a question for the AI assistant.');
    err.status = 400;
    throw err;
  }

  // Detect restricted topics for non-admin users explicitly
  const qLower = question.toLowerCase();
  const asksAdminRestricted =
    !admin &&
    /(salary|payroll|payslip.*all|other.*salary|ctc|bank account|pan|uan|candidate.*pipeline|applicant|onboarding|payment link|payment registration|user.*management|create user|all.*attendance)/i.test(qLower);

  const groundingRecords = [];
  const contextBundle = {
    user: { id: userId, name: user?.name || user?.email, role: user?.role || 'employee' },
    currentPath: sanitizeTextForPrompt(currentPath, 80),
  };

  // Query ONLY authorized slices in parallel
  const [
    ticketsQ,
    dealsQ,
    leadsQ,
    contactsQ,
    myLeavesQ,
    approvalLeavesQ,
    myAttendanceQ,
    myPayslipsQ,
    projectsQ,
    clientsQ,
    openJobsQ,
  ] = await Promise.all([
    pool.query(
      `SELECT t.id, t.title, t.status, t.priority, t.created_at, t.updated_at,
              a.name AS assignee_name
       FROM tickets t
       LEFT JOIN admin_users a ON a.id = t.assigned_to
       ORDER BY CASE WHEN t.status IN ('open','in_progress') THEN 0 ELSE 1 END, t.updated_at DESC
       LIMIT 20`
    ),
    pool.query(
      `SELECT d.id, d.title, d.stage, d.value, d.probability, d.expected_close_date, d.updated_at, c.name AS client_name
       FROM crm_deals d
       LEFT JOIN clients c ON c.id = d.client_id
       ORDER BY d.updated_at DESC
       LIMIT 15`
    ),
    pool.query(
      `SELECT id, first_name, last_name, company, status, source, lead_score, is_converted, updated_at
       FROM crm_leads
       WHERE is_converted = FALSE
       ORDER BY lead_score DESC, updated_at DESC
       LIMIT 15`
    ),
    pool.query(
      `SELECT id, name, email, subject, status, created_at
       FROM contacts
       ORDER BY created_at DESC
       LIMIT 12`
    ),
    pool.query(
      `SELECT id, leave_type, start_date, end_date, total_days, status
       FROM leaves
       WHERE employee_id = $1
       ORDER BY applied_on DESC
       LIMIT 10`,
      [userId]
    ),
    pool.query(
      `SELECT l.id, l.leave_type, l.start_date, l.end_date, l.total_days, l.status, u.name AS employee_name
       FROM leaves l
       JOIN admin_users u ON u.id = l.employee_id
       WHERE l.approver_id = $1 AND l.status = 'pending'
       ORDER BY l.applied_on DESC
       LIMIT 10`,
      [userId]
    ),
    pool.query(
      `SELECT date, status, total_hours, punch_in, punch_out
       FROM hrms_attendance
       WHERE employee_id = $1
       ORDER BY date DESC
       LIMIT 10`,
      [userId]
    ),
    pool.query(
      `SELECT id, month, year, net_salary, status
       FROM hrms_payrolls
       WHERE user_id = $1
       ORDER BY year DESC, month DESC
       LIMIT 3`,
      [userId]
    ),
    admin
      ? pool.query(
          `SELECT p.id, p.name, p.code, p.status, p.updated_at, c.name AS client_name
           FROM projects p LEFT JOIN clients c ON c.id = p.client_id
           ORDER BY p.updated_at DESC LIMIT 15`
        )
      : pool.query(
          `SELECT p.id, p.name, p.code, p.status, p.updated_at, c.name AS client_name
           FROM projects p
           JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
           LEFT JOIN clients c ON c.id = p.client_id
           ORDER BY p.updated_at DESC LIMIT 15`,
          [userId]
        ),
    admin
      ? pool.query(`SELECT id, name, company, email FROM clients ORDER BY created_at DESC LIMIT 15`)
      : pool.query(
          `SELECT DISTINCT c.id, c.name, c.company, c.email
           FROM clients c
           JOIN projects p ON p.client_id = c.id
           JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
           ORDER BY c.id DESC LIMIT 15`,
          [userId]
        ),
    pool.query(
      `SELECT id, title, department, status, vacancies FROM hrms_job_openings WHERE status = 'open' ORDER BY created_at DESC LIMIT 10`
    ),
  ]);

  contextBundle.tickets = ticketsQ.rows;
  contextBundle.crmDeals = dealsQ.rows;
  contextBundle.crmLeads = leadsQ.rows;
  contextBundle.contacts = contactsQ.rows;
  contextBundle.myLeaves = myLeavesQ.rows;
  contextBundle.leavesAwaitingMyApproval = approvalLeavesQ.rows;
  contextBundle.myAttendanceRecent = myAttendanceQ.rows;
  contextBundle.myRecentPayslips = myPayslipsQ.rows;
  contextBundle.accessibleProjects = projectsQ.rows;
  contextBundle.accessibleClients = clientsQ.rows;
  contextBundle.openJobOpenings = openJobsQ.rows;

  // Admin-only aggregates & queues (NEVER queried for non-admin)
  if (admin) {
    const [paymentsQ, candidatesQ, allPendingLeavesQ, orgAttQ, payrollAggQ] = await Promise.all([
      pool.query(
        `SELECT id, client_name, project_name, amount, status, due_date, created_at
         FROM payment_registrations ORDER BY created_at DESC LIMIT 12`
      ),
      pool.query(
        `SELECT id, name, position, stage, status, created_at FROM candidates ORDER BY created_at DESC LIMIT 12`
      ),
      pool.query(
        `SELECT l.id, l.leave_type, l.start_date, l.end_date, l.total_days, u.name AS employee_name
         FROM leaves l JOIN admin_users u ON u.id = l.employee_id
         WHERE l.status = 'pending' ORDER BY l.applied_on DESC LIMIT 12`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total_today,
                COUNT(*) FILTER (WHERE status = 'late')::int AS late_today,
                COUNT(*) FILTER (WHERE punch_in IS NOT NULL AND punch_out IS NULL)::int AS open_punches
         FROM hrms_attendance WHERE date = CURRENT_DATE`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count,
                COALESCE(SUM(net_salary), 0)::numeric AS net_total,
                COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_count
         FROM hrms_payrolls
         WHERE month = EXTRACT(MONTH FROM CURRENT_DATE) AND year = EXTRACT(YEAR FROM CURRENT_DATE)`
      ),
    ]);
    contextBundle.payments = paymentsQ.rows;
    contextBundle.candidates = candidatesQ.rows;
    contextBundle.allPendingLeaves = allPendingLeavesQ.rows;
    contextBundle.orgAttendanceToday = orgAttQ.rows[0] || {};
    contextBundle.currentMonthPayrollSummary = payrollAggQ.rows[0] || {};
  }

  // Optional current page context entity
  if (contextEntity?.type === 'ticket' && Number.isFinite(Number(contextEntity.id))) {
    const tq = await pool.query(`SELECT id, title, status, priority, description FROM tickets WHERE id = $1`, [Number(contextEntity.id)]);
    if (tq.rows[0]) contextBundle.focusedTicket = tq.rows[0];
  }

  // Allowed deeplink map per type
  const buildRecordUrl = (type, id) => {
    switch (type) {
      case 'ticket': return `/tickets/${id}`;
      case 'project': return `/projects/${id}`;
      case 'client': return '/clients';
      case 'deal': return '/deals';
      case 'lead': return '/leads';
      case 'contact': return '/contacts';
      case 'leave': return '/leaves';
      case 'payment': return '/payments';
      case 'candidate': return '/recruitment';
      default: return '/stats';
    }
  };

  const allowedRefs = [];
  ticketsQ.rows.slice(0, 6).forEach((t) => allowedRefs.push({ type: 'ticket', id: t.id, label: `Ticket #${t.id}: ${t.title}`, url: buildRecordUrl('ticket', t.id) }));
  dealsQ.rows.slice(0, 5).forEach((d) => allowedRefs.push({ type: 'deal', id: d.id, label: `Deal #${d.id}: ${d.title} (${d.stage})`, url: buildRecordUrl('deal', d.id) }));
  leadsQ.rows.slice(0, 4).forEach((l) => allowedRefs.push({ type: 'lead', id: l.id, label: `Lead #${l.id}: ${l.first_name} ${l.last_name || ''}`.trim(), url: buildRecordUrl('lead', l.id) }));
  projectsQ.rows.slice(0, 4).forEach((p) => allowedRefs.push({ type: 'project', id: p.id, label: `Project ${p.code}: ${p.name}`, url: buildRecordUrl('project', p.id) }));
  contactsQ.rows.slice(0, 3).forEach((c) => allowedRefs.push({ type: 'contact', id: c.id, label: `Contact #${c.id}: ${c.name}`, url: buildRecordUrl('contact', c.id) }));
  if (admin && contextBundle.payments) {
    contextBundle.payments.slice(0, 4).forEach((p) => allowedRefs.push({ type: 'payment', id: p.id, label: `Payment #${p.id}: ${p.client_name} (${p.status})`, url: buildRecordUrl('payment', p.id) }));
  }

  // Contextual suggested page actions
  const defaultActions = [];
  if (currentPath.includes('ticket')) {
    defaultActions.push({ label: 'Run Daily Ticket Assignment Check', url: '/tickets', actionKey: 'tickets_assignments' });
  } else if (currentPath.includes('crm') || currentPath.includes('lead') || currentPath.includes('deal') || currentPath.includes('account')) {
    defaultActions.push({ label: 'Scan Stale CRM Deals', url: '/deals', actionKey: 'crm_stale_deals' });
  } else if (currentPath.includes('hrms') || currentPath.includes('payroll') || currentPath.includes('attendance') || currentPath.includes('recruitment')) {
    if (admin) defaultActions.push({ label: 'Run Payroll Discrepancy Check', url: '/payroll', actionKey: 'hrms_payroll_audit' });
    defaultActions.push({ label: 'Inspect Attendance Summary', url: '/attendance', actionKey: 'hrms_attendance' });
  } else if (currentPath.includes('client') || currentPath.includes('project')) {
    defaultActions.push({ label: 'Review Accessible Projects', url: '/clients', actionKey: 'clients' });
  } else {
    defaultActions.push({ label: 'View ZORVI Daily Digest', url: '/stats', actionKey: 'dashboard_digest' });
    defaultActions.push({ label: 'Open Tickets Queue', url: '/tickets', actionKey: 'tickets' });
  }

  const fallbackBuilder = () => {
    const openTickets = ticketsQ.rows.filter((t) => ['open', 'in_progress'].includes(t.status));
    const urgentTickets = openTickets.filter((t) => ['urgent', 'high'].includes(t.priority));
    const unassignedTickets = openTickets.filter((t) => !t.assignee_name);
    const activeDeals = dealsQ.rows.filter((d) => !['won', 'lost'].includes(d.stage));
    const newContacts = contactsQ.rows.filter((c) => c.status === 'new');

    if (asksAdminRestricted) {
      return {
        answer:
          'I cannot answer questions about organization-wide payroll, other employees’ salary/HR profiles, payment transactions, or hiring pipeline candidates because your account role (`employee`) does not have permission to view those records. I can help you with Tickets, CRM Leads/Deals, Contacts, your assigned Client Projects, and your personal Leaves, Attendance, or Payslips.',
        supportingSummary: ['Permission scope enforced: Employee self-service + assigned projects + CRM + Tickets only.'],
        groundingRecords: [],
        suggestedActions: defaultActions,
        uncertainty: 'Restricted admin-only datasets were intentionally excluded.',
      };
    }

    const lines = [];
    if (/ticket|sla|assign|urgent|bug|support/i.test(qLower)) {
      lines.push(
        `Across the latest tickets, there are ${openTickets.length} active tickets (${urgentTickets.length} high/urgent, ${unassignedTickets.length} unassigned).`
      );
      if (urgentTickets[0]) {
        lines.push(`Highest priority active item: Ticket #${urgentTickets[0].id} ("${urgentTickets[0].title}", ${urgentTickets[0].priority}, status: ${urgentTickets[0].status}).`);
      }
      urgentTickets.slice(0, 4).forEach((t) => groundingRecords.push({ type: 'ticket', id: t.id, label: `Ticket #${t.id}: ${t.title}`, url: `/tickets/${t.id}` }));
    } else if (/crm|deal|lead|sales|pipeline|follow/i.test(qLower)) {
      const totalVal = activeDeals.reduce((acc, d) => acc + Number(d.value || 0), 0);
      lines.push(
        `You currently have ${activeDeals.length} active CRM deals in the recent window totaling ₹${totalVal.toLocaleString('en-IN')}, alongside ${leadsQ.rows.length} unconverted leads.`
      );
      activeDeals.slice(0, 4).forEach((d) => groundingRecords.push({ type: 'deal', id: d.id, label: `Deal #${d.id}: ${d.title} (${d.stage})`, url: '/deals' }));
    } else if (/leave|attendance|payroll|hr|candidate|hire|job/i.test(qLower)) {
      lines.push(`Personal summary: You have ${myLeavesQ.rows.length} recent leave requests, ${approvalLeavesQ.rows.length} pending leave approvals assigned to you, and ${myAttendanceQ.rows.length} recent attendance logs.`);
      if (admin) {
        lines.push(`Admin HRMS overview: ${contextBundle.allPendingLeaves?.length || 0} pending leave requests org-wide, ${contextBundle.orgAttendanceToday?.open_punches || 0} open attendance punches today, and ${contextBundle.currentMonthPayrollSummary?.count || 0} payroll records this month.`);
      }
    } else if (/client|project|contact/i.test(qLower)) {
      lines.push(`You have access to ${projectsQ.rows.length} recent projects across ${clientsQ.rows.length} clients, plus ${newContacts.length} unresponded ("new") contact inquiries.`);
      projectsQ.rows.slice(0, 4).forEach((p) => groundingRecords.push({ type: 'project', id: p.id, label: `Project ${p.code}: ${p.name}`, url: `/projects/${p.id}` }));
    } else {
      lines.push(
        `Current authorized snapshot: ${openTickets.length} active tickets (${urgentTickets.length} high/urgent), ${activeDeals.length} open CRM deals, ${leadsQ.rows.length} active leads, ${newContacts.length} new contacts, and ${projectsQ.rows.length} accessible projects.`
      );
      if (admin) {
        const pendingPayments = (contextBundle.payments || []).filter((p) => p.status === 'pending').length;
        lines.push(`Admin queues: ${pendingPayments} pending payment submissions and ${contextBundle.allPendingLeaves?.length || 0} pending leave requests.`);
      }
      ticketsQ.rows.slice(0, 2).forEach((t) => groundingRecords.push({ type: 'ticket', id: t.id, label: `Ticket #${t.id}: ${t.title}`, url: `/tickets/${t.id}` }));
      activeDeals.slice(0, 2).forEach((d) => groundingRecords.push({ type: 'deal', id: d.id, label: `Deal #${d.id}: ${d.title}`, url: '/deals' }));
    }

    return {
      answer: lines.join(' '),
      supportingSummary: lines,
      groundingRecords: groundingRecords.length ? groundingRecords : allowedRefs.slice(0, 4),
      suggestedActions: defaultActions,
      uncertainty: 'Generated from recent database snapshots (up to 15–20 latest records per module). Verify full lists before final actions.',
    };
  };

  if (asksAdminRestricted) {
    const restrictedRes = fallbackBuilder();
    await logAiAudit({
      pool,
      user,
      feature: 'assistant_chat',
      actionStatus: 'blocked',
      requestMeta: { currentPath, questionLength: question.length, reason: 'non_admin_restricted_topic' },
      responseMeta: { blocked: true },
    });
    return {
      ...restrictedRes,
      meta: { provider: 'rbac_guard', model: 'policy-enforced', fallbackUsed: false },
    };
  }

  const refLookup = new Map(allowedRefs.map((r) => [`${r.type}:${r.id}`, r]));
  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Answer the user's question ("${question}") strictly from the authorized records in <untrusted_record_data>. Cite record types and IDs you used. Respect the user's role (${user?.role}). If asked about data not present in the context, state what is missing.`,
    schemaHint: `{
  "answer": "clear helpful answer grounded only in provided records",
  "supportingSummary": ["bullet point citing specific IDs/metrics"],
  "citedRecordKeys": ["ticket:12", "deal:4"],
  "suggestedActions": [{ "label": "short action label", "url": "/tickets/12" }],
  "uncertainty": "note any gaps, sample limits, or missing info"
}`,
    untrustedPayload: contextBundle,
    fallbackBuilder,
    validator: (parsed, fb) => {
      const cited = Array.isArray(parsed.citedRecordKeys)
        ? parsed.citedRecordKeys.map((k) => refLookup.get(String(k))).filter(Boolean).slice(0, 6)
        : fb.groundingRecords;
      const validActions = Array.isArray(parsed.suggestedActions)
        ? parsed.suggestedActions
            .filter((a) => a && typeof a.url === 'string' && a.url.startsWith('/'))
            .slice(0, 4)
            .map((a) => ({ label: sanitizeTextForPrompt(a.label, 60), url: sanitizeTextForPrompt(a.url, 80) }))
        : fb.suggestedActions;
      return {
        answer: sanitizeTextForPrompt(parsed.answer || fb.answer, 1800),
        supportingSummary: asArray(parsed.supportingSummary, 6),
        groundingRecords: cited.length ? cited : fb.groundingRecords,
        suggestedActions: validActions.length ? validActions : fb.suggestedActions,
        uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 400),
      };
    },
  });

  await logAiAudit({
    pool,
    user,
    feature: 'assistant_chat',
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: result.groundingRecords,
    requestMeta: { currentPath, questionLength: question.length },
    responseMeta: { summaryCount: result.supportingSummary.length },
  });

  return { ...result, meta };
}

/* ============================================================================
 * 2. TICKETS AI: ANALYZE, DRAFT REPLY & DAILY ASSIGNMENT RECOMMENDATIONS
 * ============================================================================ */
async function analyzeTicket({ pool, user, ticketId }) {
  const id = Number(ticketId);
  if (!Number.isFinite(id)) throw Object.assign(new Error('Invalid ticket id'), { status: 400 });

  const [ticketQ, commentsQ, otherTicketsQ] = await Promise.all([
    pool.query(
      `SELECT t.*, c.name AS creator_name, a.name AS assignee_name
       FROM tickets t
       LEFT JOIN admin_users c ON c.id = t.created_by
       LEFT JOIN admin_users a ON a.id = t.assigned_to
       WHERE t.id = $1`,
      [id]
    ),
    pool.query(
      `SELECT tc.id, tc.comment_text, tc.created_at, u.name AS user_name
       FROM ticket_comments tc
       JOIN admin_users u ON u.id = tc.user_id
       WHERE tc.ticket_id = $1
       ORDER BY tc.created_at ASC
       LIMIT 25`,
      [id]
    ),
    pool.query(
      `SELECT id, title, description, status, priority, created_at
       FROM tickets
       WHERE id <> $1 AND status IN ('open', 'in_progress')
       ORDER BY updated_at DESC
       LIMIT 60`,
      [id]
    ),
  ]);

  if (!ticketQ.rows.length) throw Object.assign(new Error('Ticket not found'), { status: 404 });
  const ticket = ticketQ.rows[0];
  const slaRisk = computeTicketSlaRisk(ticket);

  // Duplicate detection based on real token similarity
  const baseWords = tokenize(`${ticket.title} ${sanitizeTextForPrompt(ticket.description, 400)}`);
  const dupMatches = otherTicketsQ.rows
    .map((ot) => {
      const sim = jaccardSimilarity(baseWords, tokenize(`${ot.title} ${sanitizeTextForPrompt(ot.description, 400)}`));
      return { id: ot.id, title: ot.title, status: ot.status, priority: ot.priority, similarity: Math.round(sim * 100) };
    })
    .filter((m) => m.similarity >= 25)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 4);

  const validDupIds = new Set(otherTicketsQ.rows.map((r) => Number(r.id)));

  const fallbackBuilder = () => {
    const text = `${ticket.title} ${sanitizeTextForPrompt(ticket.description, 600)}`.toLowerCase();
    let category = 'General Support';
    if (/login|auth|otp|password|token|jwt|session/.test(text)) category = 'Authentication & Access';
    else if (/pay|invoice|billing|razorpay|receipt|salary|payroll/.test(text)) category = 'Billing / Payroll';
    else if (/bug|error|crash|500|fail|broken|exception/.test(text)) category = 'Defect / Bug';
    else if (/ui|css|layout|mobile|responsive|icon/.test(text)) category = 'UI / UX';
    else if (/lead|crm|deal|email|client/.test(text)) category = 'CRM / Operations';

    let suggestedPriority = ticket.priority || 'medium';
    if (/outage|down|urgent|critical|blocked|payment fail|cannot login/.test(text)) suggestedPriority = 'urgent';
    else if (/error|broken|sla|deadline|important/.test(text) && suggestedPriority === 'low') suggestedPriority = 'high';

    const urgencyScore =
      suggestedPriority === 'urgent' ? 92 :
      suggestedPriority === 'high' ? 75 :
      suggestedPriority === 'medium' ? 50 : 25;

    return {
      summary: `Ticket #${ticket.id} ("${ticket.title}") created by ${ticket.creator_name || 'team member'} (${commentsQ.rows.length} comments). Current status: ${ticket.status}, priority: ${ticket.priority}.`,
      category,
      suggestedPriority,
      urgencyScore: Math.min(100, urgencyScore + (slaRisk.level === 'breached' ? 8 : 0)),
      slaRisk,
      possibleDuplicates: dupMatches,
      recommendedNextSteps: [
        !ticket.assigned_to ? 'Assign an active owner based on workload and skills.' : `Confirm next status update with assignee (${ticket.assignee_name}).`,
        slaRisk.level === 'breached' || slaRisk.level === 'high' ? 'Prioritize response immediately due to SLA aging.' : 'Monitor within standard SLA target.',
        dupMatches.length ? `Verify whether Ticket #${dupMatches[0].id} tracks the same root issue.` : 'No strong duplicate tickets detected in active queue.',
      ],
      uncertainty: commentsQ.rows.length === 0 ? 'No comment history yet; assessment relies only on initial title and description.' : 'Verified from ticket fields and up to 25 recent comments.',
    };
  };

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Classify and summarize Ticket #${ticket.id}. Identify urgency (0-100), SLA risk, any potential duplicates ONLY from candidateDuplicates IDs, and clear next steps.`,
    schemaHint: `{
  "summary": "2-3 sentence grounded summary",
  "category": "short category name",
  "suggestedPriority": "low | medium | high | urgent",
  "urgencyScore": 0,
  "possibleDuplicates": [{ "id": 123, "reason": "short overlap reason" }],
  "recommendedNextSteps": ["step 1", "step 2"],
  "uncertainty": "note missing info or ambiguities"
}`,
    untrustedPayload: {
      ticket: {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        assignee_name: ticket.assignee_name,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
      },
      slaRiskComputed: slaRisk,
      comments: commentsQ.rows,
      candidateDuplicates: dupMatches,
    },
    fallbackBuilder,
    validator: (parsed, fb) => {
      const sp = String(parsed.suggestedPriority || '').toLowerCase();
      const dups = Array.isArray(parsed.possibleDuplicates)
        ? parsed.possibleDuplicates
            .filter((d) => validDupIds.has(Number(d?.id)))
            .slice(0, 4)
            .map((d) => {
              const orig = otherTicketsQ.rows.find((r) => Number(r.id) === Number(d.id));
              return {
                id: Number(d.id),
                title: orig?.title || `Ticket #${d.id}`,
                status: orig?.status || 'open',
                reason: sanitizeTextForPrompt(d.reason || 'Related active ticket', 180),
              };
            })
        : fb.possibleDuplicates;

      return {
        summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 600),
        category: sanitizeTextForPrompt(parsed.category || fb.category, 60),
        suggestedPriority: ALLOWED_TICKET_PRIORITIES.includes(sp) ? sp : fb.suggestedPriority,
        urgencyScore: Number.isFinite(Number(parsed.urgencyScore))
          ? Math.max(0, Math.min(100, Math.round(Number(parsed.urgencyScore))))
          : fb.urgencyScore,
        slaRisk,
        possibleDuplicates: dups,
        recommendedNextSteps: asArray(parsed.recommendedNextSteps, 5).length ? asArray(parsed.recommendedNextSteps, 5) : fb.recommendedNextSteps,
        uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 320),
      };
    },
  });

  await logAiAudit({
    pool,
    user,
    feature: 'ticket_analyze',
    entityType: 'ticket',
    entityId: id,
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: [{ type: 'ticket', id }],
    responseMeta: { category: result.category, suggestedPriority: result.suggestedPriority, slaRisk: result.slaRisk.level },
  });

  return { ...result, ticketId: id, meta };
}

async function draftTicketReply({ pool, user, ticketId, tone = 'professional', instruction = '' }) {
  const id = Number(ticketId);
  if (!Number.isFinite(id)) throw Object.assign(new Error('Invalid ticket id'), { status: 400 });

  const [ticketQ, commentsQ] = await Promise.all([
    pool.query(
      `SELECT t.*, c.name AS creator_name, a.name AS assignee_name
       FROM tickets t
       LEFT JOIN admin_users c ON c.id = t.created_by
       LEFT JOIN admin_users a ON a.id = t.assigned_to
       WHERE t.id = $1`,
      [id]
    ),
    pool.query(
      `SELECT tc.comment_text, tc.created_at, u.name AS user_name
       FROM ticket_comments tc
       JOIN admin_users u ON u.id = tc.user_id
       WHERE tc.ticket_id = $1
       ORDER BY tc.created_at DESC
       LIMIT 10`,
      [id]
    ),
  ]);

  if (!ticketQ.rows.length) throw Object.assign(new Error('Ticket not found'), { status: 404 });
  const ticket = ticketQ.rows[0];
  const safeTone = sanitizeTextForPrompt(tone, 30) || 'professional';
  const safeInstruction = sanitizeTextForPrompt(instruction, 250);

  const fallbackBuilder = () => {
    const targetName = ticket.creator_name || 'Team';
    const lastComment = commentsQ.rows[0] ? sanitizeTextForPrompt(commentsQ.rows[0].comment_text, 140) : '';
    const replyText = [
      `Hi ${targetName},`,
      ``,
      `Thank you for raising Ticket #${ticket.id} ("${ticket.title}"). We are reviewing the current ${ticket.priority} priority request (${ticket.status}).`,
      lastComment ? `Regarding the latest update ("${lastComment}"), we are verifying the details and next steps.` : `We are reviewing the description details and confirming owner availability.`,
      safeInstruction ? `Note: ${safeInstruction}` : `We will share a confirmed update shortly. Please let us know if there are any additional logs or screenshots to attach.`,
      ``,
      `Best regards,`,
      `${user?.name || 'Zorvixe Support Team'}`,
    ].join('\n');

    return {
      draftReply: replyText,
      uncertainty: commentsQ.rows.length === 0 ? 'No prior comments exist on this ticket yet — review technical facts before posting.' : 'Draft references recent comment thread; review accuracy before posting.',
    };
  };

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Draft a ${safeTone} ticket comment reply for human review before posting. ${safeInstruction ? `Focus on: ${safeInstruction}` : ''} Never invent fixes already completed unless shown in comments.`,
    schemaHint: `{
  "draftReply": "plain text reply ready to edit before posting",
  "uncertainty": "any missing facts the human should fill in before sending"
}`,
    untrustedPayload: { ticket, recentComments: commentsQ.rows },
    fallbackBuilder,
    validator: (parsed, fb) => ({
      draftReply: sanitizeTextForPrompt(parsed.draftReply || fb.draftReply, 2500),
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 320),
    }),
  });

  await logAiAudit({
    pool,
    user,
    feature: 'ticket_draft_reply',
    entityType: 'ticket',
    entityId: id,
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: [{ type: 'ticket', id }],
  });

  return { ...result, ticketId: id, meta };
}

async function recommendTicketAssignments({ pool, user, ticketIds = null }) {
  const filterIds = Array.isArray(ticketIds) && ticketIds.length
    ? ticketIds.map(Number).filter(Number.isFinite).slice(0, 15)
    : null;

  const ticketsQuery = filterIds
    ? await pool.query(
        `SELECT t.id, t.title, t.description, t.priority, t.status, t.assigned_to, t.created_at, t.updated_at, a.name AS current_assignee_name
         FROM tickets t LEFT JOIN admin_users a ON a.id = t.assigned_to
         WHERE t.id = ANY($1::bigint[]) AND t.status IN ('open', 'in_progress')
         ORDER BY t.created_at DESC`,
        [filterIds]
      )
    : await pool.query(
        `SELECT t.id, t.title, t.description, t.priority, t.status, t.assigned_to, t.created_at, t.updated_at, a.name AS current_assignee_name
         FROM tickets t LEFT JOIN admin_users a ON a.id = t.assigned_to
         WHERE t.status IN ('open', 'in_progress')
         ORDER BY
           CASE WHEN t.assigned_to IS NULL THEN 0 ELSE 1 END,
           CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           t.created_at ASC
         LIMIT 12`
      );

  const tickets = ticketsQuery.rows;
  if (!tickets.length) {
    return {
      recommendations: [],
      teamSummary: [],
      uncertainty: 'No open or in-progress tickets matched for assignment review.',
      meta: { provider: 'deterministic_fallback', model: 'deterministic-grounded-v1', fallbackUsed: true },
    };
  }

  // Gather REAL workload, presence, leave overlap, today's attendance, and historical resolved keywords per active user
  const [membersQ, onLeaveQ, attTodayQ, historyQ] = await Promise.all([
    pool.query(`
      SELECT
        u.id, u.name, u.email, u.role, u.department, u.position,
        u.presence_status, u.last_seen_at,
        COUNT(t.id) FILTER (WHERE t.status IN ('open', 'in_progress'))::int AS open_workload,
        COUNT(t.id) FILTER (WHERE t.status IN ('open', 'in_progress') AND t.priority IN ('urgent', 'high'))::int AS high_priority_workload,
        COUNT(t.id) FILTER (WHERE t.status IN ('resolved', 'closed'))::int AS resolved_count
      FROM admin_users u
      LEFT JOIN tickets t ON t.assigned_to = u.id
      WHERE u.is_active = TRUE
      GROUP BY u.id
      ORDER BY open_workload ASC, u.name ASC
    `),
    pool.query(`
      SELECT DISTINCT employee_id, leave_type, start_date, end_date
      FROM leaves
      WHERE status = 'approved' AND CURRENT_DATE BETWEEN start_date AND end_date
    `),
    pool.query(`
      SELECT employee_id, status, punch_in, punch_out
      FROM hrms_attendance
      WHERE date = CURRENT_DATE
    `),
    pool.query(`
      SELECT assigned_to, title, priority
      FROM tickets
      WHERE assigned_to IS NOT NULL AND status IN ('resolved', 'closed')
      ORDER BY updated_at DESC
      LIMIT 150
    `),
  ]);

  const onLeaveMap = new Map(onLeaveQ.rows.map((r) => [Number(r.employee_id), r]));
  const attMap = new Map(attTodayQ.rows.map((r) => [Number(r.employee_id), r]));
  const historyByMember = new Map();
  historyQ.rows.forEach((h) => {
    const uid = Number(h.assigned_to);
    if (!historyByMember.has(uid)) historyByMember.set(uid, []);
    historyByMember.get(uid).push(h.title);
  });

  const enrichedMembers = membersQ.rows.map((m) => {
    const uid = Number(m.id);
    const leave = onLeaveMap.get(uid) || null;
    const att = attMap.get(uid) || null;
    const pastTitles = (historyByMember.get(uid) || []).slice(0, 12);
    const presence = m.presence_status || 'Available';
    const isUnavailable = Boolean(leave) || presence === 'Do not disturb' || presence === 'Offline';

    return {
      id: uid,
      name: m.name,
      email: m.email,
      department: m.department || null,
      position: m.position || null,
      presenceStatus: presence,
      onApprovedLeaveToday: Boolean(leave),
      leaveDetails: leave ? `${leave.leave_type} leave until ${String(leave.end_date).slice(0, 10)}` : null,
      checkedInToday: Boolean(att?.punch_in),
      openWorkload: m.open_workload,
      highPriorityWorkload: m.high_priority_workload,
      resolvedCount: m.resolved_count,
      pastResolvedKeywords: tokenize(`${m.department || ''} ${m.position || ''} ${pastTitles.join(' ')}`).slice(0, 25),
      isUnavailable,
    };
  });

  const allowedMemberIds = new Set(enrichedMembers.map((m) => m.id));
  const memberById = new Map(enrichedMembers.map((m) => [m.id, m]));
  const allowedTicketIds = new Set(tickets.map((t) => Number(t.id)));

  // Compute deterministic ranked candidate score per ticket
  const computeDeterministicRecs = () => {
    // Track incremental load across batch so we don't overload one member on daily batch
    const projectedExtraLoad = new Map();
    return tickets.map((t) => {
      const tWords = tokenize(`${t.title} ${sanitizeTextForPrompt(t.description, 300)}`);
      const sla = computeTicketSlaRisk(t);

      const scored = enrichedMembers
        .map((m) => {
          const extra = projectedExtraLoad.get(m.id) || 0;
          const effLoad = m.openWorkload + extra;
          let score = 50;

          // Availability factor
          if (m.onApprovedLeaveToday) score -= 60;
          else if (m.presenceStatus === 'Available') score += 16;
          else if (m.presenceStatus === 'Away') score += 4;
          else if (m.presenceStatus === 'Busy') score -= 6;
          else if (m.presenceStatus === 'Do not disturb') score -= 25;

          if (m.checkedInToday) score += 8;

          // Workload balance
          score -= effLoad * 7;
          if (t.priority === 'urgent' || t.priority === 'high') {
            score -= m.highPriorityWorkload * 6;
          }

          // Skill / role / historical ticket match
          const skillOverlap = tWords.filter((w) => m.pastResolvedKeywords.includes(w));
          const uniqueSkillHits = [...new Set(skillOverlap)];
          score += Math.min(24, uniqueSkillHits.length * 8);
          if (m.resolvedCount > 0) score += Math.min(10, Math.floor(m.resolvedCount / 2));

          return {
            member: m,
            score,
            uniqueSkillHits,
            effLoad,
          };
        })
        .sort((a, b) => b.score - a.score);

      const top = scored[0];
      const runnerUp = scored[1] || null;
      if (top) {
        projectedExtraLoad.set(top.member.id, (projectedExtraLoad.get(top.member.id) || 0) + 1);
      }

      const reasons = [];
      if (top) {
        if (top.uniqueSkillHits.length > 0) {
          reasons.push(`Skill/history overlap on: ${top.uniqueSkillHits.slice(0, 4).join(', ')} (${top.member.resolvedCount} past resolved tickets).`);
        } else {
          reasons.push(`No direct skill/department metadata match found (${top.member.department || 'no dept set'}); ranked primarily by lowest workload & availability.`);
        }
        reasons.push(`Current workload: ${top.member.openWorkload} open ticket(s), ${top.member.highPriorityWorkload} high/urgent.`);
        reasons.push(
          top.member.onApprovedLeaveToday
            ? `Caution: currently on approved leave (${top.member.leaveDetails}).`
            : `Availability: presence "${top.member.presenceStatus}"${top.member.checkedInToday ? ', punched in today' : ', no attendance punch logged today'}.`
        );
      }

      return {
        ticketId: Number(t.id),
        ticketTitle: t.title,
        priority: t.priority,
        status: t.status,
        slaRisk: sla.level,
        currentAssigneeId: t.assigned_to ? Number(t.assigned_to) : null,
        currentAssigneeName: t.current_assignee_name || null,
        recommendedAssigneeId: top ? top.member.id : null,
        recommendedAssigneeName: top ? top.member.name : null,
        alternateAssigneeId: runnerUp ? runnerUp.member.id : null,
        alternateAssigneeName: runnerUp ? runnerUp.member.name : null,
        confidence: top && top.uniqueSkillHits.length > 0 && !top.member.isUnavailable ? 'high' : 'medium',
        reasons,
        uncertainty:
          !top?.member.department && !top?.member.position
            ? 'Some team members lack department/position skill profiles; recommendation weighted workload & availability.'
            : top?.uniqueSkillHits.length === 0
              ? 'Limited historical ticket text match for this topic; verify domain fit before confirming.'
              : 'Based on live open workload, presence, leave calendar, and resolved history.',
      };
    });
  };

  const fallbackRecs = computeDeterministicRecs();
  const fallbackBuilder = () => ({
    recommendations: fallbackRecs,
    uncertainty: 'Review each recommended assignee before clicking Confirm Assignment. No tickets are modified automatically.',
  });

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Review the open tickets and active team members below. Confirm or refine the best daily assignee for each ticket using ONLY member IDs from the provided list, factoring priority, skill/history match, workload, leave status, and presence.`,
    schemaHint: `{
  "recommendations": [
    {
      "ticketId": 1,
      "recommendedAssigneeId": 2,
      "confidence": "high | medium | low",
      "reasons": ["factor 1 (priority/skills/workload/availability)", "factor 2"],
      "uncertainty": "any missing info"
    }
  ],
  "uncertainty": "overall caveats"
}`,
    untrustedPayload: {
      tickets: tickets.map((t) => ({ id: t.id, title: t.title, description: t.description, priority: t.priority, current_assignee_id: t.assigned_to })),
      teamMembers: enrichedMembers,
      baselineRanking: fallbackRecs,
    },
    fallbackBuilder,
    validator: (parsed, fb) => {
      const fbMap = new Map(fb.recommendations.map((r) => [r.ticketId, r]));
      const recs = Array.isArray(parsed.recommendations)
        ? parsed.recommendations
            .filter((r) => allowedTicketIds.has(Number(r?.ticketId)))
            .map((r) => {
              const tid = Number(r.ticketId);
              const base = fbMap.get(tid);
              const candidateUid = Number(r.recommendedAssigneeId);
              const validUid = allowedMemberIds.has(candidateUid) ? candidateUid : base.recommendedAssigneeId;
              const member = memberById.get(validUid);
              const conf = ['high', 'medium', 'low'].includes(String(r.confidence || '').toLowerCase())
                ? String(r.confidence).toLowerCase()
                : base.confidence;
              const reasons = asArray(r.reasons, 4);
              return {
                ...base,
                recommendedAssigneeId: validUid,
                recommendedAssigneeName: member ? member.name : base.recommendedAssigneeName,
                confidence: conf,
                reasons: reasons.length ? reasons : base.reasons,
                uncertainty: sanitizeTextForPrompt(r.uncertainty || base.uncertainty, 260),
              };
            })
        : fb.recommendations;

      return {
        recommendations: recs.length ? recs : fb.recommendations,
        uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 320),
      };
    },
  });

  await logAiAudit({
    pool,
    user,
    feature: 'ticket_assignments',
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: result.recommendations.map((r) => ({ type: 'ticket', id: r.ticketId, suggestedAssigneeId: r.recommendedAssigneeId })),
    responseMeta: { count: result.recommendations.length },
  });

  return {
    ...result,
    teamSummary: enrichedMembers.map(({ pastResolvedKeywords, ...rest }) => rest),
    meta,
  };
}

/* ============================================================================
 * 3. CRM AI: SUMMARIZE LEAD / DEAL / ACCOUNT, STALE DEALS & SALES EMAIL DRAFT
 * ============================================================================ */
async function summarizeCrmEntity({ pool, user, entityType, entityId }) {
  const type = String(entityType || '').toLowerCase();
  const id = Number(entityId);
  if (!['lead', 'deal', 'account'].includes(type) || !Number.isFinite(id)) {
    throw Object.assign(new Error('Valid entityType (lead|deal|account) and numeric entityId required'), { status: 400 });
  }

  let payload = {};
  let groundingRefs = [];

  if (type === 'lead') {
    const [leadQ, emailsQ] = await Promise.all([
      pool.query(`SELECT l.*, u.name AS assigned_to_name FROM crm_leads l LEFT JOIN admin_users u ON u.id = l.assigned_to WHERE l.id = $1`, [id]),
      pool.query(`SELECT subject, created_at, status FROM crm_emails WHERE related_type = 'lead' AND related_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
    ]);
    if (!leadQ.rows.length) throw Object.assign(new Error('Lead not found'), { status: 404 });
    payload = { lead: leadQ.rows[0], emails: emailsQ.rows };
    groundingRefs = [{ type: 'lead', id, label: `${leadQ.rows[0].first_name} ${leadQ.rows[0].last_name || ''}`.trim() }];
  } else if (type === 'deal') {
    const [dealQ, actQ, quotesQ, emailsQ] = await Promise.all([
      pool.query(`SELECT d.*, c.name AS client_name, c.company AS client_company, u.name AS assigned_to_name FROM crm_deals d LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN admin_users u ON u.id = d.assigned_to WHERE d.id = $1`, [id]),
      pool.query(`SELECT id, type, title, description, due_date, completed, outcome, created_at FROM crm_activities WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 15`, [id]),
      pool.query(`SELECT id, quote_number, subject, status, grand_total, valid_until FROM crm_quotes WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
      pool.query(`SELECT subject, created_at, status FROM crm_emails WHERE related_type = 'deal' AND related_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
    ]);
    if (!dealQ.rows.length) throw Object.assign(new Error('Deal not found'), { status: 404 });
    payload = { deal: dealQ.rows[0], activities: actQ.rows, quotes: quotesQ.rows, emails: emailsQ.rows };
    groundingRefs = [{ type: 'deal', id, label: dealQ.rows[0].title }];
  } else {
    const [clientQ, contactsQ, dealsQ, quotesQ, actQ] = await Promise.all([
      pool.query(`SELECT id, name, company, email, phone, industry, website, annual_revenue, city, country, created_at FROM clients WHERE id = $1`, [id]),
      pool.query(`SELECT id, name, email, position, department, is_primary FROM crm_contacts WHERE client_id = $1 LIMIT 15`, [id]),
      pool.query(`SELECT id, title, stage, value, probability, expected_close_date, updated_at FROM crm_deals WHERE client_id = $1 ORDER BY updated_at DESC LIMIT 15`, [id]),
      pool.query(`SELECT id, quote_number, subject, status, grand_total, created_at FROM crm_quotes WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
      pool.query(`SELECT id, type, title, completed, due_date, created_at FROM crm_activities WHERE client_id = $1 ORDER BY created_at DESC LIMIT 15`, [id]),
    ]);
    if (!clientQ.rows.length) throw Object.assign(new Error('Account not found'), { status: 404 });
    payload = { account: clientQ.rows[0], contacts: contactsQ.rows, deals: dealsQ.rows, quotes: quotesQ.rows, activities: actQ.rows };
    groundingRefs = [{ type: 'account', id, label: clientQ.rows[0].company || clientQ.rows[0].name }];
  }

  const fallbackBuilder = () => {
    if (type === 'lead') {
      const l = payload.lead;
      const daysOld = Math.round(hoursBetween(l.updated_at || l.created_at) / 24);
      return {
        summary: `Lead "${l.first_name} ${l.last_name || ''}" (${l.company || 'No company'}) is in stage "${l.status}" via ${l.source} with score ${l.lead_score || 0}. ${payload.emails.length} outbound CRM email(s) logged.`,
        healthStatus: l.is_converted ? 'converted' : daysOld > 10 ? 'needs_attention' : 'active',
        keySignals: [
          `Lead Score: ${l.lead_score || 0}/100 • Status: ${l.status}`,
          `Last updated ${daysOld} day(s) ago.`,
        ],
        nextSteps: [
          payload.emails.length === 0 ? 'Send an introductory capability email and schedule a discovery call.' : 'Follow up on prior outreach and qualify budget/timeline.',
          !l.is_converted && l.status === 'qualified' ? 'Consider converting lead into an Account & Deal.' : 'Verify contact phone/email & log discovery notes.',
        ],
        uncertainty: l.description ? 'Grounded in lead record and logged CRM emails.' : 'Lead description is empty; qualification details are limited.',
      };
    }
    if (type === 'deal') {
      const d = payload.deal;
      const idleDays = Math.round(hoursBetween(d.updated_at || d.created_at) / 24);
      const openTasks = payload.activities.filter((a) => !a.completed).length;
      return {
        summary: `Deal "${d.title}" for ${d.client_company || d.client_name || 'Unlinked Client'} is at stage "${d.stage}" (₹${Number(d.value || 0).toLocaleString('en-IN')}, ${d.probability || 0}% prob). ${payload.activities.length} activities & ${payload.quotes.length} quotes attached.`,
        healthStatus: ['won'].includes(d.stage) ? 'healthy' : idleDays >= 7 ? 'at_risk' : 'active',
        keySignals: [
          `Idle for ~${idleDays} day(s); ${openTasks} open follow-up activity(ies).`,
          d.expected_close_date ? `Expected close: ${String(d.expected_close_date).slice(0, 10)}` : 'No expected close date set.',
        ],
        nextSteps: [
          openTasks > 0 ? 'Complete overdue/open follow-up activities.' : 'Schedule next touchpoint (call or demo) to advance stage.',
          payload.quotes.length === 0 && ['proposal', 'negotiation'].includes(d.stage) ? 'Prepare & attach a formal quotation in Quotes.' : 'Confirm buyer timeline before expected close date.',
        ],
        uncertainty: !payload.activities.length ? 'No logged CRM activities yet for this deal.' : 'Based on deal, quotes, activities, and email logs.',
      };
    }
    const a = payload.account;
    const totalDealVal = payload.deals.filter((d) => d.stage !== 'lost').reduce((s, d) => s + Number(d.value || 0), 0);
    return {
      summary: `Account "${a.company || a.name}" (${a.industry || 'General'}) has ${payload.contacts.length} stakeholder contact(s), ${payload.deals.length} deal(s) (₹${totalDealVal.toLocaleString('en-IN')} non-lost value), and ${payload.quotes.length} quote(s).`,
      healthStatus: payload.deals.some((d) => d.stage === 'won') ? 'healthy' : payload.deals.length ? 'active' : 'needs_engagement',
      keySignals: [
        `Stakeholders: ${payload.contacts.length} contact(s)`,
        `Activities logged: ${payload.activities.length}`,
      ],
      nextSteps: [
        payload.contacts.length === 0 ? 'Add primary stakeholder contact details.' : 'Check with primary stakeholder on active deal/quote status.',
        payload.activities.filter((act) => !act.completed).length > 0 ? 'Follow up on pending CRM activities.' : 'Plan quarterly business review / upsell check-in.',
      ],
      uncertainty: !a.industry ? 'Industry/revenue enrichment fields are partial.' : 'Grounded in Account 360° database records.',
    };
  };

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Summarize this CRM ${type} record and recommend practical sales next steps for human confirmation.`,
    schemaHint: `{
  "summary": "concise executive summary",
  "healthStatus": "healthy | active | needs_attention | at_risk",
  "keySignals": ["signal 1", "signal 2"],
  "nextSteps": ["recommended action 1", "recommended action 2"],
  "uncertainty": "any missing info"
}`,
    untrustedPayload: payload,
    fallbackBuilder,
    validator: (parsed, fb) => ({
      summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 800),
      healthStatus: sanitizeTextForPrompt(parsed.healthStatus || fb.healthStatus, 30),
      keySignals: asArray(parsed.keySignals, 6).length ? asArray(parsed.keySignals, 6) : fb.keySignals,
      nextSteps: asArray(parsed.nextSteps, 5).length ? asArray(parsed.nextSteps, 5) : fb.nextSteps,
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 300),
    }),
  });

  await logAiAudit({
    pool,
    user,
    feature: 'crm_summary',
    entityType: type,
    entityId: id,
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs,
  });

  return { ...result, entityType: type, entityId: id, groundingRecords: groundingRefs, meta };
}

async function findStaleDeals({ pool, user }) {
  const dealsQ = await pool.query(`
    SELECT
      d.id, d.title, d.stage, d.value, d.probability, d.expected_close_date,
      d.updated_at, d.created_at,
      c.id AS client_id, c.name AS client_name, c.company AS client_company, c.email AS client_email,
      u.name AS owner_name,
      MAX(a.created_at) AS last_activity_at,
      COUNT(a.id) FILTER (WHERE a.completed = FALSE)::int AS pending_activities
    FROM crm_deals d
    LEFT JOIN clients c ON c.id = d.client_id
    LEFT JOIN admin_users u ON u.id = d.assigned_to
    LEFT JOIN crm_activities a ON a.deal_id = d.id
    WHERE d.stage NOT IN ('won', 'lost')
    GROUP BY d.id, c.id, u.name
    ORDER BY d.value DESC NULLS LAST, d.updated_at ASC
    LIMIT 50
  `);

  const now = new Date();
  const evaluated = dealsQ.rows.map((d) => {
    const latestTouch = d.last_activity_at && new Date(d.last_activity_at) > new Date(d.updated_at || d.created_at)
      ? d.last_activity_at
      : (d.updated_at || d.created_at);
    const daysIdle = Math.round(hoursBetween(latestTouch, now) / 24);
    const pastClose = d.expected_close_date && new Date(d.expected_close_date) < now;
    const isStale = daysIdle >= 7 || pastClose || (!d.last_activity_at && daysIdle >= 3);

    const reasons = [];
    if (daysIdle >= 7) reasons.push(`No deal update or logged activity for ${daysIdle} days.`);
    if (pastClose) reasons.push(`Expected close date (${String(d.expected_close_date).slice(0, 10)}) has passed.`);
    if (!d.last_activity_at) reasons.push('Zero CRM follow-up activities logged.');

    return {
      dealId: Number(d.id),
      title: d.title,
      stage: d.stage,
      value: Number(d.value || 0),
      clientName: d.client_company || d.client_name || 'Unlinked Client',
      clientEmail: d.client_email || '',
      clientId: d.client_id ? Number(d.client_id) : null,
      ownerName: d.owner_name || 'Unassigned',
      daysIdle,
      pastClose: Boolean(pastClose),
      pendingActivities: d.pending_activities || 0,
      isStale,
      reasons,
      suggestedFollowUp: pastClose
        ? 'Re-qualify close date with decision maker and confirm blockers via email/call.'
        : 'Log a check-in call or send a tailored follow-up email with concrete next milestone.',
    };
  });

  const staleDeals = evaluated.filter((d) => d.isStale).slice(0, 15);
  const validIds = new Set(staleDeals.map((d) => d.dealId));

  const fallbackBuilder = () => ({
    staleDeals,
    summary: staleDeals.length
      ? `Found ${staleDeals.length} open deal(s) showing staleness signals (7+ days idle, overdue expected close date, or missing activity logs) out of ${dealsQ.rows.length} active deals.`
      : `Scanned ${dealsQ.rows.length} active deal(s); none currently breach the staleness threshold (7+ days idle or past expected close).`,
    uncertainty: 'Staleness is computed from CRM deal updates, activity logs, and expected close dates; external offline conversations not logged in CRM are unseen.',
  });

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Analyze these flagged open deals and refine concise stale-deal risk summaries and suggested follow-ups without changing IDs or currency values.`,
    schemaHint: `{
  "summary": "overall pipeline staleness summary",
  "followUps": [{ "dealId": 1, "suggestedFollowUp": "concise next action" }],
  "uncertainty": "caveats"
}`,
    untrustedPayload: { staleDeals },
    fallbackBuilder,
    validator: (parsed, fb) => {
      const followMap = new Map(
        Array.isArray(parsed.followUps)
          ? parsed.followUps.filter((f) => validIds.has(Number(f?.dealId))).map((f) => [Number(f.dealId), sanitizeTextForPrompt(f.suggestedFollowUp, 220)])
          : []
      );
      return {
        summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 600),
        staleDeals: fb.staleDeals.map((sd) => ({
          ...sd,
          suggestedFollowUp: followMap.get(sd.dealId) || sd.suggestedFollowUp,
        })),
        uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 300),
      };
    },
  });

  await logAiAudit({
    pool,
    user,
    feature: 'crm_stale_deals',
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: staleDeals.map((d) => ({ type: 'deal', id: d.dealId })),
    responseMeta: { staleCount: staleDeals.length },
  });

  return { ...result, totalActiveScanned: dealsQ.rows.length, meta };
}

async function draftCrmEmail({ pool, user, relatedType = 'lead', relatedId = null, recipientName = '', recipientEmail = '', company = '', goal = '', tone = 'consultative' }) {
  const rType = ['lead', 'deal', 'account'].includes(relatedType) ? relatedType : 'lead';
  const rId = relatedId && Number.isFinite(Number(relatedId)) ? Number(relatedId) : null;
  let entityContext = { recipientName, recipientEmail, company };

  if (rId) {
    if (rType === 'lead') {
      const q = await pool.query(`SELECT first_name, last_name, company, email, status, source, description FROM crm_leads WHERE id = $1`, [rId]);
      if (q.rows[0]) entityContext.lead = q.rows[0];
    } else if (rType === 'deal') {
      const q = await pool.query(`SELECT d.title, d.stage, d.value, d.expected_close_date, d.description, c.name AS client_name, c.company FROM crm_deals d LEFT JOIN clients c ON c.id = d.client_id WHERE d.id = $1`, [rId]);
      const quotes = await pool.query(`SELECT quote_number, grand_total, status FROM crm_quotes WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 3`, [rId]);
      if (q.rows[0]) entityContext.deal = q.rows[0];
      entityContext.quotes = quotes.rows;
    } else if (rType === 'account') {
      const q = await pool.query(`SELECT name, company, industry, email FROM clients WHERE id = $1`, [rId]);
      const deals = await pool.query(`SELECT title, stage, value FROM crm_deals WHERE client_id = $1 ORDER BY updated_at DESC LIMIT 3`, [rId]);
      if (q.rows[0]) entityContext.account = q.rows[0];
      entityContext.recentDeals = deals.rows;
    }
  }

  const safeGoal = sanitizeTextForPrompt(goal, 250) || 'Follow up and align on next steps';
  const safeTone = sanitizeTextForPrompt(tone, 30) || 'consultative';
  const displayName = sanitizeTextForPrompt(recipientName || entityContext.lead?.first_name || entityContext.account?.name || 'there', 80);
  const displayCompany = sanitizeTextForPrompt(company || entityContext.lead?.company || entityContext.deal?.company || entityContext.account?.company || 'your team', 100);
  const senderName = user?.name || 'Zorvixe Technologies Team';

  const fallbackBuilder = () => {
    const dealTitle = entityContext.deal?.title;
    const subj = dealTitle
      ? `Following up on ${dealTitle} — ${displayCompany} & Zorvixe Technologies`
      : `Connecting regarding ${displayCompany}'s upcoming priorities — Zorvixe Technologies`;

    const bodyLines = [
      `Hi ${displayName},`,
      ``,
      dealTitle
        ? `I wanted to follow up regarding "${dealTitle}" (${entityContext.deal.stage}) and check on your team's timeline.`
        : `I hope you're doing well. I wanted to reach out regarding ${displayCompany} and explore how Zorvixe Technologies can support your goals (${safeGoal}).`,
      entityContext.quotes?.[0]
        ? `As a quick reference, we have quotation ${entityContext.quotes[0].quote_number} (₹${Number(entityContext.quotes[0].grand_total || 0).toLocaleString('en-IN')}) ready for your review.`
        : `Would you have 15 minutes this week for a brief call so we can confirm scope and next steps?`,
      ``,
      `Best regards,`,
      `${senderName}`,
      `Zorvixe Technologies`,
    ];

    return {
      subject: subj,
      body: bodyLines.join('\n'),
      uncertainty: rId ? 'Draft grounded in CRM record; verify pricing, dates, and recipient details before sending.' : 'No linked CRM record ID provided; review placeholders before sending.',
    };
  };

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Draft a crisp ${safeTone} B2B sales email for Zorvixe Technologies (goal: "${safeGoal}") strictly grounded in the CRM context. This is a draft for human editing and approval — never invent discounts or binding commitments.`,
    schemaHint: `{
  "subject": "clear concise subject line",
  "body": "email body with greeting, clear value/context, CTA, and sign-off as ${senderName}",
  "uncertainty": "note anything user should double-check before clicking Send"
}`,
    untrustedPayload: entityContext,
    fallbackBuilder,
    validator: (parsed, fb) => ({
      subject: sanitizeTextForPrompt(parsed.subject || fb.subject, 200),
      body: String(parsed.body || fb.body).replace(/<script[\s\S]*?<\/script>/gi, '').slice(0, 4000).trim(),
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 300),
    }),
  });

  const auditRow = await logAiAudit({
    pool,
    user,
    feature: 'crm_draft_email',
    entityType: rType,
    entityId: rId,
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: rId ? [{ type: rType, id: rId }] : [],
    requestMeta: { tone: safeTone, goal: safeGoal },
  });

  return { ...result, auditId: auditRow?.id || null, meta };
}

/* ============================================================================
 * 4. HRMS & PAYROLL AI: ATTENDANCE, RESUME VS JOB, LEAVES & PAYROLL AUDIT
 * ============================================================================ */
async function summarizeAttendance({ pool, user, month, year, department = '' }) {
  const admin = isAdminUser(user);
  const m = Number(month) || (new Date().getMonth() + 1);
  const y = Number(year) || new Date().getFullYear();

  let params = [m, y];
  let whereExtra = '';
  if (!admin) {
    params.push(Number(user.sub));
    whereExtra += ` AND a.employee_id = $${params.length}`;
  } else if (department) {
    params.push(department);
    whereExtra += ` AND u.department = $${params.length}`;
  }

  const rowsQ = await pool.query(
    `SELECT a.id, a.employee_id, u.name AS employee_name, u.department, a.date, a.punch_in, a.punch_out, a.total_hours, a.status
     FROM hrms_attendance a
     JOIN admin_users u ON u.id = a.employee_id
     WHERE EXTRACT(MONTH FROM a.date) = $1 AND EXTRACT(YEAR FROM a.date) = $2 ${whereExtra}
     ORDER BY a.date DESC
     LIMIT 350`,
    params
  );

  const records = rowsQ.rows;
  const stats = {
    totalRecords: records.length,
    present: 0,
    late: 0,
    halfDay: 0,
    absent: 0,
    missingPunchOut: 0,
    lowHoursCount: 0,
    highHoursCount: 0,
  };
  const empFlags = new Map();

  for (const r of records) {
    if (r.status === 'present') stats.present++;
    else if (r.status === 'late') stats.late++;
    else if (r.status === 'half_day') stats.halfDay++;
    else if (r.status === 'absent') stats.absent++;

    const missingOut = Boolean(r.punch_in && !r.punch_out && String(r.date).slice(0, 10) !== new Date().toISOString().slice(0, 10));
    const hrs = Number(r.total_hours || 0);
    const lowHrs = Boolean(r.punch_in && r.punch_out && hrs > 0 && hrs < 5);
    const highHrs = Boolean(hrs > 12);

    if (missingOut) stats.missingPunchOut++;
    if (lowHrs) stats.lowHoursCount++;
    if (highHrs) stats.highHoursCount++;

    if (missingOut || r.status === 'late' || r.status === 'absent' || lowHrs || highHrs) {
      const key = Number(r.employee_id);
      if (!empFlags.has(key)) {
        empFlags.set(key, {
          employeeId: key,
          employeeName: r.employee_name,
          department: r.department || 'General',
          lateCount: 0,
          absentCount: 0,
          missingPunchOuts: 0,
          anomalousHours: 0,
        });
      }
      const f = empFlags.get(key);
      if (r.status === 'late') f.lateCount++;
      if (r.status === 'absent') f.absentCount++;
      if (missingOut) f.missingPunchOuts++;
      if (lowHrs || highHrs) f.anomalousHours++;
    }
  }

  const flaggedRecords = [...empFlags.values()]
    .map((f) => {
      const reasons = [];
      if (f.missingPunchOuts > 0) reasons.push(`${f.missingPunchOuts} past day(s) missing punch-out`);
      if (f.lateCount >= 2) reasons.push(`${f.lateCount} late arrivals`);
      if (f.absentCount > 0) reasons.push(`${f.absentCount} absent mark(s)`);
      if (f.anomalousHours > 0) reasons.push(`${f.anomalousHours} log(s) with <5h or >12h hours`);
      return { ...f, needsReview: reasons.length > 0, reasons };
    })
    .filter((f) => f.needsReview)
    .slice(0, 15);

  const fallbackBuilder = () => ({
    summary:
      records.length === 0
        ? `No attendance logs recorded for ${m}/${y}${!admin ? ' for your account' : department ? ` in ${department}` : ''}.`
        : `${admin ? 'Workforce' : 'Your'} attendance for ${m}/${y}: ${records.length} logs (${stats.present} present, ${stats.late} late, ${stats.halfDay} half-day, ${stats.absent} absent; ${stats.missingPunchOut} missing punch-outs).`,
    stats,
    flaggedForReview: flaggedRecords,
    trends: [
      stats.missingPunchOut > 0 ? `${stats.missingPunchOut} historical attendance logs have a punch-in without punch-out and may skew hours.` : 'No missing historical punch-outs detected.',
      stats.late > 0 ? `${stats.late} late arrivals recorded this period.` : 'Zero late marks recorded in queried range.',
    ],
    uncertainty: records.length >= 350 ? 'Evaluated latest 350 attendance records for this filter.' : 'Evaluated all available attendance records for this filter.',
  });

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Summarize ${admin ? 'team' : 'personal'} attendance trends for ${m}/${y} and highlight records needing HR/manager review. Never approve or alter attendance records.`,
    schemaHint: `{
  "summary": "concise attendance summary citing metrics",
  "trends": ["key trend 1", "key trend 2"],
  "uncertainty": "data scope / caveats"
}`,
    untrustedPayload: { month: m, year: y, scope: admin ? 'organization' : 'self', stats, flaggedRecords },
    fallbackBuilder,
    validator: (parsed, fb) => ({
      summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 600),
      stats,
      flaggedForReview: flaggedRecords,
      trends: asArray(parsed.trends, 5).length ? asArray(parsed.trends, 5) : fb.trends,
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 300),
    }),
  });

  await logAiAudit({
    pool,
    user,
    feature: 'hrms_attendance_insights',
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    requestMeta: { month: m, year: y, scope: admin ? 'org' : 'self' },
  });

  return { ...result, meta };
}

async function compareCandidateWithJob({ pool, user, candidateId, extractResumeText }) {
  if (!isAdminUser(user)) {
    throw Object.assign(new Error('Forbidden: Admin access required'), { status: 403 });
  }
  const cid = Number(candidateId);
  if (!Number.isFinite(cid)) throw Object.assign(new Error('Invalid candidate id'), { status: 400 });

  const [candQ, uploadsQ] = await Promise.all([
    pool.query(
      `SELECT c.*, j.title AS job_title, j.department AS job_department, j.experience_required,
              j.description AS job_description, j.requirements AS job_requirements, j.salary_range
       FROM candidates c
       LEFT JOIN hrms_job_openings j ON j.id = c.job_id
       WHERE c.id = $1`,
      [cid]
    ),
    pool.query(`SELECT file_name, file_path, upload_date FROM candidate_uploads WHERE candidate_id = $1 ORDER BY upload_date DESC LIMIT 1`, [cid]),
  ]);

  if (!candQ.rows.length) throw Object.assign(new Error('Candidate not found'), { status: 404 });
  const c = candQ.rows[0];
  let resumeText = '';
  if (uploadsQ.rows[0]?.file_path && typeof extractResumeText === 'function') {
    resumeText = sanitizeTextForPrompt(extractResumeText(uploadsQ.rows[0].file_path, '', uploadsQ.rows[0].file_name), 3200);
  }

  const jobReqsText = `${c.job_title || c.position || ''} ${c.job_requirements || ''} ${c.job_description || ''}`;
  const reqTokens = [...new Set(tokenize(jobReqsText))];
  const candTokens = [...new Set(tokenize(`${c.position || ''} ${c.experience_years || ''} ${c.cover_letter || ''} ${resumeText}`))];

  const matchedSkills = reqTokens.filter((t) => candTokens.includes(t)).slice(0, 12);
  const missingSkills = reqTokens.filter((t) => !candTokens.includes(t)).slice(0, 10);

  const fallbackBuilder = () => {
    const score = reqTokens.length
      ? Math.min(95, Math.max(15, Math.round((matchedSkills.length / Math.min(reqTokens.length, 15)) * 100)))
      : 50;
    return {
      advisoryMatchScore: c.job_requirements || c.job_description ? score : null,
      summary: `${c.name} applied for ${c.job_title || c.position || 'Unspecified Role'} (stage: ${c.stage || 'applied'}, exp: ${c.experience_years || 'not specified'}). ${resumeText ? 'Resume text extracted for requirement comparison.' : 'No readable resume text extracted; comparison relies on profile & cover letter only.'}`,
      matchingStrengths: matchedSkills.length
        ? [`Keyword/requirement overlap detected for: ${matchedSkills.join(', ')}`]
        : ['Unable to verify keyword overlap automatically; manual resume screening needed.'],
      gapsOrUnclear: missingSkills.length
        ? [`Job requirement terms not clearly observed in extracted text: ${missingSkills.slice(0, 6).join(', ')}`]
        : ['No clear gaps identified from available text, verify hands-on depth in interview.'],
      suggestedInterviewQuestions: [
        `Walk through a recent production project relevant to ${c.job_title || c.position || 'this role'} and your exact architectural contribution.`,
        missingSkills.length ? `Assess hands-on depth in: ${missingSkills.slice(0, 3).join(', ')}.` : 'Discuss system debugging, trade-offs, and collaboration scenarios.',
      ],
      uncertainty: !c.job_id
        ? 'Candidate is not linked to a specific job opening record; comparison used only title/position fields.'
        : !resumeText
          ? 'No readable resume file text was extracted (scanned PDF or no upload); review attached resume manually.'
          : 'Advisory decision-support only — hiring, rating, and stage decisions must be made by authorized reviewers.',
    };
  };

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Compare this candidate's extracted resume/application details against the linked job opening requirements. Provide objective strengths, unclear/missing requirements, and interview questions. Explicitly avoid making hiring recommendations or decisions.`,
    schemaHint: `{
  "advisoryMatchScore": 0,
  "summary": "objective 2-3 sentence comparison",
  "matchingStrengths": ["matched point grounded in resume/application"],
  "gapsOrUnclear": ["gap or unverified requirement"],
  "suggestedInterviewQuestions": ["question 1", "question 2"],
  "uncertainty": "gaps in resume extraction or missing job requirements"
}`,
    untrustedPayload: {
      candidate: {
        id: c.id,
        name: c.name,
        position: c.position,
        experience_years: c.experience_years,
        notice_period: c.notice_period,
        expected_salary: c.expected_salary,
        cover_letter: c.cover_letter,
        resume_file_name: uploadsQ.rows[0]?.file_name || null,
      },
      extractedResumeText: resumeText,
      jobOpening: {
        id: c.job_id,
        title: c.job_title,
        department: c.job_department,
        experience_required: c.experience_required,
        requirements: c.job_requirements,
        description: c.job_description,
      },
    },
    fallbackBuilder,
    validator: (parsed, fb) => ({
      advisoryMatchScore: Number.isFinite(Number(parsed.advisoryMatchScore))
        ? Math.max(0, Math.min(100, Math.round(Number(parsed.advisoryMatchScore))))
        : fb.advisoryMatchScore,
      summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 700),
      matchingStrengths: asArray(parsed.matchingStrengths, 6).length ? asArray(parsed.matchingStrengths, 6) : fb.matchingStrengths,
      gapsOrUnclear: asArray(parsed.gapsOrUnclear, 6).length ? asArray(parsed.gapsOrUnclear, 6) : fb.gapsOrUnclear,
      suggestedInterviewQuestions: asArray(parsed.suggestedInterviewQuestions, 5).length ? asArray(parsed.suggestedInterviewQuestions, 5) : fb.suggestedInterviewQuestions,
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 340),
    }),
  });

  await logAiAudit({
    pool,
    user,
    feature: 'hrms_resume_match',
    entityType: 'candidate',
    entityId: cid,
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: [{ type: 'candidate', id: cid }, ...(c.job_id ? [{ type: 'job', id: c.job_id }] : [])],
    responseMeta: { advisoryMatchScore: result.advisoryMatchScore },
  });

  return { ...result, candidateId: cid, meta };
}

async function summarizeLeaves({ pool, user, status = 'pending' }) {
  const admin = isAdminUser(user);
  const userId = Number(user.sub);
  const st = ['pending', 'approved', 'rejected', 'cancelled', 'all'].includes(status) ? status : 'pending';

  let params = [];
  let where = 'WHERE 1=1';
  if (!admin) {
    params.push(userId);
    where += ` AND (l.employee_id = $${params.length} OR l.approver_id = $${params.length})`;
  }
  if (st !== 'all') {
    params.push(st);
    where += ` AND l.status = $${params.length}`;
  }

  const leavesQ = await pool.query(
    `SELECT l.id, l.employee_id, l.approver_id, l.leave_type, l.start_date, l.end_date, l.total_days, l.reason, l.status, l.applied_on,
            emp.name AS employee_name, emp.department AS employee_department,
            appr.name AS approver_name
     FROM leaves l
     JOIN admin_users emp ON emp.id = l.employee_id
     JOIN admin_users appr ON appr.id = l.approver_id
     ${where}
     ORDER BY l.applied_on DESC
     LIMIT 30`,
    params
  );

  const leaves = leavesQ.rows;
  // Detect overlapping dates among fetched requests
  const overlaps = [];
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i];
      const b = leaves[j];
      if (a.employee_id === b.employee_id) continue;
      if (new Date(a.start_date) <= new Date(b.end_date) && new Date(b.start_date) <= new Date(a.end_date)) {
        overlaps.push(`${a.employee_name} (${String(a.start_date).slice(0, 10)}) & ${b.employee_name} (${String(b.start_date).slice(0, 10)}) overlap.`);
      }
    }
  }

  const fallbackBuilder = () => {
    const totalDays = leaves.reduce((s, l) => s + Number(l.total_days || 0), 0);
    const awaitingMyApproval = leaves.filter((l) => Number(l.approver_id) === userId && l.status === 'pending').length;
    return {
      summary: leaves.length
        ? `${leaves.length} leave request(s) (${st}) totaling ${totalDays} day(s) visible in your scope. ${awaitingMyApproval} pending your review/approval.`
        : `No ${st === 'all' ? '' : st + ' '}leave requests found in your authorized scope.`,
      highlights: leaves.slice(0, 5).map((l) => `#${l.id} ${l.employee_name}: ${l.leave_type} (${l.total_days}d, ${String(l.start_date).slice(0, 10)} to ${String(l.end_date).slice(0, 10)}) — ${l.status}`),
      coverageAlerts: overlaps.slice(0, 5),
      uncertainty: 'Advisory overview only. Leave approvals/rejections require explicit human action in Leave Approval or Admin tabs.',
    };
  };

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Summarize the authorized leave requests, highlight long or overlapping leaves, and identify pending approvals needing human review. Never recommend auto-approving without human check.`,
    schemaHint: `{
  "summary": "concise leave queue summary",
  "highlights": ["item referencing request ID and dates"],
  "coverageAlerts": ["overlap alert if any"],
  "uncertainty": "caveats"
}`,
    untrustedPayload: { leaves, detectedOverlaps: overlaps.slice(0, 10) },
    fallbackBuilder,
    validator: (parsed, fb) => ({
      summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 600),
      highlights: asArray(parsed.highlights, 6).length ? asArray(parsed.highlights, 6) : fb.highlights,
      coverageAlerts: asArray(parsed.coverageAlerts, 5).length ? asArray(parsed.coverageAlerts, 5) : fb.coverageAlerts,
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 300),
    }),
  });

  await logAiAudit({
    pool,
    user,
    feature: 'hrms_leave_summary',
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    requestMeta: { statusFilter: st, count: leaves.length },
  });

  return { ...result, count: leaves.length, meta };
}

async function auditPayroll({ pool, user, month, year }) {
  if (!isAdminUser(user)) {
    throw Object.assign(new Error('Forbidden: Payroll audit requires Admin role'), { status: 403 });
  }
  const m = Number(month) || (new Date().getMonth() + 1);
  const y = Number(year) || new Date().getFullYear();

  const [payrollsQ, attQ, leavesQ] = await Promise.all([
    pool.query(
      `SELECT p.*, u.name AS employee_name, u.department,
              ss.id AS structure_id, ss.basic_monthly AS struct_basic, ss.hra_monthly AS struct_hra,
              ss.special_allowance_monthly AS struct_special, ss.conveyance_monthly AS struct_conveyance,
              ss.medical_allowance_monthly AS struct_medical,
              ss.pf_employee_monthly AS struct_pf, ss.esi_employee_monthly AS struct_esi,
              ss.professional_tax_monthly AS struct_pt, ss.tds_monthly AS struct_tds
       FROM hrms_payrolls p
       JOIN admin_users u ON u.id = p.user_id
       LEFT JOIN hrms_salary_structures ss ON ss.user_id = p.user_id
       WHERE p.month = $1 AND p.year = $2
       ORDER BY u.name ASC`,
      [m, y]
    ),
    pool.query(
      `SELECT employee_id,
              COUNT(*) FILTER (WHERE status = 'absent')::int AS absent_days,
              COUNT(*) FILTER (WHERE status = 'half_day')::int AS half_days
       FROM hrms_attendance
       WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
       GROUP BY employee_id`,
      [m, y]
    ),
    pool.query(
      `SELECT employee_id, COALESCE(SUM(total_days), 0)::int AS approved_leave_days
       FROM leaves
       WHERE status = 'approved'
         AND ((EXTRACT(MONTH FROM start_date) = $1 AND EXTRACT(YEAR FROM start_date) = $2)
           OR (EXTRACT(MONTH FROM end_date) = $1 AND EXTRACT(YEAR FROM end_date) = $2))
       GROUP BY employee_id`,
      [m, y]
    ),
  ]);

  const attMap = new Map(attQ.rows.map((r) => [Number(r.employee_id), r]));
  const leaveMap = new Map(leavesQ.rows.map((r) => [Number(r.employee_id), r]));

  const discrepancies = [];
  for (const p of payrollsQ.rows) {
    const uid = Number(p.user_id);
    const att = attMap.get(uid) || { absent_days: 0, half_days: 0 };
    const lv = leaveMap.get(uid) || { approved_leave_days: 0 };
    const flags = [];

    const workingDays = Number(p.working_days || 0);
    const paidDays = Number(p.paid_days || 0);
    const unpaidDays = Number(p.unpaid_days || 0);
    const expectedAttUnpaid = Number(att.absent_days || 0) + Number(att.half_days || 0) * 0.5;

    if (Math.abs(paidDays + unpaidDays - workingDays) > 0.1) {
      flags.push(`Paid (${paidDays}) + Unpaid (${unpaidDays}) != Working Days (${workingDays}).`);
    }
    if (Math.abs(unpaidDays - expectedAttUnpaid) > 0.1) {
      flags.push(`Payroll unpaid days (${unpaidDays}) differs from attendance absences/half-days (${expectedAttUnpaid}).`);
    }

    const baseComponentsSum = Number(p.basic_pay) + Number(p.hra) + Number(p.special_allowance) + Number(p.conveyance) + Number(p.medical);
    const perDay = workingDays > 0 ? baseComponentsSum / workingDays : 0;
    const expectedGross = Number((baseComponentsSum - perDay * unpaidDays + Number(p.bonus || 0)).toFixed(2));
    const grossDiff = Number((Number(p.gross_earnings) - expectedGross).toFixed(2));

    if (Math.abs(grossDiff) > 5) {
      flags.push(`Gross earnings (₹${p.gross_earnings}) differs by ₹${grossDiff} from prorated components + bonus (₹${expectedGross}).`);
    }

    const expectedNet = Math.max(0, Number((Number(p.gross_earnings) - Number(p.total_deductions)).toFixed(2)));
    if (Math.abs(Number(p.net_salary) - expectedNet) > 2) {
      flags.push(`Net salary (₹${p.net_salary}) does not equal Gross minus Deductions (₹${expectedNet}).`);
    }

    if (lv.approved_leave_days > 0 && unpaidDays > 0) {
      flags.push(`Employee has ${lv.approved_leave_days} approved leave day(s) in period alongside ${unpaidDays} unpaid absence day(s) — verify leave-to-attendance sync.`);
    }

    if (!p.structure_id) {
      flags.push('No custom Salary Structure configured; payroll used default fallback rates.');
    }

    if (flags.length > 0) {
      discrepancies.push({
        payrollId: Number(p.id),
        employeeId: uid,
        employeeName: p.employee_name,
        department: p.department || 'General',
        status: p.status,
        severity: Math.abs(grossDiff) > 5 || Math.abs(Number(p.net_salary) - expectedNet) > 2 ? 'high' : 'medium',
        flags,
      });
    }
  }

  const fallbackBuilder = () => ({
    summary:
      payrollsQ.rows.length === 0
        ? `No payroll records generated yet for ${m}/${y}.`
        : `Audited ${payrollsQ.rows.length} payroll record(s) for ${m}/${y}: found ${discrepancies.length} record(s) with potential discrepancies requiring human review.`,
    discrepancies,
    uncertainty: 'Checks arithmetic consistency against Salary Structures, Attendance punches, and Approved Leaves. Never modifies payroll figures automatically.',
  });

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Explain potential payroll discrepancies found for ${m}/${y} cleanly in plain English for HR/Finance review. Do NOT invent new numbers or approve payouts.`,
    schemaHint: `{
  "summary": "overall payroll audit summary",
  "explanations": [{ "payrollId": 1, "explanation": "plain-English action check" }],
  "uncertainty": "caveats"
}`,
    untrustedPayload: { month: m, year: y, auditedCount: payrollsQ.rows.length, discrepancies: discrepancies.slice(0, 20) },
    fallbackBuilder,
    validator: (parsed, fb) => {
      const expMap = new Map(
        Array.isArray(parsed.explanations)
          ? parsed.explanations.map((e) => [Number(e?.payrollId), sanitizeTextForPrompt(e?.explanation, 280)])
          : []
      );
      return {
        summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 600),
        discrepancies: fb.discrepancies.map((d) => ({
          ...d,
          aiExplanation: expMap.get(d.payrollId) || d.flags.join(' '),
        })),
        uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 300),
      };
    },
  });

  await logAiAudit({
    pool,
    user,
    feature: 'hrms_payroll_audit',
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: discrepancies.map((d) => ({ type: 'payroll', id: d.payrollId })),
    requestMeta: { month: m, year: y },
    responseMeta: { discrepanciesCount: discrepancies.length },
  });

  return { ...result, auditedCount: payrollsQ.rows.length, meta };
}

/* ============================================================================
 * 5. CLIENTS, PROJECTS & CONTACTS AI
 * ============================================================================ */
async function summarizeClient({ pool, user, clientId }) {
  const id = Number(clientId);
  if (!Number.isFinite(id)) throw Object.assign(new Error('Invalid client id'), { status: 400 });
  const admin = isAdminUser(user);
  const userId = Number(user.sub);

  const clientQ = await pool.query(`SELECT id, name, company, email, phone, industry, city, country, created_at FROM clients WHERE id = $1`, [id]);
  if (!clientQ.rows.length) throw Object.assign(new Error('Client not found'), { status: 404 });

  if (!admin) {
    const memberCheck = await pool.query(
      `SELECT 1 FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE p.client_id = $1 AND pm.user_id = $2 LIMIT 1`,
      [id, userId]
    );
    if (!memberCheck.rows.length) {
      throw Object.assign(new Error('Forbidden: You are not assigned to any project for this client'), { status: 403 });
    }
  }

  const projectsQ = admin
    ? await pool.query(`SELECT id, name, code, status, type, description, updated_at, created_at FROM projects WHERE client_id = $1 ORDER BY updated_at DESC`, [id])
    : await pool.query(
        `SELECT p.id, p.name, p.code, p.status, p.type, p.description, p.updated_at, p.created_at
         FROM projects p JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
         WHERE p.client_id = $1 ORDER BY p.updated_at DESC`,
        [id, userId]
      );

  const projectIds = projectsQ.rows.map((p) => p.id);
  const [commentsQ, dealsQ, activitiesQ] = await Promise.all([
    projectIds.length
      ? pool.query(
          `SELECT pc.project_id, pc.comment_text, pc.created_at, u.name AS author_name, p.name AS project_name
           FROM project_comments pc
           JOIN admin_users u ON u.id = pc.user_id
           JOIN projects p ON p.id = pc.project_id
           WHERE pc.project_id = ANY($1::bigint[])
           ORDER BY pc.created_at DESC LIMIT 20`,
          [projectIds]
        )
      : Promise.resolve({ rows: [] }),
    pool.query(`SELECT id, title, stage, value, expected_close_date, updated_at FROM crm_deals WHERE client_id = $1 ORDER BY updated_at DESC LIMIT 10`, [id]),
    pool.query(`SELECT id, type, title, completed, due_date FROM crm_activities WHERE client_id = $1 ORDER BY created_at DESC LIMIT 12`, [id]),
  ]);

  const now = new Date();
  const openProjects = projectsQ.rows.filter((p) => p.status !== 'completed');
  const stalledProjects = openProjects.filter((p) => hoursBetween(p.updated_at || p.created_at, now) > 24 * 14);
  const overdueActivities = activitiesQ.rows.filter((a) => !a.completed && a.due_date && new Date(a.due_date) < now);

  const fallbackBuilder = () => ({
    summary: `${clientQ.rows[0].company || clientQ.rows[0].name} has ${projectsQ.rows.length} accessible project(s) (${openProjects.length} active, ${stalledProjects.length} idle >14 days) and ${commentsQ.rows.length} recent project discussion comment(s).`,
    openIssuesAndRisks: [
      ...stalledProjects.map((p) => `Project ${p.code} ("${p.name}", status: ${p.status}) has not been updated in over 14 days.`),
      ...overdueActivities.map((a) => `Overdue CRM activity: "${a.title}" (due ${String(a.due_date).slice(0, 10)}).`),
    ],
    followUpActions: [
      openProjects.length ? `Confirm milestone progress on ${openProjects[0].name} (${openProjects[0].code}).` : 'Review potential follow-on project or support retainer.',
      commentsQ.rows[0] ? `Review latest comment from ${commentsQ.rows[0].author_name} on ${commentsQ.rows[0].project_name}.` : 'Post a status update in project comments.',
    ],
    uncertainty: admin ? 'Grounded in client projects, comments, CRM deals, and activities.' : 'Scoped strictly to projects where you are a project member.',
  });

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Summarize client history, open/stalled work, and extracted follow-up actions.`,
    schemaHint: `{
  "summary": "concise client summary",
  "openIssuesAndRisks": ["open issue or stalled project"],
  "followUpActions": ["actionable next step"],
  "uncertainty": "scope or missing data notes"
}`,
    untrustedPayload: {
      client: clientQ.rows[0],
      projects: projectsQ.rows,
      recentComments: commentsQ.rows,
      deals: dealsQ.rows,
      activities: activitiesQ.rows,
    },
    fallbackBuilder,
    validator: (parsed, fb) => ({
      summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 700),
      openIssuesAndRisks: asArray(parsed.openIssuesAndRisks, 6).length ? asArray(parsed.openIssuesAndRisks, 6) : fb.openIssuesAndRisks,
      followUpActions: asArray(parsed.followUpActions, 5).length ? asArray(parsed.followUpActions, 5) : fb.followUpActions,
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 300),
    }),
  });

  await logAiAudit({
    pool,
    user,
    feature: 'client_project_summary',
    entityType: 'client',
    entityId: id,
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: [{ type: 'client', id }],
  });

  return { ...result, clientId: id, meta };
}

async function summarizeProject({ pool, user, projectId }) {
  const id = Number(projectId);
  if (!Number.isFinite(id)) throw Object.assign(new Error('Invalid project id'), { status: 400 });
  const admin = isAdminUser(user);
  const userId = Number(user.sub);

  const projQ = await pool.query(
    `SELECT p.*, c.name AS client_name, c.company AS client_company
     FROM projects p LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.id = $1`,
    [id]
  );
  if (!projQ.rows.length) throw Object.assign(new Error('Project not found'), { status: 404 });

  if (!admin) {
    const memberCheck = await pool.query(`SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2 LIMIT 1`, [id, userId]);
    if (!memberCheck.rows.length) throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  const [commentsQ, membersQ] = await Promise.all([
    pool.query(
      `SELECT pc.id, pc.comment_text, pc.created_at, u.name AS author_name
       FROM project_comments pc JOIN admin_users u ON u.id = pc.user_id
       WHERE pc.project_id = $1 ORDER BY pc.created_at DESC LIMIT 25`,
      [id]
    ),
    pool.query(
      `SELECT u.name, pm.can_edit FROM project_members pm JOIN admin_users u ON u.id = pm.user_id WHERE pm.project_id = $1`,
      [id]
    ),
  ]);

  const p = projQ.rows[0];
  const idleDays = Math.round(hoursBetween(p.updated_at || p.created_at) / 24);
  const issueHints = commentsQ.rows
    .filter((c) => /blocker|delay|issue|pending|bug|fix|need|todo|follow/i.test(c.comment_text || ''))
    .slice(0, 4)
    .map((c) => `${c.author_name}: "${sanitizeTextForPrompt(c.comment_text, 120)}"`);

  const fallbackBuilder = () => ({
    summary: `Project ${p.code} ("${p.name}", ${p.type}) for ${p.client_company || p.client_name} is "${p.status}", assigned to ${membersQ.rows.length} member(s), with ${commentsQ.rows.length} discussion comments (last touched ${idleDays}d ago).`,
    openIssues: [
      ...(p.status !== 'completed' && idleDays >= 14 ? [`No updates in ${idleDays} days while status is "${p.status}".`] : []),
      ...issueHints,
    ],
    followUpActions: [
      commentsQ.rows[0] ? `Follow up on recent comment by ${commentsQ.rows[0].author_name}.` : 'Log initial sprint/milestone checkpoint in project comments.',
      membersQ.rows.length === 0 ? 'Assign project team members so tasks have clear ownership.' : 'Verify next delivery milestone with assigned members.',
    ],
    uncertainty: !commentsQ.rows.length ? 'No comment history on this project yet.' : 'Derived from project metadata and up to 25 recent comments.',
  });

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Summarize project ${p.code}, highlight open issues/blockers/stalled work, and extract concrete follow-up actions.`,
    schemaHint: `{
  "summary": "2-3 sentence summary",
  "openIssues": ["issue or blocker"],
  "followUpActions": ["follow-up action"],
  "uncertainty": "caveats"
}`,
    untrustedPayload: { project: p, members: membersQ.rows, comments: commentsQ.rows },
    fallbackBuilder,
    validator: (parsed, fb) => ({
      summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 700),
      openIssues: asArray(parsed.openIssues, 6).length ? asArray(parsed.openIssues, 6) : fb.openIssues,
      followUpActions: asArray(parsed.followUpActions, 5).length ? asArray(parsed.followUpActions, 5) : fb.followUpActions,
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 300),
    }),
  });

  await logAiAudit({
    pool,
    user,
    feature: 'client_project_summary',
    entityType: 'project',
    entityId: id,
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: [{ type: 'project', id }],
  });

  return { ...result, projectId: id, meta };
}

async function assistContact({ pool, user, contactId }) {
  const id = Number(contactId);
  if (!Number.isFinite(id)) throw Object.assign(new Error('Invalid contact id'), { status: 400 });

  const contactQ = await pool.query(`SELECT * FROM contacts WHERE id = $1`, [id]);
  if (!contactQ.rows.length) throw Object.assign(new Error('Contact not found'), { status: 404 });
  const c = contactQ.rows[0];

  const [leadsQ, dealsQ] = await Promise.all([
    pool.query(`SELECT id, status, lead_score, is_converted FROM crm_leads WHERE LOWER(email) = LOWER($1) LIMIT 3`, [c.email || '']),
    pool.query(`SELECT id, title, stage, value FROM crm_deals WHERE contact_id = $1 LIMIT 5`, [id]),
  ]);

  const ageHours = hoursBetween(c.created_at);
  const fallbackBuilder = () => ({
    summary: `Inquiry #${c.id} from ${c.name} (${c.email}) regarding "${c.subject}". Status: ${c.status}, age: ${ageHours}h. Linked CRM deals: ${dealsQ.rows.length}.`,
    urgency: c.status === 'new' && ageHours >= 24 ? 'high' : /urgent|quote|project|immediate|asap/i.test(`${c.subject} ${c.message}`) ? 'high' : 'normal',
    followUpActions: [
      c.status === 'new' ? 'Acknowledge inquiry promptly and mark status as viewed/responded.' : 'Confirm next call or proposal delivery.',
      dealsQ.rows.length === 0 ? 'Consider converting to a CRM Deal if commercial scope is confirmed.' : `Review linked Deal #${dealsQ.rows[0].id}.`,
    ],
    draftReply: `Hi ${c.name},\n\nThank you for contacting Zorvixe Technologies regarding "${c.subject}".\n\nWe have reviewed your inquiry and would love to connect briefly to understand your timeline and requirements. Would you be available for a 15-minute introductory call this week?\n\nBest regards,\n${user?.name || 'Zorvixe Technologies Team'}`,
    uncertainty: 'Draft response is for review only — Zorvixe does not auto-send contact replies.',
  });

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Summarize this website contact inquiry, extract concrete follow-up actions, and prepare an editable draft reply.`,
    schemaHint: `{
  "summary": "concise inquiry summary",
  "urgency": "high | normal | low",
  "followUpActions": ["action 1", "action 2"],
  "draftReply": "plain text reply draft",
  "uncertainty": "caveats"
}`,
    untrustedPayload: { contact: c, matchingLeads: leadsQ.rows, linkedDeals: dealsQ.rows },
    fallbackBuilder,
    validator: (parsed, fb) => ({
      summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 600),
      urgency: ['high', 'normal', 'low'].includes(String(parsed.urgency || '').toLowerCase()) ? String(parsed.urgency).toLowerCase() : fb.urgency,
      followUpActions: asArray(parsed.followUpActions, 4).length ? asArray(parsed.followUpActions, 4) : fb.followUpActions,
      draftReply: String(parsed.draftReply || fb.draftReply).slice(0, 2500).trim(),
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 300),
    }),
  });

  await logAiAudit({
    pool,
    user,
    feature: 'contact_followup',
    entityType: 'contact',
    entityId: id,
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    groundingRefs: [{ type: 'contact', id }],
  });

  return { ...result, contactId: id, meta };
}

/* ============================================================================
 * 6. DASHBOARD DIGEST & NOTIFICATIONS SUMMARY (STRICTLY ROLE-SCOPED)
 * ============================================================================ */
async function generateDashboardDigest({ pool, user }) {
  const admin = isAdminUser(user);
  const userId = Number(user.sub);

  const [
    openTicketsQ,
    staleDealsQ,
    newContactsQ,
    myPendingLeavesQ,
    accessibleProjectsQ,
  ] = await Promise.all([
    pool.query(
      `SELECT id, title, priority, status, assigned_to, created_at, updated_at
       FROM tickets WHERE status IN ('open','in_progress') ORDER BY created_at ASC LIMIT 30`
    ),
    pool.query(
      `SELECT id, title, stage, value, expected_close_date, updated_at
       FROM crm_deals WHERE stage NOT IN ('won','lost') ORDER BY updated_at ASC LIMIT 20`
    ),
    pool.query(`SELECT id, name, subject, created_at FROM contacts WHERE status = 'new' ORDER BY created_at DESC LIMIT 15`),
    pool.query(
      `SELECT l.id, l.leave_type, l.total_days, u.name AS employee_name
       FROM leaves l JOIN admin_users u ON u.id = l.employee_id
       WHERE l.approver_id = $1 AND l.status = 'pending' LIMIT 10`,
      [userId]
    ),
    admin
      ? pool.query(`SELECT id, name, code, status, updated_at FROM projects WHERE status <> 'completed' ORDER BY updated_at ASC LIMIT 20`)
      : pool.query(
          `SELECT p.id, p.name, p.code, p.status, p.updated_at
           FROM projects p JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
           WHERE p.status <> 'completed' ORDER BY p.updated_at ASC LIMIT 20`,
          [userId]
        ),
  ]);

  let adminQueues = null;
  if (admin) {
    const [pendingPaymentsQ, pendingCandidatesQ, allLeavesQ, dueComplianceQ] = await Promise.all([
      pool.query(`SELECT id, client_name, project_name, amount, due_date FROM payment_registrations WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10`),
      pool.query(`SELECT id, name, position, stage FROM candidates WHERE stage IN ('applied','screening') ORDER BY created_at DESC LIMIT 10`),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM leaves WHERE status = 'pending'`),
      pool.query(`SELECT id, title, due_date, status FROM hrms_compliance_records WHERE status <> 'compliant' OR due_date <= CURRENT_DATE + INTERVAL '7 days' LIMIT 10`),
    ]);
    adminQueues = {
      pendingPayments: pendingPaymentsQ.rows,
      candidatesNeedingScreening: pendingCandidatesQ.rows,
      totalPendingLeaves: allLeavesQ.rows[0]?.cnt || 0,
      upcomingCompliance: dueComplianceQ.rows,
    };
  }

  const slaRisks = openTicketsQ.rows
    .map((t) => ({ ...t, sla: computeTicketSlaRisk(t) }))
    .filter((t) => t.sla.level === 'breached' || t.sla.level === 'high');
  const unassignedTickets = openTicketsQ.rows.filter((t) => !t.assigned_to);
  const idleDeals = staleDealsQ.rows.filter((d) => hoursBetween(d.updated_at) >= 7 * 24);
  const stalledProjects = accessibleProjectsQ.rows.filter((p) => hoursBetween(p.updated_at) >= 14 * 24);

  const emergingRisks = [];
  if (slaRisks.length) emergingRisks.push({ severity: 'high', title: `${slaRisks.length} ticket(s) approaching or breaching SLA`, url: `/tickets/${slaRisks[0].id}` });
  if (unassignedTickets.length) emergingRisks.push({ severity: 'medium', title: `${unassignedTickets.length} active ticket(s) have no owner assigned`, url: '/tickets' });
  if (idleDeals.length) emergingRisks.push({ severity: 'medium', title: `${idleDeals.length} open CRM deal(s) untouched for 7+ days`, url: '/deals' });
  if (newContactsQ.rows.length) emergingRisks.push({ severity: 'medium', title: `${newContactsQ.rows.length} new website contact inquiry(ies) awaiting response`, url: '/contacts' });
  if (myPendingLeavesQ.rows.length) emergingRisks.push({ severity: 'medium', title: `${myPendingLeavesQ.rows.length} leave request(s) awaiting your approval`, url: '/leaves' });
  if (stalledProjects.length) emergingRisks.push({ severity: 'low', title: `${stalledProjects.length} active project(s) with no update in 14+ days`, url: `/projects/${stalledProjects[0].id}` });
  if (adminQueues?.pendingPayments.length) {
    emergingRisks.push({ severity: 'high', title: `${adminQueues.pendingPayments.length} pending payment verification(s)`, url: '/payments' });
  }
  if (adminQueues?.upcomingCompliance.length) {
    emergingRisks.push({ severity: 'high', title: `${adminQueues.upcomingCompliance.length} statutory compliance deadline(s) due or non-compliant`, url: '/recruitment' });
  }

  const fallbackBuilder = () => ({
    headline: `${admin ? 'Executive' : 'Daily'} Operational Digest — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    digestSummary: `Active queue shows ${openTicketsQ.rows.length} open/in-progress tickets (${slaRisks.length} high/breached SLA), ${idleDeals.length} stale CRM deals, ${newContactsQ.rows.length} unresponded inquiries, and ${stalledProjects.length} stalled accessible projects.${admin && adminQueues ? ` Admin review queues: ${adminQueues.pendingPayments.length} pending payments, ${adminQueues.totalPendingLeaves} pending leave requests, and ${adminQueues.candidatesNeedingScreening.length} candidates awaiting screening.` : ''}`,
    emergingRisks,
    recommendedFocus: emergingRisks.slice(0, 4).map((r) => r.title),
    uncertainty: admin ? 'Synthesized from live database snapshots across permitted admin modules.' : 'Filtered strictly to modules and projects authorized for your role.',
  });

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Write a crisp executive daily digest and highlight top emerging risks strictly from the provided authorized counts/records.`,
    schemaHint: `{
  "headline": "concise title",
  "digestSummary": "2-4 sentence daily operational summary",
  "recommendedFocus": ["top priority 1", "top priority 2"],
  "uncertainty": "caveats"
}`,
    untrustedPayload: {
      role: user?.role,
      openTicketsCount: openTicketsQ.rows.length,
      slaRiskCount: slaRisks.length,
      unassignedTicketsCount: unassignedTickets.length,
      idleDealsCount: idleDeals.length,
      newContactsCount: newContactsQ.rows.length,
      stalledProjectsCount: stalledProjects.length,
      leavesAwaitingMyApproval: myPendingLeavesQ.rows.length,
      ...(adminQueues ? { adminQueues } : {}),
    },
    fallbackBuilder,
    validator: (parsed, fb) => ({
      headline: sanitizeTextForPrompt(parsed.headline || fb.headline, 140),
      digestSummary: sanitizeTextForPrompt(parsed.digestSummary || fb.digestSummary, 900),
      emergingRisks,
      recommendedFocus: asArray(parsed.recommendedFocus, 5).length ? asArray(parsed.recommendedFocus, 5) : fb.recommendedFocus,
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 300),
    }),
  });

  await logAiAudit({
    pool,
    user,
    feature: 'dashboard_digest',
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    responseMeta: { riskCount: emergingRisks.length },
  });

  return { ...result, meta };
}

async function summarizeNotifications({ pool, user, activities = [] }) {
  const admin = isAdminUser(user);
  const userId = Number(user.sub);

  let feed = Array.isArray(activities) && activities.length ? activities.slice(0, 25) : null;
  if (!feed) {
    const [ticketsQ, projectsQ] = await Promise.all([
      pool.query(`SELECT id, title, priority, status, created_at FROM tickets ORDER BY created_at DESC LIMIT 10`),
      admin
        ? pool.query(`SELECT id, name, code, status, created_at FROM projects ORDER BY created_at DESC LIMIT 8`)
        : pool.query(
            `SELECT p.id, p.name, p.code, p.status, p.created_at
             FROM projects p JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
             ORDER BY p.created_at DESC LIMIT 8`,
            [userId]
          ),
    ]);
    feed = [
      ...ticketsQ.rows.map((t) => ({ type: 'ticket', at: t.created_at, text: `Ticket #${t.id}: ${t.title} (${t.priority}, ${t.status})` })),
      ...projectsQ.rows.map((p) => ({ type: 'project', at: p.created_at, text: `Project ${p.code}: ${p.name} (${p.status})` })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));
  }

  // Strictly enforce non-admin filter even if client passes raw activities
  const safeFeed = feed
    .filter((f) => admin || !['candidate', 'upload', 'payment'].includes(f?.type))
    .slice(0, 25)
    .map((f) => ({
      type: sanitizeTextForPrompt(f.type, 30),
      at: f.at,
      text: sanitizeTextForPrompt(f.text, 200),
      is_new: Boolean(f.is_new),
    }));

  const urgentItems = safeFeed.filter((f) => /urgent|high|fail|breach|overdue/i.test(f.text) || f.is_new).slice(0, 6);

  const fallbackBuilder = () => ({
    summary: safeFeed.length
      ? `Summarized ${safeFeed.length} recent activity notifications (${safeFeed.filter((f) => f.is_new).length} unread). ${urgentItems.length} item(s) flagged for priority review.`
      : 'No recent notifications available to summarize.',
    priorityAlerts: urgentItems.map((u) => `[${u.type}] ${u.text}`),
    groupedHighlights: [
      `Tickets & Comments: ${safeFeed.filter((f) => String(f.type).includes('ticket')).length} event(s)`,
      `Projects: ${safeFeed.filter((f) => String(f.type).includes('project')).length} event(s)`,
    ],
    uncertainty: 'Derived from latest visible activity stream events.',
  });

  const { result, meta } = await runStructuredAiTask({
    pool,
    taskInstruction: `Summarize these notifications cleanly, surfacing urgent or unread items first.`,
    schemaHint: `{
  "summary": "2-3 sentence summary",
  "priorityAlerts": ["most important alert"],
  "groupedHighlights": ["grouped count/summary"],
  "uncertainty": "caveats"
}`,
    untrustedPayload: { notifications: safeFeed },
    fallbackBuilder,
    validator: (parsed, fb) => ({
      summary: sanitizeTextForPrompt(parsed.summary || fb.summary, 600),
      priorityAlerts: asArray(parsed.priorityAlerts, 5).length ? asArray(parsed.priorityAlerts, 5) : fb.priorityAlerts,
      groupedHighlights: asArray(parsed.groupedHighlights, 5).length ? asArray(parsed.groupedHighlights, 5) : fb.groupedHighlights,
      uncertainty: sanitizeTextForPrompt(parsed.uncertainty || fb.uncertainty, 250),
    }),
  });

  await logAiAudit({
    pool,
    user,
    feature: 'notifications_summary',
    provider: meta.provider,
    model: meta.model,
    actionStatus: 'suggested',
    requestMeta: { feedCount: safeFeed.length },
  });

  return { ...result, meta };
}

module.exports = {
  runAssistantChat,
  analyzeTicket,
  draftTicketReply,
  recommendTicketAssignments,
  summarizeCrmEntity,
  findStaleDeals,
  draftCrmEmail,
  summarizeAttendance,
  compareCandidateWithJob,
  summarizeLeaves,
  auditPayroll,
  summarizeClient,
  summarizeProject,
  assistContact,
  generateDashboardDigest,
  summarizeNotifications,
};
