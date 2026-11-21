const nodemailer = require('nodemailer');

/**
 * Zorvixe Technologies Mailer Service
 * Supports SMTP (Gmail, Hostinger, Outlook, AWS SES, Custom SMTP)
 * Falls back to console preview if SMTP credentials are not yet configured.
 */

// Helper to escape HTML to prevent injection
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Get configured portal URL
function getPortalUrl() {
  return (
    process.env.ADMIN_PORTAL_URL ||
    process.env.PUBLIC_BASE_URL ||
    'https://www.zorvixetechnologies.in'
  );
}

// Create or get nodemailer transporter
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const port = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587', 10);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (user && pass) {
    transporter = nodemailer.createTransport({
      host: host || 'smtp.gmail.com',
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  return transporter;
}

/**
 * Generic email sender
 */
async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    console.warn('[Mailer] No recipient email specified. Skipping.');
    return { success: false, message: 'No recipient email specified' };
  }

  const client = getTransporter();
  const from =
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    `"Zorvixe Technologies" <${process.env.SMTP_USER || 'no-reply@zorvixe.com'}>`;

  if (!client) {
    // If SMTP is not yet configured, log clearly to console for development/preview
    console.log('\n======================================================');
    console.log('📧 [EMAIL NOTIFICATION PREVIEW] (SMTP not configured)');
    console.log(`To: ${to}`);
    console.log(`From: ${from}`);
    console.log(`Subject: ${subject}`);
    console.log('------------------------------------------------------');
    console.log(text || html.replace(/<[^>]+>/g, ' '));
    console.log('======================================================\n');
    return { success: true, simulated: true, to, subject };
  }

  try {
    const info = await client.sendMail({
      from,
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, ' '),
      html
    });
    console.log(`📧 [Mailer] Email sent successfully to ${to}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ [Mailer] Failed to send email to ${to}:`, err.message);
    throw err;
  }
}

/**
 * Zorvixe Branded HTML Email Template Wrapper
 */
