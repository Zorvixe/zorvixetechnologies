/**
 * Zorvixe Technologies — Zorvi Copilot Platform Tool Registry
 *
 * Every tool executes parameterized queries scoped strictly to the signed-in user's
 * permissions and records actions in ai_audit_logs.
 *
 * Safety tiers:
 * - read: safe read/search/summarize
 * - routine_write: executes immediately once required fields & permissions pass
 * - confirm_required: returns pendingConfirmation card; never executes without explicit POST /confirm
 */

const { sanitizeTextForPrompt, logAiAudit } = require('./aiService');
const aiWorkflows = require('./aiWorkflows');

const isAdminUser = (user) => String(user?.role || '').toLowerCase() === 'admin';

function buildRecordUrl(type, id) {
  switch (type) {
    case 'ticket': return `/tickets/${id}`;
    case 'project': return `/projects/${id}`;
    case 'client': return '/clients';
    case 'deal': return '/deals';
    case 'lead': return '/leads';
    case 'account': return '/accounts';
    case 'activity': return '/activities';
    case 'contact': return '/contacts';
    case 'candidate': return '/recruitment';
    case 'job': return '/recruitment';
    case 'leave': return '/leaves';
    case 'payment': return '/payments';
    case 'payroll': return '/payroll';
    case 'attendance': return '/attendance';
    case 'employee': return '/employees';
    default: return '/stats';
  }
}

