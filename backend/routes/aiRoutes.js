/**
 * Zorvixe Technologies AI Express Router (/api/ai/*)
 * All endpoints enforce authentication, role/record authorization, rate limits,
 * human confirmation requirements, and audit logging.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const { getAiRuntimeConfig, logAiAudit } = require('../services/aiService');
const aiWorkflows = require('../services/aiWorkflows');
const zorviCopilot = require('../services/zorviCopilot');

function createAiRouter({
  pool,
  requireAuth,
  requireAdmin,
  isAdmin,
  extractResumeText,
  sendTicketAssignedEmail,
  sendTicketCommentEmail,
  sendLeaveStatusEmail,
  sendEmail,
  genProjectCode,
  genZorvixeId,
  userCanEditProject,
}) {
  const router = express.Router();
  const copilotDeps = {
    extractResumeText,
    sendTicketAssignedEmail,
    sendTicketCommentEmail,
    sendLeaveStatusEmail,
    sendEmail,
    genProjectCode,
    genZorvixeId,
    userCanEditProject,
  };

  const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: Number(process.env.AI_RATE_LIMIT_MAX || 45),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.sub ? `user:${req.user.sub}` : ipKeyGenerator(req.ip || '0.0.0.0')),
    message: { success: false, message: 'Too many AI requests. Please wait a few minutes and try again.' },
  });

  function sendAiError(res, err, fallbackMsg) {
    const status = err?.status || 500;
    const msg = status < 500 ? err.message : fallbackMsg;
    if (status >= 500) console.error('[AI Route Error]', err);
    return res.status(status).json({
      success: false,
      code: err?.code || undefined,
      message: msg,
    });
  }

  // 1. AI Configuration & Status (Safe - never exposes API keys)
  router.get('/status', requireAuth, async (req, res) => {
    try {
      const cfg = await getAiRuntimeConfig(pool);
      return res.json({
        success: true,
        ...cfg,
        role: req.user?.role || 'employee',
        isAdmin: isAdmin(req),
      });
    } catch (err) {
      return sendAiError(res, err, 'Failed to read AI configuration');
    }
  });

  // Admin: Enable / Disable AI platform-wide
  router.patch('/settings', requireAdmin, async (req, res) => {
    try {
      const { enabled } = req.body || {};
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, message: 'enabled (boolean) is required' });
      }

      await pool.query(
        `INSERT INTO platform_settings (key, value, updated_by, updated_at)
         VALUES ('ai_config', jsonb_build_object('enabled', $1::boolean), $2, NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = jsonb_build_object('enabled', $1::boolean),
             updated_by = $2,
             updated_at = NOW()`,
        [enabled, Number(req.user.sub)]
      );

      await logAiAudit({
        pool,
        user: req.user,
        feature: 'ai_settings_updated',
        actionStatus: 'updated',
        provider: 'system',
        model: 'admin-setting',
        responseMeta: { enabled },
      });

      const cfg = await getAiRuntimeConfig(pool);
      return res.json({
        success: true,
        message: `AI features ${enabled ? 'enabled' : 'disabled'} successfully.`,
        ...cfg,
      });
    } catch (err) {
      return sendAiError(res, err, 'Failed to update AI settings');
    }
  });

  // Admin: Inspect AI Audit Logs
  router.get('/audit-logs', requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 40));
      const feature = req.query.feature ? String(req.query.feature).trim() : null;
      const params = [];
      let where = '';
      if (feature) {
        params.push(feature);
        where = `WHERE a.feature = $${params.length}`;
      }
      params.push(limit);

      const q = await pool.query(
        `SELECT a.id, a.user_id, u.name AS user_name, u.email AS user_email,
                a.user_role, a.feature, a.entity_type, a.entity_id,
                a.provider, a.model, a.action_status, a.grounding_refs,
                a.request_meta, a.response_meta, a.created_at
         FROM ai_audit_logs a
         LEFT JOIN admin_users u ON u.id = a.user_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $${params.length}`,
        params
      );
      return res.json({ success: true, logs: q.rows });
    } catch (err) {
      return sendAiError(res, err, 'Failed to load AI audit logs');
    }
  });

  // 2. Role-Aware Multi-Turn Copilot (Global Assistant & Actions)
  router.get('/copilot/session', requireAuth, async (req, res) => {
    try {
      const data = await zorviCopilot.getOrCreateSession({
        pool,
        userId: Number(req.user.sub),
        sessionId: req.query?.sessionId,
      });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to load Copilot session');
    }
  });

  router.post('/copilot/session/reset', requireAuth, async (req, res) => {
    try {
      const data = await zorviCopilot.resetSession({
        pool,
        userId: Number(req.user.sub),
      });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to reset Copilot session');
    }
  });

  router.post('/copilot/confirm', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { sessionId, overrides } = req.body || {};
      const data = await zorviCopilot.confirmCopilotAction({
        pool,
        user: req.user,
        sessionId,
        overrides: overrides || {},
        deps: copilotDeps,
      });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to execute confirmed Copilot action');
    }
  });

  router.post('/copilot/cancel', requireAuth, async (req, res) => {
    try {
      const { sessionId } = req.body || {};
      const data = await zorviCopilot.cancelCopilotConfirmation({
        pool,
        user: req.user,
        sessionId,
      });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to cancel pending confirmation');
    }
  });

  router.post('/assistant/chat', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { message, currentPath, contextEntity, sessionId } = req.body || {};
      const data = await zorviCopilot.runCopilotTurn({
        pool,
        user: req.user,
        message,
        currentPath,
        contextEntity,
        sessionId,
        deps: copilotDeps,
      });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to process AI assistant query');
    }
  });

  // 3. Tickets AI
  router.post('/tickets/recommend-assignments', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { ticketIds } = req.body || {};
      const data = await aiWorkflows.recommendTicketAssignments({ pool, user: req.user, ticketIds });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to generate ticket assignment recommendations');
    }
  });

  // Human-confirmed ticket assignment
  router.post('/tickets/confirm-assignment', requireAuth, async (req, res) => {
    try {
      const { ticketId, assignedTo, priority, suggestedAssigneeId, reasons } = req.body || {};
      const tid = Number(ticketId);
      const assigneeId = Number(assignedTo);
      if (!Number.isFinite(tid) || !Number.isFinite(assigneeId)) {
        return res.status(400).json({ success: false, message: 'Valid ticketId and assignedTo are required' });
      }

      const ticketQ = await pool.query(`SELECT * FROM tickets WHERE id = $1`, [tid]);
      if (!ticketQ.rows.length) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      const existing = ticketQ.rows[0];

      // Authorization check matching Tickets.js: only Admin or Ticket Creator can re-assign
      if (!isAdmin(req) && Number(existing.created_by) !== Number(req.user.sub)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Only admins or the ticket creator can confirm ticket assignments.',
        });
      }

      const assigneeQ = await pool.query(
        `SELECT id, name, email, is_active FROM admin_users WHERE id = $1`,
        [assigneeId]
      );
      if (!assigneeQ.rows.length || !assigneeQ.rows[0].is_active) {
        return res.status(400).json({ success: false, message: 'Selected assignee must be an active user.' });
      }
      const assignee = assigneeQ.rows[0];

      const allowedPriorities = ['low', 'medium', 'high', 'urgent'];
      const nextPriority = priority && allowedPriorities.includes(String(priority).toLowerCase())
        ? String(priority).toLowerCase()
        : existing.priority;

      const updQ = await pool.query(
        `UPDATE tickets
         SET assigned_to = $1,
             priority = $2,
             last_edited_by = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [assigneeId, nextPriority, Number(req.user.sub), tid]
      );
      const updatedTicket = updQ.rows[0];

      if (assignee.email && Number(existing.assigned_to) !== assigneeId && typeof sendTicketAssignedEmail === 'function') {
        sendTicketAssignedEmail({
          to: assignee.email,
          assigneeName: assignee.name,
          ticketId: updatedTicket.id,
          title: updatedTicket.title,
          description: updatedTicket.description,
          priority: updatedTicket.priority,
          createdByName: req.user.name || req.user.email,
          createdByEmail: req.user.email,
        }).catch((e) => console.error('[Mailer] AI confirmed ticket assignment email error:', e.message));
      }

      await logAiAudit({
        pool,
        user: req.user,
        feature: 'ticket_assignment_confirmed',
        entityType: 'ticket',
        entityId: tid,
        provider: 'human_confirmed',
        model: 'workflow',
        actionStatus: 'confirmed',
        groundingRefs: [{ type: 'ticket', id: tid }, { type: 'user', id: assigneeId, name: assignee.name }],
        requestMeta: { suggestedAssigneeId: suggestedAssigneeId || null, reasons: Array.isArray(reasons) ? reasons.slice(0, 3) : [] },
        responseMeta: { assignedTo: assigneeId, priority: nextPriority },
      });

      return res.json({
        success: true,
        message: `Ticket #${tid} assigned to ${assignee.name} after human confirmation.`,
        ticket: updatedTicket,
        assignee: { id: assignee.id, name: assignee.name, email: assignee.email },
      });
    } catch (err) {
      return sendAiError(res, err, 'Failed to confirm ticket assignment');
    }
  });

  router.post('/tickets/:id/analyze', requireAuth, aiLimiter, async (req, res) => {
    try {
      const data = await aiWorkflows.analyzeTicket({ pool, user: req.user, ticketId: req.params.id });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to analyze ticket');
    }
  });

  router.post('/tickets/:id/draft-reply', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { tone, instruction } = req.body || {};
      const data = await aiWorkflows.draftTicketReply({
        pool,
        user: req.user,
        ticketId: req.params.id,
        tone,
        instruction,
      });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to draft ticket reply');
    }
  });

  // 4. CRM AI
  router.post('/crm/summarize', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { entityType, entityId } = req.body || {};
      const data = await aiWorkflows.summarizeCrmEntity({ pool, user: req.user, entityType, entityId });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to summarize CRM record');
    }
  });

  router.post('/crm/stale-deals', requireAuth, aiLimiter, async (req, res) => {
    try {
      const data = await aiWorkflows.findStaleDeals({ pool, user: req.user });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to detect stale CRM deals');
    }
  });

  router.post('/crm/draft-email', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { relatedType, relatedId, recipientName, recipientEmail, company, goal, tone } = req.body || {};
      const data = await aiWorkflows.draftCrmEmail({
        pool,
        user: req.user,
        relatedType,
        relatedId,
        recipientName,
        recipientEmail,
        company,
        goal,
        tone,
      });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to draft CRM email');
    }
  });

  // 5. HRMS & Payroll AI
  router.post('/hrms/attendance-summary', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { month, year, department } = req.body || {};
      const data = await aiWorkflows.summarizeAttendance({ pool, user: req.user, month, year, department });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to summarize attendance');
    }
  });

  router.post('/hrms/compare-candidate', requireAdmin, aiLimiter, async (req, res) => {
    try {
      const { candidateId } = req.body || {};
      const data = await aiWorkflows.compareCandidateWithJob({
        pool,
        user: req.user,
        candidateId,
        extractResumeText,
      });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to compare candidate with job requirements');
    }
  });

  router.post('/hrms/leave-summary', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { status } = req.body || {};
      const data = await aiWorkflows.summarizeLeaves({ pool, user: req.user, status });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to summarize leave requests');
    }
  });

  router.post('/hrms/payroll-audit', requireAdmin, aiLimiter, async (req, res) => {
    try {
      const { month, year } = req.body || {};
      const data = await aiWorkflows.auditPayroll({ pool, user: req.user, month, year });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to run payroll discrepancy audit');
    }
  });

  // 6. Clients, Projects & Contacts AI
  router.post('/clients/:id/summary', requireAuth, aiLimiter, async (req, res) => {
    try {
      const data = await aiWorkflows.summarizeClient({ pool, user: req.user, clientId: req.params.id });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to summarize client history');
    }
  });

  router.post('/projects/:id/summary', requireAuth, aiLimiter, async (req, res) => {
    try {
      const data = await aiWorkflows.summarizeProject({ pool, user: req.user, projectId: req.params.id });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to summarize project');
    }
  });

  router.post('/contacts/:id/assist', requireAuth, aiLimiter, async (req, res) => {
    try {
      const data = await aiWorkflows.assistContact({ pool, user: req.user, contactId: req.params.id });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to analyze contact inquiry');
    }
  });

  // 7. Dashboard & Notifications AI
  router.post('/dashboard/digest', requireAuth, aiLimiter, async (req, res) => {
    try {
      const data = await aiWorkflows.generateDashboardDigest({ pool, user: req.user });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to generate daily digest');
    }
  });

  router.post('/notifications/summary', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { activities } = req.body || {};
      const data = await aiWorkflows.summarizeNotifications({ pool, user: req.user, activities });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to summarize notifications');
    }
  });

  // 8. Universal Field / Description / Comment AI Assist
  router.post('/assist-field', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { fieldLabel, currentText, pagePath, context } = req.body || {};
      const data = await aiWorkflows.assistTextField({
        pool,
        user: req.user,
        fieldLabel,
        currentText,
        pagePath,
        context,
      });
      return res.json({ success: true, ...data });
    } catch (err) {
      return sendAiError(res, err, 'Failed to generate AI field suggestion');
    }
  });

  return router;
}

module.exports = createAiRouter;