function wrapBrandTemplate({ title, contentHtml }) {
  const portalUrl = getPortalUrl();
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <!-- Header with Gradient Branding -->
          <tr>
            <td style="background: linear-gradient(135deg, #0a66c2 0%, #004182 100%); padding: 26px 32px; text-align: left;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 21px; font-weight: 700; letter-spacing: -0.3px;">ZORVIXE TECHNOLOGIES</h1>
                    <p style="margin: 4px 0 0 0; color: rgba(255, 255, 255, 0.85); font-size: 13px; font-weight: 500;">Enterprise Workplace Management</p>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="background: rgba(255, 255, 255, 0.2); color: #ffffff; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Portal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Email Body -->
          <tr>
            <td style="padding: 32px 32px 28px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                © ${year} Zorvixe Technologies. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.4;">
                This is an automated notification from the Zorvixe Enterprise System.<br>
                For any inquiries, please contact your administrator.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * 1. Send Welcome Email with User Credentials
 */
async function sendUserWelcomeEmail({ to, name, username, email, password, role, department, position }) {
  const portalUrl = getPortalUrl();
  const subject = `Welcome to Zorvixe Technologies - Your Account Credentials`;

  const contentHtml = `
    <p style="font-size: 16px; font-weight: 600; margin: 0 0 12px; color: #0f172a;">Hello ${escapeHtml(name)},</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px; color: #334155;">
      Your account on the <strong>Zorvixe Technologies Workplace Platform</strong> has been created successfully. Below are your login credentials to access the enterprise portal:
    </p>

    <!-- Credentials Card -->
    <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 20px; margin: 20px 0;">
      <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600;">Full Name:</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(name)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Email Address:</td>
          <td style="color: #0f172a;">${escapeHtml(email)}</td>
        </tr>
        ${username ? `
        <tr>
          <td style="color: #64748b; font-weight: 600;">Username:</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(username)}</td>
        </tr>` : ''}
        ${department ? `
        <tr>
          <td style="color: #64748b; font-weight: 600;">Department:</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(department)}</td>
        </tr>` : ''}
        ${position ? `
        <tr>
          <td style="color: #64748b; font-weight: 600;">Position / Designation:</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(position)}</td>
        </tr>` : ''}
        <tr>
          <td style="color: #64748b; font-weight: 600;">Temporary Password:</td>
          <td>
            <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 15px; font-weight: 700; background: #e2e8f0; color: #0f172a; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.5px;">
              ${escapeHtml(password)}
            </span>
          </td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Role:</td>
          <td>
            <span style="display: inline-block; background-color: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 12px; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;">
              ${escapeHtml(role || 'employee')}
            </span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Login CTA Button -->
    <div style="text-align: center; margin: 28px 0 20px;">
      <a href="${portalUrl}/login" target="_blank" style="display: inline-block; background-color: #0a66c2; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 13px 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(10, 102, 194, 0.25);">
        Log in to Your Account →
      </a>
    </div>

    <!-- Security Warning Box -->
    <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; margin-top: 24px;">
      <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.5;">
        <strong>🔒 Security Notice:</strong> Please change your password immediately upon your first login for your account's protection. Never share your password with anyone.
      </p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    html: wrapBrandTemplate({ title: subject, contentHtml })
  });
}

/**
 * 2. Send Ticket Assignment Notification Email
 */
async function sendTicketAssignedEmail({
  to,
  assigneeName,
  ticketId,
  title,
  description,
  priority = 'medium',
  createdByName,
  createdByEmail
}) {
  const portalUrl = getPortalUrl();
  const subject = `[Ticket #${ticketId}] New Ticket Assigned: ${title}`;

  // Priority color formatting
  const pColors = {
    critical: { bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
    high: { bg: '#ffedd5', text: '#9a3412', border: '#fb923c' },
    medium: { bg: '#e0f2fe', text: '#075985', border: '#38bdf8' },
    low: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }
  };
  const color = pColors[priority.toLowerCase()] || pColors.medium;

  const contentHtml = `
    <p style="font-size: 16px; font-weight: 600; margin: 0 0 12px; color: #0f172a;">Hello ${escapeHtml(assigneeName)},</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px; color: #334155;">
      A new ticket has been created and assigned to you on the <strong>Zorvixe Technologies Workplace Platform</strong>:
    </p>

    <!-- Ticket Summary Card -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0;">
      <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600;">Ticket ID:</td>
          <td style="color: #0a66c2; font-weight: 700; font-size: 15px;">#${ticketId}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Title:</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(title)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Priority:</td>
          <td>
            <span style="background-color: ${color.bg}; color: ${color.text}; border: 1px solid ${color.border}; font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 12px; text-transform: uppercase;">
              ${escapeHtml(priority)}
            </span>
          </td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Created By:</td>
          <td style="color: #334155;">
            ${escapeHtml(createdByName || 'Team Member')} 
            ${createdByEmail ? `<span style="color: #64748b; font-size: 13px;">(${escapeHtml(createdByEmail)})</span>` : ''}
          </td>
        </tr>
      </table>

      ${description ? `
      <div style="margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 14px;">
        <span style="font-size: 12.5px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Description:</span>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-top: 6px; font-size: 13.5px; line-height: 1.55; color: #334155; white-space: pre-line;">
          ${escapeHtml(description)}
        </div>
      </div>` : ''}
    </div>

    <!-- Action CTA -->
    <div style="text-align: center; margin: 28px 0 16px;">
      <a href="${portalUrl}/tickets/${ticketId}" target="_blank" style="display: inline-block; background-color: #0a66c2; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 13px 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(10, 102, 194, 0.25);">
        Open Ticket #${ticketId} →
      </a>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    html: wrapBrandTemplate({ title: subject, contentHtml })
  });
}

/**
 * 3. Send Ticket Comment Notification Email
 */
async function sendTicketCommentEmail({
  to,
  recipientName,
  ticketId,
  title,
  commenterName,
  commentText
}) {
  const portalUrl = getPortalUrl();
  const subject = `[Ticket #${ticketId}] New comment from ${commenterName}`;

  const contentHtml = `
    <p style="font-size: 16px; font-weight: 600; margin: 0 0 12px; color: #0f172a;">Hello ${escapeHtml(recipientName)},</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 18px; color: #334155;">
      <strong>${escapeHtml(commenterName)}</strong> posted an update on Ticket <strong>#${ticketId} (${escapeHtml(title)})</strong>:
    </p>

    <!-- Comment Block -->
    <div style="background-color: #f8fafc; border-left: 4px solid #0a66c2; border-radius: 4px; padding: 16px 20px; margin: 20px 0; font-size: 14px; line-height: 1.6; color: #1e293b; font-style: normal;">
      ${escapeHtml(commentText)}
    </div>

    <!-- Action CTA -->
    <div style="text-align: center; margin: 28px 0 16px;">
      <a href="${portalUrl}/tickets/${ticketId}" target="_blank" style="display: inline-block; background-color: #0a66c2; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
        Reply to Ticket #${ticketId} →
      </a>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    html: wrapBrandTemplate({ title: subject, contentHtml })
  });
}

/**
 * 4. Send Leave Application Email (to Approver)
 */
async function sendLeaveAppliedEmail({
  to,
  approverName,
  employeeName,
  leaveType,
  startDate,
  endDate,
  totalDays,
  reason
}) {
  const portalUrl = getPortalUrl();
  const subject = `[Leave Request] ${employeeName} applied for ${leaveType.toUpperCase()} leave (${totalDays} days)`;

  const contentHtml = `
    <p style="font-size: 16px; font-weight: 600; margin: 0 0 12px; color: #0f172a;">Hello ${escapeHtml(approverName)},</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px; color: #334155;">
      <strong>${escapeHtml(employeeName)}</strong> has submitted a new leave application that requires your review and approval:
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0;">
      <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600;">Employee:</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(employeeName)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Leave Type:</td>
          <td>
            <span style="background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 4px; font-weight: 700; text-transform: uppercase; font-size: 11.5px;">
              ${escapeHtml(leaveType)}
            </span>
          </td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Duration:</td>
          <td style="color: #0f172a; font-weight: 600;">${totalDays} day${totalDays === 1 ? '' : 's'}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Dates:</td>
          <td style="color: #334155;">
            ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}
          </td>
        </tr>
        ${reason ? `
        <tr>
          <td style="color: #64748b; font-weight: 600; vertical-align: top;">Reason:</td>
          <td style="color: #334155;">${escapeHtml(reason)}</td>
        </tr>` : ''}
      </table>
    </div>

    <div style="text-align: center; margin: 28px 0 16px;">
      <a href="${portalUrl}/leaves" target="_blank" style="display: inline-block; background-color: #0a66c2; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 13px 32px; border-radius: 8px;">
        Review Leave Request →
      </a>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    html: wrapBrandTemplate({ title: subject, contentHtml })
  });
}