async function resolveTeamMember(pool, assigneeIdOrName) {
  if (!assigneeIdOrName && assigneeIdOrName !== 0) return { status: 'none', member: null, matches: [] };
  const raw = String(assigneeIdOrName).trim().replace(/^['"@#(\[]+|['").,!?;:\]]+$/g, '').trim();
  if (!raw) return { status: 'none', member: null, matches: [] };
  if (/^\d+$/.test(raw)) {
    const q = await pool.query(
      `SELECT id, name, email, role, department, position, presence_status FROM admin_users WHERE id = $1 AND is_active = TRUE`,
      [Number(raw)]
    );
    if (!q.rows.length) return { status: 'not_found', member: null, matches: [] };
    return { status: 'found', member: q.rows[0], matches: q.rows };
  }

  const term = `%${raw.toLowerCase()}%`;
  const q = await pool.query(
    `SELECT id, name, email, username, role, department, position, presence_status
     FROM admin_users
     WHERE is_active = TRUE
       AND (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1 OR LOWER(COALESCE(username, '')) LIKE $1)
     ORDER BY CASE WHEN LOWER(name) = $2 THEN 0 ELSE 1 END, name ASC
     LIMIT 8`,
    [term, raw.toLowerCase()]
  );

  if (q.rows.length === 0) return { status: 'not_found', member: null, matches: [] };
  // Prefer exact first-name / full-name match if multiple fuzzy hits exist
  const exact = q.rows.filter(
    (u) =>
      u.name.toLowerCase() === raw.toLowerCase() ||
      u.name.toLowerCase().split(/\s+/)[0] === raw.toLowerCase() ||
      (u.username || '').toLowerCase() === raw.toLowerCase()
  );
  if (exact.length === 1) return { status: 'found', member: exact[0], matches: exact };
  if (q.rows.length === 1) return { status: 'found', member: q.rows[0], matches: q.rows };
  return { status: 'ambiguous', member: null, matches: exact.length > 1 ? exact : q.rows };
}

function getToolDefinitionsForPrompt(user) {
  const admin = isAdminUser(user);
  return [
    {
      name: 'find_team_members',
      safety: 'read',
      description: 'Search active team members by name/email/department to resolve assignees or check availability.',
      args: '{ "query": "optional name" }',
    },
    {
      name: 'search_tickets',
      safety: 'read',
      description: 'Search tickets by status (open|in_progress|resolved|closed), priority (low|medium|high|urgent), assigneeName, unassignedOnly, or text search.',
      args: '{ "status": "optional", "priority": "optional", "assigneeName": "optional", "unassignedOnly": false, "search": "optional", "limit": 10 }',
    },
    {
      name: 'get_ticket_details',
      safety: 'read',
      description: 'Get full details, comments, SLA risk, and duplicate hints for a specific ticket ID.',
      args: '{ "ticketId": 123 }',
    },
    {
      name: 'create_ticket',
      safety: 'routine_write',
      description: 'Create a new support/work ticket and optionally assign it to a team member. Needs title and description (if missing, ask the user first!).',
      args: '{ "title": "string", "description": "string", "priority": "low|medium|high|urgent", "assigneeIdOrName": "optional name or numeric id" }',
    },
    {
      name: 'update_ticket',
      safety: 'routine_write',
      description: 'Update an existing ticket status, priority, title, description, or assignee.',
      args: '{ "ticketId": 123, "status": "optional", "priority": "optional", "assigneeIdOrName": "optional", "title": "optional", "description": "optional" }',
    },
    {
      name: 'comment_ticket',
      safety: 'routine_write',
      description: 'Post a comment update on an existing ticket and notify creator/assignee.',
      args: '{ "ticketId": 123, "commentText": "string" }',
    },
    ...(admin
      ? [
          {
            name: 'search_applications',
            safety: 'read',
            description: 'Admin-only: Find job applications/candidates by role/job title, stage (applied|screening|interview|offer|hired|rejected), status, sinceDays, or keyword.',
            args: '{ "role": "optional", "stage": "optional", "sinceDays": 7, "search": "optional", "limit": 15 }',
          },
          {
            name: 'compare_applicant_to_job',
            safety: 'read',
            description: 'Admin-only: Extract job-related resume experience, compare candidate to stated job requirements transparently, and draft interview questions.',
            args: '{ "candidateId": 123 }',
          },
          {
            name: 'update_application_stage',
            safety: 'mixed',
            description: 'Admin-only: Move candidate to screening/interview immediately, OR propose human confirmation for offer/hired/rejected outcomes.',
            args: '{ "candidateId": 123, "stage": "applied|screening|interview|offer|hired|rejected", "interviewNotes": "optional", "rating": 4 }',
          },
          {
            name: 'draft_applicant_email',
            safety: 'confirm_required',
            description: 'Admin-only: Draft an email to a job applicant and prepare confirmation before sending.',
            args: '{ "candidateId": 123, "purpose": "interview_invite|follow_up|status_update", "customNote": "optional" }',
          },
          {
            name: 'search_payments',
            safety: 'read',
            description: 'Admin-only: Search payment registrations by status (pending|verified|rejected) or client/project name.',
            args: '{ "status": "optional", "search": "optional" }',
          },
          {
            name: 'create_client',
            safety: 'routine_write',
            description: 'Admin-only: Create a new client record (requires name, email, 10-digit phone or phone string).',
            args: '{ "name": "string", "email": "string", "phone": "string", "company": "optional" }',
          },
          {
            name: 'create_project',
            safety: 'routine_write',
            description: 'Admin-only: Create a new project under an existing client (requires clientIdOrName, name, type: web_development|digital_marketing|data_analytics|other).',
            args: '{ "clientIdOrName": "client name or id", "name": "string", "type": "web_development|digital_marketing|data_analytics|other", "description": "optional" }',
          },
        ]
      : []),
    {
      name: 'search_crm',
      safety: 'read',
      description: 'Search CRM leads, accounts (clients), deals, or quotes; set staleOnly=true to find idle/overdue open deals.',
      args: '{ "entityType": "leads|deals|accounts|quotes", "query": "optional", "stage": "optional", "staleOnly": false }',
    },
    {
      name: 'summarize_crm_record',
      safety: 'read',
      description: 'Summarize a CRM lead, deal, or account with activities, health status, and next steps.',
      args: '{ "entityType": "lead|deal|account", "entityId": 123 }',
    },
    {
      name: 'create_crm_lead',
      safety: 'routine_write',
      description: 'Create a new CRM lead (requires firstName).',
      args: '{ "firstName": "string", "lastName": "optional", "company": "optional", "email": "optional", "phone": "optional", "source": "optional", "description": "optional" }',
    },
    {
      name: 'create_crm_deal',
      safety: 'routine_write',
      description: 'Create a new CRM deal in pipeline (requires title).',
      args: '{ "title": "string", "clientNameOrId": "optional", "value": 0, "stage": "lead|contacted|proposal|negotiation", "description": "optional" }',
    },
    {
      name: 'log_crm_activity',
      safety: 'routine_write',
      description: 'Log a follow-up call, meeting, task, or note in CRM activities.',
      args: '{ "dealId": 123, "clientId": 45, "type": "call|meeting|task|note", "title": "string", "description": "optional", "dueDate": "optional ISO string" }',
    },
    {
      name: 'update_crm_deal_stage',
      safety: 'routine_write',
      description: 'Move a CRM deal to another stage.',
      args: '{ "dealId": 123, "stage": "lead|contacted|proposal|negotiation|won|lost", "lossReason": "optional" }',
    },
    {
      name: 'send_external_email',
      safety: 'confirm_required',
      description: 'Draft and prepare an external email to a client/lead/contact for human confirmation before sending.',
      args: '{ "to": "email", "toName": "optional", "subject": "string", "body": "string", "relatedType": "lead|deal|account|contact", "relatedId": 123 }',
    },
    {
      name: 'search_clients_and_projects',
      safety: 'read',
      description: 'Search clients and projects (scoped to member projects for non-admins); highlight overdue/stalled projects.',
      args: '{ "query": "optional", "overdueOnly": false }',
    },
    {
      name: 'summarize_client_or_project',
      safety: 'read',
      description: 'Summarize a client or project history, open issues, and follow-up actions.',
      args: '{ "entityType": "client|project", "entityId": 123 }',
    },
    {
      name: 'update_project',
      safety: 'routine_write',
      description: 'Update an authorized project status/name/description.',
      args: '{ "projectId": 123, "status": "new|InProgress|completed|OnHold|cancelled", "name": "optional", "description": "optional" }',
    },
    {
      name: 'comment_project',
      safety: 'routine_write',
      description: 'Add a discussion comment to an accessible project.',
      args: '{ "projectId": 123, "commentText": "string" }',
    },
    {
      name: 'query_hrms',
      safety: 'read',
      description: 'Query HRMS data within user permissions: topic = employees | attendance | leaves | payroll_audit (admin-only).',
      args: '{ "topic": "employees|attendance|leaves|payroll_audit", "search": "optional", "status": "optional", "month": 11, "year": 2026 }',
    },
    {
      name: 'review_leave_decision',
      safety: 'confirm_required',
      description: 'Prepare confirmation card to approve or reject a leave request (never executes automatically).',
      args: '{ "leaveId": 123, "status": "approved|rejected", "comments": "optional" }',
    },
    {
      name: 'search_contacts',
      safety: 'read',
      description: 'Search website contact inquiries by status (new|viewed|responded|closed) or keyword.',
      args: '{ "status": "optional", "search": "optional" }',
    },
    {
      name: 'update_contact_status',
      safety: 'routine_write',
      description: 'Update status of a contact inquiry.',
      args: '{ "contactId": 123, "status": "new|viewed|responded|closed" }',
    },
    {
      name: 'get_notifications_and_digest',
      safety: 'read',
      description: 'Get role-scoped daily operational digest, emerging risks, and notification highlights.',
      args: '{}',
    },
    {
      name: 'delete_record',
      safety: 'confirm_required',
      description: 'Prepare confirmation card before deleting a ticket, lead, deal, or contact (requires authorization).',
      args: '{ "entityType": "ticket|lead|deal|contact", "entityId": 123 }',
    },
  ];
}

async function executeTool({ pool, user, name, args = {}, deps = {}, confirmed = false }) {
  const admin = isAdminUser(user);
  const userId = Number(user?.sub);

  switch (name) {
    case 'find_team_members': {
      const qText = sanitizeTextForPrompt(args.query || '', 80).toLowerCase();
      const params = [];
      let where = 'WHERE is_active = TRUE';
      if (qText) {
        params.push(`%${qText}%`);
        where += ` AND (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1 OR LOWER(COALESCE(department,'')) LIKE $1 OR LOWER(COALESCE(position,'')) LIKE $1)`;
      }
      const res = await pool.query(
        `SELECT id, name, email, role, department, position, presence_status FROM admin_users ${where} ORDER BY name ASC LIMIT 20`,
        params
      );
      return { ok: true, members: res.rows, refs: [] };
    }

    case 'search_tickets': {
      const where = [];
      const params = [];
      if (args.status && args.status !== 'all') {
        params.push(String(args.status).toLowerCase());
        where.push(`t.status = $${params.length}`);
      }
      if (args.priority && args.priority !== 'all') {
        params.push(String(args.priority).toLowerCase());
        where.push(`t.priority = $${params.length}`);
      }
      if (args.unassignedOnly) {
        where.push(`t.assigned_to IS NULL`);
      }
      if (args.assigneeName) {
        params.push(`%${String(args.assigneeName).toLowerCase()}%`);
        where.push(`LOWER(COALESCE(a.name,'')) LIKE $${params.length}`);
      }
      if (args.search) {
        params.push(`%${String(args.search).toLowerCase()}%`);
        where.push(`(LOWER(t.title) LIKE $${params.length} OR LOWER(COALESCE(t.description,'')) LIKE $${params.length})`);
      }
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 12));
      params.push(limit);
      const q = await pool.query(
        `SELECT t.id, t.title, t.status, t.priority, t.created_at, t.updated_at,
                c.name AS creator_name, a.id AS assignee_id, a.name AS assignee_name
         FROM tickets t
         LEFT JOIN admin_users c ON c.id = t.created_by
         LEFT JOIN admin_users a ON a.id = t.assigned_to
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY CASE WHEN t.status IN ('open','in_progress') THEN 0 ELSE 1 END, t.updated_at DESC
         LIMIT $${params.length}`,
        params
      );
      return {
        ok: true,
        tickets: q.rows,
        refs: q.rows.slice(0, 6).map((t) => ({ type: 'ticket', id: t.id, label: `Ticket #${t.id}: ${t.title}`, url: buildRecordUrl('ticket', t.id) })),
      };
    }

    case 'get_ticket_details': {
      const tid = Number(args.ticketId);
      if (!Number.isFinite(tid)) return { ok: false, error: 'Valid numeric ticketId is required.' };
      try {
        const data = await aiWorkflows.analyzeTicket({ pool, user, ticketId: tid });
        return {
          ok: true,
          analysis: data,
          refs: [{ type: 'ticket', id: tid, label: `Ticket #${tid}`, url: buildRecordUrl('ticket', tid) }],
        };
      } catch (err) {
        return { ok: false, error: err?.message || `Ticket #${tid} not found.` };
      }
    }

    case 'create_ticket': {
      const title = sanitizeTextForPrompt(args.title || '', 190);
      const description = sanitizeTextForPrompt(args.description || '', 2000);
      const priority = ['low', 'medium', 'high', 'urgent'].includes(String(args.priority || '').toLowerCase())
        ? String(args.priority).toLowerCase()
        : null;

      if (!title || title.length < 3 || !description || description.length < 3) {
        return {
          ok: false,
          needsClarification: true,
          missingFields: [!title ? 'title' : null, !description ? 'description' : null].filter(Boolean),
          partialArgs: args,
          clarificationQuestion: !title
            ? 'What should the ticket title be?'
            : 'Please share a brief description (steps, client context, or details) for this ticket, and let me know the priority (low/medium/high/urgent).',
        };
      }

      let assignedId = null;
      let assignedMember = null;
      if (args.assigneeIdOrName) {
        const res = await resolveTeamMember(pool, args.assigneeIdOrName);
        if (res.status === 'not_found') {
          const team = await pool.query(`SELECT id, name FROM admin_users WHERE is_active = TRUE ORDER BY name ASC LIMIT 12`);
          return {
            ok: false,
            needsClarification: true,
            missingFields: ['assignee'],
            partialArgs: args,
            clarificationQuestion: `I couldn't find an active team member matching "${args.assigneeIdOrName}". Available members: ${team.rows.map((u) => u.name).join(', ')}. Who should I assign this ticket to (or leave unassigned)?`,
          };
        }
        if (res.status === 'ambiguous') {
          return {
            ok: false,
            needsClarification: true,
            missingFields: ['assignee'],
            partialArgs: args,
            clarificationQuestion: `Multiple team members matched "${args.assigneeIdOrName}": ${res.matches.map((m) => `${m.name} (${m.email})`).join(', ')}. Which person should I assign it to?`,
          };
        }
        assignedMember = res.member;
        assignedId = Number(res.member.id);
      }

      const finalPriority = priority || 'medium';
      const ins = await pool.query(
        `INSERT INTO tickets (title, description, priority, created_by, assigned_to)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [title, description, finalPriority, userId, assignedId]
      );
      const created = ins.rows[0];

      if (assignedMember?.email && typeof deps.sendTicketAssignedEmail === 'function') {
        deps.sendTicketAssignedEmail({
          to: assignedMember.email,
          assigneeName: assignedMember.name,
          ticketId: created.id,
          title: created.title,
          description: created.description,
          priority: created.priority,
          createdByName: user?.name || user?.email,
          createdByEmail: user?.email,
        }).catch(() => {});
      }

      await logAiAudit({
        pool,
        user,
        feature: 'copilot_create_ticket',
        entityType: 'ticket',
        entityId: created.id,
        provider: 'copilot_tool',
        model: 'create_ticket',
        actionStatus: 'executed',
        groundingRefs: [{ type: 'ticket', id: created.id }],
        responseMeta: { priority: finalPriority, assignedTo: assignedId },
      });

      const ref = {
        type: 'ticket',
        id: created.id,
        label: `Ticket #${created.id}: ${created.title}`,
        url: buildRecordUrl('ticket', created.id),
      };
      return {
        ok: true,
        executedAction: {
          type: 'created',
          entity: 'ticket',
          id: created.id,
          label: ref.label,
          url: ref.url,
          summary: `Created Ticket #${created.id} (${finalPriority})${assignedMember ? `, assigned to ${assignedMember.name}` : ', unassigned'}.`,
        },
        ticket: { ...created, assignee_name: assignedMember?.name || null },
        refs: [ref],
      };
    }

    case 'update_ticket': {
      const tid = Number(args.ticketId);
      if (!Number.isFinite(tid)) return { ok: false, error: 'Valid numeric ticketId is required.' };
      const existingQ = await pool.query(`SELECT * FROM tickets WHERE id = $1`, [tid]);
      if (!existingQ.rows.length) return { ok: false, error: `Ticket #${tid} not found.` };
      const existing = existingQ.rows[0];
      const canFullEdit = admin || Number(existing.created_by) === userId;

      if (!canFullEdit && (args.title || args.description || args.priority || args.assigneeIdOrName !== undefined)) {
        return { ok: false, error: `Permission denied: Only Admins or Ticket #${tid}'s creator can modify priority, title, or assignment (you can still update status).` };
      }

      const sets = [];
      const params = [];
      if (args.status && ['open', 'in_progress', 'resolved', 'closed'].includes(String(args.status).toLowerCase())) {
        params.push(String(args.status).toLowerCase());
        sets.push(`status = $${params.length}`);
      }
      if (canFullEdit && args.priority && ['low', 'medium', 'high', 'urgent'].includes(String(args.priority).toLowerCase())) {
        params.push(String(args.priority).toLowerCase());
        sets.push(`priority = $${params.length}`);
      }
      if (canFullEdit && args.title) {
        params.push(sanitizeTextForPrompt(args.title, 190));
        sets.push(`title = $${params.length}`);
      }
      if (canFullEdit && args.description) {
        params.push(sanitizeTextForPrompt(args.description, 2000));
        sets.push(`description = $${params.length}`);
      }

      let assignedMember = null;
      if (canFullEdit && args.assigneeIdOrName) {
        const res = await resolveTeamMember(pool, args.assigneeIdOrName);
        if (res.status !== 'found') {
          return {
            ok: false,
            needsClarification: true,
            missingFields: ['assignee'],
            partialArgs: args,
            clarificationQuestion:
              res.status === 'ambiguous'
                ? `Multiple team members matched "${args.assigneeIdOrName}": ${res.matches.map((m) => m.name).join(', ')}. Which one?`
                : `No active user matched "${args.assigneeIdOrName}".`,
          };
        }
        assignedMember = res.member;
        params.push(Number(assignedMember.id));
        sets.push(`assigned_to = $${params.length}`);
      }

      if (!sets.length) return { ok: false, error: 'No valid ticket changes supplied.' };
      params.push(userId);
      sets.push(`last_edited_by = $${params.length}`);
      sets.push(`updated_at = NOW()`);
      params.push(tid);

      const updQ = await pool.query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
      const updated = updQ.rows[0];

      if (assignedMember?.email && Number(existing.assigned_to) !== Number(assignedMember.id) && typeof deps.sendTicketAssignedEmail === 'function') {
        deps.sendTicketAssignedEmail({
          to: assignedMember.email,
          assigneeName: assignedMember.name,
          ticketId: updated.id,
          title: updated.title,
          description: updated.description,
          priority: updated.priority,
          createdByName: user?.name || user?.email,
          createdByEmail: user?.email,
        }).catch(() => {});
      }

      await logAiAudit({
        pool,
        user,
        feature: 'copilot_update_ticket',
        entityType: 'ticket',
        entityId: tid,
        provider: 'copilot_tool',
        model: 'update_ticket',
        actionStatus: 'executed',
        groundingRefs: [{ type: 'ticket', id: tid }],
      });

      const ref = { type: 'ticket', id: tid, label: `Ticket #${tid}: ${updated.title}`, url: buildRecordUrl('ticket', tid) };
      return {
        ok: true,
        executedAction: {
          type: 'updated',
          entity: 'ticket',
          id: tid,
          label: ref.label,
          url: ref.url,
          summary: `Updated Ticket #${tid} (status: ${updated.status}, priority: ${updated.priority}${assignedMember ? `, assigned to ${assignedMember.name}` : ''}).`,
        },
        ticket: updated,
        refs: [ref],
      };
    }

    case 'comment_ticket': {
      const tid = Number(args.ticketId);
      const commentText = sanitizeTextForPrompt(args.commentText || '', 1500);
      if (!Number.isFinite(tid) || !commentText) return { ok: false, error: 'ticketId and commentText are required.' };

      const tq = await pool.query(
        `SELECT t.id, t.title, t.created_by, t.assigned_to, c.name AS creator_name, c.email AS creator_email, a.name AS assignee_name, a.email AS assignee_email
         FROM tickets t LEFT JOIN admin_users c ON c.id = t.created_by LEFT JOIN admin_users a ON a.id = t.assigned_to WHERE t.id = $1`,
        [tid]
      );
      if (!tq.rows.length) return { ok: false, error: `Ticket #${tid} not found.` };
      await pool.query(`INSERT INTO ticket_comments (ticket_id, user_id, comment_text) VALUES ($1, $2, $3)`, [tid, userId, commentText]);
      await pool.query(`UPDATE tickets SET updated_at = NOW() WHERE id = $1`, [tid]);

      const t = tq.rows[0];
      if (typeof deps.sendTicketCommentEmail === 'function') {
        if (t.assigned_to && Number(t.assigned_to) !== userId && t.assignee_email) {
          deps.sendTicketCommentEmail({ to: t.assignee_email, recipientName: t.assignee_name, ticketId: t.id, title: t.title, commenterName: user?.name || user?.email, commentText }).catch(() => {});
        }
        if (t.created_by && Number(t.created_by) !== userId && Number(t.created_by) !== Number(t.assigned_to) && t.creator_email) {
          deps.sendTicketCommentEmail({ to: t.creator_email, recipientName: t.creator_name, ticketId: t.id, title: t.title, commenterName: user?.name || user?.email, commentText }).catch(() => {});
        }
      }

      await logAiAudit({ pool, user, feature: 'copilot_comment_ticket', entityType: 'ticket', entityId: tid, provider: 'copilot_tool', model: 'comment_ticket', actionStatus: 'executed' });
      const ref = { type: 'ticket', id: tid, label: `Ticket #${tid}: ${t.title}`, url: buildRecordUrl('ticket', tid) };
      return {
        ok: true,
        executedAction: { type: 'commented', entity: 'ticket', id: tid, label: ref.label, url: ref.url, summary: `Added comment to Ticket #${tid}.` },
        refs: [ref],
      };
    }

    case 'search_applications': {
      if (!admin) return { ok: false, error: 'Permission denied: Candidate pipeline data requires Admin role.' };
      const where = [];
      const params = [];
      if (args.stage) {
        params.push(String(args.stage).toLowerCase());
        where.push(`LOWER(COALESCE(c.stage,'applied')) = $${params.length}`);
      }
      if (args.role) {
        params.push(`%${String(args.role).toLowerCase()}%`);
        where.push(`(LOWER(COALESCE(j.title,'')) LIKE $${params.length} OR LOWER(COALESCE(c.position,'')) LIKE $${params.length})`);
      }
      if (args.sinceDays && Number(args.sinceDays) > 0) {
        params.push(Number(args.sinceDays));
        where.push(`c.created_at >= NOW() - ($${params.length} || ' days')::interval`);
      }
      if (args.search) {
        params.push(`%${String(args.search).toLowerCase()}%`);
        where.push(`(LOWER(c.name) LIKE $${params.length} OR LOWER(c.email) LIKE $${params.length} OR LOWER(COALESCE(c.position,'')) LIKE $${params.length})`);
      }
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 12));
      params.push(limit);

      const q = await pool.query(
        `SELECT c.id, c.name, c.email, c.position, c.stage, c.status, c.experience_years, c.notice_period, c.rating, c.created_at,
                j.id AS job_id, j.title AS job_title, j.department AS job_department
         FROM candidates c
         LEFT JOIN hrms_job_openings j ON j.id = c.job_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY c.created_at DESC
         LIMIT $${params.length}`,
        params
      );
      return {
        ok: true,
        candidates: q.rows,
        refs: q.rows.slice(0, 6).map((c) => ({ type: 'candidate', id: c.id, label: `Candidate #${c.id}: ${c.name} (${c.stage || 'applied'})`, url: buildRecordUrl('candidate', c.id) })),
      };
    }

    case 'compare_applicant_to_job': {
      if (!admin) return { ok: false, error: 'Permission denied: Candidate evaluation requires Admin role.' };
      const cid = Number(args.candidateId);
      if (!Number.isFinite(cid)) return { ok: false, error: 'Valid candidateId is required.' };
      const res = await aiWorkflows.compareCandidateWithJob({ pool, user, candidateId: cid, extractResumeText: deps.extractResumeText });
      return {
        ok: true,
        comparison: res,
        refs: [{ type: 'candidate', id: cid, label: `Candidate #${cid}`, url: buildRecordUrl('candidate', cid) }],
      };
    }

    case 'update_application_stage': {
      if (!admin) return { ok: false, error: 'Permission denied: Updating candidate stages requires Admin role.' };
      const cid = Number(args.candidateId);
      const nextStage = String(args.stage || '').toLowerCase();
      const validStages = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
      if (!Number.isFinite(cid) || !validStages.includes(nextStage)) {
        return { ok: false, error: 'Valid candidateId and stage (applied|screening|interview|offer|hired|rejected) required.' };
      }
      const cq = await pool.query(`SELECT id, name, email, stage, position FROM candidates WHERE id = $1`, [cid]);
      if (!cq.rows.length) return { ok: false, error: `Candidate #${cid} not found.` };
      const cand = cq.rows[0];

      // High-risk hiring outcomes require human confirmation
      if (['offer', 'hired', 'rejected'].includes(nextStage) && !confirmed) {
        return {
          ok: true,
          requiresConfirmation: true,
          pendingConfirmation: {
            tool: 'update_application_stage',
            title: `Confirm Candidate Stage Change → "${nextStage.toUpperCase()}"`,
            summary: `Move ${cand.name} (#${cid}, currently "${cand.stage}") to "${nextStage}". Final hiring, offer, and rejection outcomes require human confirmation.`,
            args: { candidateId: cid, stage: nextStage, interviewNotes: args.interviewNotes || null, rating: args.rating || null },
          },
          refs: [{ type: 'candidate', id: cid, label: `Candidate #${cid}: ${cand.name}`, url: buildRecordUrl('candidate', cid) }],
        };
      }

      const statusVal = nextStage === 'hired' ? 'approved' : nextStage === 'rejected' ? 'rejected' : undefined;
      await pool.query(
        `UPDATE candidates
         SET stage = $1,
             status = COALESCE($2, status),
             interview_notes = COALESCE($3, interview_notes),
             rating = COALESCE($4, rating)
         WHERE id = $5`,
        [nextStage, statusVal || null, args.interviewNotes ? sanitizeTextForPrompt(args.interviewNotes, 1000) : null, args.rating ? Number(args.rating) : null, cid]
      );

      await logAiAudit({
        pool, user, feature: 'copilot_update_candidate_stage', entityType: 'candidate', entityId: cid,
        provider: 'copilot_tool', model: 'update_application_stage', actionStatus: confirmed ? 'confirmed' : 'executed',
        responseMeta: { stage: nextStage },
      });

      const ref = { type: 'candidate', id: cid, label: `Candidate #${cid}: ${cand.name} → ${nextStage}`, url: buildRecordUrl('candidate', cid) };
      return {
        ok: true,
        executedAction: { type: 'updated', entity: 'candidate', id: cid, label: ref.label, url: ref.url, summary: `Moved ${cand.name} (#${cid}) to stage "${nextStage}".` },
        refs: [ref],
      };
    }

    case 'draft_applicant_email': {
      if (!admin) return { ok: false, error: 'Permission denied: Applicant email requires Admin role.' };
      const cid = Number(args.candidateId);
      if (!Number.isFinite(cid)) return { ok: false, error: 'Valid candidateId required.' };
      const cq = await pool.query(
        `SELECT c.*, j.title AS job_title FROM candidates c LEFT JOIN hrms_job_openings j ON j.id = c.job_id WHERE c.id = $1`,
        [cid]
      );
      if (!cq.rows.length) return { ok: false, error: `Candidate #${cid} not found.` };
      const cand = cq.rows[0];
      const purpose = sanitizeTextForPrompt(args.purpose || 'interview_invite', 40);
      const roleTitle = cand.job_title || cand.position || 'the role at Zorvixe Technologies';

      const subject =
        purpose === 'interview_invite'
          ? `Interview Invitation — ${roleTitle} | Zorvixe Technologies`
          : `Application Update — ${roleTitle} | Zorvixe Technologies`;
      const body = [
        `Hi ${cand.name},`,
        ``,
        purpose === 'interview_invite'
          ? `Thank you for applying for ${roleTitle} at Zorvixe Technologies. We reviewed your profile and would like to invite you to an interview discussion.`
          : `Thank you for your interest in ${roleTitle} at Zorvixe Technologies. We wanted to share an update regarding your application (current stage: ${cand.stage || 'applied'}).`,
        args.customNote ? `\n${sanitizeTextForPrompt(args.customNote, 400)}` : `Please share your availability for a 30-minute call this week.`,
        ``,
        `Best regards,`,
        `${user?.name || 'Zorvixe Hiring Team'}`,
        `Zorvixe Technologies`,
      ].join('\n');

      return {
        ok: true,
        requiresConfirmation: true,
        pendingConfirmation: {
          tool: 'send_external_email',
          title: `Confirm Applicant Email to ${cand.name}`,
          summary: `To: ${cand.email}\nSubject: ${subject}\n\n${body}`,
          args: { to: cand.email, toName: cand.name, subject, body, relatedType: 'candidate', relatedId: cid },
        },
        refs: [{ type: 'candidate', id: cid, label: `Candidate #${cid}: ${cand.name}`, url: buildRecordUrl('candidate', cid) }],
      };
    }

    case 'search_crm': {
      const entityType = String(args.entityType || 'deals').toLowerCase();
      if (args.staleOnly) {
        const res = await aiWorkflows.findStaleDeals({ pool, user });
        return {
          ok: true,
          staleDeals: res.staleDeals,
          summary: res.summary,
          refs: (res.staleDeals || []).slice(0, 6).map((d) => ({ type: 'deal', id: d.dealId, label: `DEAL-${d.dealId}: ${d.title}`, url: buildRecordUrl('deal', d.dealId) })),
        };
      }
      const qTerm = args.query ? `%${String(args.query).toLowerCase()}%` : null;
      if (entityType === 'leads') {
        const params = [];
        const where = qTerm ? (params.push(qTerm), `WHERE LOWER(first_name || ' ' || COALESCE(last_name,'') || ' ' || COALESCE(company,'')) LIKE $1`) : '';
        const q = await pool.query(`SELECT id, first_name, last_name, company, email, status, lead_score, is_converted FROM crm_leads ${where} ORDER BY created_at DESC LIMIT 12`, params);
        return { ok: true, leads: q.rows, refs: q.rows.slice(0, 5).map((l) => ({ type: 'lead', id: l.id, label: `Lead #${l.id}: ${l.first_name} ${l.last_name || ''}`.trim(), url: buildRecordUrl('lead', l.id) })) };
      }
      if (entityType === 'accounts') {
        const params = [];
        const where = qTerm ? (params.push(qTerm), `WHERE LOWER(name || ' ' || COALESCE(company,'') || ' ' || COALESCE(industry,'')) LIKE $1`) : '';
        const q = await pool.query(`SELECT id, name, company, email, phone, industry FROM clients ${where} ORDER BY created_at DESC LIMIT 12`, params);
        return { ok: true, accounts: q.rows, refs: q.rows.slice(0, 5).map((a) => ({ type: 'account', id: a.id, label: `Account #${a.id}: ${a.company || a.name}`, url: buildRecordUrl('account', a.id) })) };
      }
      if (entityType === 'quotes') {
        const params = [];
        const where = qTerm ? (params.push(qTerm), `WHERE LOWER(subject || ' ' || quote_number) LIKE $1`) : '';
        const q = await pool.query(`SELECT id, quote_number, subject, status, grand_total, valid_until FROM crm_quotes ${where} ORDER BY created_at DESC LIMIT 12`, params);
        return { ok: true, quotes: q.rows, refs: [] };
      }
      const params = [];
      const where = [];
      if (qTerm) {
        params.push(qTerm);
        where.push(`LOWER(d.title || ' ' || COALESCE(c.name,'') || ' ' || COALESCE(c.company,'')) LIKE $${params.length}`);
      }
      if (args.stage) {
        params.push(String(args.stage).toLowerCase());
        where.push(`d.stage = $${params.length}`);
      }
      const q = await pool.query(
        `SELECT d.id, d.title, d.stage, d.value, d.probability, d.expected_close_date, c.name AS client_name
         FROM crm_deals d LEFT JOIN clients c ON c.id = d.client_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY d.updated_at DESC LIMIT 12`,
        params
      );
      return { ok: true, deals: q.rows, refs: q.rows.slice(0, 5).map((d) => ({ type: 'deal', id: d.id, label: `DEAL-${d.id}: ${d.title} (${d.stage})`, url: buildRecordUrl('deal', d.id) })) };
    }

    case 'summarize_crm_record': {
      const data = await aiWorkflows.summarizeCrmEntity({ pool, user, entityType: args.entityType, entityId: args.entityId });
      return { ok: true, ...data, refs: data.groundingRecords || [] };
    }

    case 'create_crm_lead': {
      const firstName = sanitizeTextForPrompt(args.firstName || '', 90);
      if (!firstName) {
        return {
          ok: false,
          needsClarification: true,
          missingFields: ['firstName'],
          partialArgs: args,
          clarificationQuestion: 'Please provide at least the lead’s first name (plus company/email if available).',
        };
      }
      const ins = await pool.query(
        `INSERT INTO crm_leads (first_name, last_name, company, email, phone, source, status, lead_score, assigned_to, description)
         VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9) RETURNING *`,
        [
          firstName,
          args.lastName ? sanitizeTextForPrompt(args.lastName, 90) : null,
          args.company ? sanitizeTextForPrompt(args.company, 140) : null,
          args.email ? sanitizeTextForPrompt(args.email, 160) : null,
          args.phone ? sanitizeTextForPrompt(args.phone, 40) : null,
          args.source ? sanitizeTextForPrompt(args.source, 40) : 'Zorvi Copilot',
          Number(args.leadScore) || 50,
          userId,
          args.description ? sanitizeTextForPrompt(args.description, 1000) : null,
        ]
      );
      const lead = ins.rows[0];
      await logAiAudit({ pool, user, feature: 'copilot_create_lead', entityType: 'lead', entityId: lead.id, provider: 'copilot_tool', model: 'create_crm_lead', actionStatus: 'executed' });
      const ref = { type: 'lead', id: lead.id, label: `Lead #${lead.id}: ${lead.first_name} ${lead.last_name || ''}`.trim(), url: buildRecordUrl('lead', lead.id) };
      return { ok: true, executedAction: { type: 'created', entity: 'lead', id: lead.id, label: ref.label, url: ref.url, summary: `Created ${ref.label}.` }, refs: [ref] };
    }

    case 'create_crm_deal': {
      const title = sanitizeTextForPrompt(args.title || '', 140);
      if (!title) {
        return { ok: false, needsClarification: true, missingFields: ['title'], partialArgs: args, clarificationQuestion: 'What should the CRM deal title be?' };
      }
      let clientId = null;
      if (args.clientNameOrId) {
        if (/^\d+$/.test(String(args.clientNameOrId))) {
          clientId = Number(args.clientNameOrId);
        } else {
          const cq = await pool.query(`SELECT id FROM clients WHERE LOWER(name) LIKE $1 OR LOWER(COALESCE(company,'')) LIKE $1 LIMIT 1`, [`%${String(args.clientNameOrId).toLowerCase()}%`]);
          if (cq.rows[0]) clientId = cq.rows[0].id;
        }
      }
      const stage = ['lead', 'contacted', 'proposal', 'negotiation'].includes(String(args.stage || '').toLowerCase()) ? String(args.stage).toLowerCase() : 'lead';
      const ins = await pool.query(
        `INSERT INTO crm_deals (title, client_id, value, stage, probability, assigned_to, description)
         VALUES ($1, $2, $3, $4, 50, $5, $6) RETURNING *`,
        [title, clientId, Number(args.value) || 0, stage, userId, args.description ? sanitizeTextForPrompt(args.description, 1000) : null]
      );
      const deal = ins.rows[0];
      await logAiAudit({ pool, user, feature: 'copilot_create_deal', entityType: 'deal', entityId: deal.id, provider: 'copilot_tool', model: 'create_crm_deal', actionStatus: 'executed' });
      const ref = { type: 'deal', id: deal.id, label: `DEAL-${deal.id}: ${deal.title}`, url: buildRecordUrl('deal', deal.id) };
      return { ok: true, executedAction: { type: 'created', entity: 'deal', id: deal.id, label: ref.label, url: ref.url, summary: `Created ${ref.label} in stage "${stage}".` }, refs: [ref] };
    }

    case 'log_crm_activity': {
      const title = sanitizeTextForPrompt(args.title || '', 190);
      if (!title) return { ok: false, error: 'Activity title is required.' };
      const type = ['call', 'meeting', 'task', 'note'].includes(String(args.type || '').toLowerCase()) ? String(args.type).toLowerCase() : 'task';
      const ins = await pool.query(
        `INSERT INTO crm_activities (deal_id, client_id, user_id, type, title, description, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [args.dealId ? Number(args.dealId) : null, args.clientId ? Number(args.clientId) : null, userId, type, title, args.description ? sanitizeTextForPrompt(args.description, 1000) : null, args.dueDate || null]
      );
      const act = ins.rows[0];
      await logAiAudit({ pool, user, feature: 'copilot_log_activity', entityType: 'activity', entityId: act.id, provider: 'copilot_tool', model: 'log_crm_activity', actionStatus: 'executed' });
      const ref = { type: 'activity', id: act.id, label: `CRM Activity #${act.id}: ${act.title}`, url: buildRecordUrl('activity', act.id) };
      return { ok: true, executedAction: { type: 'created', entity: 'activity', id: act.id, label: ref.label, url: ref.url, summary: `Logged CRM ${type}: "${act.title}".` }, refs: [ref] };
    }

    case 'update_crm_deal_stage': {
      const did = Number(args.dealId);
      const stage = String(args.stage || '').toLowerCase();
      if (!Number.isFinite(did) || !['lead', 'contacted', 'proposal', 'negotiation', 'won', 'lost'].includes(stage)) {
        return { ok: false, error: 'Valid dealId and stage required.' };
      }
      const probMap = { lead: 20, contacted: 40, proposal: 60, negotiation: 80, won: 100, lost: 0 };
      const upd = await pool.query(
        `UPDATE crm_deals SET stage = $1, probability = $2, loss_reason = CASE WHEN $1='lost' THEN $3 ELSE loss_reason END, updated_at = NOW() WHERE id = $4 RETURNING *`,
        [stage, probMap[stage], args.lossReason || null, did]
      );
      if (!upd.rows.length) return { ok: false, error: `Deal #${did} not found.` };
      await logAiAudit({ pool, user, feature: 'copilot_update_deal_stage', entityType: 'deal', entityId: did, provider: 'copilot_tool', model: 'update_crm_deal_stage', actionStatus: 'executed' });
      const ref = { type: 'deal', id: did, label: `DEAL-${did}: ${upd.rows[0].title}`, url: buildRecordUrl('deal', did) };
      return { ok: true, executedAction: { type: 'updated', entity: 'deal', id: did, label: ref.label, url: ref.url, summary: `Moved DEAL-${did} to "${stage}".` }, refs: [ref] };
    }

    case 'send_external_email': {
      const to = sanitizeTextForPrompt(args.to || '', 160);
      const subject = sanitizeTextForPrompt(args.subject || '', 220);
      const body = String(args.body || '').slice(0, 4000).trim();
      if (!to || !subject || !body) {
        return { ok: false, needsClarification: true, missingFields: [!to ? 'to' : null, !subject ? 'subject' : null, !body ? 'body' : null].filter(Boolean), partialArgs: args, clarificationQuestion: 'Please share the recipient email, subject, and message to prepare the draft.' };
      }
      if (!confirmed) {
        return {
          ok: true,
          requiresConfirmation: true,
          pendingConfirmation: {
            tool: 'send_external_email',
            title: `Confirm Sending Email to ${to}`,
            summary: `To: ${args.toName ? `${args.toName} <${to}>` : to}\nSubject: ${subject}\n\n${body}`,
            args: { to, toName: args.toName || '', subject, body, relatedType: args.relatedType || null, relatedId: args.relatedId || null },
          },
          refs: [],
        };
      }
      let sent = false;
      if (typeof deps.sendEmail === 'function') {
        await deps.sendEmail({ to, subject, text: body, html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;">${body.replace(/\n/g, '<br/>')}</div>` });
        sent = true;
      }
      if (['lead', 'deal', 'account'].includes(args.relatedType)) {
        await pool.query(
          `INSERT INTO crm_emails (recipient_email, recipient_name, subject, body, related_type, related_id, sent_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [to, args.toName || '', subject, body, args.relatedType, args.relatedId ? Number(args.relatedId) : null, userId, sent ? 'sent' : 'queued']
        );
      }
      await logAiAudit({ pool, user, feature: 'copilot_send_email', entityType: args.relatedType || 'email', entityId: args.relatedId || null, provider: 'human_confirmed', model: 'send_external_email', actionStatus: 'confirmed', responseMeta: { to, sent } });
      return {
        ok: true,
        executedAction: { type: 'sent', entity: 'email', id: null, label: `Email to ${to}`, url: args.relatedType === 'lead' ? '/leads' : '/deals', summary: `Email "${subject}" ${sent ? 'sent' : 'queued'} to ${to}.` },
        refs: [],
      };
    }

    case 'search_clients_and_projects': {
      const qTerm = args.query ? `%${String(args.query).toLowerCase()}%` : null;
      const params = [];
      let sql;
      if (admin) {
        if (qTerm) params.push(qTerm);
        sql = `SELECT p.id, p.name, p.code, p.status, p.type, p.updated_at, c.id AS client_id, c.name AS client_name, c.company AS client_company
               FROM projects p LEFT JOIN clients c ON c.id = p.client_id
               ${qTerm ? `WHERE (LOWER(p.name) LIKE $1 OR LOWER(p.code) LIKE $1 OR LOWER(COALESCE(c.name,'')) LIKE $1 OR LOWER(COALESCE(c.company,'')) LIKE $1)` : ''}
               ORDER BY p.updated_at DESC LIMIT 20`;
      } else {
        params.push(userId);
        if (qTerm) params.push(qTerm);
        sql = `SELECT p.id, p.name, p.code, p.status, p.type, p.updated_at, c.id AS client_id, c.name AS client_name, c.company AS client_company, pm.can_edit
               FROM projects p JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1 LEFT JOIN clients c ON c.id = p.client_id
               ${qTerm ? `WHERE (LOWER(p.name) LIKE $2 OR LOWER(p.code) LIKE $2 OR LOWER(COALESCE(c.name,'')) LIKE $2 OR LOWER(COALESCE(c.company,'')) LIKE $2)` : ''}
               ORDER BY p.updated_at DESC LIMIT 20`;
      }
      const pq = await pool.query(sql, params);
      let rows = pq.rows;
      if (args.overdueOnly) {
        const cutoff = Date.now() - 14 * 86400000;
        rows = rows.filter((r) => r.status !== 'completed' && new Date(r.updated_at).getTime() < cutoff);
      }
      return {
        ok: true,
        projects: rows,
        refs: rows.slice(0, 6).map((p) => ({ type: 'project', id: p.id, label: `Project ${p.code}: ${p.name} (${p.status})`, url: buildRecordUrl('project', p.id) })),
      };
    }

    case 'summarize_client_or_project': {
      const type = String(args.entityType || '').toLowerCase();
      const id = Number(args.entityId);
      if (type === 'client') {
        const data = await aiWorkflows.summarizeClient({ pool, user, clientId: id });
        return { ok: true, ...data, refs: [{ type: 'client', id, label: `Client #${id}`, url: buildRecordUrl('client', id) }] };
      }
      const data = await aiWorkflows.summarizeProject({ pool, user, projectId: id });
      return { ok: true, ...data, refs: [{ type: 'project', id, label: `Project #${id}`, url: buildRecordUrl('project', id) }] };
    }

    case 'create_client': {
      if (!admin) return { ok: false, error: 'Permission denied: Creating clients requires Admin role.' };
      const nameVal = sanitizeTextForPrompt(args.name || '', 110);
      const emailVal = sanitizeTextForPrompt(args.email || '', 150).toLowerCase();
      const phoneVal = sanitizeTextForPrompt(args.phone || '', 20);
      if (!nameVal || !emailVal || !phoneVal) {
        return {
          ok: false, needsClarification: true,
          missingFields: [!nameVal ? 'name' : null, !emailVal ? 'email' : null, !phoneVal ? 'phone' : null].filter(Boolean),
          partialArgs: args,
          clarificationQuestion: 'To create a client, please provide name, email, and phone number (and optionally company).',
        };
      }
      const ins = await pool.query(`INSERT INTO clients (name, email, phone, company) VALUES ($1,$2,$3,$4) RETURNING *`, [nameVal, emailVal, phoneVal, args.company || null]);
      const client = ins.rows[0];
      await logAiAudit({ pool, user, feature: 'copilot_create_client', entityType: 'client', entityId: client.id, provider: 'copilot_tool', model: 'create_client', actionStatus: 'executed' });
      const ref = { type: 'client', id: client.id, label: `Client #${client.id}: ${client.name}`, url: buildRecordUrl('client', client.id) };
      return { ok: true, executedAction: { type: 'created', entity: 'client', id: client.id, label: ref.label, url: ref.url, summary: `Created client ${client.name} (#${client.id}).` }, refs: [ref] };
    }

    case 'create_project': {
      if (!admin) return { ok: false, error: 'Permission denied: Creating projects requires Admin role.' };
      const nameVal = sanitizeTextForPrompt(args.name || '', 190);
      const typeVal = ['web_development', 'digital_marketing', 'data_analytics', 'other'].includes(args.type) ? args.type : 'web_development';
      if (!nameVal || !args.clientIdOrName) {
        return { ok: false, needsClarification: true, missingFields: [!nameVal ? 'name' : null, !args.clientIdOrName ? 'clientIdOrName' : null].filter(Boolean), partialArgs: args, clarificationQuestion: 'To create a project, please share the client name (or ID) and project name.' };
      }
      let cid = /^\d+$/.test(String(args.clientIdOrName)) ? Number(args.clientIdOrName) : null;
      if (!cid) {
        const cq = await pool.query(`SELECT id FROM clients WHERE LOWER(name) LIKE $1 OR LOWER(COALESCE(company,'')) LIKE $1 LIMIT 1`, [`%${String(args.clientIdOrName).toLowerCase()}%`]);
        cid = cq.rows[0]?.id || null;
      }
      if (!cid) return { ok: false, error: `Client matching "${args.clientIdOrName}" not found.` };
      const code = deps.genProjectCode ? deps.genProjectCode() : `PRJ-${Date.now().toString().slice(-6)}`;
      const zorvixeId = deps.genZorvixeId ? deps.genZorvixeId(code) : `ZOR-${code.replace(/^PRJ-/, '')}`;
      const ins = await pool.query(
        `INSERT INTO projects (client_id, code, zorvixe_id, name, description, type, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [cid, code, zorvixeId, nameVal, args.description || null, typeVal, userId]
      );
      const proj = ins.rows[0];
      await logAiAudit({ pool, user, feature: 'copilot_create_project', entityType: 'project', entityId: proj.id, provider: 'copilot_tool', model: 'create_project', actionStatus: 'executed' });
      const ref = { type: 'project', id: proj.id, label: `Project ${proj.code}: ${proj.name}`, url: buildRecordUrl('project', proj.id) };
      return { ok: true, executedAction: { type: 'created', entity: 'project', id: proj.id, label: ref.label, url: ref.url, summary: `Created ${ref.label}.` }, refs: [ref] };
    }

    case 'update_project': {
      const pid = Number(args.projectId);
      if (!Number.isFinite(pid)) return { ok: false, error: 'Valid projectId is required.' };
      const canEdit = admin || (typeof deps.userCanEditProject === 'function' && (await deps.userCanEditProject(userId, pid)));
      if (!canEdit) return { ok: false, error: `Permission denied: You do not have edit permission on Project #${pid}.` };
      const sets = [];
      const params = [];
      if (args.status) { params.push(sanitizeTextForPrompt(args.status, 30)); sets.push(`status = $${params.length}`); }
      if (args.name) { params.push(sanitizeTextForPrompt(args.name, 190)); sets.push(`name = $${params.length}`); }
      if (args.description) { params.push(sanitizeTextForPrompt(args.description, 2000)); sets.push(`description = $${params.length}`); }
      if (!sets.length) return { ok: false, error: 'No project updates specified.' };
      params.push(userId); sets.push(`updated_by = $${params.length}`);
      params.push(pid);
      const upd = await pool.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
      if (!upd.rows.length) return { ok: false, error: `Project #${pid} not found.` };
      await logAiAudit({ pool, user, feature: 'copilot_update_project', entityType: 'project', entityId: pid, provider: 'copilot_tool', model: 'update_project', actionStatus: 'executed' });
      const ref = { type: 'project', id: pid, label: `Project ${upd.rows[0].code}: ${upd.rows[0].name}`, url: buildRecordUrl('project', pid) };
      return { ok: true, executedAction: { type: 'updated', entity: 'project', id: pid, label: ref.label, url: ref.url, summary: `Updated ${ref.label} (status: ${upd.rows[0].status}).` }, refs: [ref] };
    }

    case 'comment_project': {
      const pid = Number(args.projectId);
      const text = sanitizeTextForPrompt(args.commentText || '', 1500);
      if (!Number.isFinite(pid) || !text) return { ok: false, error: 'projectId and commentText are required.' };
      if (!admin) {
        const mem = await pool.query(`SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2 LIMIT 1`, [pid, userId]);
        if (!mem.rows.length) return { ok: false, error: 'Permission denied on this project.' };
      }
      await pool.query(`INSERT INTO project_comments (project_id, user_id, comment_text) VALUES ($1,$2,$3)`, [pid, userId, text]);
      const ref = { type: 'project', id: pid, label: `Project #${pid}`, url: buildRecordUrl('project', pid) };
      return { ok: true, executedAction: { type: 'commented', entity: 'project', id: pid, label: ref.label, url: ref.url, summary: `Added project comment on #${pid}.` }, refs: [ref] };
    }

    case 'query_hrms': {
      const topic = String(args.topic || args.scope || 'attendance').toLowerCase();
      if (topic === 'payroll_audit') {
        if (!admin) return { ok: false, error: 'Permission denied: Organization payroll data requires Admin role.' };
        const res = await aiWorkflows.auditPayroll({ pool, user, month: args.month, year: args.year });
        return { ok: true, payrollAudit: res, refs: [{ type: 'payroll', id: 0, label: 'Payroll Runs', url: '/payroll' }] };
      }
      if (topic === 'employees') {
        const q = await pool.query(
          `SELECT u.id, u.name, u.email, u.role, u.department, u.position, u.presence_status, ep.employee_code, ep.employment_type
           FROM admin_users u LEFT JOIN hrms_employee_profiles ep ON ep.user_id = u.id
           WHERE u.is_active = TRUE
           ORDER BY u.name ASC LIMIT 25`
        );
        return { ok: true, employees: q.rows, refs: [{ type: 'employee', id: 0, label: 'Employees Directory', url: '/employees' }] };
      }
      if (topic === 'leaves') {
        const res = await aiWorkflows.summarizeLeaves({ pool, user, status: args.status || 'pending' });
        return { ok: true, leavesOverview: res, refs: [{ type: 'leave', id: 0, label: 'Leave Management', url: '/leaves' }] };
      }
      const res = await aiWorkflows.summarizeAttendance({ pool, user, month: args.month, year: args.year });
      return { ok: true, attendanceOverview: res, refs: [{ type: 'attendance', id: 0, label: 'Attendance Management', url: '/attendance' }] };
    }

    case 'review_leave_decision': {
      const lid = Number(args.leaveId);
      const status = String(args.status || '').toLowerCase();
      if (!Number.isFinite(lid) || !['approved', 'rejected'].includes(status)) {
        return { ok: false, error: 'Valid leaveId and status (approved|rejected) required.' };
      }
      const lq = await pool.query(
        `SELECT l.*, emp.name AS employee_name, emp.email AS employee_email FROM leaves l JOIN admin_users emp ON emp.id = l.employee_id WHERE l.id = $1`,
        [lid]
      );
      if (!lq.rows.length) return { ok: false, error: `Leave request #${lid} not found.` };
      const leave = lq.rows[0];
      if (!admin && Number(leave.approver_id) !== userId) {
        return { ok: false, error: 'Permission denied: You are not authorized to decide this leave request.' };
      }
      if (!confirmed) {
        return {
          ok: true,
          requiresConfirmation: true,
          pendingConfirmation: {
            tool: 'review_leave_decision',
            title: `Confirm Leave ${status === 'approved' ? 'Approval' : 'Rejection'} (#${lid})`,
            summary: `${leave.employee_name} — ${leave.leave_type} (${leave.total_days} day(s): ${String(leave.start_date).slice(0, 10)} to ${String(leave.end_date).slice(0, 10)}). Reason: ${leave.reason}`,
            args: { leaveId: lid, status, comments: args.comments || '' },
          },
          refs: [{ type: 'leave', id: lid, label: `Leave #${lid}: ${leave.employee_name}`, url: '/leaves' }],
        };
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (status === 'approved' && leave.status !== 'approved') {
          const bq = await client.query(`SELECT * FROM leave_balances WHERE employee_id = $1`, [leave.employee_id]);
          const bal = Number(bq.rows[0]?.[`${leave.leave_type}_balance`] || 0);
          if (bal < Number(leave.total_days)) {
            await client.query('ROLLBACK');
            return { ok: false, error: `Insufficient ${leave.leave_type} balance (${bal} available, ${leave.total_days} required).` };
          }
          await client.query(
            `UPDATE leave_balances SET ${leave.leave_type}_balance = ${leave.leave_type}_balance - $1 WHERE employee_id = $2`,
            [leave.total_days, leave.employee_id]
          );
        }
        await client.query(
          `UPDATE leaves SET status = $1, approved_by = $2, approved_on = NOW(), comments = COALESCE($3, comments) WHERE id = $4`,
          [status, userId, args.comments || null, lid]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      if (leave.employee_email && typeof deps.sendLeaveStatusEmail === 'function') {
        deps.sendLeaveStatusEmail({ to: leave.employee_email, employeeName: leave.employee_name, leaveType: leave.leave_type, status, startDate: leave.start_date, endDate: leave.end_date, comments: args.comments || '' }).catch(() => {});
      }

      await logAiAudit({ pool, user, feature: 'copilot_leave_decision', entityType: 'leave', entityId: lid, provider: 'human_confirmed', model: 'review_leave_decision', actionStatus: 'confirmed', responseMeta: { status } });
      return {
        ok: true,
        executedAction: { type: 'updated', entity: 'leave', id: lid, label: `Leave #${lid}: ${status}`, url: '/leaves', summary: `Leave #${lid} (${leave.employee_name}) marked ${status}.` },
        refs: [{ type: 'leave', id: lid, label: `Leave #${lid}`, url: '/leaves' }],
      };
    }

    case 'search_contacts': {
      const where = [];
      const params = [];
      if (args.status) { params.push(String(args.status).toLowerCase()); where.push(`status = $${params.length}`); }
      if (args.search) { params.push(`%${String(args.search).toLowerCase()}%`); where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(subject) LIKE $${params.length})`); }
      const q = await pool.query(`SELECT id, name, email, phone, subject, status, created_at FROM contacts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 12`, params);
      return { ok: true, contacts: q.rows, refs: q.rows.slice(0, 5).map((c) => ({ type: 'contact', id: c.id, label: `Contact #${c.id}: ${c.name} (${c.status})`, url: '/contacts' })) };
    }

    case 'update_contact_status': {
      const cid = Number(args.contactId);
      const status = String(args.status || '').toLowerCase();
      if (!Number.isFinite(cid) || !['new', 'viewed', 'responded', 'closed'].includes(status)) {
        return { ok: false, error: 'Valid contactId and status (new|viewed|responded|closed) required.' };
      }
      const upd = await pool.query(`UPDATE contacts SET status = $1 WHERE id = $2 RETURNING id, name, status`, [status, cid]);
      if (!upd.rows.length) return { ok: false, error: `Contact #${cid} not found.` };
      await logAiAudit({ pool, user, feature: 'copilot_update_contact', entityType: 'contact', entityId: cid, provider: 'copilot_tool', model: 'update_contact_status', actionStatus: 'executed' });
      const ref = { type: 'contact', id: cid, label: `Contact #${cid}: ${upd.rows[0].name}`, url: '/contacts' };
      return { ok: true, executedAction: { type: 'updated', entity: 'contact', id: cid, label: ref.label, url: '/contacts', summary: `Contact #${cid} updated to "${status}".` }, refs: [ref] };
    }

    case 'search_payments': {
      if (!admin) return { ok: false, error: 'Permission denied: Payment data requires Admin role.' };
      const where = [];
      const params = [];
      if (args.status) { params.push(String(args.status).toLowerCase()); where.push(`status = $${params.length}`); }
      if (args.search) { params.push(`%${String(args.search).toLowerCase()}%`); where.push(`(LOWER(client_name) LIKE $${params.length} OR LOWER(project_name) LIKE $${params.length})`); }
      const q = await pool.query(`SELECT id, client_name, project_name, amount, status, due_date, created_at FROM payment_registrations ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 12`, params);
      return { ok: true, payments: q.rows, refs: q.rows.slice(0, 5).map((p) => ({ type: 'payment', id: p.id, label: `Payment #${p.id}: ${p.client_name} (₹${Number(p.amount).toLocaleString('en-IN')})`, url: '/payments' })) };
    }

    case 'get_notifications_and_digest': {
      const [digest, notifSummary] = await Promise.all([
        aiWorkflows.generateDashboardDigest({ pool, user }),
        aiWorkflows.summarizeNotifications({ pool, user }),
      ]);
      return {
        ok: true,
        digest,
        notifications: notifSummary,
        refs: (digest.emergingRisks || []).map((r) => ({ type: 'risk', id: r.title, label: r.title, url: r.url })),
      };
    }

    case 'delete_record': {
      const type = String(args.entityType || '').toLowerCase();
      const id = Number(args.entityId);
      if (!['ticket', 'lead', 'deal', 'contact'].includes(type) || !Number.isFinite(id)) {
        return { ok: false, error: 'Valid entityType (ticket|lead|deal|contact) and numeric entityId required.' };
      }
      if (type === 'contact' && !admin) return { ok: false, error: 'Permission denied: Deleting contacts requires Admin role.' };
      if (type === 'ticket') {
        const tq = await pool.query(`SELECT created_by, title FROM tickets WHERE id = $1`, [id]);
        if (!tq.rows.length) return { ok: false, error: `Ticket #${id} not found.` };
        if (!admin && Number(tq.rows[0].created_by) !== userId) {
          return { ok: false, error: 'Permission denied: Only Admins or the ticket creator can delete a ticket.' };
        }
      }
      if (!confirmed) {
        return {
          ok: true,
          requiresConfirmation: true,
          pendingConfirmation: {
            tool: 'delete_record',
            title: `Confirm Permanent Delete (${type.toUpperCase()} #${id})`,
            summary: `This will permanently delete ${type} #${id}. Destructive actions require explicit confirmation.`,
            args: { entityType: type, entityId: id },
          },
          refs: [],
        };
      }
      const tableMap = { ticket: 'tickets', lead: 'crm_leads', deal: 'crm_deals', contact: 'contacts' };
      const del = await pool.query(`DELETE FROM ${tableMap[type]} WHERE id = $1 RETURNING id`, [id]);
      if (!del.rowCount) return { ok: false, error: `${type} #${id} not found.` };
      await logAiAudit({ pool, user, feature: 'copilot_delete_record', entityType: type, entityId: id, provider: 'human_confirmed', model: 'delete_record', actionStatus: 'confirmed' });
      return { ok: true, executedAction: { type: 'deleted', entity: type, id, label: `Deleted ${type} #${id}`, url: buildRecordUrl(type, id), summary: `Deleted ${type} #${id}.` }, refs: [] };
    }

    default:
      return { ok: false, error: `Unknown or unsupported tool: ${name}` };
  }
}

module.exports = {
  isAdminUser,
  buildRecordUrl,
  resolveTeamMember,
  getToolDefinitionsForPrompt,
  executeTool,
};