/**
 * 5. Send Leave Status Update Email (to Employee)
 */
async function sendLeaveStatusEmail({
  to,
  employeeName,
  status,
  leaveType,
  startDate,
  endDate,
  totalDays,
  approverName,
  comments
}) {
  const portalUrl = getPortalUrl();
  const isApproved = status === 'approved';
  const subject = `Your ${leaveType.toUpperCase()} leave application was ${isApproved ? 'Approved' : 'Rejected'}`;

  const statusColor = isApproved
    ? { bg: '#dcfce7', text: '#15803d', border: '#86efac', label: 'APPROVED' }
    : { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', label: 'REJECTED' };

  const contentHtml = `
    <p style="font-size: 16px; font-weight: 600; margin: 0 0 12px; color: #0f172a;">Hello ${escapeHtml(employeeName)},</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px; color: #334155;">
      Your leave application has been reviewed by <strong>${escapeHtml(approverName)}</strong>:
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0;">
      <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600;">Status:</td>
          <td>
            <span style="background: ${statusColor.bg}; color: ${statusColor.text}; border: 1px solid ${statusColor.border}; padding: 3px 10px; border-radius: 12px; font-weight: 700; font-size: 12px;">
              ${statusColor.label}
            </span>
          </td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Leave Type:</td>
          <td style="color: #0f172a; font-weight: 600; text-transform: uppercase;">${escapeHtml(leaveType)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Total Days:</td>
          <td style="color: #0f172a;">${totalDays} day${totalDays === 1 ? '' : 's'}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Period:</td>
          <td style="color: #334155;">${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Reviewed By:</td>
          <td style="color: #0f172a;">${escapeHtml(approverName)}</td>
        </tr>
        ${comments ? `
        <tr>
          <td style="color: #64748b; font-weight: 600; vertical-align: top;">Comments:</td>
          <td style="color: #334155;">${escapeHtml(comments)}</td>
        </tr>` : ''}
      </table>
    </div>

    <div style="text-align: center; margin: 28px 0 16px;">
      <a href="${portalUrl}/leaves" target="_blank" style="display: inline-block; background-color: #0a66c2; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 13px 32px; border-radius: 8px;">
        View Leave History →
      </a>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    html: wrapBrandTemplate({ title: subject, contentHtml })
  });
}

/**
 * 6. Send Contact Form Submission Alert (to Admin)
 */
async function sendContactFormAlert({ to, name, email, phone, subject, message }) {
  const portalUrl = getPortalUrl();
  const emailSubject = `[Website Contact] New message from ${name}: ${subject || 'Inquiry'}`;

  const contentHtml = `
    <p style="font-size: 16px; font-weight: 600; margin: 0 0 12px; color: #0f172a;">Hello Admin,</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px; color: #334155;">
      A new inquiry has been submitted via the <strong>Zorvixe Technologies Website</strong>:
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0;">
      <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600;">Sender:</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(name)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Email:</td>
          <td><a href="mailto:${escapeHtml(email)}" style="color: #0a66c2;">${escapeHtml(email)}</a></td>
        </tr>
        ${phone ? `
        <tr>
          <td style="color: #64748b; font-weight: 600;">Phone:</td>
          <td style="color: #0f172a;">${escapeHtml(phone)}</td>
        </tr>` : ''}
        <tr>
          <td style="color: #64748b; font-weight: 600;">Subject:</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(subject || 'General Inquiry')}</td>
        </tr>
      </table>

      <div style="margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 14px;">
        <span style="font-size: 12.5px; font-weight: 600; color: #64748b; text-transform: uppercase;">Message:</span>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-top: 6px; font-size: 13.5px; line-height: 1.55; color: #334155; white-space: pre-line;">
          ${escapeHtml(message)}
        </div>
      </div>
    </div>

    <div style="text-align: center; margin: 24px 0 16px;">
      <a href="mailto:${escapeHtml(email)}" style="display: inline-block; background-color: #0a66c2; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
        Reply to ${escapeHtml(name)} →
      </a>
    </div>
  `;

  return sendEmail({
    to,
    subject: emailSubject,
    html: wrapBrandTemplate({ title: emailSubject, contentHtml })
  });
}

module.exports = {
  sendEmail,
  sendUserWelcomeEmail,
  sendTicketAssignedEmail,
  sendTicketCommentEmail,
  sendLeaveAppliedEmail,
  sendLeaveStatusEmail,
  sendContactFormAlert
};
