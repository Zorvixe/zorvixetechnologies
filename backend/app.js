// app.js
// One-file backend: Admin auth (email/username) + RBAC + Users + Contacts + Candidates (links + PDF upload)
// Deps: express cors helmet cookie-parser express-rate-limit dotenv pg bcryptjs jsonwebtoken multer path fs crypto

require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const rateLimit = require('express-rate-limit')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { Pool } = require('pg')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const zlib = require('zlib')

// Email notification services
const {
  sendEmail,
  sendUserWelcomeEmail,
  sendTicketAssignedEmail,
  sendTicketCommentEmail,
  sendLeaveAppliedEmail,
  sendLeaveStatusEmail,
  sendContactFormAlert,
  sendCareerOtpEmail,
  sendCareerApplicationConfirmation,
  sendCareerNewApplicantAdminAlert
} = require('./services/mailer')

/* ---------------------------- App & Middleware ---------------------------- */
const app = express()
const PORT = process.env.PORT || 5001

app.use(helmet())
app.use(express.json())
app.use(cookieParser())
app.use(
  cors({
    origin: "*", // In production: e.g., "https://yourdomain.com"
    credentials: true,
  })
);

/* ------------------------------ Uploads setup ----------------------------- */
const UPLOADS_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}
app.use('/uploads', express.static(UPLOADS_DIR)) // optional: serve files if you want direct access

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, 'candidate-' + unique + path.extname(file.originalname))
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok =
      file.mimetype === "application/pdf" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/jpg" ||
      file.mimetype === "application/msword" ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype === "text/plain" ||
      ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.txt'].includes(ext);
    cb(ok ? null : new Error("Only PDF, DOC, DOCX, TXT and image files are allowed"), ok);
  },
});

/* --------------------------------- DB Pool -------------------------------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'false' || process.env.NODE_ENV === 'development'
      ? false
      : { rejectUnauthorized: false },
})

/* -------------------- Project & Payment Helpers + RBAC checks -------------------- */
function genProjectCode() {
  const ts = Date.now().toString().slice(-6)
  const rnd = Math.random().toString(36).substr(2, 4).toUpperCase()
  return `PRJ-${ts}-${rnd}`
}
function genZorvixeId(code) {
  const rnd = Math.random().toString(36).substr(2, 3).toUpperCase()
  return `ZOR-${code.replace(/^PRJ-/, '')}-${rnd}`
}
const isAdmin = (req) => req.user?.role === 'admin'

async function userCanEditProject(userId, projectId) {
  if (!userId || !projectId) return false
  const q = await pool.query(
    `SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 AND can_edit=TRUE LIMIT 1`,
    [projectId, userId]
  )
  return q.rows.length > 0
}
async function userCanManagePayments(userId, projectId) {
  if (!userId || !projectId) return false
  const q = await pool.query(
    `SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 AND can_manage_payments=TRUE LIMIT 1`,
    [projectId, userId]
  )
  return q.rows.length > 0
}
function requireProjectEdit() {
  return async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId || req.params.id)
      if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id' })
      if (isAdmin(req)) return next()
      if (await userCanEditProject(req.user.sub, projectId)) return next()
      return res.status(403).json({ message: 'Forbidden' })
    } catch (e) {
      return res.status(500).json({ message: 'Server error' })
    }
  }
}
function requireProjectPayments() {
  return async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId || req.params.id)
      if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id' })
      if (isAdmin(req)) return next()
      if (await userCanManagePayments(req.user.sub, projectId)) return next()
      return res.status(403).json({ message: 'Forbidden' })
    } catch {
      return res.status(500).json({ message: 'Server error' })
    }
  }
}

/* ----------------------------- DB Initialization -------------------------- */
async function initDb() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // updated_at trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    // Admin users
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id             BIGSERIAL PRIMARY KEY,
        email          VARCHAR(160) UNIQUE NOT NULL,
        username       VARCHAR(60) UNIQUE,
        password_hash  TEXT NOT NULL,
        name           VARCHAR(100) NOT NULL,
        role           VARCHAR(20) NOT NULL DEFAULT 'admin', -- 'admin' | 'employee'
        is_active      BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at  TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)
    await client.query(`
      DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON admin_users;
      CREATE TRIGGER trg_admin_users_updated_at
      BEFORE UPDATE ON admin_users
      FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
    `)
    // ensure columns exist when upgrading
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS username VARCHAR(60) UNIQUE;`)
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin';`)
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;`)
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS presence_status VARCHAR(30) NOT NULL DEFAULT 'Available';`)
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS dnd_until TIMESTAMPTZ;`)
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;`)
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS chat_preferences JSONB DEFAULT '{"soundNotif": true, "oneOneChats": true, "mentionNotif": true, "pauseChat": false}'::jsonb;`)
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS notif_last_read_at TIMESTAMPTZ;`)
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS ticket_last_read_at TIMESTAMPTZ;`)
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS notif_seen_keys JSONB DEFAULT '[]'::jsonb;`)
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS ticket_seen_keys JSONB DEFAULT '[]'::jsonb;`)

    // Contacts
    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id            BIGSERIAL PRIMARY KEY,
        name          VARCHAR(100) NOT NULL,
        email         VARCHAR(160) NOT NULL,
        phone         VARCHAR(20)  NOT NULL,
        subject       VARCHAR(80)  NOT NULL,
        message       TEXT         NOT NULL,
        status        VARCHAR(20)  NOT NULL DEFAULT 'new',  -- new | viewed | responded | closed
        admin_notes   TEXT,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts (created_at DESC);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts (status);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts (email);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts (phone);`)
    await client.query(`
      DROP TRIGGER IF EXISTS trg_contacts_updated_at ON contacts;
      CREATE TRIGGER trg_contacts_updated_at
      BEFORE UPDATE ON contacts
      FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
    `)

    /* ----------------------------- Candidates ----------------------------- */
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(100) NOT NULL,
        email           VARCHAR(100) NOT NULL,
        phone           VARCHAR(20) NOT NULL,
        position        VARCHAR(100),
        candidate_id    VARCHAR(50) UNIQUE NOT NULL,
        status          VARCHAR(20) DEFAULT 'pending', -- pending|documents_uploaded|approved|rejected
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_links (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
        token VARCHAR(100) UNIQUE NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        upload_completed BOOLEAN DEFAULT FALSE
      );
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_uploads (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'uploaded'
      );
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_candidate_links_token ON candidate_links(token);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_candidate_uploads_cid ON candidate_uploads(candidate_id);`)

    // Clients
    await client.query(`
  CREATE TABLE IF NOT EXISTS clients (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(120) NOT NULL,
    email        VARCHAR(160) NOT NULL,
    phone        VARCHAR(20)  NOT NULL,
    company      VARCHAR(160),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
`)
    await client.query(`
  DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
  CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
`)

    // Projects
    await client.query(`
  CREATE TABLE IF NOT EXISTS projects (
    id            BIGSERIAL PRIMARY KEY,
    client_id     BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    code          VARCHAR(60) UNIQUE NOT NULL,       -- business/project id (e.g., PRJ-XXXX)
    zorvixe_id    VARCHAR(80) UNIQUE NOT NULL,       -- derived from code + random
    name          VARCHAR(200) NOT NULL,
    description   TEXT,
    type          VARCHAR(40) NOT NULL,              -- web_development | digital_marketing | data_analytics | other
    other_type    VARCHAR(80),
    status        VARCHAR(30) NOT NULL DEFAULT 'new',
    updated_by    BIGINT REFERENCES admin_users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`)
    await client.query(`
  CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
`)
    await client.query(`
  DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
  CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
`)

    // Project members (RBAC per-project)
    await client.query(`
  CREATE TABLE IF NOT EXISTS project_members (
    id                   BIGSERIAL PRIMARY KEY,
    project_id           BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id              BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    can_edit             BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_payments  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id)
  );
`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id)`)

    // Payment links and registrations (reuse if you created earlier)
    await client.query(`
  CREATE TABLE IF NOT EXISTS payment_links (
    id         BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    token      VARCHAR(100) UNIQUE NOT NULL,
    active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT REFERENCES admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_kind VARCHAR(20) NOT NULL DEFAULT 'project',
    expires_at TIMESTAMPTZ NOT NULL
  );
`)

    await client.query(`
  CREATE TABLE IF NOT EXISTS payment_registrations (
    id                 BIGSERIAL PRIMARY KEY,
    project_id         BIGINT REFERENCES projects(id),
    client_id          BIGINT REFERENCES clients(id),
    client_name        VARCHAR(120) NOT NULL,
    project_name       VARCHAR(200) NOT NULL,
    project_code       VARCHAR(60) NOT NULL,
    zorvixe_id         VARCHAR(80) NOT NULL,
    amount             NUMERIC(10,2) NOT NULL,
    due_date           DATE NOT NULL,
    receipt_url        TEXT NOT NULL,
    reference_id       VARCHAR(60) UNIQUE NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'pending',
    payment_type       VARCHAR(40) NOT NULL,      -- web_development | digital_marketing | data_analytics | other
    payment_description TEXT,
    payment_kind VARCHAR(20) NOT NULL DEFAULT 'project',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`)


    await client.query(`
  CREATE TABLE IF NOT EXISTS project_comments (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    parent_id       BIGINT REFERENCES project_comments(id) ON DELETE CASCADE,
    comment_text    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

    await client.query(`
  CREATE INDEX IF NOT EXISTS idx_project_comments_project ON project_comments(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_comments_parent ON project_comments(parent_id);
`);

    await client.query(`
  DROP TRIGGER IF EXISTS trg_project_comments_updated_at ON project_comments;
  CREATE TRIGGER trg_project_comments_updated_at
  BEFORE UPDATE ON project_comments
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
`);


    // Add to the DB initialization section (after project_comments)
    await client.query(`
  CREATE TABLE IF NOT EXISTS tickets (
    id              BIGSERIAL PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'open', -- open, in_progress, resolved, closed
    priority        VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
    created_by      BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    assigned_to     BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

    await client.query(`
  CREATE TABLE IF NOT EXISTS ticket_comments (
    id              BIGSERIAL PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    comment_text    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

    await client.query(`
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
  CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by);
  CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);
`);

    await client.query(`
  DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
  CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
`);

    await client.query(`
  DROP TRIGGER IF EXISTS trg_ticket_comments_updated_at ON ticket_comments;
  CREATE TRIGGER trg_ticket_comments_updated_at
  BEFORE UPDATE ON ticket_comments
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
`);

    // Backfill columns if older table existed
    await client.query(`ALTER TABLE payment_registrations ADD COLUMN IF NOT EXISTS payment_type VARCHAR(40)`)
    await client.query(`ALTER TABLE payment_registrations ADD COLUMN IF NOT EXISTS payment_description TEXT`)
    await client.query(`ALTER TABLE payment_registrations ADD COLUMN IF NOT EXISTS project_code VARCHAR(60)`)


    // relax NOT NULL and set a default for older/newer rows
    await client.query(`ALTER TABLE payment_registrations ALTER COLUMN payment_type DROP NOT NULL;`);
    await client.query(`ALTER TABLE payment_registrations ALTER COLUMN payment_type SET DEFAULT 'other';`);
    await client.query(`UPDATE payment_registrations SET payment_type='other' WHERE payment_type IS NULL;`);



    // Per-link manual amount
    await client.query(`ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2)`);

    // Track which link created a submission + store server file path
    await client.query(`ALTER TABLE payment_registrations ADD COLUMN IF NOT EXISTS link_id BIGINT REFERENCES payment_links(id)`);
    await client.query(`ALTER TABLE payment_registrations ADD COLUMN IF NOT EXISTS receipt_path TEXT`);


    await client.query(`
  CREATE TABLE IF NOT EXISTS ticket_views (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ticket_id, user_id)
  );
`);

    await client.query(`
  CREATE INDEX IF NOT EXISTS idx_ticket_views_ticket ON ticket_views(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_ticket_views_user ON ticket_views(user_id);
`);

    // Add last_edited_by to tickets table
    await client.query(`
  ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_edited_by BIGINT REFERENCES admin_users(id);
`);

    await client.query(`
  DROP TRIGGER IF EXISTS trg_tickets_last_edited ON tickets;
  CREATE TRIGGER trg_tickets_last_edited
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
`);


    // Add to DB initialization
    await client.query(`
  CREATE TABLE IF NOT EXISTS leaves (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    approver_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    leave_type VARCHAR(20) NOT NULL CHECK (leave_type IN ('sick', 'casual', 'annual', 'maternity', 'paternity')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INTEGER NOT NULL CHECK (total_days > 0),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    applied_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    approved_on TIMESTAMPTZ,
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

    await client.query(`
  CREATE TABLE IF NOT EXISTS leave_balances (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    sick_balance INTEGER NOT NULL DEFAULT 1,          -- monthly accrual, starts with 1
    casual_balance INTEGER NOT NULL DEFAULT 2,        -- monthly accrual, starts with 2
    annual_balance INTEGER NOT NULL DEFAULT 21,
    maternity_balance INTEGER NOT NULL DEFAULT 180,
    paternity_balance INTEGER NOT NULL DEFAULT 15,
    sick_used_this_month INTEGER NOT NULL DEFAULT 0,
    casual_used_this_month INTEGER NOT NULL DEFAULT 0,
    sick_carry_forward INTEGER NOT NULL DEFAULT 0,
    casual_carry_forward INTEGER NOT NULL DEFAULT 0,
    annual_carry_forward INTEGER NOT NULL DEFAULT 0,
    last_reset TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id)
  );
`);

    await client.query(`
  ALTER TABLE leave_balances
ADD COLUMN IF NOT EXISTS sick_used_this_month INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS casual_used_this_month INTEGER NOT NULL DEFAULT 0;

  `)


    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leaves_employee_id ON leaves(employee_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leaves_approver_id ON leaves(approver_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leaves_start_date ON leaves(start_date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leaves_end_date ON leaves(end_date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leave_balances_employee ON leave_balances(employee_id);`);

    // Add triggers for updated_at
    await client.query(`
  DROP TRIGGER IF EXISTS trg_leaves_updated_at ON leaves;
  CREATE TRIGGER trg_leaves_updated_at
  BEFORE UPDATE ON leaves
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
`);

    await client.query(`
  DROP TRIGGER IF EXISTS trg_leave_balances_updated_at ON leave_balances;
  CREATE TRIGGER trg_leave_balances_updated_at
  BEFORE UPDATE ON leave_balances
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
`);

    // In initDb() – find this block and change casual_balance from 2 to 1
    await client.query(`
  INSERT INTO leave_balances (employee_id, sick_balance, casual_balance, annual_balance, maternity_balance, paternity_balance)
  SELECT id, 1, 1, 21, 180, 15   -- changed casual from 2 to 1
  FROM admin_users
  WHERE is_active = TRUE
  AND NOT EXISTS (SELECT 1 FROM leave_balances WHERE employee_id = admin_users.id)
`);

    // Add department, position, and phone to admin_users
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS department VARCHAR(100);`);
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS position VARCHAR(100);`);
    await client.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);`);

    // Table for tracking user login and logout timings
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_login_logs (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        logout_at TIMESTAMPTZ,
        session_duration_minutes INTEGER,
        ip_address VARCHAR(100),
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_login_logs_user_id ON user_login_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_login_logs_login_at ON user_login_logs(login_at);
    `);

    // Backfill login records from existing users if table is empty
    await client.query(`
      INSERT INTO user_login_logs (user_id, login_at)
      SELECT id, last_login_at
      FROM admin_users
      WHERE last_login_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM user_login_logs WHERE user_login_logs.user_id = admin_users.id);
    `);

    // Table for LinkedIn-style direct and group chatting / discussions
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGSERIAL PRIMARY KEY,
        sender_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        receiver_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        message_text TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver ON chat_messages(receiver_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
    `);

    // ---------------- HRMS & Payroll Tables ----------------
    // 1. Attendance Management
    await client.query(`
      CREATE TABLE IF NOT EXISTS hrms_attendance (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        punch_in TIMESTAMPTZ,
        punch_out TIMESTAMPTZ,
        total_hours NUMERIC(5,2) DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'present', -- 'present', 'late', 'half_day', 'absent', 'on_leave', 'holiday'
        punch_in_note TEXT,
        punch_out_note TEXT,
        ip_address VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(employee_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_hrms_attendance_employee ON hrms_attendance(employee_id);
      CREATE INDEX IF NOT EXISTS idx_hrms_attendance_date ON hrms_attendance(date);
      CREATE INDEX IF NOT EXISTS idx_hrms_attendance_status ON hrms_attendance(status);
    `);

    // 2. Employee Profile & Records
    await client.query(`
      CREATE TABLE IF NOT EXISTS hrms_employee_profiles (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL UNIQUE REFERENCES admin_users(id) ON DELETE CASCADE,
        employee_code VARCHAR(50) UNIQUE,
        dob DATE,
        gender VARCHAR(20),
        blood_group VARCHAR(10),
        address TEXT,
        emergency_contact_name VARCHAR(100),
        emergency_contact_phone VARCHAR(30),
        emergency_contact_relation VARCHAR(50),
        employment_type VARCHAR(30) DEFAULT 'full_time',
        joining_date DATE,
        reporting_manager_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
        bank_name VARCHAR(100),
        bank_account_no VARCHAR(50),
        bank_ifsc VARCHAR(30),
        pan_number VARCHAR(30),
        uan_number VARCHAR(30),
        esi_number VARCHAR(30),
        documents JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_hrms_emp_profiles_user ON hrms_employee_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_hrms_emp_profiles_code ON hrms_employee_profiles(employee_code);
    `);

    // 3. Salary Structures
    await client.query(`
      CREATE TABLE IF NOT EXISTS hrms_salary_structures (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL UNIQUE REFERENCES admin_users(id) ON DELETE CASCADE,
        ctc_annual NUMERIC(12,2) NOT NULL DEFAULT 0,
        basic_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
        hra_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
        special_allowance_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
        conveyance_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
        medical_allowance_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
        pf_employee_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
        esi_employee_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
        professional_tax_monthly NUMERIC(10,2) NOT NULL DEFAULT 200,
        tds_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
        effective_from DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_hrms_salary_structures_user ON hrms_salary_structures(user_id);
    `);

    // 4. Monthly Payroll Records
    await client.query(`
      CREATE TABLE IF NOT EXISTS hrms_payrolls (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        working_days INTEGER NOT NULL DEFAULT 30,
        paid_days NUMERIC(4,1) NOT NULL DEFAULT 30,
        unpaid_days NUMERIC(4,1) NOT NULL DEFAULT 0,
        gross_earnings NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_deductions NUMERIC(10,2) NOT NULL DEFAULT 0,
        net_salary NUMERIC(10,2) NOT NULL DEFAULT 0,
        basic_pay NUMERIC(10,2) NOT NULL DEFAULT 0,
        hra NUMERIC(10,2) NOT NULL DEFAULT 0,
        special_allowance NUMERIC(10,2) NOT NULL DEFAULT 0,
        conveyance NUMERIC(10,2) NOT NULL DEFAULT 0,
        medical NUMERIC(10,2) NOT NULL DEFAULT 0,
        bonus NUMERIC(10,2) NOT NULL DEFAULT 0,
        pf_deduction NUMERIC(10,2) NOT NULL DEFAULT 0,
        esi_deduction NUMERIC(10,2) NOT NULL DEFAULT 0,
        pt_deduction NUMERIC(10,2) NOT NULL DEFAULT 0,
        tds_deduction NUMERIC(10,2) NOT NULL DEFAULT 0,
        other_deductions NUMERIC(10,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        payment_date DATE,
        payment_mode VARCHAR(30) DEFAULT 'Bank Transfer',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, month, year)
      );
      CREATE INDEX IF NOT EXISTS idx_hrms_payrolls_user ON hrms_payrolls(user_id);
      CREATE INDEX IF NOT EXISTS idx_hrms_payrolls_period ON hrms_payrolls(year, month);
    `);

    // 5. Job Openings (Recruitment) & Candidates Pipeline
    await client.query(`
      CREATE TABLE IF NOT EXISTS hrms_job_openings (
        id BIGSERIAL PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        department VARCHAR(100) NOT NULL,
        experience_required VARCHAR(50),
        job_type VARCHAR(50) DEFAULT 'Full-time',
        vacancies INTEGER DEFAULT 1,
        location VARCHAR(100) DEFAULT 'Hyderabad / Remote',
        salary_range VARCHAR(100),
        description TEXT,
        requirements TEXT,
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS stage VARCHAR(50) DEFAULT 'applied';
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_date TIMESTAMPTZ;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_notes TEXT;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 0;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job_id BIGINT;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS expected_salary VARCHAR(50);
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS experience_years VARCHAR(20);
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cover_letter TEXT;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS portfolio_url VARCHAR(255);
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(255);
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_location VARCHAR(120);
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS notice_period VARCHAR(60);
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source VARCHAR(60) DEFAULT 'admin';

      CREATE TABLE IF NOT EXISTS careers_email_otps (
        id BIGSERIAL PRIMARY KEY,
        email VARCHAR(160) NOT NULL,
        otp_code VARCHAR(10) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_careers_otps_email ON careers_email_otps(email);
    `);

    // 6. Statutory Compliance Records
    await client.query(`
      CREATE TABLE IF NOT EXISTS hrms_compliance_records (
        id BIGSERIAL PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        category VARCHAR(50) NOT NULL,
        frequency VARCHAR(30) DEFAULT 'monthly',
        due_date DATE,
        status VARCHAR(20) DEFAULT 'compliant',
        notes TEXT,
        document_ref VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 7. CRM Deals & Sales Pipeline
    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_deals (
        id BIGSERIAL PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
        contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
        value NUMERIC(12,2) DEFAULT 0,
        stage VARCHAR(30) NOT NULL DEFAULT 'lead',
        probability INTEGER DEFAULT 50,
        expected_close_date DATE,
        assigned_to BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage);
      CREATE INDEX IF NOT EXISTS idx_crm_deals_client ON crm_deals(client_id);
    `);

    // 8. CRM Activities & Follow-ups
    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_activities (
        id BIGSERIAL PRIMARY KEY,
        deal_id BIGINT REFERENCES crm_deals(id) ON DELETE CASCADE,
        client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
        user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
        type VARCHAR(30) NOT NULL DEFAULT 'note',
        title VARCHAR(200) NOT NULL,
        description TEXT,
        due_date TIMESTAMPTZ,
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_activities_deal ON crm_activities(deal_id);
    `);

    // 9. Comprehensive Zoho-Grade Enterprise CRM Tables
    await client.query(`
      -- Alter existing clients & deals tables for deeper CRM intelligence
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS website VARCHAR(200);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS annual_revenue NUMERIC(15,2);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS city VARCHAR(100);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India';

      ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS loss_reason VARCHAR(100);
      ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS deal_type VARCHAR(50) DEFAULT 'new_business';

      ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 15;
      ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS outcome VARCHAR(50);
      ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';

      -- CRM Leads Pool
      CREATE TABLE IF NOT EXISTS crm_leads (
        id BIGSERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100),
        company VARCHAR(150),
        email VARCHAR(255),
        phone VARCHAR(50),
        source VARCHAR(50) DEFAULT 'Website',
        status VARCHAR(50) DEFAULT 'new',
        industry VARCHAR(100),
        annual_revenue NUMERIC(15,2),
        lead_score INTEGER DEFAULT 10,
        assigned_to BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
        description TEXT,
        is_converted BOOLEAN DEFAULT FALSE,
        converted_at TIMESTAMPTZ,
        converted_client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
        converted_contact_id BIGINT,
        converted_deal_id BIGINT REFERENCES crm_deals(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status);
      CREATE INDEX IF NOT EXISTS idx_crm_leads_converted ON crm_leads(is_converted);

      -- CRM B2B Contacts (linked to clients/accounts)
      CREATE TABLE IF NOT EXISTS crm_contacts (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(160),
        phone VARCHAR(50),
        position VARCHAR(100),
        department VARCHAR(100),
        is_primary BOOLEAN DEFAULT FALSE,
        linkedin_url VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_contacts_client ON crm_contacts(client_id);

      -- CRM Products & Services Catalog
      CREATE TABLE IF NOT EXISTS crm_products (
        id BIGSERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(100) DEFAULT 'Software',
        unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax_percentage NUMERIC(5,2) DEFAULT 18.0,
        is_active BOOLEAN DEFAULT TRUE,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- CRM Quotations (CPQ)
      CREATE TABLE IF NOT EXISTS crm_quotes (
        id BIGSERIAL PRIMARY KEY,
        quote_number VARCHAR(50) UNIQUE NOT NULL,
        subject VARCHAR(200) NOT NULL,
        deal_id BIGINT REFERENCES crm_deals(id) ON DELETE SET NULL,
        client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
        contact_id BIGINT REFERENCES crm_contacts(id) ON DELETE SET NULL,
        valid_until DATE,
        status VARCHAR(30) DEFAULT 'draft',
        subtotal NUMERIC(12,2) DEFAULT 0,
        discount_percentage NUMERIC(5,2) DEFAULT 0,
        discount_amount NUMERIC(12,2) DEFAULT 0,
        tax_amount NUMERIC(12,2) DEFAULT 0,
        grand_total NUMERIC(12,2) DEFAULT 0,
        terms_and_conditions TEXT,
        notes TEXT,
        created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_quotes_client ON crm_quotes(client_id);
      CREATE INDEX IF NOT EXISTS idx_crm_quotes_deal ON crm_quotes(deal_id);

      -- Quote Line Items
      CREATE TABLE IF NOT EXISTS crm_quote_items (
        id BIGSERIAL PRIMARY KEY,
        quote_id BIGINT REFERENCES crm_quotes(id) ON DELETE CASCADE,
        product_id BIGINT REFERENCES crm_products(id) ON DELETE SET NULL,
        description VARCHAR(255) NOT NULL,
        quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
        unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
        discount_percentage NUMERIC(5,2) DEFAULT 0,
        tax_percentage NUMERIC(5,2) DEFAULT 18.0,
        total_amount NUMERIC(12,2) NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_crm_quote_items_quote ON crm_quote_items(quote_id);

      -- CRM Phase 2: Email Templates & Communication Logs
      CREATE TABLE IF NOT EXISTS crm_email_templates (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(50) DEFAULT 'sales',
        subject VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        is_system BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS crm_emails (
        id BIGSERIAL PRIMARY KEY,
        recipient_email VARCHAR(160) NOT NULL,
        recipient_name VARCHAR(150),
        subject VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        related_type VARCHAR(30),
        related_id BIGINT,
        sent_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'sent',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_emails_related ON crm_emails(related_type, related_id);

      -- Extend leads & deals for UTM, assignments, loss notes
      ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100);
      ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100);
      ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100);
      ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS assigned_to BIGINT REFERENCES admin_users(id) ON DELETE SET NULL;
      ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS loss_notes TEXT;
    `);

    // Seed default Phase 2 Email Templates if table is empty
    await client.query(`
      INSERT INTO crm_email_templates (name, category, subject, body, is_system)
      SELECT 'Initial Discovery & Capabilities Introduction', 'lead_followup', 'Zorvixe Technologies — Software Architecture & Digital Innovation for {Company}', 'Hi {Name},\n\nI noticed {Company}''s impressive work and wanted to reach out regarding your tech roadmap. At Zorvixe Technologies, we specialize in high-performance cloud architecture, fullstack applications, and automated AI workflow pipelines.\n\nCould we connect for a brief 15-minute discovery call this Thursday at 3 PM to explore how we can support your tech objectives?\n\nBest regards,\n{MyName}\nZorvixe Technologies\ncontact@zorvixe.com', TRUE
      WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Initial Discovery & Capabilities Introduction');

      INSERT INTO crm_email_templates (name, category, subject, body, is_system)
      SELECT 'Commercial Proposal & Quotation Delivery', 'proposal', 'Commercial Proposal {QuoteNumber} for {Company} — Zorvixe Technologies', 'Dear {Name},\n\nThank you for sharing your requirements with us. Following our recent discussion, I have prepared proposal {QuoteNumber} for {Company} with an investment of {Amount}.\n\nYou can review the itemized scope and milestones in our proposal. Please let us know if you''d like to fine-tune any specifics.\n\nWarm regards,\n{MyName}\nZorvixe Technologies', TRUE
      WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Commercial Proposal & Quotation Delivery');

      INSERT INTO crm_email_templates (name, category, subject, body, is_system)
      SELECT 'Contract Finalization & Negotiation', 'negotiation', 'Re: Contract Finalization & Onboarding for {Company}', 'Hi {Name},\n\nWe are excited about the prospect of partnering with {Company}. We have reviewed the feedback and can confirm the updated milestones and terms as discussed.\n\nPlease let us know if we are good to proceed with the master services agreement (MSA) so our engineering squad can begin sprint planning.\n\nBest regards,\n{MyName}\nZorvixe Technologies', TRUE
      WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Contract Finalization & Negotiation');

      INSERT INTO crm_email_templates (name, category, subject, body, is_system)
      SELECT 'Deal Won & Project Kickoff Welcome', 'welcome', 'Welcome to Zorvixe Technologies! Project Kickoff & Next Steps for {Company}', 'Dear {Name},\n\nWelcome to Zorvixe Technologies! We are thrilled to kick off this project with {Company}.\n\nOur team is currently preparing your project board and environment setup. Your dedicated account manager and lead architect will schedule our official kickoff sync within 48 hours.\n\nWarm welcome,\n{MyName}\nZorvixe Technologies Team', TRUE
      WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Deal Won & Project Kickoff Welcome');

      INSERT INTO crm_email_templates (name, category, subject, body, is_system)
      SELECT 'Milestone Payment Reminder', 'payment', 'Invoice & Milestone Payment Reminder — {Company}', 'Dear {Name},\n\nThis is a friendly reminder regarding the upcoming milestone payment for {Company} in reference to {QuoteNumber} for {Amount}.\n\nPlease let us know once the transfer is initiated so our accounts team can share the official tax receipt.\n\nThank you,\nFinance & Accounts Team\nZorvixe Technologies', TRUE
      WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Milestone Payment Reminder');
    `);

    // Seed default products if empty
    await client.query(`
      INSERT INTO crm_products (code, name, category, unit_price, tax_percentage, description)
      VALUES 
        ('PROD-ENTERPRISE-APP', 'Enterprise Custom Software Development', 'Software', 350000.00, 18.00, 'End-to-end full stack web application architecture, dev & deployment'),
        ('PROD-AI-INTEGRATION', 'AI Agents & Workflow Automation', 'Service', 180000.00, 18.00, 'Custom LLM agent pipelines, API orchestrations and process automation'),
        ('PROD-CLOUD-DEVOPS', 'Cloud Infrastructure & DevOps Setup', 'Service', 95000.00, 18.00, 'AWS/GCP/Docker architecture, CI/CD pipelines and security audits'),
        ('PROD-ANNUAL-MAINT', 'Annual Enterprise Support & SLA', 'Maintenance', 120000.00, 18.00, '24/7 uptime monitoring, security patches and dedicated dev support')
      ON CONFLICT (code) DO NOTHING;
    `);

    // Clean up any old sample/test leads if present
    await client.query(`
      DELETE FROM crm_leads WHERE email IN ('vikram.sharma@apexretail.in', 'ananya@fincore.io');
    `);

    // Ensure profiles & salary structures exist for any existing users
    await client.query(`
      INSERT INTO hrms_employee_profiles (user_id, employee_code, employment_type, joining_date)
      SELECT id, 'ZOR-EMP-' || LPAD(id::text, 3, '0'), 'full_time', created_at::date
      FROM admin_users
      WHERE NOT EXISTS (SELECT 1 FROM hrms_employee_profiles WHERE hrms_employee_profiles.user_id = admin_users.id);

      INSERT INTO hrms_salary_structures (user_id, ctc_annual, basic_monthly, hra_monthly, special_allowance_monthly, conveyance_monthly, medical_allowance_monthly, pf_employee_monthly, esi_employee_monthly, professional_tax_monthly, effective_from)
      SELECT id, 600000, 25000, 10000, 10000, 2500, 2500, 1800, 375, 200, CURRENT_DATE
      FROM admin_users
      WHERE NOT EXISTS (SELECT 1 FROM hrms_salary_structures WHERE hrms_salary_structures.user_id = admin_users.id);
    `);

    // Seed default statutory compliance templates if empty
    await client.query(`
      INSERT INTO hrms_compliance_records (title, category, frequency, due_date, status, notes)
      SELECT 'EPF Monthly ECR Filing', 'PF_ESI', 'monthly', (CURRENT_DATE + INTERVAL '15 days')::date, 'compliant', 'Monthly EPF electronic return filing and payment'
      WHERE NOT EXISTS (SELECT 1 FROM hrms_compliance_records WHERE title = 'EPF Monthly ECR Filing');

      INSERT INTO hrms_compliance_records (title, category, frequency, due_date, status, notes)
      SELECT 'ESIC Monthly Contribution Return', 'PF_ESI', 'monthly', (CURRENT_DATE + INTERVAL '15 days')::date, 'compliant', 'Monthly ESIC payment and challan filing'
      WHERE NOT EXISTS (SELECT 1 FROM hrms_compliance_records WHERE title = 'ESIC Monthly Contribution Return');

      INSERT INTO hrms_compliance_records (title, category, frequency, due_date, status, notes)
      SELECT 'TDS Quarterly Return (Form 24Q)', 'TDS', 'quarterly', (CURRENT_DATE + INTERVAL '30 days')::date, 'compliant', 'Quarterly salary TDS return filing'
      WHERE NOT EXISTS (SELECT 1 FROM hrms_compliance_records WHERE title = 'TDS Quarterly Return (Form 24Q)');

      INSERT INTO hrms_compliance_records (title, category, frequency, due_date, status, notes)
      SELECT 'Professional Tax Remittance', 'Statutory', 'monthly', (CURRENT_DATE + INTERVAL '20 days')::date, 'compliant', 'State statutory Professional Tax deposit'
      WHERE NOT EXISTS (SELECT 1 FROM hrms_compliance_records WHERE title = 'Professional Tax Remittance');

      INSERT INTO hrms_compliance_records (title, category, frequency, due_date, status, notes)
      SELECT 'Labour Welfare Fund Compliance', 'Labour_Law', 'annual', (CURRENT_DATE + INTERVAL '60 days')::date, 'compliant', 'Annual labour welfare fund deduction and submission'
      WHERE NOT EXISTS (SELECT 1 FROM hrms_compliance_records WHERE title = 'Labour Welfare Fund Compliance');
    `);

    // Clean up sample job openings if any
    await client.query(`
      DELETE FROM hrms_job_openings WHERE title IN ('Senior Full Stack React / Node Developer', 'UI/UX Product Designer');
    `);


    // Seed default admin
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const seedUsername =
        (process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL.split('@')[0] || '').toLowerCase()
      const seedRole = (process.env.ADMIN_ROLE || 'admin').toLowerCase() === 'employee' ? 'employee' : 'admin'

      const { rows } = await client.query(
        'SELECT 1 FROM admin_users WHERE email=$1 OR username=$2 LIMIT 1',
        [process.env.ADMIN_EMAIL.toLowerCase(), seedUsername || null]
      )
      if (rows.length === 0) {
        const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)
        await client.query(
          `INSERT INTO admin_users (email, username, password_hash, name, role, is_active)
           VALUES ($1,$2,$3,$4,$5,TRUE)`,
          [process.env.ADMIN_EMAIL.toLowerCase(), seedUsername || null, hash, process.env.ADMIN_NAME || 'Administrator', seedRole]
        )
        console.log(`✅ Seeded admin: ${process.env.ADMIN_EMAIL} (${seedUsername || 'no-username'})`)
      }
    }

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('DB init error:', e)
    throw e
  } finally {
    client.release()
  }
}


// Add this function to calculate working days (including Saturdays)
function calculateWorkingDays(startDate, endDate) {
  let totalDays = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const day = current.getDay();
    // Count all days except Sunday (0)
    if (day !== 0) {
      totalDays++;
    }
    current.setDate(current.getDate() + 1);
  }
  return totalDays;
}

// Add this function to check monthly limits
// In app.js - Update the checkMonthlyLimit function

// Add after checkMonthlyLimit function

async function updateMonthlyAccruals(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch current balance
    const balanceRes = await client.query(
      'SELECT * FROM leave_balances WHERE employee_id = $1 FOR UPDATE',
      [userId]
    );

    if (balanceRes.rows.length === 0) {
      // Create balance record if it doesn't exist
      await client.query(
        `INSERT INTO leave_balances (employee_id) VALUES ($1)`,
        [userId]
      );
      await client.query('COMMIT');
      return;
    }

    const balance = balanceRes.rows[0];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let lastReset = balance.last_reset;
    if (!lastReset) {
      // First time – just set last_reset to now and reset monthly counters
      // No accrual added on first setup (only reset counters)
      await client.query(
        `UPDATE leave_balances
         SET sick_used_this_month = 0,
             casual_used_this_month = 0,
             last_reset = NOW()
         WHERE employee_id = $1`,
        [userId]
      );
      await client.query('COMMIT');
      return;
    }

    const lastResetDate = new Date(lastReset);
    const lastResetMonth = lastResetDate.getMonth();
    const lastResetYear = lastResetDate.getFullYear();

    // If last reset was in a previous month or year
    if (lastResetYear < currentYear || (lastResetYear === currentYear && lastResetMonth < currentMonth)) {
      // Calculate number of months passed
      let monthsPassed = (currentYear - lastResetYear) * 12 + (currentMonth - lastResetMonth);
      if (monthsPassed <= 0) monthsPassed = 1;

      // Add monthly accruals (sick +1, casual +1 per month)
      // ✅ No inline comments inside the SQL string
      await client.query(
        `UPDATE leave_balances
         SET sick_balance = sick_balance + $1,
             casual_balance = casual_balance + $2,
             sick_used_this_month = 0,
             casual_used_this_month = 0,
             last_reset = NOW()
         WHERE employee_id = $3`,
        [monthsPassed, monthsPassed, userId]
      );
    } else {
      // Already in current month – just ensure monthly counters are zero
      await client.query(
        `UPDATE leave_balances
         SET sick_used_this_month = 0,
             casual_used_this_month = 0
         WHERE employee_id = $1`,
        [userId]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function checkMonthlyLimit(userId, leaveType, requestedDays) {
  // First, update monthly accruals for this user
  await updateMonthlyAccruals(userId);

  const balanceQuery = await pool.query(
    'SELECT * FROM leave_balances WHERE employee_id = $1',
    [userId]
  );

  if (balanceQuery.rows.length === 0) return true;

  const balance = balanceQuery.rows[0];

  if (leaveType === 'sick') {
    const monthlyLimit = 1;
    const usedThisMonth = Number(balance.sick_used_this_month) || 0;
    const availableThisMonth = monthlyLimit - usedThisMonth;
    return requestedDays <= availableThisMonth;
  }

  // In checkMonthlyLimit, find this block:
  if (leaveType === 'casual') {
    const monthlyLimit = 1;               // changed from 2 to 1
    const usedThisMonth = Number(balance.casual_used_this_month) || 0;
    const availableThisMonth = monthlyLimit - usedThisMonth;
    return requestedDays <= availableThisMonth;
  }

  return true;
}



/* ------------------------------- Auth Utils ------------------------------- */
function signAdminToken(admin) {
  const payload = { sub: admin.id, email: admin.email, name: admin.name, role: admin.role, username: admin.username }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' })
}
function getTokenFromReq(req) {
  const auth = req.headers.authorization || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  if (req.cookies && req.cookies.admin_token) return req.cookies.admin_token
  return null
}
function requireAuth(req, res, next) {
  try {
    const token = getTokenFromReq(req)
    if (!token) return res.status(401).json({ message: 'Missing token' })
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (!decoded?.role) return res.status(403).json({ message: 'Forbidden' })
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid token' })
  }
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' })
    if (req.user.role !== role) return res.status(403).json({ message: 'Forbidden' })
    next()
  }
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => requireRole('admin')(req, res, next))
}

/* --------------------------------- Health -------------------------------- */
app.get('/api/health/live', (_req, res) => res.json({ status: 'ok' }))
app.get('/api/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'db_unavailable' })
  }
})

/* ------------------------------ Admin Auth API ---------------------------- */
// Login with email OR username (identifier)
app.post('/api/admin/login', async (req, res) => {
  try {
    const identifier = (req.body.identifier || req.body.email || '').toString().trim().toLowerCase()
    const password = (req.body.password || '').toString()
    if (!identifier || !password) return res.status(400).json({ message: 'Identifier and password required' })

    const isEmail = identifier.includes('@')
    const { rows } = await pool.query(
      isEmail
        ? 'SELECT * FROM admin_users WHERE email=$1 LIMIT 1'
        : 'SELECT * FROM admin_users WHERE username=$1 LIMIT 1',
      [identifier]
    )
    const admin = rows[0]
    if (!admin || !admin.is_active) return res.status(401).json({ message: 'Invalid credentials' })

    const ok = await bcrypt.compare(password, admin.password_hash)
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

    await pool.query('UPDATE admin_users SET last_login_at=NOW(), last_seen_at=NOW() WHERE id=$1', [admin.id])

    // Close any previous open session for this user if it was left open
    await pool.query(
      `UPDATE user_login_logs
       SET logout_at = NOW(),
           session_duration_minutes = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - login_at)) / 60))
       WHERE user_id = $1 AND logout_at IS NULL`,
      [admin.id]
    ).catch(err => console.error('Error closing prior session:', err));

    // Record new login log
    let sessionId = null;
    try {
      const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '').toString().split(',')[0].trim();
      const userAgent = (req.headers['user-agent'] || '').toString();
      const logRes = await pool.query(
        `INSERT INTO user_login_logs (user_id, login_at, ip_address, user_agent)
         VALUES ($1, NOW(), $2, $3)
         RETURNING id`,
        [admin.id, ip, userAgent]
      );
      sessionId = logRes.rows[0]?.id;
    } catch (logErr) {
      console.error('Error creating login log:', logErr);
    }

    const token = signAdminToken(admin)
    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    }
    res.cookie('admin_token', token, cookieOpts)
    res.json({
      token,
      sessionId,
      admin: {
        id: admin.id, email: admin.email, username: admin.username, name: admin.name,
        role: admin.role, is_active: admin.is_active, last_login_at: admin.last_login_at
      },
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})
app.post('/api/admin/logout', async (req, res) => {
  try {
    let userId = null;
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.cookies && req.cookies.admin_token) {
      token = req.cookies.admin_token;
    }
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        userId = payload.sub;
      } catch (err) { }
    }
    if (!userId && req.body && req.body.userId) {
      userId = req.body.userId;
    }
    const sessionId = req.body && req.body.sessionId ? Number(req.body.sessionId) : null;

    if (userId) {
      await pool.query('UPDATE admin_users SET last_seen_at = NULL WHERE id = $1', [userId]).catch(() => { });
    }

    if (sessionId) {
      await pool.query(
        `UPDATE user_login_logs
         SET logout_at = NOW(),
             session_duration_minutes = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - login_at)) / 60))
         WHERE id = $1 AND logout_at IS NULL`,
        [sessionId]
      );
    } else if (userId) {
      await pool.query(
        `UPDATE user_login_logs
         SET logout_at = NOW(),
             session_duration_minutes = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - login_at)) / 60))
         WHERE id = (
           SELECT id FROM user_login_logs
           WHERE user_id = $1 AND logout_at IS NULL
           ORDER BY login_at DESC
           LIMIT 1
         )`,
        [userId]
      );
    }
  } catch (err) {
    console.error('Error recording logout:', err);
  }

  res.clearCookie('admin_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  res.json({ message: 'Logged out' })
})
app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ me: req.user })
})

/* ----------------------------- Presence & Status System ----------------------------- */
const VALID_PRESENCE_STATUSES = ['Available', 'Away', 'Busy', 'Invisible', 'Do not disturb'];
const PRESENCE_ONLINE_WINDOW_MS = 3 * 60 * 1000; // 3 minutes active heartbeat window
const DEFAULT_CHAT_PREFS = {
  soundNotif: true,
  oneOneChats: true,
  mentionNotif: true,
  pauseChat: false
};

function computeDndUntil(durationLabel) {
  if (!durationLabel) return null;
  const now = new Date();
  switch (durationLabel) {
    case '15 Mins':
      return new Date(now.getTime() + 15 * 60 * 1000);
    case '30 Mins':
      return new Date(now.getTime() + 30 * 60 * 1000);
    case '1 Hour':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case '2 Hours':
      return new Date(now.getTime() + 2 * 60 * 60 * 1000);
    case 'Until tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow;
    }
    default:
      return new Date(now.getTime() + 15 * 60 * 1000);
  }
}

function computeEffectivePresence(row) {
  if (!row) return { effective_status: 'Offline', is_online: false };
  const rawStatus = row.presence_status || 'Available';
  const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  const isRecentlySeen = lastSeen > 0 && (Date.now() - lastSeen) <= PRESENCE_ONLINE_WINDOW_MS;

  if (!row.is_active || !isRecentlySeen || rawStatus === 'Invisible') {
    return { effective_status: 'Offline', is_online: false };
  }

  if (rawStatus === 'Do not disturb' && row.dnd_until && new Date(row.dnd_until).getTime() <= Date.now()) {
    return { effective_status: 'Available', is_online: true };
  }

  return { effective_status: rawStatus, is_online: true };
}

// Get current user's presence & chat preferences (also refreshes last_seen_at and expires DND)
app.get('/api/presence/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { rows } = await pool.query(
      `UPDATE admin_users
       SET last_seen_at = NOW(),
           presence_status = CASE
             WHEN presence_status = 'Do not disturb' AND dnd_until IS NOT NULL AND dnd_until <= NOW()
             THEN 'Available'
             ELSE presence_status
           END,
           dnd_until = CASE
             WHEN presence_status = 'Do not disturb' AND dnd_until IS NOT NULL AND dnd_until <= NOW()
             THEN NULL
             ELSE dnd_until
           END
       WHERE id = $1
       RETURNING id, presence_status, dnd_until, last_seen_at, chat_preferences`,
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const row = rows[0];
    res.json({
      success: true,
      presence: {
        status: row.presence_status || 'Available',
        dnd_until: row.dnd_until || null,
        last_seen_at: row.last_seen_at,
        chat_preferences: { ...DEFAULT_CHAT_PREFS, ...(row.chat_preferences || {}) }
      }
    });
  } catch (error) {
    console.error('Get presence error:', error);
    res.status(500).json({ success: false, message: 'Failed to load presence status' });
  }
});

// Update current user's presence status or chat preferences
app.patch('/api/presence/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { presence_status, dnd_duration, dnd_until, chat_preferences } = req.body || {};

    let nextStatus = null;
    if (presence_status !== undefined) {
      if (!VALID_PRESENCE_STATUSES.includes(presence_status)) {
        return res.status(400).json({ success: false, message: 'Invalid presence status' });
      }
      nextStatus = presence_status;
    }

    let nextDndUntil = undefined;
    if (nextStatus === 'Do not disturb') {
      nextDndUntil = dnd_until ? new Date(dnd_until) : computeDndUntil(dnd_duration || '15 Mins');
    } else if (nextStatus !== null) {
      nextDndUntil = null;
    }

    const currentRes = await pool.query(
      `SELECT presence_status, dnd_until, chat_preferences FROM admin_users WHERE id = $1`,
      [userId]
    );
    if (currentRes.rowCount === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const cur = currentRes.rows[0];
    const finalStatus = nextStatus !== null ? nextStatus : (cur.presence_status || 'Available');
    const finalDndUntil = nextDndUntil !== undefined ? nextDndUntil : cur.dnd_until;
    const mergedPrefs = chat_preferences && typeof chat_preferences === 'object'
      ? { ...DEFAULT_CHAT_PREFS, ...(cur.chat_preferences || {}), ...chat_preferences }
      : { ...DEFAULT_CHAT_PREFS, ...(cur.chat_preferences || {}) };

    const updRes = await pool.query(
      `UPDATE admin_users
       SET presence_status = $1,
           dnd_until = $2,
           chat_preferences = $3::jsonb,
           last_seen_at = NOW()
       WHERE id = $4
       RETURNING id, presence_status, dnd_until, last_seen_at, chat_preferences`,
      [finalStatus, finalDndUntil, JSON.stringify(mergedPrefs), userId]
    );

    const row = updRes.rows[0];
    res.json({
      success: true,
      presence: {
        status: row.presence_status,
        dnd_until: row.dnd_until,
        last_seen_at: row.last_seen_at,
        chat_preferences: { ...DEFAULT_CHAT_PREFS, ...(row.chat_preferences || {}) }
      }
    });
  } catch (error) {
    console.error('Update presence error:', error);
    res.status(500).json({ success: false, message: 'Failed to update presence status' });
  }
});

// Periodic heartbeat to keep user active/online & check expired DND
app.post('/api/presence/heartbeat', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { rows } = await pool.query(
      `UPDATE admin_users
       SET last_seen_at = NOW(),
           presence_status = CASE
             WHEN presence_status = 'Do not disturb' AND dnd_until IS NOT NULL AND dnd_until <= NOW()
             THEN 'Available'
             ELSE presence_status
           END,
           dnd_until = CASE
             WHEN presence_status = 'Do not disturb' AND dnd_until IS NOT NULL AND dnd_until <= NOW()
             THEN NULL
             ELSE dnd_until
           END
       WHERE id = $1
       RETURNING id, presence_status, dnd_until, last_seen_at, chat_preferences`,
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const row = rows[0];
    res.json({
      success: true,
      presence: {
        status: row.presence_status || 'Available',
        dnd_until: row.dnd_until || null,
        last_seen_at: row.last_seen_at,
        chat_preferences: { ...DEFAULT_CHAT_PREFS, ...(row.chat_preferences || {}) }
      }
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ success: false, message: 'Heartbeat failed' });
  }
});

/* ----------------------------- My Account API ----------------------------- */

// 1. Get logged-in user's complete account profile & stats
app.get('/api/admin/account', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const userRes = await pool.query(
      `SELECT id, email, username, name, role, department, position, phone, is_active, last_login_at, created_at
       FROM admin_users
       WHERE id = $1`,
      [userId]
    );
    if (userRes.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const profile = userRes.rows[0];

    // Additional quick stats for profile dashboard
    const [ticketsRes, leavesRes, loginsRes] = await Promise.all([
      pool.query(
        `SELECT 
           COUNT(*) FILTER (WHERE created_by = $1)::int AS tickets_created,
           COUNT(*) FILTER (WHERE assigned_to = $1)::int AS tickets_assigned
         FROM tickets`,
        [userId]
      ).catch(() => ({ rows: [{ tickets_created: 0, tickets_assigned: 0 }] })),
      pool.query(
        `SELECT sick_balance, casual_balance, annual_balance, sick_used_this_month, casual_used_this_month
         FROM leave_balances
         WHERE employee_id = $1`,
        [userId]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT COUNT(*)::int AS total_logins, MAX(login_at) AS last_session
         FROM user_login_logs
         WHERE user_id = $1`,
        [userId]
      ).catch(() => ({ rows: [{ total_logins: 0, last_session: null }] }))
    ]);

    res.json({
      success: true,
      user: profile,
      stats: {
        tickets: ticketsRes.rows[0] || { tickets_created: 0, tickets_assigned: 0 },
        leaves: leavesRes.rows[0] || null,
        logins: loginsRes.rows[0] || { total_logins: 0, last_session: null }
      }
    });
  } catch (error) {
    console.error('Fetch account error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching account' });
  }
});

// 2. Update logged-in user's profile information
app.patch('/api/admin/account', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { name, username, phone, department, position } = req.body || {};

    const sets = [];
    const params = [];

    if (typeof name === 'string' && name.trim()) {
      params.push(name.trim());
      sets.push(`name=$${params.length}`);
    }
    if (typeof username === 'string') {
      const cleanUsername = username.trim().toLowerCase() || null;
      params.push(cleanUsername);
      sets.push(`username=$${params.length}`);
    }
    if (typeof phone === 'string' || phone === null) {
      params.push(phone ? phone.trim() : null);
      sets.push(`phone=$${params.length}`);
    }
    if (typeof department === 'string' || department === null) {
      params.push(department ? department.trim() : null);
      sets.push(`department=$${params.length}`);
    }
    if (typeof position === 'string' || position === null) {
      params.push(position ? position.trim() : null);
      sets.push(`position=$${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'No changes provided' });
    }

    params.push(userId);
    const updateQuery = `
      UPDATE admin_users
      SET ${sets.join(', ')}
      WHERE id = $${params.length}
      RETURNING id, email, username, name, role, department, position, phone, is_active, last_login_at, created_at
    `;
    const { rows } = await pool.query(updateQuery, params);

    res.json({
      success: true,
      message: 'Account profile updated successfully',
      user: rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Username is already taken' });
    }
    console.error('Update account error:', error);
    res.status(500).json({ success: false, message: 'Server error updating account' });
  }
});

// 3. Change logged-in user's password
app.post('/api/admin/account/change-password', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { current_password, new_password } = req.body || {};

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }

    if (typeof new_password !== 'string' || new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const userRes = await pool.query('SELECT password_hash FROM admin_users WHERE id = $1', [userId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(current_password, userRes.rows[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect current password' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error updating password' });
  }
});

/* ------------------------- User Login/Logout Logs API --------------------- */
// List login/logout logs with date, user, search filters and pagination
app.get('/api/admin/login-logs', requireAuth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 500);
    const offset = (page - 1) * limit;

    const { date, userId, search } = req.query;

    let where = [];
    let params = [];
    let paramCount = 0;

    // Permissions: Admins can see all users or filter by specific user.
    // Non-admins can only see their own login/logout history.
    if (!isAdmin(req)) {
      paramCount++;
      where.push(`l.user_id = $${paramCount}`);
      params.push(req.user.sub);
    } else if (userId && userId !== 'all') {
      paramCount++;
      where.push(`l.user_id = $${paramCount}`);
      params.push(Number(userId));
    }

    // Date filtering (YYYY-MM-DD)
    if (date) {
      paramCount++;
      const dStart = new Date(date);
      dStart.setHours(0, 0, 0, 0);
      where.push(`l.login_at >= $${paramCount}`);
      params.push(dStart);

      paramCount++;
      const dEnd = new Date(date);
      dEnd.setDate(dEnd.getDate() + 1);
      dEnd.setHours(0, 0, 0, 0);
      where.push(`l.login_at < $${paramCount}`);
      params.push(dEnd);
    }

    // Search filtering (name, email, username, ip)
    if (search && search.trim()) {
      paramCount++;
      const term = `%${search.trim().toLowerCase()}%`;
      where.push(`(LOWER(u.name) LIKE $${paramCount} OR LOWER(u.email) LIKE $${paramCount} OR LOWER(u.username) LIKE $${paramCount} OR LOWER(COALESCE(l.ip_address, '')) LIKE $${paramCount})`);
      params.push(term);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Total count
    const countRes = await pool.query(
      `SELECT COUNT(*)::BIGINT AS total
       FROM user_login_logs l
       JOIN admin_users u ON u.id = l.user_id
       ${whereSql}`,
      params
    );
    const total = Number(countRes.rows[0]?.total || 0);

    // Get logs with user details
    const dataParams = [...params, limit, offset];
    const dataRes = await pool.query(
      `SELECT 
        l.id,
        l.user_id,
        u.name AS user_name,
        u.email AS user_email,
        u.username AS user_username,
        u.role AS user_role,
        u.department AS user_department,
        l.login_at,
        l.logout_at,
        l.session_duration_minutes,
        l.ip_address,
        l.user_agent,
        CASE 
          WHEN l.logout_at IS NULL AND l.login_at >= NOW() - INTERVAL '24 hours' THEN 'active'
          WHEN l.logout_at IS NULL THEN 'expired'
          ELSE 'completed'
        END AS session_status
       FROM user_login_logs l
       JOIN admin_users u ON u.id = l.user_id
       ${whereSql}
       ORDER BY l.login_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    // Compute stats for today
    const currentUserId = req.user.sub;
    const isUserAdmin = isAdmin(req);
    const statsUserFilter = (!isUserAdmin || (userId && userId !== 'all'))
      ? `AND l.user_id = ${Number(!isUserAdmin ? currentUserId : userId)}`
      : '';

    const statsRes = await pool.query(`
      SELECT 
        COUNT(*)::INT AS total_logins_today,
        COUNT(CASE WHEN l.logout_at IS NULL AND l.login_at >= NOW() - INTERVAL '24 hours' THEN 1 END)::INT AS currently_active,
        MIN(l.login_at) FILTER (WHERE l.login_at >= CURRENT_DATE) AS first_login_today,
        MAX(l.logout_at) FILTER (WHERE l.logout_at >= CURRENT_DATE) AS last_logout_today
      FROM user_login_logs l
      WHERE l.login_at >= CURRENT_DATE ${statsUserFilter}
    `).catch(() => ({ rows: [{}] }));

    const stats = statsRes.rows[0] || {
      total_logins_today: 0,
      currently_active: 0,
      first_login_today: null,
      last_logout_today: null
    };

    res.json({
      success: true,
      logs: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      },
      stats
    });
  } catch (e) {
    console.error('List login logs error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Export login/logout logs to CSV
app.get('/api/admin/login-logs/export.csv', requireAuth, async (req, res) => {
  try {
    const { date, userId, search } = req.query;

    let where = [];
    let params = [];
    let paramCount = 0;

    if (!isAdmin(req)) {
      paramCount++;
      where.push(`l.user_id = $${paramCount}`);
      params.push(req.user.sub);
    } else if (userId && userId !== 'all') {
      paramCount++;
      where.push(`l.user_id = $${paramCount}`);
      params.push(Number(userId));
    }

    if (date) {
      paramCount++;
      const dStart = new Date(date);
      dStart.setHours(0, 0, 0, 0);
      where.push(`l.login_at >= $${paramCount}`);
      params.push(dStart);

      paramCount++;
      const dEnd = new Date(date);
      dEnd.setDate(dEnd.getDate() + 1);
      dEnd.setHours(0, 0, 0, 0);
      where.push(`l.login_at < $${paramCount}`);
      params.push(dEnd);
    }

    if (search && search.trim()) {
      paramCount++;
      const term = `%${search.trim().toLowerCase()}%`;
      where.push(`(LOWER(u.name) LIKE $${paramCount} OR LOWER(u.email) LIKE $${paramCount} OR LOWER(u.username) LIKE $${paramCount} OR LOWER(COALESCE(l.ip_address, '')) LIKE $${paramCount})`);
      params.push(term);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT 
        l.id,
        u.name AS user_name,
        u.email AS user_email,
        u.role AS user_role,
        u.department AS user_department,
        l.login_at,
        l.logout_at,
        l.session_duration_minutes,
        l.ip_address,
        CASE 
          WHEN l.logout_at IS NULL AND l.login_at >= NOW() - INTERVAL '24 hours' THEN 'Active'
          WHEN l.logout_at IS NULL THEN 'Auto-Closed'
          ELSE 'Logged Out'
        END AS status
       FROM user_login_logs l
       JOIN admin_users u ON u.id = l.user_id
       ${whereSql}
       ORDER BY l.login_at DESC
       LIMIT 5000`,
      params
    );

    const header = [
      'Log ID',
      'User Name',
      'Email',
      'Role',
      'Department',
      'Login Date & Time',
      'Logout Date & Time',
      'Duration (Minutes)',
      'Status',
      'IP Address'
    ];

    const esc = (v) => {
      if (v == null) return '';
      const s = String(v).replaceAll('"', '""').replaceAll('\n', ' ').replaceAll('\r', ' ');
      return `"${s}"`;
    };

    const csvLines = [header.join(',')];
    rows.forEach((r) => {
      const row = [
        r.id,
        r.user_name,
        r.user_email,
        r.user_role,
        r.user_department || '',
        r.login_at ? new Date(r.login_at).toLocaleString() : '',
        r.logout_at ? new Date(r.logout_at).toLocaleString() : (r.status === 'Active' ? 'Still Logged In' : 'None'),
        r.session_duration_minutes ?? (r.status === 'Active' ? 'Ongoing' : ''),
        r.status,
        r.ip_address || ''
      ];
      csvLines.push(row.map(esc).join(','));
    });

    const csv = csvLines.join('\n');
    const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="login-timings-${ts}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error('Export login logs error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ------------------------- Admin Users Management API --------------------- */
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200)
    const offset = (page - 1) * limit
    const q = (req.query.search || '').toString().trim().toLowerCase()

    const where = []
    const params = []
    if (q) {
      params.push(`%${q}%`)
      const idx = params.length
      where.push(`(LOWER(name) LIKE $${idx} OR LOWER(email) LIKE $${idx} OR LOWER(username) LIKE $${idx} OR LOWER(COALESCE(department, '')) LIKE $${idx} OR LOWER(COALESCE(position, '')) LIKE $${idx})`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const c = await pool.query(`SELECT COUNT(*)::BIGINT AS total FROM admin_users ${whereSql}`, params)
    const total = Number(c.rows[0]?.total || 0)

    const data = await pool.query(
      `SELECT id, email, username, name, role, department, position, phone, is_active, last_login_at,
              presence_status, dnd_until, last_seen_at, created_at, updated_at
       FROM admin_users
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )

    const enrichedUsers = data.rows.map((u) => ({
      ...u,
      ...computeEffectivePresence(u)
    }))

    res.json({ data: enrichedUsers, page, limit, total, total_pages: Math.ceil(total / limit) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const {
      name = '',
      email = '',
      username = '',
      role = 'employee',
      password = '',
      department = '',
      position = ''
    } = req.body || {}
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email, password required' })
    const roleVal = role === 'admin' ? 'admin' : 'employee'
    const uname = username ? username.toLowerCase() : null
    const dept = (department || '').trim() || null
    const pos = (position || '').trim() || null

    const hash = await bcrypt.hash(password, 12)
    const sql = `
      INSERT INTO admin_users (name, email, username, role, password_hash, is_active, department, position)
      VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)
      RETURNING id, email, username, name, role, department, position, phone, is_active, created_at, updated_at
    `
    const { rows } = await pool.query(sql, [name, email.toLowerCase(), uname, roleVal, hash, dept, pos])

    // Initialize leave balance for new user
    await pool.query(`
      INSERT INTO leave_balances (employee_id, sick_balance, casual_balance, annual_balance, maternity_balance, paternity_balance)
      VALUES ($1, 1, 1, 21, 180, 15)
      ON CONFLICT (employee_id) DO NOTHING
    `, [rows[0].id]).catch(err => console.error('Leave balance init error for user:', err));

    // Send welcome email with login credentials (non-blocking)
    if (rows[0] && rows[0].email) {
      sendUserWelcomeEmail({
        to: rows[0].email,
        name: rows[0].name,
        username: rows[0].username || rows[0].email,
        email: rows[0].email,
        password: password,
        role: rows[0].role,
        department: rows[0].department,
        position: rows[0].position
      }).catch(err => console.error('[Mailer] Error sending user welcome email:', err));
    }

    res.status(201).json({ message: 'User created', user: rows[0] })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ message: 'Email or username already exists' })
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})
app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' })
    const sets = []
    const params = []
    const { name, email, username, role, is_active, password, department, position } = req.body || {}
    if (typeof name === 'string') { params.push(name); sets.push(`name=$${params.length}`) }
    if (typeof email === 'string') { params.push(email.toLowerCase()); sets.push(`email=$${params.length}`) }
    if (typeof username === 'string') { params.push(username.toLowerCase() || null); sets.push(`username=$${params.length}`) }
    if (role === 'admin' || role === 'employee') { params.push(role); sets.push(`role=$${params.length}`) }
    if (typeof is_active === 'boolean') { params.push(is_active); sets.push(`is_active=$${params.length}`) }
    if (typeof department === 'string' || department === null) {
      params.push(department ? department.trim() : null)
      sets.push(`department=$${params.length}`)
    }
    if (typeof position === 'string' || position === null) {
      params.push(position ? position.trim() : null)
      sets.push(`position=$${params.length}`)
    }
    if (typeof password === 'string' && password.length >= 6) {
      const hash = await bcrypt.hash(password, 12)
      params.push(hash); sets.push(`password_hash=$${params.length}`)
    }
    if (!sets.length) return res.status(400).json({ message: 'No changes submitted' })
    params.push(id)
    const { rows } = await pool.query(
      `UPDATE admin_users SET ${sets.join(', ')} WHERE id=$${params.length}
       RETURNING id, email, username, name, role, department, position, phone, is_active, last_login_at, created_at, updated_at`,
      params
    )

    // If password was updated, email the user with their new password
    if (typeof password === 'string' && password.length >= 6 && rows[0]?.email) {
      sendUserWelcomeEmail({
        to: rows[0].email,
        name: rows[0].name,
        username: rows[0].username || rows[0].email,
        email: rows[0].email,
        password: password,
        role: rows[0].role,
        department: rows[0].department,
        position: rows[0].position
      }).catch(err => console.error('[Mailer] Error sending updated credentials email:', err));
    }

    res.json({ message: 'Updated', user: rows[0] })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ message: 'Email or username already exists' })
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' })
    if (req.user.sub === id) return res.status(400).json({ message: 'You cannot delete yourself' })
    const { rowCount } = await pool.query('DELETE FROM admin_users WHERE id=$1', [id])
    if (!rowCount) return res.status(404).json({ message: 'Not found' })
    res.json({ message: 'Deleted' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Test email endpoint for administrators to verify SMTP configuration
app.post('/api/admin/test-email', requireAdmin, async (req, res) => {
  try {
    const targetEmail = (req.body.to || req.user.email || '').trim();
    if (!targetEmail) return res.status(400).json({ success: false, message: 'Recipient email is required' });

    const result = await sendEmail({
      to: targetEmail,
      subject: 'Test Email from Zorvixe Technologies',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0a66c2; margin-top: 0;">Zorvixe Technologies SMTP Test</h2>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">
            Success! If you received this email, the SMTP server configuration for Zorvixe Technologies Workplace Management is working properly.
          </p>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #475569; margin-top: 16px;">
            <strong>Test Timestamp:</strong> ${new Date().toLocaleString()}
          </div>
        </div>
      `,
      text: 'Success! Your SMTP configuration on Zorvixe Technologies is working properly.'
    });

    res.json({ success: true, message: `Test email processed for ${targetEmail}`, result });
  } catch (err) {
    console.error('[Mailer] Test email error:', err);
    res.status(500).json({ success: false, message: 'Failed to send test email: ' + err.message });
  }
});

/* ---------------------------- Contact: Public API ------------------------- */
const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
})
function validateContactPayload(payload) {
  const errors = {}
  const name = (payload.name || '').trim()
  const email = (payload.email || '').trim()
  const phone = (payload.phone || '').trim()
  const subject = (payload.subject || '').trim()
  const message = (payload.message || '').trim()

  if (!name) errors.name = 'Name is required'
  else if (name.length < 3) errors.name = 'Name must be at least 3 characters'
  else if (!/^[a-zA-Z\s]+$/.test(name)) errors.name = 'Only letters and spaces allowed'

  if (!email) errors.email = 'Email is required'
  else if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email)) errors.email = 'Invalid email format'

  if (!phone) errors.phone = 'Phone number is required'
  else if (!/^\d{10}$/.test(phone)) errors.phone = 'Phone number must be 10 digits'
  else if (!/^[6-9]/.test(phone)) errors.phone = 'Phone number must start with 6-9'

  if (!subject) errors.subject = 'Please select a service'
  if (!message) errors.message = 'Message is required'
  else if (message.length < 10) errors.message = 'Message must be at least 10 characters'

  return { errors, valid: Object.keys(errors).length === 0, data: { name, email, phone, subject, message } }
}
app.post('/api/contact/submit', submitLimiter, async (req, res) => {
  try {
    const { valid, errors, data } = validateContactPayload(req.body || {})
    if (!valid) return res.status(400).json({ errors })
    const { name, email, phone, subject, message } = data
    await pool.query(
      `INSERT INTO contacts (name, email, phone, subject, message) VALUES ($1,$2,$3,$4,$5)`,
      [name, email, phone, subject, message]
    )

    // Notify administrator of new website contact inquiry (non-blocking)
    const adminAlertEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || 'admin@zorvixe.com';
    sendContactFormAlert({
      to: adminAlertEmail,
      name,
      email,
      phone,
      subject,
      message
    }).catch(err => console.error('[Mailer] Error sending contact alert email:', err));

    res.json({ message: 'Contact form submitted' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

/* ---------------------------- Contact: Admin API -------------------------- */
function buildContactsWhere({ search, status, from, to }) {
  const where = []
  const params = []
  if (status) { params.push(status); where.push(`status = $${params.length}`) }
  if (search) {
    params.push(`%${search}%`)
    const idx = params.length
    where.push(`(name ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx} OR subject ILIKE $${idx} OR message ILIKE $${idx})`)
  }
  if (from) { params.push(new Date(from)); where.push(`created_at >= $${params.length}`) }
  if (to) { const d = new Date(to); d.setDate(d.getDate() + 1); params.push(d); where.push(`created_at < $${params.length}`) }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}
const ALLOWED_SORT = new Set(['created_at', 'status', 'name', 'email'])
const normalizeSort = (s) => (ALLOWED_SORT.has(s) ? s : 'created_at')
const normalizeOrder = (o) => (['asc', 'desc'].includes((o || '').toLowerCase()) ? o.toUpperCase() : 'DESC')

app.get('/api/contacts', requireAuth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200)
    const offset = (page - 1) * limit
    const search = (req.query.search || '').toString().trim()
    const status = (req.query.status || '').toString().trim()
    const from = (req.query.from || '').toString().trim()
    const to = (req.query.to || '').toString().trim()
    const sort = normalizeSort((req.query.sort || '').toString().trim())
    const order = normalizeOrder((req.query.order || '').toString().trim())

    const { whereSql, params } = buildContactsWhere({ search, status, from, to })
    const countSql = `SELECT COUNT(*)::BIGINT AS total FROM contacts ${whereSql}`
    const { rows: countRows } = await pool.query(countSql, params)
    const total = Number(countRows[0]?.total || 0)

    const dataSql = `
      SELECT id, name, email, phone, subject, message, status, admin_notes, created_at, updated_at
      FROM contacts
      ${whereSql}
      ORDER BY ${sort} ${order}
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}`
    const { rows } = await pool.query(dataSql, [...params, limit, offset])

    res.json({ data: rows, page, limit, total, total_pages: Math.ceil(total / limit) })
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }) }
})
app.get('/api/contacts/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' })
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, subject, message, status, admin_notes, created_at, updated_at FROM contacts WHERE id=$1`,
      [id]
    )
    const row = rows[0]
    if (!row) return res.status(404).json({ message: 'Not found' })
    res.json(row)
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }) }
})
app.patch('/api/contacts/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' })
    const status = (req.body.status || '').toString().trim()
    const admin_notes = (req.body.admin_notes || '').toString()

    const fields = []
    const params = []
    if (status) {
      const allowed = new Set(['new', 'viewed', 'responded', 'closed'])
      if (!allowed.has(status)) return res.status(400).json({ message: 'Invalid status' })
      params.push(status); fields.push(`status=$${params.length}`)
    }
    if (typeof admin_notes === 'string') { params.push(admin_notes); fields.push(`admin_notes=$${params.length}`) }
    if (!fields.length) return res.status(400).json({ message: 'No changes submitted' })

    params.push(id)
    const { rows } = await pool.query(`UPDATE contacts SET ${fields.join(', ')} WHERE id=$${params.length} RETURNING *`, params)
    res.json({ message: 'Updated', contact: rows[0] })
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }) }
})
app.delete('/api/contacts/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' })
    const { rowCount } = await pool.query(`DELETE FROM contacts WHERE id=$1`, [id])
    if (!rowCount) return res.status(404).json({ message: 'Not found' })
    res.json({ message: 'Deleted' })
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }) }
})
app.post('/api/contacts/bulk', requireAdmin, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : []
    const action = (req.body.action || '').toString().trim()
    if (!ids.length) return res.status(400).json({ message: 'No ids provided' })
    if (action === 'delete') {
      const { rowCount } = await pool.query(`DELETE FROM contacts WHERE id = ANY($1::bigint[])`, [ids])
      return res.json({ message: 'Deleted', count: rowCount })
    }
    if (action === 'status') {
      const status = (req.body.status || '').toString().trim()
      const allowed = new Set(['new', 'viewed', 'responded', 'closed'])
      if (!allowed.has(status)) return res.status(400).json({ message: 'Invalid status' })
      const { rowCount } = await pool.query(`UPDATE contacts SET status=$1 WHERE id = ANY($2::bigint[])`, [status, ids])
      return res.json({ message: 'Status updated', count: rowCount })
    }
    return res.status(400).json({ message: 'Invalid action' })
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }) }
})
app.get('/api/contacts/export.csv', requireAdmin, async (req, res) => {
  try {
    const search = (req.query.search || '').toString().trim()
    const status = (req.query.status || '').toString().trim()
    const from = (req.query.from || '').toString().trim()
    const to = (req.query.to || '').toString().trim()
    const { whereSql, params } = buildContactsWhere({ search, status, from, to })

    const sql = `
      SELECT id, name, email, phone, subject, message, status, admin_notes, created_at, updated_at
      FROM contacts ${whereSql}
      ORDER BY created_at DESC`
    const { rows } = await pool.query(sql, params)

    const header = ['id', 'name', 'email', 'phone', 'subject', 'message', 'status', 'admin_notes', 'created_at', 'updated_at']
    const csvLines = [header.join(',')]
    const esc = (v) => { if (v == null) return ''; const s = String(v).replaceAll('"', '"\"').replaceAll('\n', ' ').replaceAll('\r', ' '); return `"${s}"` }
    rows.forEach(r => csvLines.push([
      r.id, r.name, r.email, r.phone, r.subject, r.message?.replaceAll('"', '""'),
      r.status, r.admin_notes || '', r.created_at?.toISOString?.() || r.created_at, r.updated_at?.toISOString?.() || r.updated_at
    ].map(esc).join(',')))
    const csv = csvLines.join('\n')
    const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="contacts-${ts}.csv"`)
    res.send(csv)
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }) }
})
app.get('/api/stats/contacts', requireAuth, async (_req, res) => {
  try {
    const byStatus = await pool.query(`SELECT status, COUNT(*)::BIGINT AS count FROM contacts GROUP BY status`)
    const last30 = await pool.query(`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::BIGINT AS count
      FROM contacts
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC`)
    res.json({ byStatus: byStatus.rows, last30: last30.rows })
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }) }
})

/* -------------------------- CANDIDATES: Admin API ------------------------- */
// helpers
const generateCandidateId = () => {
  const ts = Date.now().toString().slice(-6)
  const rand = Math.random().toString(36).substr(2, 4).toUpperCase()
  return `CAN-${ts}-${rand}`
}

function extractResumeText(filePath, mimetype, originalname) {
  try {
    const ext = path.extname(originalname || filePath).toLowerCase()
    const buf = fs.readFileSync(filePath)

    // TXT
    if (ext === '.txt' || mimetype === 'text/plain') {
      return buf.toString('utf8')
    }

    // DOCX (ZIP archive containing word/document.xml)
    if (ext === '.docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      let pos = 0
      while (pos < buf.length) {
        const sig = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), pos)
        if (sig === -1) break
        if (sig + 30 > buf.length) break
        const fnLen = buf.readUInt16LE(sig + 26)
        const extraLen = buf.readUInt16LE(sig + 28)
        const compMethod = buf.readUInt16LE(sig + 8)
        const compSize = buf.readUInt32LE(sig + 18)
        const fn = buf.slice(sig + 30, sig + 30 + fnLen).toString('utf8')
        const dataStart = sig + 30 + fnLen + extraLen
        if (fn === 'word/document.xml' && dataStart + compSize <= buf.length) {
          const compData = buf.slice(dataStart, dataStart + compSize)
          let xml = ''
          try {
            if (compMethod === 8) {
              xml = zlib.inflateRawSync(compData).toString('utf8')
            } else {
              xml = compData.toString('utf8')
            }
          } catch { }
          if (xml) {
            return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
          }
        }
        pos = dataStart + compSize
      }
    }

    // PDF extraction
    if (ext === '.pdf' || mimetype === 'application/pdf') {
      let fullText = ''
      let pos = 0
      while (pos < buf.length) {
        let streamStart = buf.indexOf('stream\r\n', pos)
        let offset = 8
        if (streamStart === -1) {
          streamStart = buf.indexOf('stream\n', pos)
          offset = 7
        }
        if (streamStart === -1) break
        streamStart += offset

        const streamEnd = buf.indexOf('endstream', streamStart)
        if (streamEnd === -1) break

        const streamBuf = buf.slice(streamStart, streamEnd)
        let inflated = null
        try {
          inflated = zlib.inflateSync(streamBuf)
        } catch {
          try {
            inflated = zlib.inflateRawSync(streamBuf)
          } catch { }
        }

        const content = inflated ? inflated.toString('latin1') : streamBuf.toString('latin1')
        const tjRegex = /\(([^)]*)\)\s*Tj/g
        let m
        while ((m = tjRegex.exec(content)) !== null) {
          fullText += m[1] + ' '
        }
        const arrayRegex = /\[([^\]]*)\]\s*TJ/g
        while ((m = arrayRegex.exec(content)) !== null) {
          const inner = m[1]
          const innerRegex = /\(([^)]*)\)/g
          let im
          while ((im = innerRegex.exec(inner)) !== null) {
            fullText += im[1]
          }
          fullText += ' '
        }

        pos = streamEnd + 9
      }

      // Raw regex search on buffer for email & phone if sparse
      const raw = buf.toString('latin1')
      const emailMatches = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
      if (emailMatches) fullText += ' ' + emailMatches.join(' ')
      const phoneMatches = raw.match(/(?:(?:\+|00)?91[\s.-]*)?[6-9]\d{4}[\s.-]*\d{5}/g)
      if (phoneMatches) fullText += ' ' + phoneMatches.join(' ')

      if (fullText.trim().length > 0) return fullText
    }

    // Generic fallback for any other text/doc
    return buf.toString('latin1')
  } catch (err) {
    console.error('extractResumeText error:', err)
    return ''
  }
}

function parseResumeDetails(rawText, filename = '') {
  const result = {
    name: '',
    email: '',
    phone: '',
    position: '',
  }

  if (!rawText && !filename) return result

  const clean = (rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\t\f\v]/g, ' ')
    .replace(/[ ]{2,}/g, ' ')

  const lines = clean
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  // 1. Email
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
  const emailMatch = clean.match(emailRegex)
  if (emailMatch) {
    result.email = emailMatch[1].toLowerCase().trim()
  }

  // 2. Phone (standard 10-digit phone starting 6-9)
  const phoneCandidates = clean.match(/(?:(?:\+|00)?91[\s.-]*)?[6-9]\d{4}[\s.-]*\d{5}/g) ||
    clean.match(/(?:\+?\d{1,3}[\s.-]*)?\(?\d{2,4}\)?[\s.-]*\d{3,4}[\s.-]*\d{4}/g) || []
  for (const pc of phoneCandidates) {
    const digits = pc.replace(/\D/g, '')
    let normalized = ''
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      normalized = digits
    } else if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
      normalized = digits.slice(2)
    } else if (digits.length > 10) {
      const last10 = digits.slice(-10)
      if (/^[6-9]/.test(last10)) normalized = last10
    }
    if (normalized) {
      result.phone = normalized
      break
    }
  }

  // 3. Position / Role
  const knownRoles = [
    'Full Stack Developer',
    'Frontend Developer',
    'Backend Developer',
    'Software Engineer',
    'Software Developer',
    'Web Developer',
    'React Developer',
    'Node.js Developer',
    'MERN Stack Developer',
    'Python Developer',
    'Java Developer',
    'DevOps Engineer',
    'Cloud Architect',
    'Mobile Application Developer',
    'Android Developer',
    'iOS Developer',
    'Flutter Developer',
    'UI/UX Designer',
    'Product Designer',
    'QA Engineer',
    'Quality Assurance Engineer',
    'Automation Tester',
    'Data Scientist',
    'Data Analyst',
    'Machine Learning Engineer',
    'AI Engineer',
    'Business Analyst',
    'Project Manager',
    'Product Manager',
    'Scrum Master',
    'Digital Marketing Specialist',
    'Marketing Manager',
    'HR Manager',
    'HR Executive',
    'Talent Acquisition Specialist',
    'Accountant',
    'Sales Executive',
    'Customer Success Manager'
  ]

  for (const role of knownRoles) {
    const regex = new RegExp(`\\b${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (regex.test(clean)) {
      result.position = role
      break
    }
  }

  if (!result.position) {
    const posLabelRegex = /(?:role|position|designation|applying for|title|job title)\s*[:\-]\s*([a-zA-Z\s\/\-]{3,40})/i
    const posMatch = clean.match(posLabelRegex)
    if (posMatch && posMatch[1]) {
      const candidatePos = posMatch[1].trim()
      if (candidatePos.length >= 3 && !/^(the|and|for|with)$/i.test(candidatePos)) {
        result.position = candidatePos
      }
    }
  }

  // 4. Name extraction
  const nameBlacklist = [
    'curriculum vitae', 'resume', 'bio-data', 'biodata', 'profile',
    'summary', 'contact', 'personal info', 'personal details', 'experience',
    'education', 'skills', 'objective', 'career objective', 'portfolio',
    'page', 'page 1', 'page 2', 'about me', 'work experience'
  ]

  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i].trim()
    const lineLower = line.toLowerCase()
    if (line.includes('@') || /\d{5,}/.test(line)) continue
    if (nameBlacklist.some(b => lineLower === b || lineLower.startsWith(b + ':'))) continue
    if (lineLower.includes('http') || lineLower.includes('linkedin.com') || lineLower.includes('github.com')) continue

    const words = line.split(/\s+/).filter(Boolean)
    if (words.length >= 2 && words.length <= 4) {
      const isAlphaOnly = words.every(w => /^[A-Z][a-zA-Z.'-]*$/i.test(w))
      if (isAlphaOnly && line.length >= 3 && line.length <= 40) {
        result.name = words
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
        break
      }
    }
  }

  // Fallback for name from filename (e.g. John_Doe_Resume.pdf)
  if (!result.name && filename) {
    const cleanFn = filename
      .replace(/\.[^/.]+$/, '')
      .replace(/(?:resume|cv|biodata|profile|updated|latest|202[0-9]|zorvixe)/gi, '')
      .replace(/[-_.]+/g, ' ')
      .trim()
    const fnWords = cleanFn.split(/\s+/).filter(w => w.length >= 2 && /^[a-zA-Z]+$/.test(w))
    if (fnWords.length >= 2 && fnWords.length <= 4) {
      result.name = fnWords.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    }
  }

  return result
}

// Parse resume endpoint (ADMIN)
app.post('/api/admin/candidates/parse-resume', requireAdmin, upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No resume file uploaded' })
  }
  try {
    const rawText = extractResumeText(req.file.path, req.file.mimetype, req.file.originalname)
    const extracted = parseResumeDetails(rawText, req.file.originalname)

    res.json({
      success: true,
      message: 'Resume parsed successfully',
      extracted,
      file: {
        path: req.file.path,
        originalname: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    })
  } catch (err) {
    console.error('Parse resume error:', err)
    res.status(500).json({ success: false, message: 'Failed to parse resume', error: err.message })
  }
})

// Create candidate (ADMIN)
app.post('/api/admin/candidates', requireAdmin, async (req, res) => {
  const { name, email, phone, position, resume_file } = req.body || {}
  const errors = {}
  if (!name || name.trim().length < 3) errors.name = 'Name must be at least 3 characters'
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Valid email is required'
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) errors.phone = 'Valid 10-digit phone starting with 6-9 is required'
  if (!position || position.trim().length < 2) errors.position = 'Position must be at least 2 characters'
  if (Object.keys(errors).length) return res.status(400).json({ success: false, errors })

  try {
    const cid = generateCandidateId()
    const result = await pool.query(
      `INSERT INTO candidates (name, email, phone, position, candidate_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name.trim(), email.trim().toLowerCase(), phone.trim(), position.trim(), cid]
    )
    const candidate = result.rows[0]

    // Link uploaded resume if provided
    if (resume_file && resume_file.path && fs.existsSync(resume_file.path)) {
      try {
        await pool.query(
          `INSERT INTO candidate_uploads (candidate_id, file_name, file_path, file_size)
           VALUES ($1, $2, $3, $4)`,
          [candidate.id, resume_file.originalname || path.basename(resume_file.path), resume_file.path, resume_file.size || 0]
        )
        await pool.query(`UPDATE candidates SET status = 'documents_uploaded' WHERE id = $1`, [candidate.id])
        candidate.status = 'documents_uploaded'
      } catch (upErr) {
        console.error('Failed to attach resume to candidate:', upErr)
      }
    }

    res.status(201).json({ success: true, candidate })
  } catch (e) {
    console.error('Create candidate error:', e)
    if (e.code === '23505') return res.status(400).json({ success: false, message: 'Duplicate candidate_id or email' })
    res.status(500).json({ success: false, message: 'Failed to create candidate' })
  }
})

// List candidates (ADMIN)
app.get('/api/admin/candidates', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
             cl.token AS active_token,
             cl.expires_at AS token_expiry,
             cl.active AS token_active,
             cl.upload_completed,
             cu.file_name,
             cu.file_size,
             cu.upload_date
      FROM candidates c
      LEFT JOIN candidate_links cl
        ON c.id = cl.candidate_id AND cl.active = TRUE AND cl.expires_at > NOW()
      LEFT JOIN candidate_uploads cu
        ON c.id = cu.candidate_id
      ORDER BY c.created_at DESC
    `)
    res.json({ success: true, candidates: result.rows })
  } catch (e) {
    console.error('Fetch candidates error:', e)
    res.status(500).json({ success: false, message: 'Failed to fetch candidates' })
  }
})

// Generate onboarding/upload link (ADMIN)
app.post('/api/admin/candidate-links', requireAdmin, async (req, res) => {
  const { candidateId } = req.body || {}
  try {
    const cand = await pool.query(`SELECT * FROM candidates WHERE id=$1`, [candidateId])
    if (cand.rows.length === 0) return res.status(404).json({ success: false, message: 'Candidate not found' })

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 5) // valid 5 hours

    await pool.query(`UPDATE candidate_links SET active = FALSE WHERE candidate_id = $1`, [candidateId])

    const { rows } = await pool.query(
      `INSERT INTO candidate_links (candidate_id, token, expires_at) VALUES ($1,$2,$3)
       RETURNING id, candidate_id, token, expires_at, active`,
      [candidateId, token, expiresAt]
    )

    // You can host a public onboarding page at /onboarding/:token in your frontend
    const onboardingUrl = `https://www.zorvixetechnologies.in/onboarding/${token}`
    res.status(201).json({ success: true, link: onboardingUrl, token, expiresAt, candidate: cand.rows[0], linkRow: rows[0] })
  } catch (e) {
    console.error('Generate candidate link error:', e)
    res.status(500).json({ success: false, message: 'Failed to generate onboarding link' })
  }
})

// Activate/Deactivate current active link (ADMIN)
app.put('/api/admin/candidate-links/:candidateId/toggle', requireAdmin, async (req, res) => {
  const { candidateId } = req.params
  const { active } = req.body
  try {
    const result = await pool.query(
      `UPDATE candidate_links
       SET active = $1
       WHERE candidate_id = $2 AND expires_at > NOW()
       RETURNING *`,
      [!!active, candidateId]
    )
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'No active link found' })
    res.json({ success: true, message: `Link ${active ? 'activated' : 'deactivated'}`, link: result.rows[0] })
  } catch (e) {
    console.error('Toggle link error:', e)
    res.status(500).json({ success: false, message: 'Failed to toggle link status' })
  }
})

// Update candidate status (ADMIN)
app.put('/api/admin/candidates/:id/status', requireAdmin, async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  const valid = ['pending', 'documents_uploaded', 'approved', 'rejected']
  if (!valid.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status value' })
  try {
    const result = await pool.query(`UPDATE candidates SET status=$1 WHERE id=$2 RETURNING *`, [status, id])
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Candidate not found' })
    res.json({ success: true, message: 'Candidate status updated', candidate: result.rows[0] })
  } catch (e) {
    console.error('Update candidate status error:', e)
    res.status(500).json({ success: false, message: 'Failed to update candidate status' })
  }
})

// Admin download of uploaded PDF / Resume (ADMIN)
app.get('/api/admin/candidate-download/:candidateId', requireAdmin, async (req, res) => {
  const { candidateId } = req.params
  try {
    const q = await pool.query(
      `SELECT cu.*, c.name AS candidate_name
       FROM candidate_uploads cu
       JOIN candidates c ON cu.candidate_id = c.id
       WHERE cu.candidate_id = $1
       ORDER BY cu.upload_date DESC
       LIMIT 1`,
      [candidateId]
    )
    if (q.rows.length === 0) return res.status(404).json({ success: false, message: 'No uploaded file found' })
    const uploadRec = q.rows[0]
    const filePath = path.resolve(uploadRec.file_path)
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' })

    const ext = path.extname(uploadRec.file_name || uploadRec.file_path || '.pdf').toLowerCase()
    const mimeMap = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    }
    const safeName = (uploadRec.file_name || `${uploadRec.candidate_name}-document${ext}`).replace(/["\r\n]/g, '')
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
    fs.createReadStream(filePath).pipe(res)
  } catch (e) {
    console.error('Download file error:', e)
    res.status(500).json({ success: false, message: 'Failed to download file' })
  }
})

/* ------------------------- CANDIDATES: Public API ------------------------- */
// Candidate details by link token (validates link; PDFs themselves do not expire)
app.get('/api/candidate-details/:token', async (req, res) => {
  const { token } = req.params
  try {
    const linkRes = await pool.query(
      `SELECT id AS link_id, candidate_id, token, active, created_at, expires_at, upload_completed
       FROM candidate_links WHERE token=$1 AND active=TRUE AND expires_at > NOW()`,
      [token]
    )
    if (linkRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Link not found, expired, or inactive' })

    const link = linkRes.rows[0]
    const candRes = await pool.query(`SELECT * FROM candidates WHERE id=$1`, [link.candidate_id])
    if (candRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Candidate not found' })

    const upRes = await pool.query(`SELECT * FROM candidate_uploads WHERE candidate_id=$1`, [link.candidate_id])

    res.json({
      success: true,
      candidate: { ...candRes.rows[0], hasUploaded: upRes.rows.length > 0, uploadDetails: upRes.rows[0] || null },
      linkId: link.link_id,
    })
  } catch (e) {
    console.error('Candidate details error:', e)
    res.status(500).json({ success: false, message: 'Failed to fetch candidate details' })
  }
})

// Upload candidate PDF using token (public)
app.post('/api/candidate/upload/:token', upload.single('certificate'), async (req, res) => {
  const { token } = req.params
  try {
    const linkQ = await pool.query(
      `SELECT cl.id AS link_id, cl.candidate_id, cl.active, cl.expires_at,
              c.id AS cand_id, c.name AS cand_name
       FROM candidate_links cl
       JOIN candidates c ON c.id = cl.candidate_id
       WHERE cl.token=$1 AND cl.active=TRUE AND cl.expires_at > NOW()`,
      [token]
    )
    if (linkQ.rows.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path)
      return res.status(404).json({ success: false, message: 'Invalid or expired link' })
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' })

    const { link_id, cand_id } = linkQ.rows[0]

    // ensure not already uploaded
    const existing = await pool.query(`SELECT 1 FROM candidate_uploads WHERE candidate_id=$1 LIMIT 1`, [cand_id])
    if (existing.rows.length > 0) {
      fs.unlinkSync(req.file.path)
      return res.status(400).json({ success: false, message: 'Certificate already uploaded for this candidate' })
    }

    const ins = await pool.query(
      `INSERT INTO candidate_uploads (candidate_id, file_name, file_path, file_size)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [cand_id, req.file.originalname, req.file.path, req.file.size]
    )
    await pool.query(`UPDATE candidate_links SET upload_completed=TRUE WHERE id=$1`, [link_id])
    await pool.query(`UPDATE candidates SET status='documents_uploaded' WHERE id=$1`, [cand_id])

    res.status(201).json({ success: true, message: 'Certificate uploaded successfully', upload: ins.rows[0] })
  } catch (e) {
    console.error('Upload file error:', e)
    if (req.file) { try { fs.unlinkSync(req.file.path) } catch { } }
    res.status(500).json({ success: false, message: 'Failed to upload certificate', error: e.message })
  }
})

/* -------------------------------- Clients API -------------------------------- */
// List clients:
// - Admin: all
// - Employee: only clients having projects where the user is a member
app.get('/api/admin/clients', requireAuth, async (req, res) => {
  try {
    if (isAdmin(req)) {
      const q = await pool.query(`
        SELECT c.*, 
               COUNT(p.id)::BIGINT AS project_count
        FROM clients c
        LEFT JOIN projects p ON p.client_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `)
      return res.json({ success: true, clients: q.rows })
    } else {
      const q = await pool.query(`
        SELECT DISTINCT c.*, x.project_count
        FROM clients c
        JOIN projects p ON p.client_id = c.id
        JOIN project_members m ON m.project_id = p.id AND m.user_id = $1
        JOIN (
          SELECT client_id, COUNT(*)::BIGINT AS project_count
          FROM projects GROUP BY client_id
        ) x ON x.client_id = c.id
        ORDER BY c.created_at DESC
      `, [req.user.sub])
      return res.json({ success: true, clients: q.rows })
    }
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Create client (admin only)
app.post('/api/admin/clients', requireAdmin, async (req, res) => {
  try {
    const { name = '', email = '', phone = '', company = '' } = req.body || {}
    if (!name || !email || !phone) return res.status(400).json({ message: 'name, email, phone are required' })
    const { rows } = await pool.query(
      `INSERT INTO clients (name,email,phone,company) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, email.toLowerCase(), phone, company]
    )
    res.status(201).json({ success: true, client: rows[0] })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})

// Get one client (visible if admin OR member of any of its projects)
app.get('/api/admin/clients/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' })
    const q = await pool.query(`SELECT * FROM clients WHERE id=$1`, [id])
    const client = q.rows[0]
    if (!client) return res.status(404).json({ message: 'Not found' })
    if (!isAdmin(req)) {
      const m = await pool.query(`SELECT 1 FROM projects p JOIN project_members pm ON pm.project_id=p.id WHERE p.client_id=$1 AND pm.user_id=$2 LIMIT 1`, [id, req.user.sub])
      if (m.rows.length === 0) return res.status(403).json({ message: 'Forbidden' })
    }
    res.json({ success: true, client })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})

// Update a client (ADMIN)
app.patch('/api/admin/clients/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const { name, email, phone, company } = req.body || {};
    const sets = [];
    const params = [];

    if (typeof name === 'string') { params.push(name.trim()); sets.push(`name=$${params.length}`); }
    if (typeof email === 'string') { params.push(email.trim().toLowerCase()); sets.push(`email=$${params.length}`); }
    if (typeof phone === 'string') { params.push(phone.trim()); sets.push(`phone=$${params.length}`); }
    if (typeof company === 'string' || company === null) {
      params.push(company ? company.trim() : null);
      sets.push(`company=$${params.length}`);
    }

    if (!sets.length) return res.status(400).json({ message: 'No changes submitted' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE clients SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ message: 'Not found' });
    return res.json({ success: true, client: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Delete a client (ADMIN)
// NOTE: projects have a FK ON DELETE CASCADE, so their rows go away automatically.
app.delete('/api/admin/clients/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const r = await pool.query(`DELETE FROM clients WHERE id=$1`, [id]);
    if (!r.rowCount) return res.status(404).json({ message: 'Not found' });

    return res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
});



/* -------------------------------- Projects API ------------------------------- */
// List projects under a client
app.get('/api/admin/clients/:id/projects', requireAuth, async (req, res) => {
  try {
    const clientId = Number(req.params.id)
    if (!Number.isFinite(clientId)) return res.status(400).json({ message: 'Invalid client id' })

    let sql = `
      SELECT p.*, au.name AS updated_by_name
      FROM projects p
      LEFT JOIN admin_users au ON au.id = p.updated_by
      WHERE p.client_id=$1
      ORDER BY p.created_at DESC
    `
    let params = [clientId]

    if (!isAdmin(req)) {
      sql = `
        SELECT p.*, au.name AS updated_by_name
        FROM projects p
        JOIN project_members m ON m.project_id = p.id AND m.user_id=$2
        LEFT JOIN admin_users au ON au.id = p.updated_by
        WHERE p.client_id=$1
        ORDER BY p.created_at DESC
      `
      params = [clientId, req.user.sub]
    }
    const { rows } = await pool.query(sql, params)

    // decorate with my permissions
    let myPerms = {}
    if (!isAdmin(req) && rows.length) {
      const ids = rows.map(r => r.id)
      const p = await pool.query(
        `SELECT project_id, can_edit, can_manage_payments FROM project_members WHERE user_id=$1 AND project_id=ANY($2::bigint[])`,
        [req.user.sub, ids]
      )
      p.rows.forEach(r => { myPerms[r.project_id] = { can_edit: r.can_edit, can_manage_payments: r.can_manage_payments } })
    }

    res.json({
      success: true,
      projects: rows.map(r => ({
        ...r,
        my_perms: isAdmin(req) ? { can_edit: true, can_manage_payments: true } : (myPerms[r.id] || { can_edit: false, can_manage_payments: false })
      }))
    })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})

// Create project (admin only by default)
app.post('/api/admin/projects', requireAdmin, async (req, res) => {
  try {
    const { client_id, name = '', description = '', type = '', other_type = '' } = req.body || {}
    if (!client_id || !name || !type) return res.status(400).json({ message: 'client_id, name, type required' })
    const code = genProjectCode()
    const zorvixe_id = genZorvixeId(code)

    const { rows } = await pool.query(`
      INSERT INTO projects (client_id, code, zorvixe_id, name, description, type, other_type, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [client_id, code, zorvixe_id, name, description, type, type === 'other' ? other_type : null, req.user.sub])

    res.status(201).json({ success: true, project: rows[0] })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})

// Get one project
app.get('/api/admin/projects/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' })
    const q = await pool.query(`
      SELECT p.*, au.name AS updated_by_name
      FROM projects p
      LEFT JOIN admin_users au ON au.id = p.updated_by
      WHERE p.id=$1
    `, [id])
    const project = q.rows[0]
    if (!project) return res.status(404).json({ message: 'Not found' })
    if (!isAdmin(req)) {
      const ok = await pool.query(`SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 LIMIT 1`, [id, req.user.sub])
      if (ok.rows.length === 0) return res.status(403).json({ message: 'Forbidden' })
    }
    res.json({ success: true, project })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})

// Update project (admin OR can_edit)
app.patch('/api/admin/projects/:id', requireAuth, requireProjectEdit(), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const fields = []
    const params = []
    const { name, description, status, type, other_type } = req.body || {}

    if (typeof name === 'string') { params.push(name); fields.push(`name=$${params.length}`) }
    if (typeof description === 'string') { params.push(description); fields.push(`description=$${params.length}`) }
    if (typeof status === 'string') { params.push(status); fields.push(`status=$${params.length}`) }
    if (typeof type === 'string') { params.push(type); fields.push(`type=$${params.length}`) }
    if (typeof other_type === 'string') { params.push(other_type || null); fields.push(`other_type=$${params.length}`) }
    // who edited
    params.push(req.user.sub); fields.push(`updated_by=$${params.length}`)

    if (!fields.length) return res.status(400).json({ message: 'No changes' })
    params.push(id)

    const { rows } = await pool.query(`UPDATE projects SET ${fields.join(', ')} WHERE id=$${params.length} RETURNING *`, params)
    res.json({ success: true, project: rows[0] })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})

// Delete project (admin only)
app.delete('/api/admin/projects/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const r = await pool.query(`DELETE FROM projects WHERE id=$1`, [id])
    if (!r.rowCount) return res.status(404).json({ message: 'Not found' })
    res.json({ success: true, message: 'Deleted' })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})


/* ---------------------------- Project Members API ---------------------------- */
// List members for a project (admin or member)
app.get('/api/admin/projects/:projectId/members', requireAuth, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId)
    if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id' })
    if (!isAdmin(req)) {
      const ok = await pool.query(`SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 LIMIT 1`, [projectId, req.user.sub])
      if (ok.rows.length === 0) return res.status(403).json({ message: 'Forbidden' })
    }
    const q = await pool.query(`
      SELECT pm.user_id, pm.can_edit, pm.can_manage_payments,
             u.name, u.email, u.role
      FROM project_members pm
      JOIN admin_users u ON u.id = pm.user_id
      WHERE pm.project_id=$1
      ORDER BY u.name ASC
    `, [projectId])
    res.json({ success: true, members: q.rows })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})

// Add member (admin only)
app.post('/api/admin/projects/:projectId/members', requireAdmin, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId)
    const { user_id, can_edit = false, can_manage_payments = false } = req.body || {}
    if (!user_id) return res.status(400).json({ message: 'user_id required' })
    const q = await pool.query(`
      INSERT INTO project_members (project_id, user_id, can_edit, can_manage_payments)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (project_id, user_id) DO UPDATE SET can_edit=EXCLUDED.can_edit, can_manage_payments=EXCLUDED.can_manage_payments
      RETURNING *
    `, [projectId, user_id, !!can_edit, !!can_manage_payments])
    res.status(201).json({ success: true, member: q.rows[0] })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})

// Update member (admin only)
app.patch('/api/admin/projects/:projectId/members/:userId', requireAdmin, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId)
    const userId = Number(req.params.userId)
    const { can_edit, can_manage_payments } = req.body || {}
    const fields = []
    const params = []
    if (typeof can_edit === 'boolean') { params.push(can_edit); fields.push(`can_edit=$${params.length}`) }
    if (typeof can_manage_payments === 'boolean') { params.push(can_manage_payments); fields.push(`can_manage_payments=$${params.length}`) }
    if (!fields.length) return res.status(400).json({ message: 'No changes' })
    params.push(projectId, userId)
    const q = await pool.query(
      `UPDATE project_members SET ${fields.join(', ')} WHERE project_id=$${params.length - 1} AND user_id=$${params.length} RETURNING *`,
      params
    )
    if (!q.rowCount) return res.status(404).json({ message: 'Not found' })
    res.json({ success: true, member: q.rows[0] })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})

// Remove member (admin only)
app.delete('/api/admin/projects/:projectId/members/:userId', requireAdmin, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId)
    const userId = Number(req.params.userId)

    const q = await pool.query(`DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, [projectId, userId])
    if (!q.rowCount) return res.status(404).json({ message: 'Not found' })
    res.json({ success: true, message: 'Removed' })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Server error' }) }
})


/* ------------------------------- Payments API ------------------------------- */
// Generate payment link for a project (admin OR member with can_manage_payments)
// Generate payment link for a project (admin OR member with can_manage_payments)
function buildPublicUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function requireLinkPayments() {
  return async (req, res, next) => {
    try {
      const linkId = Number(req.params.id);
      if (!Number.isFinite(linkId)) return res.status(400).json({ message: "Invalid link id" });
      const q = await pool.query(`SELECT id, project_id FROM payment_links WHERE id=$1`, [linkId]);
      const link = q.rows[0];
      if (!link) return res.status(404).json({ message: "Link not found" });
      if (isAdmin(req) || (await userCanManagePayments(req.user.sub, link.project_id))) {
        req.linkRow = link;
        return next();
      }
      return res.status(403).json({ message: "Forbidden" });
    } catch (e) {
      return res.status(500).json({ message: "Server error" });
    }
  };
}


app.get(
  "/api/admin/projects/:projectId/payment-links",
  requireAuth,
  requireProjectPayments(),
  async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const { rows } = await pool.query(
        `SELECT id, project_id, token, active, payment_kind, created_at, expires_at, amount
         FROM payment_links
         WHERE project_id=$1
         ORDER BY created_at DESC`,
        [projectId]
      );
      const base = buildPublicUrl(req);
      res.json({
        success: true,
        links: rows.map((r) => ({ ...r, url: `${base}/payment/${r.token}` })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);


app.patch(
  "/api/payment-links/:id",
  requireAuth,
  requireLinkPayments(),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { amount, expires_at, active } = req.body || {};
      const sets = [];
      const params = [];

      if (amount !== undefined) { params.push(Number(amount) || 0); sets.push(`amount=$${params.length}`); }
      if (typeof active === "boolean") { params.push(active); sets.push(`active=$${params.length}`); }
      if (expires_at) { params.push(new Date(expires_at)); sets.push(`expires_at=$${params.length}`); }

      if (!sets.length) return res.status(400).json({ message: "No changes submitted" });

      params.push(id);
      const q = await pool.query(
        `UPDATE payment_links SET ${sets.join(", ")} WHERE id=$${params.length} RETURNING id, project_id, token, active, payment_kind, created_at, expires_at, amount`,
        params
      );
      res.json({ success: true, link: q.rows[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);
app.post(
  "/api/payment-links/:id/regenerate",
  requireAuth,
  requireLinkPayments(),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const days = Number(process.env.PAYMENT_LINK_EXPIRES_DAYS || 30);
      const newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const q = await pool.query(
        `UPDATE payment_links SET active=TRUE, expires_at=$2 WHERE id=$1
         RETURNING id, project_id, token, active, payment_kind, created_at, expires_at, amount`,
        [id, newExpiry]
      );
      if (!q.rows[0]) return res.status(404).json({ success: false, message: "Link not found" });
      res.json({ success: true, link: q.rows[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);



// Delete a specific payment link
app.delete(
  "/api/admin/payment-links/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const q = await pool.query(`DELETE FROM payment_links WHERE id=$1`, [id]);
      if (!q.rowCount) return res.status(404).json({ success: false, message: "Link not found" });
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);



app.post('/api/admin/projects/:projectId/payment-links', requireAuth, requireProjectPayments(), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId)
    const rawKind = (req.body?.kind || '').toString().toLowerCase()
    const paymentKind = ['registration', 'project'].includes(rawKind) ? rawKind : 'project'
    const { amount } = req.body || {};

    const token = crypto.randomBytes(32).toString('hex')
    const days = Number(process.env.PAYMENT_LINK_EXPIRES_DAYS || 30)
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    const { rows: pRows } = await pool.query(`
      SELECT p.*, c.id AS c_id, c.name AS c_name
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      WHERE p.id=$1
    `, [projectId])
    const project = pRows[0]
    if (!project) return res.status(404).json({ message: 'Project not found' })

    await pool.query(
      `INSERT INTO payment_links (project_id, token, active, created_by, expires_at, payment_kind, amount)
   VALUES ($1,$2,TRUE,$3,$4,$5,$6)`,
      [projectId, token, req.user.sub, expiresAt, paymentKind, amount ?? null]
    );

    const base = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`
    const link = `${base}/payment/${token}`

    res.status(201).json({
      success: true,
      token, link, expiresAt,
      paymentKind,
      project: { id: project.id, name: project.name, code: project.code }
    })
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: 'Failed to generate link' }) }
})

// Toggle (enable/disable) *all* links under this project
app.put('/api/admin/payment-links/:projectId/toggle',
  requireAuth,
  requireProjectPayments(),
  async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const { active } = req.body || {};
      await pool.query(
        `UPDATE payment_links SET active = $2 WHERE project_id = $1`,
        [projectId, !!active]
      );
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);



app.get('/api/client-details/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const linkQ = await pool.query(`
      SELECT pl.*, p.name AS project_name, p.code AS project_code, p.zorvixe_id, p.id AS project_id,
             c.id AS client_id, c.name AS client_name, c.email AS client_email
      FROM payment_links pl
      JOIN projects p ON p.id = pl.project_id
      JOIN clients c  ON c.id = p.client_id
      WHERE pl.token=$1 AND pl.active=TRUE AND pl.expires_at>NOW()
    `, [token]);

    const link = linkQ.rows[0];
    if (!link) return res.status(404).json({ success: false, message: 'Link not found, expired, or inactive' });

    // you can customize due date, description defaults here
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    res.json({
      success: true,
      paymentKind: link.payment_kind,
      client: {
        clientName: link.client_name,
        clientId: link.client_id,
        email: link.client_email,
        projectName: link.project_name,
        project_id: link.project_id,
        projectCode: link.project_code,
        zorvixe_id: link.zorvixe_id,
        amount: link.amount ?? 0,
        dueDate,
        project_description: null,
        linkId: link.id,
      },
      linkId: link.id,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Public: submit payment or registration — multipart/form-data with field "receipt"
app.post('/api/payment/submit', upload.single('receipt'), async (req, res) => {
  try {
    const {
      token = "",
      linkId = "",
      clientId = "",
      projectId = "",
      paymentKind = "project",
      amount: rawAmount,
      paymentType = null,
      paymentDescription = null,
    } = req.body || {};

    // Find link by id or token, validate active+not expired
    let link;
    if (linkId) {
      const q = await pool.query(`SELECT * FROM payment_links WHERE id=$1 AND active=TRUE AND expires_at>NOW()`, [Number(linkId)]);
      link = q.rows[0];
    } else if (token) {
      const q = await pool.query(`SELECT * FROM payment_links WHERE token=$1 AND active=TRUE AND expires_at>NOW()`, [token]);
      link = q.rows[0];
    }
    if (!link) {
      if (req.file) try { fs.unlinkSync(req.file.path) } catch { }
      return res.status(404).json({ success: false, message: 'Link not found or inactive/expired' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'Missing receipt file' });

    // Resolve client/project from link
    const projQ = await pool.query(`
      SELECT p.id, p.code AS project_code, p.name AS project_name, p.zorvixe_id, p.client_id,
             c.name AS client_name
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      WHERE p.id = $1
    `, [link.project_id]);
    const proj = projQ.rows[0];

    // Amount priority: body.amount -> link.amount -> 0
    const amount = rawAmount !== undefined ? Number(rawAmount) || 0 : (link.amount ?? 0);

    const base = buildPublicUrl(req);
    const receipt_url = `${base}/uploads/${path.basename(req.file.path)}`;
    const kind = (paymentKind || link.payment_kind || "project").toLowerCase();
    const safeKind = ["registration", "project"].includes(kind) ? kind : "project";

    // NEW: default the type so we never write NULL
    const resolvedPaymentType =
      (paymentType && String(paymentType).trim()) ||
      (safeKind === "registration" ? "registration" : "other");
    const year = new Date().getFullYear();
    const referenceId = `PAY-${year}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const ins = await pool.query(
      `
  INSERT INTO payment_registrations
    (link_id, payment_kind, project_id, client_id, client_name, project_name, project_code, zorvixe_id,
     amount, due_date, receipt_url, receipt_path, reference_id, status, payment_type, payment_description, created_at)
  VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW() + INTERVAL '1 days', $10, $11, $12, 'pending', $13, $14, NOW())
  RETURNING *
  `,
      [
        link.id,
        safeKind,
        proj?.id || null,
        proj?.client_id || clientId || null,
        proj?.client_name || null,
        proj?.project_name || null,
        proj?.project_code || null,
        proj?.zorvixe_id || null,
        amount,
        receipt_url,
        req.file.path,
        referenceId,
        resolvedPaymentType,        // << here
        paymentDescription || null, // nullable
      ]
    );
    // You may choose to auto-disable link after first submission; keeping as-is (do not disable).
    res.status(201).json({ success: true, referenceId, data: ins.rows[0] });
  } catch (e) {
    console.error(e);
    if (req.file) { try { fs.unlinkSync(req.file.path) } catch { } }
    res.status(500).json({ success: false, message: 'Failed to submit payment', error: e.message });
  }
});

app.get(
  "/api/payment-links/:id/submissions",
  requireAuth,
  requireLinkPayments(),
  async (req, res) => {
    try {
      const linkId = Number(req.params.id);
      const { rows } = await pool.query(
        `SELECT id, created_at, amount, status, receipt_url, receipt_path
         FROM payment_registrations
         WHERE link_id=$1
         ORDER BY created_at DESC`,
        [linkId]
      );
      res.json({
        success: true,
        submissions: rows.map((r) => ({
          id: r.id,
          created_at: r.created_at,
          amount: r.amount,
          status: r.status,
          files: r.receipt_url ? [r.receipt_url] : [],
        })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

app.get('/api/admin/payment-registrations/:id/receipt', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const q = await pool.query(`SELECT receipt_path FROM payment_registrations WHERE id=$1`, [id]);
    const row = q.rows[0];
    if (!row || !row.receipt_path) return res.status(404).json({ success: false, message: 'No file found' });

    const filePath = path.resolve(row.receipt_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File missing on server' });

    const ext = (path.extname(filePath) || '').toLowerCase();
    const mime =
      ext === '.pdf' ? 'application/pdf' :
        ext === '.png' ? 'image/png' :
          ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
            'application/octet-stream';

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="payment-receipt-${id}${ext}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Failed to download receipt' });
  }
});

// DASHBOARD STATS (requires auth)
app.get('/api/stats/dashboard', requireAuth, async (_req, res) => {
  try {
    const [
      clientsCount,
      projectsCount,
      contactsCount,
      linksCount,
      paymentsCount,
      candidatesCount,

      contactsByStatus,
      contactsLast30,
      paymentsLast30,
      recentLogins,

      contactsRecent,
      paymentsRecent,
      candidatesRecent,
      uploadsRecent,
      projectsRecent,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::BIGINT AS c FROM clients`),
      pool.query(`SELECT COUNT(*)::BIGINT AS c FROM projects`),
      pool.query(`SELECT COUNT(*)::BIGINT AS c FROM contacts`),
      pool.query(`SELECT COUNT(*)::BIGINT AS c FROM payment_links`),
      pool.query(`SELECT COUNT(*)::BIGINT AS c FROM payment_registrations`),
      pool.query(`SELECT COUNT(*)::BIGINT AS c FROM candidates`),

      pool.query(`SELECT status, COUNT(*)::BIGINT AS count FROM contacts GROUP BY status`),
      pool.query(`
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::BIGINT AS count
        FROM contacts
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `),
      pool.query(`
        SELECT date_trunc('day', created_at) AS day,
               COUNT(*)::BIGINT AS count,
               COALESCE(SUM(amount), 0)::NUMERIC AS total_amount
        FROM payment_registrations
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `),
      pool.query(`
        SELECT id, name, email, role, last_login_at
        FROM admin_users
        WHERE last_login_at IS NOT NULL
        ORDER BY last_login_at DESC
        LIMIT 10
      `),

      pool.query(`
        SELECT id, name, email, subject, created_at
        FROM contacts
        ORDER BY created_at DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT id, client_name, project_name, amount, status, created_at
        FROM payment_registrations
        ORDER BY created_at DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT id, name, email, created_at
        FROM candidates
        ORDER BY created_at DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT cu.id, cu.candidate_id, cu.file_name, cu.upload_date, c.name AS candidate_name
        FROM candidate_uploads cu
        JOIN candidates c ON c.id = cu.candidate_id
        ORDER BY cu.upload_date DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT id, name, code, created_at
        FROM projects
        ORDER BY created_at DESC
        LIMIT 10
      `),
    ]);

    // Build activity feed (merge & sort)
    const acts = [];

    contactsRecent.rows.forEach((r) => {
      acts.push({
        type: "contact",
        at: r.created_at,
        text: `Contact from ${r.name} (${r.email}) — ${r.subject}`,
      });
    });

    paymentsRecent.rows.forEach((r) => {
      acts.push({
        type: "payment",
        at: r.created_at,
        text: `Payment submitted: ${r.client_name || "Client"} • ${r.project_name || "Project"} • Rs. ${Number(r.amount || 0).toLocaleString()} (${r.status})`,
      });
    });

    candidatesRecent.rows.forEach((r) => {
      acts.push({
        type: "candidate",
        at: r.created_at,
        text: `Candidate created: ${r.name} (${r.email})`,
      });
    });

    uploadsRecent.rows.forEach((r) => {
      acts.push({
        type: "upload",
        at: r.upload_date,
        text: `Candidate upload: ${r.candidate_name} • ${r.file_name}`,
      });
    });

    projectsRecent.rows.forEach((r) => {
      acts.push({
        type: "project",
        at: r.created_at,
        text: `Project created: ${r.name} (${r.code})`,
      });
    });

    acts.sort((a, b) => new Date(b.at) - new Date(a.at));
    const activityFeed = acts.slice(0, 20);

    // Build response
    res.json({
      totals: {
        clients: Number(clientsCount.rows[0]?.c || 0),
        projects: Number(projectsCount.rows[0]?.c || 0),
        contacts: Number(contactsCount.rows[0]?.c || 0),
        payment_links: Number(linksCount.rows[0]?.c || 0),
        payments: Number(paymentsCount.rows[0]?.c || 0),
        candidates: Number(candidatesCount.rows[0]?.c || 0),
      },
      contactsByStatus: contactsByStatus.rows.map((r) => ({
        status: r.status,
        count: Number(r.count || 0),
      })),
      contactsLast30: contactsLast30.rows.map((r) => ({
        day: r.day,
        count: Number(r.count || 0),
      })),
      paymentsLast30: paymentsLast30.rows.map((r) => ({
        day: r.day,
        count: Number(r.count || 0),
        total_amount: Number(r.total_amount || 0),
      })),
      recentLogins: recentLogins.rows,
      activityFeed,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------ GLOBAL SEARCH API ------------------------ */
// Search across all entities: Tickets, Projects, Clients, Contacts, Candidates, Users, Leaves, Payments
app.get('/api/global-search', requireAuth, async (req, res) => {
  try {
    const rawQ = (req.query.q || req.query.query || '').toString().trim();
    if (!rawQ || rawQ.length < 1) {
      return res.json({ query: '', total: 0, results: [] });
    }

    const qLower = rawQ.toLowerCase();
    const term = `%${qLower}%`;
    const numId = parseInt(rawQ.replace(/[^0-9]/g, ''), 10);
    const validNum = Number.isInteger(numId) ? numId : -1;

    // Search in parallel across all core tables
    const [
      ticketsRes,
      projectsRes,
      clientsRes,
      contactsRes,
      candidatesRes,
      usersRes,
      leavesRes,
      paymentsRes,
      dealsRes,
      jobsRes,
    ] = await Promise.all([
      // Tickets
      pool.query(
        `SELECT t.id, t.title, t.status, t.priority, t.created_at,
                u.name AS assigned_to_name
         FROM tickets t
         LEFT JOIN admin_users u ON t.assigned_to = u.id
         WHERE t.id = $1
            OR LOWER(t.title) LIKE $2
            OR LOWER(COALESCE(t.description, '')) LIKE $2
            OR LOWER(COALESCE(t.status, '')) LIKE $2
            OR LOWER(COALESCE(u.name, '')) LIKE $2
         ORDER BY t.created_at DESC
         LIMIT 6`,
        [validNum, term]
      ),

      // Projects
      pool.query(
        `SELECT p.id, p.name, p.code, p.zorvixe_id, p.status, p.type,
                c.name AS client_name
         FROM projects p
         LEFT JOIN clients c ON p.client_id = c.id
         WHERE p.id = $1
            OR LOWER(p.name) LIKE $2
            OR LOWER(p.code) LIKE $2
            OR LOWER(p.zorvixe_id) LIKE $2
            OR LOWER(COALESCE(p.description, '')) LIKE $2
            OR LOWER(COALESCE(c.name, '')) LIKE $2
         ORDER BY p.created_at DESC
         LIMIT 6`,
        [validNum, term]
      ),

      // Clients
      pool.query(
        `SELECT id, name, email, phone, company, created_at
         FROM clients
         WHERE id = $1
            OR LOWER(name) LIKE $2
            OR LOWER(email) LIKE $2
            OR LOWER(phone) LIKE $2
            OR LOWER(COALESCE(company, '')) LIKE $2
         ORDER BY created_at DESC
         LIMIT 6`,
        [validNum, term]
      ),

      // Contacts
      pool.query(
        `SELECT id, name, email, phone, subject, status, created_at
         FROM contacts
         WHERE id = $1
            OR LOWER(name) LIKE $2
            OR LOWER(email) LIKE $2
            OR LOWER(phone) LIKE $2
            OR LOWER(subject) LIKE $2
            OR LOWER(message) LIKE $2
         ORDER BY created_at DESC
         LIMIT 6`,
        [validNum, term]
      ),

      // Candidates
      pool.query(
        `SELECT id, name, email, phone, position, candidate_id, status, created_at
         FROM candidates
         WHERE id = $1
            OR LOWER(name) LIKE $2
            OR LOWER(email) LIKE $2
            OR LOWER(phone) LIKE $2
            OR LOWER(COALESCE(position, '')) LIKE $2
            OR LOWER(candidate_id) LIKE $2
         ORDER BY created_at DESC
         LIMIT 6`,
        [validNum, term]
      ),

      // Users / Team
      pool.query(
        `SELECT id, name, email, username, role, department, position, is_active
         FROM admin_users
         WHERE id = $1
            OR LOWER(name) LIKE $2
            OR LOWER(email) LIKE $2
            OR LOWER(COALESCE(username, '')) LIKE $2
            OR LOWER(COALESCE(department, '')) LIKE $2
            OR LOWER(COALESCE(position, '')) LIKE $2
         ORDER BY name ASC
         LIMIT 6`,
        [validNum, term]
      ),

      // Leaves
      pool.query(
        `SELECT l.id, l.leave_type, l.status, l.start_date, l.end_date, l.total_days, l.reason,
                u.name AS employee_name
         FROM leaves l
         LEFT JOIN admin_users u ON l.employee_id = u.id
         WHERE l.id = $1
            OR LOWER(COALESCE(u.name, '')) LIKE $2
            OR LOWER(l.leave_type) LIKE $2
            OR LOWER(l.reason) LIKE $2
            OR LOWER(l.status) LIKE $2
         ORDER BY l.created_at DESC
         LIMIT 6`,
        [validNum, term]
      ),

      // Payments
      pool.query(
        `SELECT id, client_name, project_name, project_code, amount, status, reference_id, created_at
         FROM payment_registrations
         WHERE id = $1
            OR LOWER(client_name) LIKE $2
            OR LOWER(project_name) LIKE $2
            OR LOWER(project_code) LIKE $2
            OR LOWER(reference_id) LIKE $2
         ORDER BY created_at DESC
         LIMIT 6`,
        [validNum, term]
      ),

      // CRM Deals
      pool.query(
        `SELECT d.id, d.title, d.value, d.stage, d.probability, c.name AS client_name
         FROM crm_deals d
         LEFT JOIN clients c ON c.id = d.client_id
         WHERE d.id = $1
            OR LOWER(d.title) LIKE $2
            OR LOWER(COALESCE(c.name, '')) LIKE $2
            OR LOWER(d.stage) LIKE $2
         ORDER BY d.created_at DESC
         LIMIT 6`,
        [validNum, term]
      ),

      // HRMS Job Openings
      pool.query(
        `SELECT id, title, department, vacancies, job_type, salary_range, status
         FROM hrms_job_openings
         WHERE id = $1
            OR LOWER(title) LIKE $2
            OR LOWER(department) LIKE $2
            OR LOWER(status) LIKE $2
         ORDER BY created_at DESC
         LIMIT 6`,
        [validNum, term]
      ),
    ]);

    const results = [];

    // Format Tickets
    ticketsRes.rows.forEach((t) => {
      results.push({
        id: `ticket-${t.id}`,
        rawId: t.id,
        category: 'Tickets',
        type: 'ticket',
        title: t.title,
        subtitle: `#${t.id} • ${t.status || 'open'} • ${t.assigned_to_name ? `Assigned: ${t.assigned_to_name}` : 'Unassigned'}`,
        badge: t.status,
        url: `/tickets/${t.id}`,
      });
    });

    // Format Projects
    projectsRes.rows.forEach((p) => {
      results.push({
        id: `project-${p.id}`,
        rawId: p.id,
        category: 'Projects',
        type: 'project',
        title: p.name,
        subtitle: `${p.code || ''} • ${p.status || 'new'} ${p.client_name ? `• Client: ${p.client_name}` : ''}`,
        badge: p.status,
        url: `/projects/${p.id}`,
      });
    });

    // Format Clients
    clientsRes.rows.forEach((c) => {
      results.push({
        id: `client-${c.id}`,
        rawId: c.id,
        category: 'Clients',
        type: 'client',
        title: c.name,
        subtitle: `${c.company ? `${c.company} • ` : ''}${c.email || ''} ${c.phone ? `• ${c.phone}` : ''}`,
        badge: c.company || 'Client',
        url: `/clients`,
      });
    });

    // Format Contacts
    contactsRes.rows.forEach((c) => {
      results.push({
        id: `contact-${c.id}`,
        rawId: c.id,
        category: 'Contacts',
        type: 'contact',
        title: c.name,
        subtitle: `${c.email || ''} • ${c.phone || ''} ${c.subject ? `• "${c.subject}"` : ''}`,
        badge: c.status,
        url: `/contacts`,
      });
    });

    // Format Users
    usersRes.rows.forEach((u) => {
      results.push({
        id: `user-${u.id}`,
        rawId: u.id,
        category: 'Users',
        type: 'user',
        title: u.name,
        subtitle: `${u.department ? `${u.department} • ` : ''}${u.position || u.role || ''} • ${u.email}`,
        badge: u.role,
        url: `/users`,
      });
    });

    // Format Candidates
    candidatesRes.rows.forEach((cd) => {
      results.push({
        id: `candidate-${cd.id}`,
        rawId: cd.id,
        category: 'Candidates',
        type: 'candidate',
        title: cd.name,
        subtitle: `${cd.position ? `${cd.position} • ` : ''}${cd.email} • ID: ${cd.candidate_id}`,
        badge: cd.status,
        url: `/candidates`,
      });
    });

    // Format Leaves
    leavesRes.rows.forEach((l) => {
      results.push({
        id: `leave-${l.id}`,
        rawId: l.id,
        category: 'Leaves',
        type: 'leave',
        title: `${l.employee_name || 'Employee'} - ${l.leave_type} leave`,
        subtitle: `${l.total_days} day(s) • ${l.status} • "${l.reason}"`,
        badge: l.status,
        url: `/leaves`,
      });
    });

    // Format Payments
    paymentsRes.rows.forEach((pm) => {
      results.push({
        id: `payment-${pm.id}`,
        rawId: pm.id,
        category: 'Payments',
        type: 'payment',
        title: `Payment: ${pm.client_name || pm.project_name}`,
        subtitle: `₹${Number(pm.amount || 0).toLocaleString()} • ${pm.status} • Ref: ${pm.reference_id}`,
        badge: pm.status,
        url: `/payments`,
      });
    });

    // Format CRM Deals
    dealsRes.rows.forEach((d) => {
      results.push({
        id: `deal-${d.id}`,
        rawId: d.id,
        category: 'CRM Deals',
        type: 'deal',
        title: d.title,
        subtitle: `₹${Number(d.value || 0).toLocaleString()} • ${d.client_name ? `Client: ${d.client_name} • ` : ''}Stage: ${d.stage}`,
        badge: d.stage,
        url: `/crm`,
      });
    });

    // Format Job Openings
    jobsRes.rows.forEach((j) => {
      results.push({
        id: `job-${j.id}`,
        rawId: j.id,
        category: 'Job Openings',
        type: 'job',
        title: j.title,
        subtitle: `${j.department} • ${j.vacancies} Openings • ${j.job_type}`,
        badge: j.status,
        url: `/recruitment`,
      });
    });

    res.json({
      query: rawQ,
      total: results.length,
      results,
    });
  } catch (err) {
    console.error('Global search error:', err);
    res.status(500).json({ message: 'Search failed', error: err.message });
  }
});

function buildServerNotifKey(activity) {
  const type = activity?.type || '';
  const atRaw = activity?.at || '';
  const at = atRaw instanceof Date ? atRaw.toISOString() : String(atRaw);
  const relatedId =
    activity?.data?.id ??
    activity?.data?.project_id ??
    activity?.data?.ticket_id ??
    '';
  const text = activity?.text || '';
  return encodeURIComponent(`${type}|${at}|${relatedId}|${text}`);
}

function buildServerTicketKey(activity) {
  const atRaw = activity?.at || '';
  const at = atRaw instanceof Date ? atRaw.toISOString() : String(atRaw);
  const id = activity?.data?.id ?? activity?.data?.ticket_id ?? '';
  const text = activity?.text || activity?.data?.title || '';
  return encodeURIComponent(`${at}|${id}|${text}`);
}

app.get('/api/stats/notifications', requireAuth, async (req, res) => {
  try {
    const currentUserId = Number(req.user?.sub);
    const currentUserEmail = (req.user?.email || '').toLowerCase();

    const userReadQ = await pool.query(
      `SELECT notif_last_read_at, COALESCE(notif_seen_keys, '[]'::jsonb) AS notif_seen_keys
       FROM admin_users WHERE id = $1`,
      [currentUserId]
    ).catch(() => ({ rows: [] }));

    const readRow = userReadQ.rows[0] || {};
    const lastReadMs = readRow.notif_last_read_at ? new Date(readRow.notif_last_read_at).getTime() : 0;
    const seenKeysArr = Array.isArray(readRow.notif_seen_keys) ? readRow.notif_seen_keys : [];
    const seenKeys = new Set(seenKeysArr);

    const [
      // Basic counts
      projectsCount,
      ticketsCount,
      commentsCount,
      usersCount,

      // Recent activities
      projectsRecent,
      ticketsRecent,
      projectCommentsRecent,
      ticketCommentsRecent,
      recentLogins,
      recentRealLogouts,

      // Status breakdowns
      projectsByStatus,
      ticketsByStatus,
      ticketsByPriority,

      // Activity timelines
      projectsLast30,
      ticketsLast30,
      commentsLast30,

    ] = await Promise.all([
      // Basic counts (unchanged)
      pool.query(`SELECT COUNT(*)::BIGINT AS c FROM projects`),
      pool.query(`SELECT COUNT(*)::BIGINT AS c FROM tickets`),
      pool.query(`SELECT COUNT(*)::BIGINT AS c FROM (SELECT id FROM project_comments UNION ALL SELECT id FROM ticket_comments) AS all_comments`),
      pool.query(`SELECT COUNT(*)::BIGINT AS c FROM admin_users WHERE is_active = TRUE`),

      // Recent activities - UPDATED QUERIES
      pool.query(`
        SELECT 
          p.id, p.name, p.code, p.status, p.created_at, p.updated_at,
          au.name AS updated_by_name, au.email AS updated_by_email
        FROM projects p
        LEFT JOIN admin_users au ON au.id = p.updated_by
        ORDER BY p.created_at DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT 
          t.id, t.title, t.status, t.priority, t.created_at, t.updated_at,
          au.name AS assigned_to_name, au.email AS assigned_to_email,
          creator.name AS created_by_name, creator.email AS created_by_email
        FROM tickets t
        LEFT JOIN admin_users au ON au.id = t.assigned_to
        LEFT JOIN admin_users creator ON creator.id = t.created_by
        ORDER BY t.created_at DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT 
          pc.id, pc.project_id, pc.comment_text, pc.created_at,
          p.name AS project_name, p.code AS project_code,
          u.name AS user_name, u.email AS user_email
        FROM project_comments pc
        JOIN projects p ON p.id = pc.project_id
        JOIN admin_users u ON u.id = pc.user_id
        ORDER BY pc.created_at DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT 
          tc.id, tc.ticket_id, tc.comment_text, tc.created_at,
          t.title AS ticket_title, t.status AS ticket_status,
          u.name AS user_name, u.email AS user_email
        FROM ticket_comments tc
        JOIN tickets t ON t.id = tc.ticket_id
        JOIN admin_users u ON u.id = tc.user_id
        ORDER BY tc.created_at DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT id, name, email, role, last_login_at
        FROM admin_users
        WHERE last_login_at IS NOT NULL
        ORDER BY last_login_at DESC
        LIMIT 15
      `),
      pool.query(`
        SELECT u.id, u.name, u.email, u.role, l.logout_at
        FROM user_login_logs l
        JOIN admin_users u ON u.id = l.user_id
        WHERE l.logout_at IS NOT NULL
        ORDER BY l.logout_at DESC
        LIMIT 10
      `).catch(() => ({ rows: [] })),

      // Status breakdowns (unchanged)
      pool.query(`SELECT status, COUNT(*)::BIGINT AS count FROM projects GROUP BY status`),
      pool.query(`SELECT status, COUNT(*)::BIGINT AS count FROM tickets GROUP BY status`),
      pool.query(`SELECT priority, COUNT(*)::BIGINT AS count FROM tickets GROUP BY priority`),

      // Activity timelines (unchanged)
      pool.query(`
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::BIGINT AS count
        FROM projects
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `),
      pool.query(`
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::BIGINT AS count
        FROM tickets
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `),
      pool.query(`
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::BIGINT AS count
        FROM (
          SELECT created_at FROM project_comments 
          UNION ALL 
          SELECT created_at FROM ticket_comments
        ) AS all_comments
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `),
    ]);

    // Build activity feed (merge & sort all recent activities)
    const acts = [];

    // Project activities
    projectsRecent.rows.forEach((r) => {
      acts.push({
        type: "project",
        at: r.created_at,
        text: `Project created: ${r.name} (${r.code}) - Status: ${r.status}`,
        data: {
          ...r,
          updated_by_name: r.updated_by_name,
          updated_by_email: r.updated_by_email
        }
      });
    });

    // Ticket activities
    ticketsRecent.rows.forEach((r) => {
      acts.push({
        type: "ticket",
        at: r.created_at,
        text: `Ticket created: ${r.title} - Priority: ${r.priority}, Status: ${r.status}`,
        data: {
          ...r,
          assigned_to_name: r.assigned_to_name,
          assigned_to_email: r.assigned_to_email,
          created_by_name: r.created_by_name
        }
      });
    });

    // Project comment activities
    projectCommentsRecent.rows.forEach((r) => {
      acts.push({
        type: "project_comment",
        at: r.created_at,
        text: `${r.user_name} commented on project ${r.project_name} (${r.project_code})`,
        data: {
          ...r,
          user_name: r.user_name,
          user_email: r.user_email
        }
      });
    });

    // Ticket comment activities
    ticketCommentsRecent.rows.forEach((r) => {
      acts.push({
        type: "ticket_comment",
        at: r.created_at,
        text: `${r.user_name} commented on ticket: ${r.ticket_title}`,
        data: {
          ...r,
          user_name: r.user_name,
          user_email: r.user_email
        }
      });
    });

    // User login activities
    recentLogins.rows.forEach((r) => {
      acts.push({
        type: "user_login",
        at: r.last_login_at,
        text: `${r.name} logged in`,
        data: {
          ...r,
          name: r.name,
          email: r.email
        }
      });
    });

    // Real user logout activities from user_login_logs
    recentRealLogouts.rows.forEach((r) => {
      acts.push({
        type: "user_logout",
        at: r.logout_at,
        text: `${r.name} logged out`,
        data: {
          ...r,
          name: r.name,
          email: r.email
        }
      });
    });

    // Sort by date (newest first)
    acts.sort((a, b) => new Date(b.at) - new Date(a.at));
    const activityFeed = acts.slice(0, 20).map((act) => {
      const key = buildServerNotifKey(act);
      const actTimeMs = act.at ? new Date(act.at).getTime() : 0;
      const isOwnLoginLogout =
        (act.type === 'user_login' || act.type === 'user_logout') &&
        Number(act.data?.id) === currentUserId;
      const isAfterLastRead = !lastReadMs || actTimeMs > lastReadMs;
      const is_new = !isOwnLoginLogout && isAfterLastRead && !seenKeys.has(key);
      return {
        ...act,
        key,
        is_new
      };
    });

    const unreadCount = activityFeed.filter((a) => a.is_new).length;

    // Build response
    res.json({
      unreadCount,
      lastReadAt: readRow.notif_last_read_at || null,
      totals: {
        projects: Number(projectsCount.rows[0]?.c || 0),
        tickets: Number(ticketsCount.rows[0]?.c || 0),
        comments: Number(commentsCount.rows[0]?.c || 0),
        users: Number(usersCount.rows[0]?.c || 0),
      },

      statusBreakdowns: {
        projects: projectsByStatus.rows.map((r) => ({
          status: r.status,
          count: Number(r.count || 0),
        })),
        tickets: {
          byStatus: ticketsByStatus.rows.map((r) => ({
            status: r.status,
            count: Number(r.count || 0),
          })),
          byPriority: ticketsByPriority.rows.map((r) => ({
            priority: r.priority,
            count: Number(r.count || 0),
          })),
        },
      },

      trendsLast30: {
        projects: projectsLast30.rows.map((r) => ({
          day: r.day,
          count: Number(r.count || 0),
        })),
        tickets: ticketsLast30.rows.map((r) => ({
          day: r.day,
          count: Number(r.count || 0),
        })),
        comments: commentsLast30.rows.map((r) => ({
          day: r.day,
          count: Number(r.count || 0),
        })),
      },

      recentLogins: recentLogins.rows,
      activityFeed,

      // Raw recent data for detailed views if needed
      recentData: {
        projects: projectsRecent.rows,
        tickets: ticketsRecent.rows,
        projectComments: projectCommentsRecent.rows,
        ticketComments: ticketCommentsRecent.rows,
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// Mark notifications as read (single key or mark all)
app.post('/api/notifications/mark-read', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user?.sub);
    const { markAll, key, keys, latestAt } = req.body || {};

    const curQ = await pool.query(
      `SELECT COALESCE(notif_seen_keys, '[]'::jsonb) AS notif_seen_keys FROM admin_users WHERE id = $1`,
      [userId]
    );
    const existingKeys = Array.isArray(curQ.rows[0]?.notif_seen_keys) ? curQ.rows[0].notif_seen_keys : [];
    const seenSet = new Set(existingKeys);

    if (key) seenSet.add(String(key));
    if (Array.isArray(keys)) keys.forEach((k) => k && seenSet.add(String(k)));

    const trimmedKeys = Array.from(seenSet).slice(-150);

    if (markAll) {
      const safeLatestAt = latestAt && !isNaN(new Date(latestAt).getTime()) ? new Date(latestAt) : null;
      await pool.query(
        `UPDATE admin_users
         SET notif_last_read_at = GREATEST(NOW(), COALESCE($1::timestamptz, NOW())),
             notif_seen_keys = $2::jsonb
         WHERE id = $3`,
        [safeLatestAt, JSON.stringify(trimmedKeys), userId]
      );
      return res.json({ success: true, unreadCount: 0 });
    }

    await pool.query(
      `UPDATE admin_users SET notif_seen_keys = $1::jsonb WHERE id = $2`,
      [JSON.stringify(trimmedKeys), userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark notifications read error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark notifications as read' });
  }
});

// GET /api/stats/tickets — robust + debug-friendly
app.get("/api/stats/tickets", requireAuth, async (req, res) => {
  try {
    const currentUserId = Number(req.user?.sub);

    const userReadQ = await pool.query(
      `SELECT ticket_last_read_at, COALESCE(ticket_seen_keys, '[]'::jsonb) AS ticket_seen_keys
       FROM admin_users WHERE id = $1`,
      [currentUserId]
    ).catch(() => ({ rows: [] }));

    const readRow = userReadQ.rows[0] || {};
    const lastReadMs = readRow.ticket_last_read_at ? new Date(readRow.ticket_last_read_at).getTime() : 0;
    const seenKeysArr = Array.isArray(readRow.ticket_seen_keys) ? readRow.ticket_seen_keys : [];
    const seenKeys = new Set(seenKeysArr);

    // 1) tickets count - visible to all authenticated users
    const qTicketsCount = `SELECT COUNT(*)::BIGINT AS c FROM tickets`;

    // 2) recent tickets
    const qTicketsRecent = `
      SELECT t.id, t.title, t.status, t.priority, t.created_at, t.updated_at,
             au.name AS assigned_to_name, au.email AS assigned_to_email,
             creator.name AS created_by_name
      FROM tickets t
      LEFT JOIN admin_users au ON au.id = t.assigned_to
      LEFT JOIN admin_users creator ON creator.id = t.created_by
      ORDER BY t.created_at DESC
      LIMIT 20
    `;

    // 3) recent ticket comments (limit 20): show comments across all tickets
    const qTicketCommentsRecent = `
      SELECT tc.id, tc.ticket_id, tc.comment_text, tc.created_at,
             t.title AS ticket_title, t.status AS ticket_status,
             u.name AS user_name, u.email AS user_email
      FROM ticket_comments tc
      JOIN tickets t ON t.id = tc.ticket_id
      JOIN admin_users u ON u.id = tc.user_id
      ORDER BY tc.created_at DESC
      LIMIT 20
    `;

    // 4) tickets by status
    const qTicketsByStatus = `SELECT status, COUNT(*)::BIGINT AS count FROM tickets GROUP BY status`;

    // 5) tickets by priority
    const qTicketsByPriority = `SELECT priority, COUNT(*)::BIGINT AS count FROM tickets GROUP BY priority`;

    // 6) tickets last 30 days
    const qTicketsLast30 = `
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::BIGINT AS count
      FROM tickets
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC
    `;

    // 7) comments last 30 days
    const qCommentsLast30 = `
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::BIGINT AS count
      FROM ticket_comments
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC
    `;

    // Execute all
    const [
      ticketsCountQ,
      ticketsRecentQ,
      ticketCommentsRecentQ,
      ticketsByStatusQ,
      ticketsByPriorityQ,
      ticketsLast30Q,
      commentsLast30Q,
    ] = await Promise.all([
      pool.query(qTicketsCount),
      pool.query(qTicketsRecent),
      pool.query(qTicketCommentsRecent),
      pool.query(qTicketsByStatus),
      pool.query(qTicketsByPriority),
      pool.query(qTicketsLast30),
      pool.query(qCommentsLast30),
    ]);

    // Build activity feed
    const acts = [];

    ticketsRecentQ.rows.forEach((r) => {
      acts.push({
        type: "ticket",
        at: r.created_at,
        text: `Ticket created: ${r.title} - Priority: ${r.priority}, Status: ${r.status}`,
        data: r,
      });
    });

    ticketCommentsRecentQ.rows.forEach((r) => {
      acts.push({
        type: "ticket_comment",
        at: r.created_at,
        text: `${r.user_name} commented on ticket: ${r.ticket_title}`,
        data: r,
      });
    });

    acts.sort((a, b) => new Date(b.at) - new Date(a.at));
    const activityFeed = acts.slice(0, 20).map((act) => {
      const key = buildServerTicketKey(act);
      const actTimeMs = act.at ? new Date(act.at).getTime() : 0;
      const isAfterLastRead = !lastReadMs || actTimeMs > lastReadMs;
      const is_new = isAfterLastRead && !seenKeys.has(key);
      return {
        ...act,
        key,
        is_new
      };
    });

    const unreadCount = activityFeed.filter((a) => a.is_new).length;

    res.json({
      unreadCount,
      lastReadAt: readRow.ticket_last_read_at || null,
      totals: { tickets: Number(ticketsCountQ.rows[0]?.c || 0) },
      statusBreakdowns: {
        byStatus: ticketsByStatusQ.rows.map((r) => ({ status: r.status, count: Number(r.count || 0) })),
        byPriority: ticketsByPriorityQ.rows.map((r) => ({ priority: r.priority, count: Number(r.count || 0) })),
      },
      trendsLast30: {
        tickets: ticketsLast30Q.rows.map((r) => ({ day: r.day, count: Number(r.count || 0) })),
        comments: commentsLast30Q.rows.map((r) => ({ day: r.day, count: Number(r.count || 0) })),
      },
      activityFeed,
      recentData: { tickets: ticketsRecentQ.rows, ticketComments: ticketCommentsRecentQ.rows },
    });
  } catch (e) {
    console.error("[stats/tickets] error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Mark ticket activities as read (single key or mark all)
app.post('/api/tickets-activity/mark-read', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user?.sub);
    const { markAll, key, keys, latestAt } = req.body || {};

    const curQ = await pool.query(
      `SELECT COALESCE(ticket_seen_keys, '[]'::jsonb) AS ticket_seen_keys FROM admin_users WHERE id = $1`,
      [userId]
    );
    const existingKeys = Array.isArray(curQ.rows[0]?.ticket_seen_keys) ? curQ.rows[0].ticket_seen_keys : [];
    const seenSet = new Set(existingKeys);

    if (key) seenSet.add(String(key));
    if (Array.isArray(keys)) keys.forEach((k) => k && seenSet.add(String(k)));

    const trimmedKeys = Array.from(seenSet).slice(-150);

    if (markAll) {
      const safeLatestAt = latestAt && !isNaN(new Date(latestAt).getTime()) ? new Date(latestAt) : null;
      await pool.query(
        `UPDATE admin_users
         SET ticket_last_read_at = GREATEST(NOW(), COALESCE($1::timestamptz, NOW())),
             ticket_seen_keys = $2::jsonb
         WHERE id = $3`,
        [safeLatestAt, JSON.stringify(trimmedKeys), userId]
      );
      return res.json({ success: true, unreadCount: 0 });
    }

    await pool.query(
      `UPDATE admin_users SET ticket_seen_keys = $1::jsonb WHERE id = $2`,
      [JSON.stringify(trimmedKeys), userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark ticket activity read error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark ticket activity as read' });
  }
});





/* --------------------------------- Projects Commets ---------------------------------- */
// Get comments for a project
app.get('/api/projects/:projectId/comments', requireAuth, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId)
    if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id' })

    // Check if user has access to this project
    if (!isAdmin(req)) {
      const hasAccess = await pool.query(
        'SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 LIMIT 1',
        [projectId, req.user.sub]
      )
      if (hasAccess.rows.length === 0) return res.status(403).json({ message: 'Forbidden' })
    }

    // Get comments with user info, ordered by creation date (newest first)
    const { rows } = await pool.query(`
      SELECT 
        c.*,
        u.name as user_name,
        u.email as user_email,
        u.role as user_role
      FROM project_comments c
      JOIN admin_users u ON u.id = c.user_id
      WHERE c.project_id = $1
      ORDER BY c.created_at DESC
    `, [projectId])

    // Structure comments into a tree (parent/child relationships)
    const commentMap = {}
    const rootComments = []

    rows.forEach(comment => {
      commentMap[comment.id] = { ...comment, replies: [] }
    })

    rows.forEach(comment => {
      if (comment.parent_id) {
        if (commentMap[comment.parent_id]) {
          commentMap[comment.parent_id].replies.push(commentMap[comment.id])
        }
      } else {
        rootComments.push(commentMap[comment.id])
      }
    })

    res.json({ success: true, comments: rootComments })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Add a new comment
app.post('/api/projects/:projectId/comments', requireAuth, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId)
    if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id' })

    const { comment_text, parent_id } = req.body
    if (!comment_text || comment_text.trim().length === 0) {
      return res.status(400).json({ message: 'Comment text is required' })
    }

    // Check if user has access to this project
    if (!isAdmin(req)) {
      const hasAccess = await pool.query(
        'SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 LIMIT 1',
        [projectId, req.user.sub]
      )
      if (hasAccess.rows.length === 0) return res.status(403).json({ message: 'Forbidden' })
    }

    // Validate parent_id if provided
    if (parent_id) {
      const parentComment = await pool.query(
        'SELECT id FROM project_comments WHERE id=$1 AND project_id=$2',
        [parent_id, projectId]
      )
      if (parentComment.rows.length === 0) {
        return res.status(400).json({ message: 'Invalid parent comment' })
      }
    }

    // Insert comment
    const { rows } = await pool.query(`
      INSERT INTO project_comments (project_id, user_id, parent_id, comment_text)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [projectId, req.user.sub, parent_id || null, comment_text.trim()])

    // Get comment with user info
    const newComment = await pool.query(`
      SELECT 
        c.*,
        u.name as user_name,
        u.email as user_email,
        u.role as user_role
      FROM project_comments c
      JOIN admin_users u ON u.id = c.user_id
      WHERE c.id = $1
    `, [rows[0].id])

    res.status(201).json({ success: true, comment: newComment.rows[0] })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Edit a comment (only by author)
app.put('/api/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const commentId = Number(req.params.commentId)
    if (!Number.isFinite(commentId)) return res.status(400).json({ message: 'Invalid comment id' })

    const { comment_text } = req.body
    if (!comment_text || comment_text.trim().length === 0) {
      return res.status(400).json({ message: 'Comment text is required' })
    }

    // Check if user is the author of this comment
    const comment = await pool.query(
      'SELECT * FROM project_comments WHERE id=$1',
      [commentId]
    )

    if (comment.rows.length === 0) return res.status(404).json({ message: 'Comment not found' })
    if (comment.rows[0].user_id !== req.user.sub) return res.status(403).json({ message: 'Forbidden' })

    // Update comment
    const { rows } = await pool.query(`
      UPDATE project_comments 
      SET comment_text = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [comment_text.trim(), commentId])

    res.json({ success: true, comment: rows[0] })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Delete a comment (author or admin)
app.delete('/api/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const commentId = Number(req.params.commentId)
    if (!Number.isFinite(commentId)) return res.status(400).json({ message: 'Invalid comment id' })

    // Check if user is the author or an admin
    const comment = await pool.query(
      'SELECT * FROM project_comments WHERE id=$1',
      [commentId]
    )

    if (comment.rows.length === 0) return res.status(404).json({ message: 'Comment not found' })

    if (comment.rows[0].user_id !== req.user.sub && !isAdmin(req)) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    // Delete comment (cascade will delete replies)
    await pool.query('DELETE FROM project_comments WHERE id=$1', [commentId])

    res.json({ success: true, message: 'Comment deleted' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/* --------------------------- Ticket Export API --------------------------- */
app.get('/api/admin/tickets/export.csv', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate, status, priority, search } = req.query;

    let where = [];
    let params = [];
    let paramCount = 0;

    // Apply filters
    if (status && status !== 'all') {
      paramCount++;
      where.push(`t.status = $${paramCount}`);
      params.push(status);
    }

    if (priority && priority !== 'all') {
      paramCount++;
      where.push(`t.priority = $${paramCount}`);
      params.push(priority);
    }

    if (search) {
      paramCount++;
      where.push(`(t.title ILIKE $${paramCount} OR t.description ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }

    // Date range filtering
    if (startDate) {
      paramCount++;
      where.push(`t.created_at >= $${paramCount}`);
      params.push(new Date(startDate));
    }

    if (endDate) {
      paramCount++;
      // Add one day to include the end date fully
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      where.push(`t.created_at < $${paramCount}`);
      params.push(end);
    }

    // Tickets are visible to everyone in the admin panel

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Get tickets with comments for export
    const ticketsQuery = await pool.query(`
      SELECT 
        t.*,
        creator.name as creator_name,
        creator.email as creator_email,
        assignee.name as assignee_name,
        assignee.email as assignee_email,
        last_editor.name as last_editor_name,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', tc.id,
            'comment_text', tc.comment_text,
            'user_name', commenter.name,
            'user_email', commenter.email,
            'created_at', tc.created_at,
            'updated_at', tc.updated_at
          ) ORDER BY tc.created_at ASC
        ) FILTER (WHERE tc.id IS NOT NULL) as comments
      FROM tickets t
      LEFT JOIN admin_users creator ON creator.id = t.created_by
      LEFT JOIN admin_users assignee ON assignee.id = t.assigned_to
      LEFT JOIN admin_users last_editor ON last_editor.id = t.last_edited_by
      LEFT JOIN ticket_comments tc ON tc.ticket_id = t.id
      LEFT JOIN admin_users commenter ON commenter.id = tc.user_id
      ${whereSql}
      GROUP BY t.id, creator.id, assignee.id, last_editor.id
      ORDER BY t.created_at DESC
    `, params);

    const rows = ticketsQuery.rows || [];

    // Generate CSV
    const header = [
      'ID', 'Title', 'Description', 'Status', 'Priority',
      'Creator', 'Creator Email', 'Assigned To', 'Assigned To Email',
      'Created At', 'Updated At', 'Last Editor',
      'Comments Count', 'Comments'
    ];

    const csvLines = [header.join(',')];

    const esc = (v) => {
      if (v == null) return '';
      const s = String(v)
        .replaceAll('"', '""')
        .replaceAll('\n', ' ')
        .replaceAll('\r', ' ');
      return `"${s}"`;
    };

    rows.forEach(r => {
      const commentsText = Array.isArray(r.comments)
        ? r.comments.map(c =>
          `[${new Date(c.created_at).toLocaleString()}] ${c.user_name}: ${c.comment_text}`
        ).join(' | ')
        : '';

      const row = [
        r.id,
        r.title,
        r.description ? r.description.replace(/<[^>]*>/g, '') : '',
        r.status,
        r.priority,
        r.creator_name,
        r.creator_email,
        r.assignee_name,
        r.assignee_email,
        new Date(r.created_at).toISOString(),
        new Date(r.updated_at).toISOString(),
        r.last_editor_name,
        Array.isArray(r.comments) ? r.comments.length : 0,
        commentsText
      ];

      csvLines.push(row.map(esc).join(','));
    });

    const csv = csvLines.join('\n');
    const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tickets-${ts}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error('Ticket export error:', e);
    res.status(500).json({ success: false, message: 'Failed to export tickets' });
  }
});

/* --------------------------------- Tickets API --------------------------------- */
// Get all tickets
app.get('/api/tickets', requireAuth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const hasLimit = req.query.limit !== undefined && req.query.limit !== null && req.query.limit !== '';
    const limit = hasLimit ? Math.max(parseInt(req.query.limit) || 20, 1) : 1000;
    const offset = (page - 1) * limit;

    const {
      status,
      priority,
      search,
      startDate,
      endDate,
      assignee
    } = req.query;

    let where = [];
    let params = [];
    let paramCount = 0;

    if (status && status !== 'all') {
      paramCount++;
      where.push(`t.status = $${paramCount}`);
      params.push(status);
    }

    if (priority && priority !== 'all') {
      paramCount++;
      where.push(`t.priority = $${paramCount}`);
      params.push(priority);
    }

    if (search) {
      paramCount++;
      where.push(`(t.title ILIKE $${paramCount} OR t.description ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }

    if (assignee && assignee !== 'all') {
      paramCount++;
      where.push(`t.assigned_to = $${paramCount}`);
      params.push(assignee);
    }

    // Date range filtering - FIXED: Tickets never expire, show all by default
    if (startDate) {
      paramCount++;
      where.push(`t.created_at >= $${paramCount}`);
      params.push(new Date(startDate));
    }

    if (endDate) {
      paramCount++;
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      where.push(`t.created_at < $${paramCount}`);
      params.push(end);
    }

    // All tickets are visible to everyone in the admin panel

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Get total count
    const countQuery = await pool.query(
      `SELECT COUNT(*)::BIGINT AS total FROM tickets t ${whereSql}`,
      params
    );
    const total = Number(countQuery.rows[0]?.total || 0);

    // Get tickets with pagination
    params.push(limit);
    params.push(offset);

    const dataQuery = await pool.query(`
      SELECT 
        t.*,
        creator.id AS creator_id, creator.name AS creator_name, creator.email AS creator_email,
        assignee.id AS assignee_id, assignee.name AS assignee_name, assignee.email AS assignee_email,
        (SELECT COUNT(*) FROM ticket_comments WHERE ticket_id = t.id) AS comment_count
      FROM tickets t
      LEFT JOIN admin_users creator ON creator.id = t.created_by
      LEFT JOIN admin_users assignee ON assignee.id = t.assigned_to
      ${whereSql}
      ORDER BY t.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      success: true,
      tickets: dataQuery.rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
    });
  } catch (e) {
    console.error('Tickets list error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get a single ticket with comments
app.get('/api/tickets/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ticket id' });

    // Get ticket info
    const ticketQuery = await pool.query(`
      SELECT 
        t.*,
        creator.id AS creator_id, creator.name AS creator_name, creator.email AS creator_email,
        assignee.id AS assignee_id, assignee.name AS assignee_name, assignee.email AS assignee_email,
        last_editor.name AS last_editor_name
      FROM tickets t
      LEFT JOIN admin_users creator ON creator.id = t.created_by
      LEFT JOIN admin_users assignee ON assignee.id = t.assigned_to
      LEFT JOIN admin_users last_editor ON last_editor.id = t.last_edited_by
      WHERE t.id = $1
    `, [id]);

    if (ticketQuery.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Get comments
    const commentsQuery = await pool.query(`
      SELECT 
        tc.*,
        u.id AS user_id, u.name AS user_name, u.email AS user_email, u.role AS user_role
      FROM ticket_comments tc
      JOIN admin_users u ON u.id = tc.user_id
      WHERE tc.ticket_id = $1
      ORDER BY tc.created_at ASC
    `, [id]);

    res.json({
      success: true,
      ticket: ticketQuery.rows[0],
      comments: commentsQuery.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create a new ticket
app.post('/api/tickets', requireAuth, async (req, res) => {
  try {
    const { title, description, priority = 'medium', assigned_to } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const result = await pool.query(`
      INSERT INTO tickets (title, description, priority, created_by, assigned_to)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [title, description, priority, req.user.sub, assigned_to || null]);

    const createdTicket = result.rows[0];

    // Send email notification to assigned user (non-blocking)
    if (createdTicket && createdTicket.assigned_to) {
      (async () => {
        try {
          const assigneeRes = await pool.query(
            'SELECT id, name, email FROM admin_users WHERE id = $1',
            [createdTicket.assigned_to]
          );
          if (assigneeRes.rows.length && assigneeRes.rows[0].email) {
            const assignee = assigneeRes.rows[0];
            await sendTicketAssignedEmail({
              to: assignee.email,
              assigneeName: assignee.name,
              ticketId: createdTicket.id,
              title: createdTicket.title,
              description: createdTicket.description,
              priority: createdTicket.priority,
              createdByName: req.user.name || req.user.email,
              createdByEmail: req.user.email
            });
          }
        } catch (mailErr) {
          console.error('[Mailer] Error sending ticket assignment email:', mailErr);
        }
      })();
    }

    res.status(201).json({ success: true, ticket: createdTicket });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update a ticket
// In app.js - Update the PATCH /api/tickets/:id endpoint
app.patch('/api/tickets/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ticket id' });

    // Fetch previous assigned_to before update to detect re-assignment
    const prevRes = await pool.query('SELECT assigned_to FROM tickets WHERE id=$1', [id]);
    const prevAssignedTo = prevRes.rows[0]?.assigned_to;

    const { title, description, status, priority, assigned_to } = req.body;
    const sets = [];
    const params = [];

    if (title) { params.push(title); sets.push(`title = $${params.length}`); }
    if (description) { params.push(description); sets.push(`description = $${params.length}`); }
    if (status) { params.push(status); sets.push(`status = $${params.length}`); }
    if (priority) { params.push(priority); sets.push(`priority = $${params.length}`); }
    if (assigned_to !== undefined) {
      params.push(assigned_to);
      sets.push(`assigned_to = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Add last_edited_by and updated_at
    params.push(req.user.sub);
    sets.push(`last_edited_by = $${params.length}`);
    sets.push(`updated_at = NOW()`);

    params.push(id);
    const result = await pool.query(`
      UPDATE tickets 
      SET ${sets.join(', ')}
      WHERE id = $${params.length}
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const updatedTicket = result.rows[0];

    // If assigned_to changed to a new user, send email notification
    if (assigned_to && Number(assigned_to) !== Number(prevAssignedTo)) {
      (async () => {
        try {
          const assigneeRes = await pool.query(
            'SELECT id, name, email FROM admin_users WHERE id = $1',
            [assigned_to]
          );
          if (assigneeRes.rows.length && assigneeRes.rows[0].email) {
            const assignee = assigneeRes.rows[0];
            await sendTicketAssignedEmail({
              to: assignee.email,
              assigneeName: assignee.name,
              ticketId: updatedTicket.id,
              title: updatedTicket.title,
              description: updatedTicket.description,
              priority: updatedTicket.priority,
              createdByName: req.user.name || req.user.email,
              createdByEmail: req.user.email
            });
          }
        } catch (mailErr) {
          console.error('[Mailer] Error sending ticket assignment email:', mailErr);
        }
      })();
    }

    res.json({ success: true, ticket: updatedTicket });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add a comment to a ticket
app.post('/api/tickets/:id/comments', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ticket id' });

    const { comment_text } = req.body;
    if (!comment_text || !comment_text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const exists = await pool.query('SELECT 1 FROM tickets WHERE id=$1', [id]);
    if (!exists.rows.length) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const ins = await pool.query(
      `INSERT INTO ticket_comments (ticket_id, user_id, comment_text)
       VALUES ($1,$2,$3) RETURNING id`,
      [id, req.user.sub, comment_text.trim()]
    );

    await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id=$1', [id]);

    const joined = await pool.query(
      `SELECT tc.*, u.id AS user_id, u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM ticket_comments tc
       JOIN admin_users u ON u.id = tc.user_id
       WHERE tc.id=$1`,
      [ins.rows[0].id]
    );

    // Notify ticket assignee and creator of the new comment (non-blocking)
    (async () => {
      try {
        const ticketInfo = await pool.query(
          `SELECT t.id, t.title, t.created_by, t.assigned_to,
                  c.name AS creator_name, c.email AS creator_email,
                  a.name AS assignee_name, a.email AS assignee_email
           FROM tickets t
           LEFT JOIN admin_users c ON c.id = t.created_by
           LEFT JOIN admin_users a ON a.id = t.assigned_to
           WHERE t.id = $1`,
          [id]
        );
        if (ticketInfo.rows.length) {
          const t = ticketInfo.rows[0];
          const commenterId = Number(req.user.sub);
          const commenterName = req.user.name || req.user.email;

          // Notify assignee if not the commenter
          if (t.assigned_to && Number(t.assigned_to) !== commenterId && t.assignee_email) {
            await sendTicketCommentEmail({
              to: t.assignee_email,
              recipientName: t.assignee_name,
              ticketId: t.id,
              title: t.title,
              commenterName: commenterName,
              commentText: comment_text.trim()
            });
          }

          // Notify creator if not the commenter and not the assignee
          if (
            t.created_by &&
            Number(t.created_by) !== commenterId &&
            Number(t.created_by) !== Number(t.assigned_to) &&
            t.creator_email
          ) {
            await sendTicketCommentEmail({
              to: t.creator_email,
              recipientName: t.creator_name,
              ticketId: t.id,
              title: t.title,
              commenterName: commenterName,
              commentText: comment_text.trim()
            });
          }
        }
      } catch (mailErr) {
        console.error('[Mailer] Error sending ticket comment email:', mailErr);
      }
    })();

    res.status(201).json({ success: true, comment: joined.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update a ticket comment
app.patch('/api/ticket-comments/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid comment id' });

    const { comment_text } = req.body;
    if (!comment_text || !comment_text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const own = await pool.query(
      'SELECT 1 FROM ticket_comments WHERE id=$1 AND user_id=$2',
      [id, req.user.sub]
    );
    if (!own.rows.length) return res.status(404).json({ success: false, message: 'Comment not found or access denied' });

    await pool.query(
      `UPDATE ticket_comments SET comment_text=$1, updated_at=NOW() WHERE id=$2`,
      [comment_text.trim(), id]
    );

    const joined = await pool.query(
      `SELECT tc.*, u.id AS user_id, u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM ticket_comments tc
       JOIN admin_users u ON u.id = tc.user_id
       WHERE tc.id=$1`,
      [id]
    );

    res.json({ success: true, comment: joined.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Delete a ticket comment
app.delete('/api/ticket-comments/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid comment id' });

    // Check if user owns this comment or is admin
    const commentCheck = await pool.query(
      'SELECT * FROM ticket_comments WHERE id = $1',
      [id]
    );

    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    if (commentCheck.rows[0].user_id !== req.user.sub && !isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await pool.query('DELETE FROM ticket_comments WHERE id = $1', [id]);
    res.json({ success: true, message: 'Comment deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add this endpoint after the existing user management endpoints
app.get('/api/admin/users/for-assignment', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, email 
      FROM admin_users 
      WHERE is_active = TRUE 
      ORDER BY name
    `);
    res.json({ success: true, users: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete a ticket (creator or admin)
app.delete('/api/tickets/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ticket id' });

    const q = await pool.query(
      `SELECT id, created_by FROM tickets WHERE id=$1`,
      [id]
    );
    const t = q.rows[0];
    if (!t) return res.status(404).json({ success: false, message: 'Ticket not found' });

    // Only creator or admin
    if (t.created_by !== req.user.sub && !isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await pool.query(`DELETE FROM tickets WHERE id=$1`, [id]);
    return res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Track ticket views
app.post('/api/tickets/:id/view', requireAuth, async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const userId = req.user.sub;

    if (!Number.isFinite(ticketId)) return res.status(400).json({ message: 'Invalid ticket id' });

    // Check if user already viewed this ticket
    const existingView = await pool.query(
      'SELECT 1 FROM ticket_views WHERE ticket_id=$1 AND user_id=$2 LIMIT 1',
      [ticketId, userId]
    );

    if (existingView.rows.length === 0) {
      // Record new view
      await pool.query(
        'INSERT INTO ticket_views (ticket_id, user_id) VALUES ($1, $2)',
        [ticketId, userId]
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get ticket viewers
app.get('/api/tickets/:id/viewers', requireAuth, async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    if (!Number.isFinite(ticketId)) return res.status(400).json({ message: 'Invalid ticket id' });

    const viewers = await pool.query(`
      SELECT au.id, au.name, au.email, tv.viewed_at
      FROM ticket_views tv
      JOIN admin_users au ON au.id = tv.user_id
      WHERE tv.ticket_id = $1
      ORDER BY tv.viewed_at DESC
    `, [ticketId]);

    res.json({ success: true, viewers: viewers.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


//Leaves Management

app.get('/api/leaves/approvers', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;

    const result = await pool.query(`
      SELECT id, name, email, role, department, position
      FROM admin_users 
      WHERE is_active = TRUE AND id != $1
      ORDER BY name ASC
    `, [currentUserId]);

    res.json({
      success: true,
      approvers: result.rows
    });

  } catch (error) {
    console.error('Get approvers error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



app.get('/api/leaves/my-leaves', requireAuth, async (req, res) => {
  try {
    const employeeId = req.user.sub;
    const { status, year, page = 1, limit = 10 } = req.query;

    let whereClause = 'WHERE l.employee_id = $1';
    let params = [employeeId];
    let paramCount = 1;

    if (status && status !== 'all') {
      paramCount++;
      whereClause += ` AND l.status = $${paramCount}`;
      params.push(status);
    }

    if (year) {
      paramCount++;
      whereClause += ` AND EXTRACT(YEAR FROM l.start_date) = $${paramCount}`;
      params.push(year);
    }

    // Get total count
    const countQuery = await pool.query(
      `SELECT COUNT(*) FROM leaves l ${whereClause}`,
      params
    );
    const total = parseInt(countQuery.rows[0].count);

    // Calculate pagination
    const offset = (page - 1) * limit;
    paramCount++;
    params.push(limit);
    paramCount++;
    params.push(offset);

    // Get leaves
    const leavesQuery = await pool.query(`
      SELECT l.*, 
             emp.name as employee_name, emp.email as employee_email, emp.role as employee_role, emp.department as employee_department,
             appr.name as approver_name, appr.email as approver_email, appr.role as approver_role,
             approver.name as approved_by_name
      FROM leaves l
      JOIN admin_users emp ON emp.id = l.employee_id
      JOIN admin_users appr ON appr.id = l.approver_id
      LEFT JOIN admin_users approver ON approver.id = l.approved_by
      ${whereClause}
      ORDER BY l.applied_on DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `, params);

    res.json({
      success: true,
      leaves: leavesQuery.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get my leaves error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/leaves/for-approval', requireAuth, async (req, res) => {
  try {
    const approverId = req.user.sub;
    const { status, year, page = 1, limit = 10 } = req.query;

    let whereClause = 'WHERE l.approver_id = $1';
    let params = [approverId];
    let paramCount = 1;

    if (status && status !== 'all') {
      paramCount++;
      whereClause += ` AND l.status = $${paramCount}`;
      params.push(status);
    }

    if (year) {
      paramCount++;
      whereClause += ` AND EXTRACT(YEAR FROM l.start_date) = $${paramCount}`;
      params.push(year);
    }

    // Get total count
    const countQuery = await pool.query(
      `SELECT COUNT(*) FROM leaves l ${whereClause}`,
      params
    );
    const total = parseInt(countQuery.rows[0].count);

    // Calculate pagination
    const offset = (page - 1) * limit;
    paramCount++;
    params.push(limit);
    paramCount++;
    params.push(offset);

    // Get leaves
    const leavesQuery = await pool.query(`
      SELECT l.*, 
             emp.name as employee_name, emp.email as employee_email, emp.role as employee_role, emp.department as employee_department,
             appr.name as approver_name, appr.email as approver_email, appr.role as approver_role,
             approver.name as approved_by_name
      FROM leaves l
      JOIN admin_users emp ON emp.id = l.employee_id
      JOIN admin_users appr ON appr.id = l.approver_id
      LEFT JOIN admin_users approver ON approver.id = l.approved_by
      ${whereClause}
      ORDER BY l.applied_on DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `, params);

    res.json({
      success: true,
      leaves: leavesQuery.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get leaves for approval error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/admin/leaves', requireAuth, async (req, res) => {
  try {
    const { status, department, year, page = 1, limit = 10 } = req.query;

    let whereClause = 'WHERE 1=1';
    let params = [];
    let paramCount = 0;

    if (status && status !== 'all') {
      paramCount++;
      whereClause += ` AND l.status = $${paramCount}`;
      params.push(status);
    }

    if (department && department !== 'all') {
      paramCount++;
      whereClause += ` AND emp.department = $${paramCount}`;
      params.push(department);
    }

    if (year && year !== 'all') {
      paramCount++;
      whereClause += ` AND EXTRACT(YEAR FROM l.start_date) = $${paramCount}`;
      params.push(parseInt(year));
    }

    // Get total count
    const countQuery = await pool.query(
      `SELECT COUNT(*) FROM leaves l 
       JOIN admin_users emp ON emp.id = l.employee_id 
       ${whereClause}`,
      params
    );
    const total = parseInt(countQuery.rows[0].count);

    // Calculate pagination
    const offset = (page - 1) * limit;
    paramCount++;
    params.push(parseInt(limit));
    paramCount++;
    params.push(parseInt(offset));

    // Get leaves
    const leavesQuery = await pool.query(`
      SELECT l.*, 
             emp.name as employee_name, emp.email as employee_email, emp.role as employee_role, emp.department as employee_department,
             appr.name as approver_name, appr.email as approver_email, appr.role as approver_role,
             approver.name as approved_by_name
      FROM leaves l
      JOIN admin_users emp ON emp.id = l.employee_id
      JOIN admin_users appr ON appr.id = l.approver_id
      LEFT JOIN admin_users approver ON approver.id = l.approved_by
      ${whereClause}
      ORDER BY l.applied_on DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `, params);

    res.json({
      success: true,
      leaves: leavesQuery.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get all leaves error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// Update the leave application endpoint

// Also update the leave application route to fix the error message
app.post('/api/leaves/apply', requireAuth, async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason, approverId } = req.body;
    const employeeId = req.user.sub;

    // Validation
    if (!leaveType || !startDate || !endDate || !reason || !approverId) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const validLeaveTypes = ['sick', 'casual', 'annual', 'maternity', 'paternity'];
    if (!validLeaveTypes.includes(leaveType)) {
      return res.status(400).json({ success: false, message: 'Invalid leave type' });
    }

    // Check if approver exists and is active
    const approverCheck = await pool.query(
      'SELECT id, name FROM admin_users WHERE id = $1 AND is_active = TRUE',
      [approverId]
    );

    if (approverCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Selected approver not found or inactive' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      return res.status(400).json({ success: false, message: 'Start date cannot be in the past' });
    }

    if (end < start) {
      return res.status(400).json({ success: false, message: 'End date cannot be before start date' });
    }

    // Calculate total days (including Saturdays, excluding Sundays)
    const totalDays = calculateWorkingDays(start, end);

    if (totalDays <= 0) {
      return res.status(400).json({ success: false, message: 'No working days in selected period' });
    }

    // Check leave balance and monthly limits
    const balanceQuery = await pool.query(
      'SELECT * FROM leave_balances WHERE employee_id = $1',
      [employeeId]
    );

    if (balanceQuery.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Leave balance not found' });
    }

    const balance = balanceQuery.rows[0];
    const availableBalance = balance[`${leaveType}_balance`];

    // Check monthly limits for sick and casual leaves
    if (leaveType === 'sick' || leaveType === 'casual') {
      const withinMonthlyLimit = await checkMonthlyLimit(employeeId, leaveType, totalDays);
      if (!withinMonthlyLimit) {
        const monthlyLimit = leaveType === 'sick' ? 1 : 2;
        const usedThisMonth = leaveType === 'sick' ?
          (Number(balance.sick_used_this_month) || 0) :
          (Number(balance.casual_used_this_month) || 0);
        const availableThisMonth = monthlyLimit - usedThisMonth;

        return res.status(400).json({
          success: false,
          message: `Monthly ${leaveType} leave limit exceeded. Available this month: ${availableThisMonth}, Requested: ${totalDays}`
        });
      }
    }

    if (availableBalance < totalDays) {
      return res.status(400).json({
        success: false,
        message: `Insufficient ${leaveType} leave balance. Available: ${availableBalance}, Required: ${totalDays}`
      });
    }

    // Create leave application
    const result = await pool.query(
      `INSERT INTO leaves (employee_id, approver_id, leave_type, start_date, end_date, total_days, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [employeeId, approverId, leaveType, startDate, endDate, totalDays, reason]
    );

    // Get leave with employee and approver details
    const leaveWithDetails = await pool.query(`
      SELECT l.*, 
             emp.name as employee_name, emp.email as employee_email, emp.role as employee_role, emp.department as employee_department,
             appr.name as approver_name, appr.email as approver_email, appr.role as approver_role,
             approver.name as approved_by_name
      FROM leaves l
      JOIN admin_users emp ON emp.id = l.employee_id
      JOIN admin_users appr ON appr.id = l.approver_id
      LEFT JOIN admin_users approver ON approver.id = l.approved_by
      WHERE l.id = $1
    `, [result.rows[0].id]);

    // Send email notification to approver (non-blocking)
    const createdLeave = leaveWithDetails.rows[0];
    if (createdLeave && createdLeave.approver_email) {
      sendLeaveAppliedEmail({
        to: createdLeave.approver_email,
        approverName: createdLeave.approver_name,
        employeeName: createdLeave.employee_name,
        leaveType: createdLeave.leave_type,
        startDate: createdLeave.start_date,
        endDate: createdLeave.end_date,
        totalDays: createdLeave.total_days,
        reason: createdLeave.reason
      }).catch(err => console.error('[Mailer] Error sending leave application email:', err));
    }

    res.status(201).json({
      success: true,
      message: 'Leave application submitted successfully',
      leave: leaveWithDetails.rows[0]
    });

  } catch (error) {
    console.error('Apply leave error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update leave status approval with day modification capability - FIXED VERSION
app.patch('/api/leaves/:id/status', requireAuth, async (req, res) => {
  let client;
  try {
    const leaveId = Number(req.params.id);
    const { status, comments, approvedDays, approvedStartDate, approvedEndDate } = req.body;
    const currentUserId = req.user.sub;
    const currentUserRole = req.user.role;

    if (!Number.isFinite(leaveId)) {
      return res.status(400).json({ success: false, message: 'Invalid leave ID' });
    }

    const validStatuses = ['approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Get complete leave details including leave_type
    const leaveQuery = await pool.query(
      `SELECT l.*, emp.name as employee_name, appr.name as approver_name
       FROM leaves l
       JOIN admin_users emp ON emp.id = l.employee_id
       JOIN admin_users appr ON appr.id = l.approver_id
       WHERE l.id = $1`,
      [leaveId]
    );

    if (leaveQuery.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Leave not found' });
    }

    const leave = leaveQuery.rows[0];

    // Check permissions
    const isApprover = leave.approver_id === currentUserId;
    const isAdmin = currentUserRole === 'admin';

    if (!isApprover && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to approve/reject this leave'
      });
    }

    let finalDays = leave.total_days;
    let finalStartDate = leave.start_date;
    let finalEndDate = leave.end_date;

    // If approver modified the days/dates
    if (approvedDays && approvedStartDate && approvedEndDate) {
      finalDays = Number(approvedDays);
      finalStartDate = new Date(approvedStartDate);
      finalEndDate = new Date(approvedEndDate);
    }

    // Validate final days
    if (finalDays <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Total days must be greater than 0'
      });
    }

    // Use transaction for atomic operations
    client = await pool.connect();
    try {
      await client.query('BEGIN');

      // If approving leave, deduct from balance
      if (status === 'approved' && leave.status !== 'approved') {
        const balanceQuery = await client.query(
          'SELECT * FROM leave_balances WHERE employee_id = $1',
          [leave.employee_id]
        );

        if (balanceQuery.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Leave balance not found' });
        }

        const balance = balanceQuery.rows[0];
        const availableBalance = Number(balance[`${leave.leave_type}_balance`]) || 0;

        if (availableBalance < finalDays) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Insufficient ${leave.leave_type} leave balance. Available: ${availableBalance}, Required: ${finalDays}`
          });
        }

        // Update monthly usage for sick and casual leaves
        let monthlyUpdate = '';
        const monthlyParams = [];

        if (leave.leave_type === 'sick') {
          monthlyUpdate = `, sick_used_this_month = sick_used_this_month + $${monthlyParams.length + 2}`;
          monthlyParams.push(finalDays);
        } else if (leave.leave_type === 'casual') {
          monthlyUpdate = `, casual_used_this_month = casual_used_this_month + $${monthlyParams.length + 2}`;
          monthlyParams.push(finalDays);
        }

        // Deduct from balance and update monthly usage
        await client.query(
          `UPDATE leave_balances 
           SET ${leave.leave_type}_balance = ${leave.leave_type}_balance - $1 ${monthlyUpdate}
           WHERE employee_id = $${monthlyParams.length + 2}`,
          [finalDays, ...monthlyParams, leave.employee_id]
        );
      }

      // If reversing approval, add back to balance
      if (status !== 'approved' && leave.status === 'approved') {
        let monthlyUpdate = '';
        const monthlyParams = [];

        if (leave.leave_type === 'sick') {
          monthlyUpdate = `, sick_used_this_month = GREATEST(0, sick_used_this_month - $${monthlyParams.length + 2})`;
          monthlyParams.push(finalDays);
        } else if (leave.leave_type === 'casual') {
          monthlyUpdate = `, casual_used_this_month = GREATEST(0, casual_used_this_month - $${monthlyParams.length + 2})`;
          monthlyParams.push(finalDays);
        }

        await client.query(
          `UPDATE leave_balances 
           SET ${leave.leave_type}_balance = ${leave.leave_type}_balance + $1 ${monthlyUpdate}
           WHERE employee_id = $${monthlyParams.length + 2}`,
          [finalDays, ...monthlyParams, leave.employee_id]
        );
      }

      // Update leave status with possible date modifications
      const updateQuery = await client.query(
        `UPDATE leaves 
         SET status = $1, approved_by = $2, approved_on = NOW(), comments = $3,
             total_days = $4, start_date = $5, end_date = $6
         WHERE id = $7
         RETURNING *`,
        [status, currentUserId, comments, finalDays, finalStartDate, finalEndDate, leaveId]
      );

      await client.query('COMMIT');

      // Get updated leave with details
      const updatedLeave = await pool.query(`
        SELECT l.*, 
               emp.name as employee_name, emp.email as employee_email, emp.role as employee_role, emp.department as employee_department,
               appr.name as approver_name, appr.email as approver_email, appr.role as approver_role,
               approver.name as approved_by_name, approver.email as approved_by_email
        FROM leaves l
        JOIN admin_users emp ON emp.id = l.employee_id
        JOIN admin_users appr ON appr.id = l.approver_id
        LEFT JOIN admin_users approver ON approver.id = l.approved_by
        WHERE l.id = $1
      `, [leaveId]);

      // Send email notification to employee regarding approval/rejection (non-blocking)
      const updatedRow = updatedLeave.rows[0];
      if (updatedRow && updatedRow.employee_email) {
        sendLeaveStatusEmail({
          to: updatedRow.employee_email,
          employeeName: updatedRow.employee_name,
          status,
          leaveType: updatedRow.leave_type,
          startDate: updatedRow.start_date,
          endDate: updatedRow.end_date,
          totalDays: updatedRow.total_days,
          approverName: req.user.name || req.user.email,
          comments: comments || ''
        }).catch(err => console.error('[Mailer] Error sending leave status email:', err));
      }

      res.json({
        success: true,
        message: `Leave application ${status} successfully`,
        leave: updatedLeave.rows[0]
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Update leave status error:', error);
    if (client) {
      client.release();
    }
    res.status(500).json({
      success: false,
      message: 'Server error while updating leave status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add monthly reset function
app.post('/api/admin/leaves/monthly-reset', requireAdmin, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();

    // Get all active employees
    const users = await client.query(
      'SELECT id FROM admin_users WHERE is_active = TRUE'
    );

    for (const user of users.rows) {
      const balance = await client.query(
        'SELECT last_reset FROM leave_balances WHERE employee_id = $1',
        [user.id]
      );

      const lastReset = balance.rows[0]?.last_reset;
      let shouldAdd = false;

      if (!lastReset) {
        shouldAdd = true;
      } else {
        const lastDate = new Date(lastReset);
        if (lastDate.getMonth() !== currentMonth || lastDate.getFullYear() !== currentYear) {
          shouldAdd = true;
        }
      }

      if (shouldAdd) {
        // Add monthly accrual
        await client.query(`
          UPDATE leave_balances 
          SET sick_balance = sick_balance + 1,
              casual_balance = casual_balance + 2,
              sick_used_this_month = 0,
              casual_used_this_month = 0,
              last_reset = NOW()
          WHERE employee_id = $1
        `, [user.id]);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Monthly leave balances updated successfully'
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Monthly reset error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    if (client) client.release();
  }
});

app.get('/api/leaves/balance', requireAuth, async (req, res) => {
  try {
    const employeeId = req.user.sub;
    await updateMonthlyAccruals(employeeId); // 👈 add this line

    const result = await pool.query(`
      SELECT lb.*, au.name as employee_name, au.email as employee_email, au.role as employee_role
      FROM leave_balances lb
      JOIN admin_users au ON au.id = lb.employee_id
      WHERE lb.employee_id = $1
    `, [employeeId]);

    if (result.rows.length === 0) {
      const insertResult = await pool.query(
        `INSERT INTO leave_balances (employee_id) VALUES ($1) RETURNING *`,
        [employeeId]
      );
      return res.json({ success: true, balance: insertResult.rows[0] });
    }

    res.json({ success: true, balance: result.rows[0] });
  } catch (error) {
    console.error('Get leave balance error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.patch('/api/leaves/:id/cancel', requireAuth, async (req, res) => {
  try {
    const leaveId = Number(req.params.id);
    const employeeId = req.user.sub;

    if (!Number.isFinite(leaveId)) {
      return res.status(400).json({ success: false, message: 'Invalid leave ID' });
    }

    // Check if leave exists and belongs to employee
    const leaveQuery = await pool.query(
      'SELECT * FROM leaves WHERE id = $1 AND employee_id = $2',
      [leaveId, employeeId]
    );

    if (leaveQuery.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Leave not found' });
    }

    const leave = leaveQuery.rows[0];

    // Only allow cancellation of pending leaves
    if (leave.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending leaves can be cancelled'
      });
    }

    // Update leave status to cancelled
    const updateQuery = await pool.query(
      'UPDATE leaves SET status = $1 WHERE id = $2 RETURNING *',
      ['cancelled', leaveId]
    );

    res.json({
      success: true,
      message: 'Leave application cancelled successfully',
      leave: updateQuery.rows[0]
    });

  } catch (error) {
    console.error('Cancel leave error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/admin/leaves/carry-forward', requireAdmin, async (req, res) => {
  try {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // Get all active employees with leave balances
    const balancesQuery = await pool.query(`
      SELECT lb.*, au.name as employee_name
      FROM leave_balances lb
      JOIN admin_users au ON au.id = lb.employee_id
      WHERE au.is_active = TRUE
    `);

    let updatedCount = 0;

    for (const balance of balancesQuery.rows) {
      // Carry forward logic
      const casualCarryForward = Math.min(balance.casual_balance, 5);
      const sickCarryForward = Math.min(balance.sick_balance, 10);
      const annualCarryForward = balance.annual_balance; // Annual leaves can be fully carried forward

      // Update balances with carry forwards
      await pool.query(`
        UPDATE leave_balances 
        SET 
          casual_balance = 12 + $1,
          sick_balance = 12 + $2,
          annual_balance = $3,
          casual_carry_forward = $1,
          sick_carry_forward = $2,
          annual_carry_forward = $3,
          last_reset = NOW()
        WHERE id = $4
      `, [casualCarryForward, sickCarryForward, annualCarryForward, balance.id]);

      updatedCount++;
    }

    res.json({
      success: true,
      message: `Leave balances carried forward for ${updatedCount} employees`,
      updatedCount
    });

  } catch (error) {
    console.error('Carry forward leaves error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ----------------------------- Chat / Discussions ----------------------------- */

// 1. Get chat users (colleagues) with last message, unread count, and status
app.get('/api/chat/users', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;
    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.role,
        u.department,
        u.position,
        u.is_active,
        u.last_login_at,
        u.presence_status,
        u.dnd_until,
        u.last_seen_at,
        COALESCE(unread.count, 0) AS unread_count,
        CASE 
          WHEN lm.is_deleted = TRUE THEN 'This message was deleted'
          ELSE lm.message_text
        END AS last_message,
        lm.created_at AS last_message_at,
        lm.sender_id AS last_message_sender_id
      FROM admin_users u
      LEFT JOIN LATERAL (
        SELECT cm.message_text, cm.created_at, cm.sender_id, cm.is_deleted
        FROM chat_messages cm
        WHERE (cm.sender_id = $1 AND cm.receiver_id = u.id)
           OR (cm.sender_id = u.id AND cm.receiver_id = $1)
        ORDER BY cm.created_at DESC
        LIMIT 1
      ) lm ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS count
        FROM chat_messages cm
        WHERE cm.sender_id = u.id AND cm.receiver_id = $1 AND cm.is_read = FALSE
      ) unread ON TRUE
      WHERE u.id != $1 AND u.is_active = TRUE
      ORDER BY 
        CASE WHEN lm.created_at IS NOT NULL THEN 0 ELSE 1 END,
        lm.created_at DESC NULLS LAST,
        u.name ASC;
    `;
    const { rows } = await pool.query(query, [currentUserId]);
    const usersWithPresence = rows.map((u) => {
      const eff = computeEffectivePresence(u);
      return {
        ...u,
        presence_status: eff.effective_status,
        effective_status: eff.effective_status,
        is_online: eff.is_online
      };
    });
    res.json({ success: true, users: usersWithPresence });
  } catch (error) {
    console.error('Chat users error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching chat users' });
  }
});

// 2. Get total unread messages count for current user
app.get('/api/chat/unread-count', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total_unread FROM chat_messages WHERE receiver_id = $1 AND is_read = FALSE`,
      [currentUserId]
    );
    res.json({ success: true, total_unread: rows[0]?.total_unread || 0 });
  } catch (error) {
    console.error('Chat unread count error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 3. Get messages exchanged between current user and another user
app.get('/api/chat/messages/:otherUserId', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;
    const otherUserId = Number(req.params.otherUserId);
    if (!Number.isFinite(otherUserId) || otherUserId === currentUserId) {
      return res.status(400).json({ success: false, message: 'Invalid target user id' });
    }

    // Mark unread messages from other user as read
    await pool.query(
      `UPDATE chat_messages SET is_read = TRUE WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
      [otherUserId, currentUserId]
    );

    const query = `
      SELECT 
        cm.id,
        cm.sender_id,
        cm.receiver_id,
        cm.message_text,
        cm.is_read,
        cm.created_at,
        cm.is_edited,
        cm.edited_at,
        cm.is_deleted,
        cm.deleted_at,
        s.name AS sender_name,
        r.name AS receiver_name
      FROM chat_messages cm
      JOIN admin_users s ON s.id = cm.sender_id
      JOIN admin_users r ON r.id = cm.receiver_id
      WHERE (cm.sender_id = $1 AND cm.receiver_id = $2)
         OR (cm.sender_id = $2 AND cm.receiver_id = $1)
      ORDER BY cm.created_at ASC
      LIMIT 300
    `;
    const { rows } = await pool.query(query, [currentUserId, otherUserId]);
    res.json({ success: true, messages: rows });
  } catch (error) {
    console.error('Chat messages fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching messages' });
  }
});

// 4. Send a message to another user
app.post('/api/chat/messages', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;
    const { receiver_id, message_text } = req.body || {};
    const targetUserId = Number(receiver_id);
    const text = typeof message_text === 'string' ? message_text.trim() : '';

    if (!Number.isFinite(targetUserId) || targetUserId === currentUserId) {
      return res.status(400).json({ success: false, message: 'Invalid receiver ID' });
    }
    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text cannot be empty' });
    }

    // Ensure receiver exists and is active
    const checkReceiver = await pool.query(
      `SELECT id, name FROM admin_users WHERE id = $1 AND is_active = TRUE`,
      [targetUserId]
    );
    if (checkReceiver.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Recipient not found or inactive' });
    }

    const insertQuery = `
      INSERT INTO chat_messages (sender_id, receiver_id, message_text, is_read, created_at)
      VALUES ($1, $2, $3, FALSE, NOW())
      RETURNING *
    `;
    const { rows } = await pool.query(insertQuery, [currentUserId, targetUserId, text]);
    res.json({ success: true, message: rows[0] });
  } catch (error) {
    console.error('Send chat message error:', error);
    res.status(500).json({ success: false, message: 'Server error sending message' });
  }
});

// 5. Edit a message (sender only)
app.put('/api/chat/messages/:id', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;
    const messageId = Number(req.params.id);
    const { message_text } = req.body || {};
    const text = typeof message_text === 'string' ? message_text.trim() : '';

    if (!Number.isFinite(messageId)) {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }
    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text cannot be empty' });
    }

    const checkMsg = await pool.query(
      `SELECT id, sender_id, is_deleted FROM chat_messages WHERE id = $1`,
      [messageId]
    );
    if (checkMsg.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const msg = checkMsg.rows[0];
    if (Number(msg.sender_id) !== Number(currentUserId)) {
      return res.status(403).json({ success: false, message: 'You can only edit your own messages' });
    }
    if (msg.is_deleted) {
      return res.status(400).json({ success: false, message: 'Deleted messages cannot be edited' });
    }

    const updateQuery = `
      UPDATE chat_messages
      SET message_text = $1, is_edited = TRUE, edited_at = NOW()
      WHERE id = $2 AND sender_id = $3
      RETURNING *
    `;
    const { rows } = await pool.query(updateQuery, [text, messageId, currentUserId]);
    res.json({ success: true, message: rows[0] });
  } catch (error) {
    console.error('Edit chat message error:', error);
    res.status(500).json({ success: false, message: 'Server error editing message' });
  }
});

// 6. Delete a message (WhatsApp style - sender or admin)
app.delete('/api/chat/messages/:id', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;
    const userRole = req.user.role;
    const messageId = Number(req.params.id);

    if (!Number.isFinite(messageId)) {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }

    const checkMsg = await pool.query(
      `SELECT id, sender_id, is_deleted FROM chat_messages WHERE id = $1`,
      [messageId]
    );
    if (checkMsg.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const msg = checkMsg.rows[0];
    const isOwner = Number(msg.sender_id) === Number(currentUserId);
    const isAdmin = userRole === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You can only delete your own messages' });
    }

    const deleteQuery = `
      UPDATE chat_messages
      SET is_deleted = TRUE, deleted_at = NOW(), message_text = 'This message was deleted'
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await pool.query(deleteQuery, [messageId]);
    res.json({ success: true, message: rows[0] });
  } catch (error) {
    console.error('Delete chat message error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting message' });
  }
});

// 7. Explicitly mark messages from a specific sender as read
app.patch('/api/chat/read/:senderId', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;
    const senderId = Number(req.params.senderId);
    if (!Number.isFinite(senderId)) {
      return res.status(400).json({ success: false, message: 'Invalid sender ID' });
    }

    await pool.query(
      `UPDATE chat_messages SET is_read = TRUE WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
      [senderId, currentUserId]
    );
    res.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ==========================================================================
   ======================= HRMS & PAYROLL MODULE APIS =======================
   ========================================================================== */

function numberToWords(num) {
  if (!num || isNaN(num)) return 'Zero Rupees Only';
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const n = ('000000000' + Math.floor(num)).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return `${num} Rupees Only`;
  let str = '';
  str += (Number(n[1]) !== 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
  str += (Number(n[2]) !== 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
  str += (Number(n[3]) !== 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
  str += (Number(n[4]) !== 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
  str += (Number(n[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
  return (str.trim() || 'Zero') + ' Rupees Only';
}

/* ----------------------- 1. Attendance Management ----------------------- */

// Get current user's today attendance + admin organization overview
app.get('/api/hrms/attendance/today', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const isUserAdmin = isAdmin(req);

    // Current user's today record
    const myToday = await pool.query(
      `SELECT * FROM hrms_attendance WHERE employee_id = $1 AND date = CURRENT_DATE LIMIT 1`,
      [userId]
    );

    let orgOverview = null;
    let todayRecords = [];

    if (isUserAdmin) {
      const statsQ = await pool.query(`
        SELECT 
          COUNT(DISTINCT u.id) AS total_employees,
          COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('present', 'late')) AS present_count,
          COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'late') AS late_count,
          COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'half_day') AS half_day_count,
          COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'approved' AND CURRENT_DATE BETWEEN l.start_date AND l.end_date) AS on_leave_count
        FROM admin_users u
        LEFT JOIN hrms_attendance a ON a.employee_id = u.id AND a.date = CURRENT_DATE
        LEFT JOIN leaves l ON l.employee_id = u.id
        WHERE u.is_active = TRUE
      `);

      const recordsQ = await pool.query(`
        SELECT 
          a.id,
          u.id AS employee_id,
          u.name,
          u.email,
          u.department,
          u.position,
          ep.employee_code,
          a.date,
          a.punch_in,
          a.punch_out,
          a.total_hours,
          COALESCE(a.status, 'absent') AS status,
          a.punch_in_note,
          a.punch_out_note
        FROM admin_users u
        LEFT JOIN hrms_employee_profiles ep ON ep.user_id = u.id
        LEFT JOIN hrms_attendance a ON a.employee_id = u.id AND a.date = CURRENT_DATE
        WHERE u.is_active = TRUE
        ORDER BY a.punch_in ASC NULLS LAST, u.name ASC
      `);

      orgOverview = statsQ.rows[0] || {};
      todayRecords = recordsQ.rows || [];
    }

    res.json({
      success: true,
      myRecord: myToday.rows[0] || null,
      currentTime: new Date().toISOString(),
      orgOverview,
      todayRecords
    });
  } catch (error) {
    console.error('HRMS Attendance today error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance data' });
  }
});

// Quick Punch In / Punch Out
app.post('/api/hrms/attendance/punch', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { action, note } = req.body || {}; // action: 'in' | 'out'
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const existing = await pool.query(
      `SELECT * FROM hrms_attendance WHERE employee_id = $1 AND date = CURRENT_DATE LIMIT 1`,
      [userId]
    );

    if (action === 'in') {
      if (existing.rows.length > 0 && existing.rows[0].punch_in) {
        return res.status(400).json({ success: false, message: 'You have already punched in for today' });
      }

      // Check if late (after 10:15 AM local)
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const isLate = hours > 10 || (hours === 10 && minutes > 15);
      const status = isLate ? 'late' : 'present';

      const insertQ = `
        INSERT INTO hrms_attendance (employee_id, date, punch_in, status, punch_in_note, ip_address)
        VALUES ($1, CURRENT_DATE, NOW(), $2, $3, $4)
        ON CONFLICT (employee_id, date) DO UPDATE 
        SET punch_in = EXCLUDED.punch_in, status = EXCLUDED.status, punch_in_note = EXCLUDED.punch_in_note, updated_at = NOW()
        RETURNING *
      `;
      const result = await pool.query(insertQ, [userId, status, note || null, ip]);
      return res.json({ success: true, message: isLate ? 'Punched in (Marked Late)' : 'Punched in successfully', record: result.rows[0] });
    } else if (action === 'out') {
      if (existing.rows.length === 0 || !existing.rows[0].punch_in) {
        return res.status(400).json({ success: false, message: 'Please punch in first before punching out' });
      }

      const punchInTime = new Date(existing.rows[0].punch_in);
      const now = new Date();
      const durationHours = Math.max(0, Number(((now - punchInTime) / (1000 * 60 * 60)).toFixed(2)));

      let status = existing.rows[0].status;
      if (durationHours < 4) {
        status = 'half_day';
      } else if (durationHours >= 8 && status === 'half_day') {
        status = 'present';
      }

      const updateQ = `
        UPDATE hrms_attendance
        SET punch_out = NOW(), total_hours = $1, status = $2, punch_out_note = $3, updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `;
      const result = await pool.query(updateQ, [durationHours, status, note || null, existing.rows[0].id]);
      return res.json({ success: true, message: 'Punched out successfully', record: result.rows[0] });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action: must be in or out' });
    }
  } catch (error) {
    console.error('HRMS Punch error:', error);
    res.status(500).json({ success: false, message: 'Punch action failed' });
  }
});

// My Attendance History
app.get('/api/hrms/attendance/my', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();

    const q = `
      SELECT * FROM hrms_attendance 
      WHERE employee_id = $1 
        AND EXTRACT(MONTH FROM date) = $2 
        AND EXTRACT(YEAR FROM date) = $3
      ORDER BY date DESC
    `;
    const { rows } = await pool.query(q, [userId, m, y]);

    // Aggregate metrics
    let presentCount = 0;
    let lateCount = 0;
    let halfDayCount = 0;
    let totalHours = 0;
    rows.forEach(r => {
      if (r.status === 'present' || r.status === 'late') presentCount++;
      if (r.status === 'late') lateCount++;
      if (r.status === 'half_day') halfDayCount++;
      totalHours += Number(r.total_hours || 0);
    });

    res.json({
      success: true,
      records: rows,
      stats: {
        totalDays: rows.length,
        presentCount,
        lateCount,
        halfDayCount,
        totalHours: totalHours.toFixed(2),
        avgHoursPerDay: rows.length ? (totalHours / rows.length).toFixed(1) : 0
      }
    });
  } catch (error) {
    console.error('My Attendance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch personal attendance' });
  }
});

// Admin: Attendance Filter / Management across employees
app.get('/api/hrms/attendance', requireAdmin, async (req, res) => {
  try {
    const { date, month, year, department, employee_id, status } = req.query;
    let whereClauses = [];
    let params = [];

    if (date) {
      params.push(date);
      whereClauses.push(`a.date = $${params.length}`);
    } else if (month && year) {
      params.push(Number(month));
      whereClauses.push(`EXTRACT(MONTH FROM a.date) = $${params.length}`);
      params.push(Number(year));
      whereClauses.push(`EXTRACT(YEAR FROM a.date) = $${params.length}`);
    }

    if (department) {
      params.push(department);
      whereClauses.push(`u.department = $${params.length}`);
    }
    if (employee_id) {
      params.push(employee_id);
      whereClauses.push(`u.id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      whereClauses.push(`a.status = $${params.length}`);
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        a.id,
        u.id AS employee_id,
        u.name,
        u.email,
        u.department,
        u.position,
        ep.employee_code,
        a.date,
        a.punch_in,
        a.punch_out,
        a.total_hours,
        a.status,
        a.punch_in_note,
        a.punch_out_note
      FROM hrms_attendance a
      JOIN admin_users u ON u.id = a.employee_id
      LEFT JOIN hrms_employee_profiles ep ON ep.user_id = u.id
      ${whereStr}
      ORDER BY a.date DESC, u.name ASC
      LIMIT 300
    `;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, records: rows });
  } catch (error) {
    console.error('Admin attendance search error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve attendance logs' });
  }
});

// Admin: Manual Attendance Upsert
app.post('/api/hrms/attendance/manual', requireAdmin, async (req, res) => {
  try {
    const { employee_id, date, punch_in, punch_out, total_hours, status, note } = req.body || {};
    if (!employee_id || !date) {
      return res.status(400).json({ success: false, message: 'employee_id and date are required' });
    }

    const query = `
      INSERT INTO hrms_attendance (employee_id, date, punch_in, punch_out, total_hours, status, punch_in_note)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (employee_id, date) DO UPDATE 
      SET punch_in = EXCLUDED.punch_in,
          punch_out = EXCLUDED.punch_out,
          total_hours = EXCLUDED.total_hours,
          status = EXCLUDED.status,
          punch_in_note = EXCLUDED.punch_in_note,
          updated_at = NOW()
      RETURNING *
    `;
    const { rows } = await pool.query(query, [
      employee_id,
      date,
      punch_in || null,
      punch_out || null,
      total_hours || 8,
      status || 'present',
      note || 'Manual Entry by Admin'
    ]);

    res.json({ success: true, message: 'Attendance record saved', record: rows[0] });
  } catch (error) {
    console.error('Manual attendance error:', error);
    res.status(500).json({ success: false, message: 'Failed to save attendance record' });
  }
});

/* ----------------------- 2. Employee Records & Directory ----------------------- */

// Get all employee records (with profile & salary structures)
app.get('/api/hrms/employees', requireAuth, async (req, res) => {
  try {
    const { search, department, role, status } = req.query;
    let whereClauses = [];
    let params = [];

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      whereClauses.push(`(LOWER(u.name) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length} OR LOWER(ep.employee_code) LIKE $${params.length})`);
    }
    if (department) {
      params.push(department);
      whereClauses.push(`u.department = $${params.length}`);
    }
    if (role) {
      params.push(role);
      whereClauses.push(`u.role = $${params.length}`);
    }
    if (status === 'active') {
      whereClauses.push(`u.is_active = TRUE`);
    } else if (status === 'inactive') {
      whereClauses.push(`u.is_active = FALSE`);
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.username,
        u.role,
        u.department,
        u.position,
        u.phone,
        u.is_active,
        u.last_login_at,
        u.presence_status,
        u.dnd_until,
        u.last_seen_at,
        u.created_at,
        ep.employee_code,
        ep.dob,
        ep.gender,
        ep.blood_group,
        ep.address,
        ep.emergency_contact_name,
        ep.emergency_contact_phone,
        ep.emergency_contact_relation,
        ep.employment_type,
        ep.joining_date,
        ep.bank_name,
        ep.bank_account_no,
        ep.bank_ifsc,
        ep.pan_number,
        ep.uan_number,
        ep.esi_number,
        ep.documents,
        ss.ctc_annual,
        ss.basic_monthly,
        ss.hra_monthly,
        ss.special_allowance_monthly
      FROM admin_users u
      LEFT JOIN hrms_employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hrms_salary_structures ss ON ss.user_id = u.id
      ${whereStr}
      ORDER BY u.name ASC
    `;

    const { rows } = await pool.query(query, params);
    const enrichedEmployees = rows.map((u) => {
      const eff = computeEffectivePresence(u);
      return {
        ...u,
        presence_status: eff.effective_status,
        effective_status: eff.effective_status,
        is_online: eff.is_online
      };
    });
    res.json({ success: true, employees: enrichedEmployees, total: enrichedEmployees.length });
  } catch (error) {
    console.error('HRMS Employees list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch employee records' });
  }
});

// Get single employee full details
app.get('/api/hrms/employees/:id', requireAuth, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId)) return res.status(400).json({ success: false, message: 'Invalid employee ID' });

    // Non-admin can only view their own profile
    if (!isAdmin(req) && Number(req.user.sub) !== targetId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const userQ = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.username, u.role, u.department, u.position, u.phone, u.is_active, u.created_at,
        ep.employee_code, ep.dob, ep.gender, ep.blood_group, ep.address,
        ep.emergency_contact_name, ep.emergency_contact_phone, ep.emergency_contact_relation,
        ep.employment_type, ep.joining_date, ep.reporting_manager_id,
        ep.bank_name, ep.bank_account_no, ep.bank_ifsc, ep.pan_number, ep.uan_number, ep.esi_number, ep.documents,
        ss.ctc_annual, ss.basic_monthly, ss.hra_monthly, ss.special_allowance_monthly, ss.conveyance_monthly,
        ss.medical_allowance_monthly, ss.pf_employee_monthly, ss.esi_employee_monthly, ss.professional_tax_monthly, ss.tds_monthly,
        lb.sick_balance, lb.casual_balance, lb.annual_balance
      FROM admin_users u
      LEFT JOIN hrms_employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hrms_salary_structures ss ON ss.user_id = u.id
      LEFT JOIN leave_balances lb ON lb.employee_id = u.id
      WHERE u.id = $1
    `, [targetId]);

    if (!userQ.rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Recent 5 attendance logs
    const attQ = await pool.query(
      `SELECT * FROM hrms_attendance WHERE employee_id = $1 ORDER BY date DESC LIMIT 5`,
      [targetId]
    );

    // Recent 3 payslips
    const payslipQ = await pool.query(
      `SELECT id, month, year, gross_earnings, total_deductions, net_salary, status, payment_date FROM hrms_payrolls WHERE user_id = $1 ORDER BY year DESC, month DESC LIMIT 3`,
      [targetId]
    );

    res.json({
      success: true,
      employee: userQ.rows[0],
      recentAttendance: attQ.rows,
      recentPayslips: payslipQ.rows
    });
  } catch (error) {
    console.error('HRMS Employee detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve employee profile' });
  }
});

// Update employee details (admin or employee updating profile)
app.put('/api/hrms/employees/:id', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId)) return res.status(400).json({ success: false, message: 'Invalid employee ID' });

    const isUserAdmin = isAdmin(req);
    if (!isUserAdmin && Number(req.user.sub) !== targetId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const {
      name, phone, department, position,
      employee_code, dob, gender, blood_group, address,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      employment_type, joining_date,
      bank_name, bank_account_no, bank_ifsc, pan_number, uan_number, esi_number
    } = req.body || {};

    await client.query('BEGIN');

    // Update admin_users basic fields
    if (isUserAdmin) {
      await client.query(
        `UPDATE admin_users SET name = COALESCE($1, name), phone = COALESCE($2, phone), department = COALESCE($3, department), position = COALESCE($4, position), updated_at = NOW() WHERE id = $5`,
        [name, phone, department, position, targetId]
      );
    } else {
      await client.query(
        `UPDATE admin_users SET phone = COALESCE($1, phone), updated_at = NOW() WHERE id = $2`,
        [phone, targetId]
      );
    }

    // Upsert hrms_employee_profiles
    const profileQ = `
      INSERT INTO hrms_employee_profiles (
        user_id, employee_code, dob, gender, blood_group, address,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
        employment_type, joining_date,
        bank_name, bank_account_no, bank_ifsc, pan_number, uan_number, esi_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (user_id) DO UPDATE SET
        employee_code = COALESCE(EXCLUDED.employee_code, hrms_employee_profiles.employee_code),
        dob = EXCLUDED.dob,
        gender = EXCLUDED.gender,
        blood_group = EXCLUDED.blood_group,
        address = EXCLUDED.address,
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        emergency_contact_relation = EXCLUDED.emergency_contact_relation,
        employment_type = COALESCE(EXCLUDED.employment_type, hrms_employee_profiles.employment_type),
        joining_date = COALESCE(EXCLUDED.joining_date, hrms_employee_profiles.joining_date),
        bank_name = EXCLUDED.bank_name,
        bank_account_no = EXCLUDED.bank_account_no,
        bank_ifsc = EXCLUDED.bank_ifsc,
        pan_number = EXCLUDED.pan_number,
        uan_number = EXCLUDED.uan_number,
        esi_number = EXCLUDED.esi_number,
        updated_at = NOW()
      RETURNING *
    `;

    const code = employee_code || `ZOR-EMP-${String(targetId).padStart(3, '0')}`;
    const result = await client.query(profileQ, [
      targetId, code, dob || null, gender || null, blood_group || null, address || null,
      emergency_contact_name || null, emergency_contact_phone || null, emergency_contact_relation || null,
      employment_type || 'full_time', joining_date || null,
      bank_name || null, bank_account_no || null, bank_ifsc || null, pan_number || null, uan_number || null, esi_number || null
    ]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Employee profile updated successfully', profile: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update employee profile error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update employee' });
  } finally {
    client.release();
  }
});

/* ----------------------- 3. Payroll Processing & Payslips ----------------------- */

// Get Salary Structures
app.get('/api/hrms/payroll/structures', requireAdmin, async (req, res) => {
  try {
    const q = `
      SELECT 
        u.id AS user_id,
        u.name,
        u.email,
        u.department,
        u.position,
        ep.employee_code,
        ep.joining_date,
        ss.id AS structure_id,
        COALESCE(ss.ctc_annual, 0) AS ctc_annual,
        COALESCE(ss.basic_monthly, 0) AS basic_monthly,
        COALESCE(ss.hra_monthly, 0) AS hra_monthly,
        COALESCE(ss.special_allowance_monthly, 0) AS special_allowance_monthly,
        COALESCE(ss.conveyance_monthly, 0) AS conveyance_monthly,
        COALESCE(ss.medical_allowance_monthly, 0) AS medical_allowance_monthly,
        COALESCE(ss.pf_employee_monthly, 0) AS pf_employee_monthly,
        COALESCE(ss.esi_employee_monthly, 0) AS esi_employee_monthly,
        COALESCE(ss.professional_tax_monthly, 200) AS professional_tax_monthly,
        COALESCE(ss.tds_monthly, 0) AS tds_monthly,
        ss.effective_from
      FROM admin_users u
      LEFT JOIN hrms_employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hrms_salary_structures ss ON ss.user_id = u.id
      WHERE u.is_active = TRUE
      ORDER BY u.name ASC
    `;
    const { rows } = await pool.query(q);
    res.json({ success: true, structures: rows });
  } catch (error) {
    console.error('Salary structures error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve salary structures' });
  }
});

// Update/Save Employee Salary Structure
app.put('/api/hrms/payroll/structures/:userId', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const {
      ctc_annual, basic_monthly, hra_monthly, special_allowance_monthly,
      conveyance_monthly, medical_allowance_monthly, pf_employee_monthly,
      esi_employee_monthly, professional_tax_monthly, tds_monthly, effective_from
    } = req.body || {};

    const q = `
      INSERT INTO hrms_salary_structures (
        user_id, ctc_annual, basic_monthly, hra_monthly, special_allowance_monthly,
        conveyance_monthly, medical_allowance_monthly, pf_employee_monthly,
        esi_employee_monthly, professional_tax_monthly, tds_monthly, effective_from
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id) DO UPDATE SET
        ctc_annual = EXCLUDED.ctc_annual,
        basic_monthly = EXCLUDED.basic_monthly,
        hra_monthly = EXCLUDED.hra_monthly,
        special_allowance_monthly = EXCLUDED.special_allowance_monthly,
        conveyance_monthly = EXCLUDED.conveyance_monthly,
        medical_allowance_monthly = EXCLUDED.medical_allowance_monthly,
        pf_employee_monthly = EXCLUDED.pf_employee_monthly,
        esi_employee_monthly = EXCLUDED.esi_employee_monthly,
        professional_tax_monthly = EXCLUDED.professional_tax_monthly,
        tds_monthly = EXCLUDED.tds_monthly,
        effective_from = EXCLUDED.effective_from,
        updated_at = NOW()
      RETURNING *
    `;

    const { rows } = await pool.query(q, [
      userId,
      ctc_annual || 0,
      basic_monthly || 0,
      hra_monthly || 0,
      special_allowance_monthly || 0,
      conveyance_monthly || 0,
      medical_allowance_monthly || 0,
      pf_employee_monthly || 0,
      esi_employee_monthly || 0,
      professional_tax_monthly || 200,
      tds_monthly || 0,
      effective_from || new Date().toISOString().slice(0, 10)
    ]);

    res.json({ success: true, message: 'Salary structure updated successfully', structure: rows[0] });
  } catch (error) {
    console.error('Update salary structure error:', error);
    res.status(500).json({ success: false, message: 'Failed to update salary structure' });
  }
});

// List Payroll Runs for a given period
app.get('/api/hrms/payroll/runs', requireAdmin, async (req, res) => {
  try {
    const { month, year, status } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();

    let whereStr = `WHERE p.month = $1 AND p.year = $2`;
    let params = [m, y];

    if (status) {
      params.push(status);
      whereStr += ` AND p.status = $3`;
    }

    const q = `
      SELECT 
        p.*,
        u.name,
        u.email,
        u.department,
        u.position,
        ep.employee_code,
        ep.bank_name,
        ep.bank_account_no,
        ep.pan_number
      FROM hrms_payrolls p
      JOIN admin_users u ON u.id = p.user_id
      LEFT JOIN hrms_employee_profiles ep ON ep.user_id = u.id
      ${whereStr}
      ORDER BY u.name ASC
    `;

    const { rows } = await pool.query(q, params);

    // Compute summary
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let paidCount = 0;
    let draftCount = 0;

    rows.forEach(r => {
      totalGross += Number(r.gross_earnings || 0);
      totalDeductions += Number(r.total_deductions || 0);
      totalNet += Number(r.net_salary || 0);
      if (r.status === 'paid') paidCount++;
      else draftCount++;
    });

    res.json({
      success: true,
      period: { month: m, year: y },
      payrolls: rows,
      summary: {
        totalEmployees: rows.length,
        totalGross: totalGross.toFixed(2),
        totalDeductions: totalDeductions.toFixed(2),
        totalNet: totalNet.toFixed(2),
        paidCount,
        draftCount
      }
    });
  } catch (error) {
    console.error('Payroll runs list error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve payroll runs' });
  }
});

// Generate / Run Payroll for all active employees
app.post('/api/hrms/payroll/generate', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { month, year } = req.body || {};
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();

    const daysInMonth = new Date(y, m, 0).getDate();

    await client.query('BEGIN');

    // Fetch active employees with salary structure
    const employeesQ = await client.query(`
      SELECT 
        u.id, u.name, u.email, u.department,
        COALESCE(ss.basic_monthly, 25000) AS basic_monthly,
        COALESCE(ss.hra_monthly, 10000) AS hra_monthly,
        COALESCE(ss.special_allowance_monthly, 10000) AS special_allowance_monthly,
        COALESCE(ss.conveyance_monthly, 2500) AS conveyance_monthly,
        COALESCE(ss.medical_allowance_monthly, 2500) AS medical_allowance_monthly,
        COALESCE(ss.pf_employee_monthly, 1800) AS pf_employee_monthly,
        COALESCE(ss.esi_employee_monthly, 0) AS esi_employee_monthly,
        COALESCE(ss.professional_tax_monthly, 200) AS professional_tax_monthly,
        COALESCE(ss.tds_monthly, 0) AS tds_monthly
      FROM admin_users u
      LEFT JOIN hrms_salary_structures ss ON ss.user_id = u.id
      WHERE u.is_active = TRUE
    `);

    let generatedCount = 0;

    for (const emp of employeesQ.rows) {
      // Calculate unpaid leave days from attendance or leave records
      const attQ = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'absent') AS absent_days,
          COUNT(*) FILTER (WHERE status = 'half_day') AS half_days
        FROM hrms_attendance
        WHERE employee_id = $1 
          AND EXTRACT(MONTH FROM date) = $2 
          AND EXTRACT(YEAR FROM date) = $3
      `, [emp.id, m, y]);

      const absentDays = Number(attQ.rows[0]?.absent_days || 0);
      const halfDays = Number(attQ.rows[0]?.half_days || 0);
      const unpaidDays = absentDays + (halfDays * 0.5);
      const paidDays = Math.max(0, daysInMonth - unpaidDays);

      const baseGross = Number(emp.basic_monthly) + Number(emp.hra_monthly) + Number(emp.special_allowance_monthly) + Number(emp.conveyance_monthly) + Number(emp.medical_allowance_monthly);
      const perDayRate = baseGross / daysInMonth;
      const unpaidDeduction = Number((perDayRate * unpaidDays).toFixed(2));

      const actualGross = Math.max(0, Number((baseGross - unpaidDeduction).toFixed(2)));
      const pf = Number(emp.pf_employee_monthly);
      const esi = Number(emp.esi_employee_monthly);
      const pt = Number(emp.professional_tax_monthly);
      const tds = Number(emp.tds_monthly);
      const totalDeductions = Number((pf + esi + pt + tds).toFixed(2));
      const netSalary = Math.max(0, Number((actualGross - totalDeductions).toFixed(2)));

      const upsertQ = `
        INSERT INTO hrms_payrolls (
          user_id, month, year, working_days, paid_days, unpaid_days,
          gross_earnings, total_deductions, net_salary,
          basic_pay, hra, special_allowance, conveyance, medical, bonus,
          pf_deduction, esi_deduction, pt_deduction, tds_deduction, other_deductions,
          status, payment_mode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0, $15, $16, $17, $18, 0, 'draft', 'Bank Transfer')
        ON CONFLICT (user_id, month, year) DO UPDATE SET
          working_days = EXCLUDED.working_days,
          paid_days = EXCLUDED.paid_days,
          unpaid_days = EXCLUDED.unpaid_days,
          gross_earnings = EXCLUDED.gross_earnings,
          total_deductions = EXCLUDED.total_deductions,
          net_salary = EXCLUDED.net_salary,
          basic_pay = EXCLUDED.basic_pay,
          hra = EXCLUDED.hra,
          special_allowance = EXCLUDED.special_allowance,
          conveyance = EXCLUDED.conveyance,
          medical = EXCLUDED.medical,
          pf_deduction = EXCLUDED.pf_deduction,
          esi_deduction = EXCLUDED.esi_deduction,
          pt_deduction = EXCLUDED.pt_deduction,
          tds_deduction = EXCLUDED.tds_deduction,
          updated_at = NOW()
      `;

      await client.query(upsertQ, [
        emp.id, m, y, daysInMonth, paidDays, unpaidDays,
        actualGross, totalDeductions, netSalary,
        emp.basic_monthly, emp.hra_monthly, emp.special_allowance_monthly, emp.conveyance_monthly, emp.medical_allowance_monthly,
        pf, esi, pt, tds
      ]);

      generatedCount++;
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `Successfully processed payroll for ${generatedCount} employees for ${m}/${y}`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Payroll generation error:', error);
    res.status(500).json({ success: false, message: 'Payroll generation failed' });
  } finally {
    client.release();
  }
});

// Update specific payroll status (mark paid, add bonus, notes)
app.patch('/api/hrms/payroll/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, payment_date, payment_mode, bonus, other_deductions, notes } = req.body || {};

    const existing = await pool.query(`SELECT * FROM hrms_payrolls WHERE id = $1`, [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Payroll not found' });

    const p = existing.rows[0];
    const newBonus = bonus !== undefined ? Number(bonus) : Number(p.bonus || 0);
    const newOtherDed = other_deductions !== undefined ? Number(other_deductions) : Number(p.other_deductions || 0);

    const baseGross = Number(p.basic_pay) + Number(p.hra) + Number(p.special_allowance) + Number(p.conveyance) + Number(p.medical);
    const newGross = Number((baseGross + newBonus).toFixed(2));
    const newTotalDeductions = Number((Number(p.pf_deduction) + Number(p.esi_deduction) + Number(p.pt_deduction) + Number(p.tds_deduction) + newOtherDed).toFixed(2));
    const newNetSalary = Math.max(0, Number((newGross - newTotalDeductions).toFixed(2)));

    const updateQ = `
      UPDATE hrms_payrolls
      SET 
        status = COALESCE($1, status),
        payment_date = COALESCE($2, payment_date),
        payment_mode = COALESCE($3, payment_mode),
        bonus = $4,
        other_deductions = $5,
        gross_earnings = $6,
        total_deductions = $7,
        net_salary = $8,
        notes = COALESCE($9, notes),
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `;

    const result = await pool.query(updateQ, [
      status || null,
      payment_date || (status === 'paid' ? new Date().toISOString().slice(0, 10) : null),
      payment_mode || null,
      newBonus,
      newOtherDed,
      newGross,
      newTotalDeductions,
      newNetSalary,
      notes || null,
      id
    ]);

    res.json({ success: true, message: 'Payroll updated successfully', payroll: result.rows[0] });
  } catch (error) {
    console.error('Update payroll error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payroll record' });
  }
});

// View Full Detailed Payslip
app.get('/api/hrms/payroll/payslip/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const payslipQ = await pool.query(`
      SELECT 
        p.*,
        u.name AS employee_name,
        u.email AS employee_email,
        u.department,
        u.position,
        ep.employee_code,
        ep.joining_date,
        ep.bank_name,
        ep.bank_account_no,
        ep.bank_ifsc,
        ep.pan_number,
        ep.uan_number,
        ep.esi_number
      FROM hrms_payrolls p
      JOIN admin_users u ON u.id = p.user_id
      LEFT JOIN hrms_employee_profiles ep ON ep.user_id = u.id
      WHERE p.id = $1
    `, [id]);

    if (!payslipQ.rows.length) return res.status(404).json({ success: false, message: 'Payslip not found' });
    const p = payslipQ.rows[0];

    // Non-admin can only view their own payslip
    if (!isAdmin(req) && Number(req.user.sub) !== Number(p.user_id)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[p.month] || `Month ${p.month}`;

    const earnings = [
      { name: 'Basic Salary', amount: Number(p.basic_pay) },
      { name: 'House Rent Allowance (HRA)', amount: Number(p.hra) },
      { name: 'Special Allowance', amount: Number(p.special_allowance) },
      { name: 'Conveyance Allowance', amount: Number(p.conveyance) },
      { name: 'Medical Allowance', amount: Number(p.medical) },
    ];
    if (Number(p.bonus) > 0) earnings.push({ name: 'Performance Bonus / Incentives', amount: Number(p.bonus) });

    const deductions = [
      { name: 'Provident Fund (EPF)', amount: Number(p.pf_deduction) },
      { name: 'Employee State Insurance (ESIC)', amount: Number(p.esi_deduction) },
      { name: 'Professional Tax (PT)', amount: Number(p.pt_deduction) },
      { name: 'Income Tax (TDS)', amount: Number(p.tds_deduction) },
    ];
    if (Number(p.other_deductions) > 0) deductions.push({ name: 'Other Deductions', amount: Number(p.other_deductions) });

    res.json({
      success: true,
      payslip: {
        ...p,
        monthName,
        company: {
          name: 'Zorvixe Technologies',
          tagline: 'Enterprise Software & Cloud Engineering Solutions',
          address: 'Cyber Towers, HITEC City, Hyderabad, Telangana 500081',
          email: 'info@zorvixetechnologies.in',
          website: 'www.zorvixetechnologies.in'
        },
        earnings,
        deductions,
        netPayInWords: numberToWords(p.net_salary)
      }
    });
  } catch (error) {
    console.error('Payslip detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve payslip' });
  }
});

// Employee Self-Service: My Payslips
app.get('/api/hrms/payroll/my-payslips', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { rows } = await pool.query(
      `SELECT * FROM hrms_payrolls WHERE user_id = $1 ORDER BY year DESC, month DESC`,
      [userId]
    );
    res.json({ success: true, payslips: rows });
  } catch (error) {
    console.error('My payslips error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch personal payslips' });
  }
});

/* ----------------------- 4. Recruitment & Compliance ----------------------- */

// Get all job openings
app.get('/api/hrms/recruitment/jobs', requireAuth, async (req, res) => {
  try {
    const q = `
      SELECT 
        j.*,
        COUNT(c.id) AS applicants_count
      FROM hrms_job_openings j
      LEFT JOIN candidates c ON c.job_id = j.id
      GROUP BY j.id
      ORDER BY j.created_at DESC
    `;
    const { rows } = await pool.query(q);
    res.json({ success: true, jobs: rows });
  } catch (error) {
    console.error('Recruitment jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch job openings' });
  }
});

// Create Job Opening
app.post('/api/hrms/recruitment/jobs', requireAdmin, async (req, res) => {
  try {
    const { title, department, experience_required, job_type, vacancies, location, salary_range, description, requirements, status } = req.body || {};
    if (!title || !department) return res.status(400).json({ success: false, message: 'Title and department are required' });

    const q = `
      INSERT INTO hrms_job_openings (title, department, experience_required, job_type, vacancies, location, salary_range, description, requirements, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const { rows } = await pool.query(q, [
      title, department, experience_required || null, job_type || 'Full-time',
      vacancies || 1, location || 'Hyderabad / Remote', salary_range || null,
      description || null, requirements || null, status || 'open'
    ]);
    res.status(201).json({ success: true, message: 'Job opening created', job: rows[0] });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ success: false, message: 'Failed to create job opening' });
  }
});

// Update Job Opening
app.put('/api/hrms/recruitment/jobs/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, department, experience_required, job_type, vacancies, location, salary_range, description, requirements, status } = req.body || {};

    const q = `
      UPDATE hrms_job_openings
      SET title = COALESCE($1, title), department = COALESCE($2, department), experience_required = COALESCE($3, experience_required),
          job_type = COALESCE($4, job_type), vacancies = COALESCE($5, vacancies), location = COALESCE($6, location),
          salary_range = COALESCE($7, salary_range), description = COALESCE($8, description), requirements = COALESCE($9, requirements),
          status = COALESCE($10, status), updated_at = NOW()
      WHERE id = $11
      RETURNING *
    `;
    const { rows } = await pool.query(q, [
      title, department, experience_required, job_type, vacancies, location, salary_range, description, requirements, status, id
    ]);
    res.json({ success: true, message: 'Job opening updated', job: rows[0] });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ success: false, message: 'Failed to update job opening' });
  }
});

// Delete Job Opening
app.delete('/api/hrms/recruitment/jobs/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`DELETE FROM hrms_job_openings WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Job opening deleted' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete job opening' });
  }
});

// Candidate Pipeline
app.get('/api/hrms/recruitment/pipeline', requireAdmin, async (req, res) => {
  try {
    const q = `
      SELECT 
        c.*,
        j.title AS job_title,
        j.department AS job_department,
        cu.file_name AS resume_file_name,
        cu.file_size AS resume_file_size
      FROM candidates c
      LEFT JOIN hrms_job_openings j ON j.id = c.job_id
      LEFT JOIN LATERAL (
        SELECT file_name, file_size
        FROM candidate_uploads
        WHERE candidate_id = c.id
        ORDER BY upload_date DESC
        LIMIT 1
      ) cu ON TRUE
      ORDER BY c.created_at DESC
    `;
    const { rows } = await pool.query(q);

    const stages = {
      applied: [],
      screening: [],
      interview: [],
      offer: [],
      hired: [],
      rejected: []
    };

    rows.forEach(c => {
      const stage = (c.stage || 'applied').toLowerCase();
      if (stages[stage]) stages[stage].push(c);
      else stages.applied.push(c);
    });

    res.json({ success: true, candidates: rows, stages });
  } catch (error) {
    console.error('Recruitment pipeline error:', error);
    res.status(500).json({ success: false, message: 'Failed to load recruitment pipeline' });
  }
});

// Update candidate stage, interview date, notes, rating
app.patch('/api/hrms/recruitment/candidate/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { stage, interview_date, interview_notes, rating, expected_salary } = req.body || {};

    const q = `
      UPDATE candidates
      SET stage = COALESCE($1, stage),
          interview_date = COALESCE($2, interview_date),
          interview_notes = COALESCE($3, interview_notes),
          rating = COALESCE($4, rating),
          expected_salary = COALESCE($5, expected_salary)
      WHERE id = $6
      RETURNING *
    `;
    const { rows } = await pool.query(q, [stage || null, interview_date || null, interview_notes || null, rating || null, expected_salary || null, id]);
    res.json({ success: true, message: 'Candidate status updated', candidate: rows[0] });
  } catch (error) {
    console.error('Update candidate stage error:', error);
    res.status(500).json({ success: false, message: 'Failed to update candidate' });
  }
});

// 1-Click Convert Hired Candidate to Employee
app.post('/api/hrms/recruitment/hire/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const candidateId = Number(req.params.id);
    const candQ = await client.query(`SELECT * FROM candidates WHERE id = $1`, [candidateId]);
    if (!candQ.rows.length) return res.status(404).json({ success: false, message: 'Candidate not found' });
    const c = candQ.rows[0];

    // Check if user already exists with email
    const existingUser = await client.query(`SELECT id FROM admin_users WHERE email = $1`, [c.email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: `An employee account already exists with email ${c.email}` });
    }

    await client.query('BEGIN');

    // Create user with default temporary password
    const tempPassword = `Zorvixe@${Math.floor(1000 + Math.random() * 9000)}`;
    const hash = await bcrypt.hash(tempPassword, 10);
    const username = (c.email.split('@')[0] || c.name.replace(/\s+/g, '').toLowerCase()) + Math.floor(10 + Math.random() * 89);

    const userInsert = await client.query(`
      INSERT INTO admin_users (name, email, username, password_hash, role, position, phone, is_active)
      VALUES ($1, $2, $3, $4, 'employee', $5, $6, TRUE)
      RETURNING *
    `, [c.name, c.email.toLowerCase(), username, hash, c.position || 'Software Engineer', c.phone]);

    const newUser = userInsert.rows[0];

    // Create profile
    const empCode = `ZOR-EMP-${String(newUser.id).padStart(3, '0')}`;
    await client.query(`
      INSERT INTO hrms_employee_profiles (user_id, employee_code, employment_type, joining_date)
      VALUES ($1, $2, 'full_time', CURRENT_DATE)
    `, [newUser.id, empCode]);

    // Create salary structure
    await client.query(`
      INSERT INTO hrms_salary_structures (user_id, ctc_annual, basic_monthly, hra_monthly, special_allowance_monthly, effective_from)
      VALUES ($1, 600000, 25000, 10000, 10000, CURRENT_DATE)
    `, [newUser.id]);

    // Update candidate stage to hired
    await client.query(`UPDATE candidates SET stage = 'hired', status = 'approved' WHERE id = $1`, [candidateId]);

    // Send Welcome Email
    sendUserWelcomeEmail({
      toEmail: newUser.email,
      name: newUser.name,
      username: newUser.username,
      plainPassword: tempPassword,
      role: 'employee'
    }).catch(err => console.error('[Mailer] Welcome email error:', err));

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Candidate ${c.name} hired successfully as Employee (${empCode})! Welcome credentials have been emailed.`,
      user: newUser,
      tempPassword
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Hire candidate error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to hire candidate' });
  } finally {
    client.release();
  }
});

// Compliance & Statutory Tracker
app.get('/api/hrms/compliance', requireAuth, async (req, res) => {
  try {
    const { category, status } = req.query;
    let whereClauses = [];
    let params = [];

    if (category) {
      params.push(category);
      whereClauses.push(`category = $${params.length}`);
    }
    if (status) {
      params.push(status);
      whereClauses.push(`status = $${params.length}`);
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const q = `SELECT * FROM hrms_compliance_records ${whereStr} ORDER BY due_date ASC NULLS LAST`;
    const { rows } = await pool.query(q, params);

    res.json({ success: true, records: rows });
  } catch (error) {
    console.error('Compliance error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve compliance records' });
  }
});

// Update compliance status
app.patch('/api/hrms/compliance/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, due_date, notes } = req.body || {};

    const q = `
      UPDATE hrms_compliance_records
      SET status = COALESCE($1, status),
          due_date = COALESCE($2, due_date),
          notes = COALESCE($3, notes),
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    const { rows } = await pool.query(q, [status || null, due_date || null, notes || null, id]);
    res.json({ success: true, message: 'Compliance record updated', record: rows[0] });
  } catch (error) {
    console.error('Update compliance error:', error);
    res.status(500).json({ success: false, message: 'Failed to update compliance record' });
  }
});

/* ----------------------- 4B. Public Careers Portal API (Applicant Email Login & ATS Sync) ----------------------- */

const careersOtpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests. Please wait a few minutes before retrying.' }
});

function requireApplicant(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'Please sign in with your Gmail / Google account to continue.' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || decoded.type !== 'applicant' || !decoded.applicantEmail) {
      return res.status(403).json({ success: false, message: 'Invalid applicant session. Please sign in again.' });
    }
    req.applicant = {
      email: decoded.applicantEmail.toLowerCase().trim(),
      name: decoded.applicantName || '',
      avatar: decoded.applicantAvatar || ''
    };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Session expired. Please sign in with your Google / Gmail account again.' });
  }
}

function isGmailAccount(email) {
  return /^[^\s@]+@(gmail\.com|googlemail\.com)$/i.test(String(email || '').trim());
}

async function fetchApplicantApplications(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const q = `
    SELECT
      c.id,
      c.candidate_id,
      c.name,
      c.email,
      c.phone,
      c.position,
      c.stage,
      c.status,
      c.job_id,
      c.experience_years,
      c.expected_salary,
      c.current_location,
      c.notice_period,
      c.interview_date,
      c.created_at,
      j.title AS job_title,
      j.department AS job_department,
      j.location AS job_location,
      j.job_type AS job_type,
      cu.file_name AS resume_file_name
    FROM candidates c
    LEFT JOIN hrms_job_openings j ON j.id = c.job_id
    LEFT JOIN LATERAL (
      SELECT file_name
      FROM candidate_uploads
      WHERE candidate_id = c.id
      ORDER BY upload_date DESC
      LIMIT 1
    ) cu ON TRUE
    WHERE LOWER(c.email) = $1
    ORDER BY c.created_at DESC
  `;
  const { rows } = await pool.query(q, [cleanEmail]);
  return rows;
}

// Public careers summary (open count, departments teaser, and Google OAuth Client ID)
app.get('/api/careers/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS open_count,
        COALESCE(ARRAY_AGG(DISTINCT department) FILTER (WHERE department IS NOT NULL), '{}') AS departments
      FROM hrms_job_openings
      WHERE LOWER(COALESCE(status, 'open')) = 'open'
    `);
    res.json({
      success: true,
      openCount: rows[0]?.open_count || 0,
      departments: rows[0]?.departments || [],
      googleClientId: ("732679323329-8mm3knueffrqvntc1nk0uodm93e0tdi4.apps.googleusercontent.com").trim()
    });
  } catch (error) {
    console.error('Careers summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to load careers summary' });
  }
});

// Google / Gmail OAuth Login (Verifies Google Identity ID Token or Access Token)
app.post('/api/careers/auth/google', async (req, res) => {
  try {
    const { credential, accessToken } = req.body || {};
    if (!credential && !accessToken) {
      return res.status(400).json({ success: false, message: 'Google sign-in credential is required.' });
    }

    let googleProfile = null;

    if (credential) {
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
      );
      if (!verifyRes.ok) {
        return res.status(401).json({ success: false, message: 'Invalid or expired Google sign-in token.' });
      }
      const payload = await verifyRes.json();
      const configuredClientId = ("732679323329-8mm3knueffrqvntc1nk0uodm93e0tdi4.apps.googleusercontent.com").trim();
      if (configuredClientId && payload.aud !== configuredClientId) {
        return res.status(401).json({ success: false, message: 'Google sign-in client mismatch.' });
      }
      googleProfile = payload;
    } else if (accessToken) {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!userInfoRes.ok) {
        return res.status(401).json({ success: false, message: 'Invalid Google access token.' });
      }
      googleProfile = await userInfoRes.json();
    }

    const email = (googleProfile?.email || '').trim().toLowerCase();
    const isVerified = googleProfile?.email_verified === true || googleProfile?.email_verified === 'true';

    if (!email || !isVerified) {
      return res.status(401).json({ success: false, message: 'Google account email could not be verified.' });
    }

    if (!isGmailAccount(email)) {
      return res.status(400).json({ success: false, message: 'Please sign in with a valid @gmail.com Google account.' });
    }

    const googleName = (googleProfile?.name || '').trim();
    const googleAvatar = (googleProfile?.picture || '').trim();

    const token = jwt.sign(
      {
        type: 'applicant',
        applicantEmail: email,
        applicantName: googleName,
        applicantAvatar: googleAvatar
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const myApplications = await fetchApplicantApplications(email);
    const latest = myApplications[0] || {};

    res.json({
      success: true,
      token,
      applicant: {
        email,
        name: latest.name || googleName || '',
        avatar: googleAvatar || '',
        phone: latest.phone || '',
        current_location: latest.current_location || ''
      },
      myApplications
    });
  } catch (error) {
    console.error('Careers Google auth error:', error);
    res.status(500).json({ success: false, message: 'Google sign-in failed. Please try again.' });
  }
});

// Step 1: Send verification OTP to Gmail account
app.post('/api/careers/auth/send-otp', careersOtpLimiter, async (req, res) => {
  try {
    const rawEmail = (req.body?.email || '').trim().toLowerCase();
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid Gmail address.' });
    }
    if (!isGmailAccount(rawEmail)) {
      return res.status(400).json({ success: false, message: 'Only Gmail accounts (@gmail.com) are allowed to sign in.' });
    }

    const otp = String(crypto.randomInt(100000, 999999));

    await pool.query(
      `INSERT INTO careers_email_otps (email, otp_code, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [rawEmail, otp]
    );

    const mailRes = await sendCareerOtpEmail({ to: rawEmail, otp });
    const resp = {
      success: true,
      message: `A 6-digit verification code has been sent to your Gmail (${rawEmail}).`
    };
    if (mailRes?.simulated) {
      resp.devOtp = otp;
    }
    res.json(resp);
  } catch (error) {
    console.error('Careers send OTP error:', error);
    res.status(500).json({ success: false, message: 'Unable to send verification code. Please try again.' });
  }
});

// Step 2: Verify Gmail OTP & issue applicant session token
app.post('/api/careers/auth/verify-otp', async (req, res) => {
  try {
    const rawEmail = (req.body?.email || '').trim().toLowerCase();
    const rawOtp = String(req.body?.otp || '').trim();

    if (!isGmailAccount(rawEmail)) {
      return res.status(400).json({ success: false, message: 'A valid @gmail.com address is required.' });
    }
    if (!/^\d{6}$/.test(rawOtp)) {
      return res.status(400).json({ success: false, message: 'Please enter the 6-digit verification code.' });
    }

    const q = await pool.query(
      `SELECT * FROM careers_email_otps
       WHERE LOWER(email) = $1 AND otp_code = $2 AND verified = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [rawEmail, rawOtp]
    );

    if (q.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code. Please request a new one.' });
    }

    await pool.query(`UPDATE careers_email_otps SET verified = TRUE WHERE id = $1`, [q.rows[0].id]);

    const token = jwt.sign(
      { type: 'applicant', applicantEmail: rawEmail },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const myApplications = await fetchApplicantApplications(rawEmail);
    const latest = myApplications[0] || {};

    res.json({
      success: true,
      token,
      applicant: {
        email: rawEmail,
        name: latest.name || '',
        avatar: '',
        phone: latest.phone || '',
        current_location: latest.current_location || ''
      },
      myApplications
    });
  } catch (error) {
    console.error('Careers verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
});

// Get logged-in applicant session & applications
app.get('/api/careers/auth/me', requireApplicant, async (req, res) => {
  try {
    const myApplications = await fetchApplicantApplications(req.applicant.email);
    const latest = myApplications[0] || {};
    res.json({
      success: true,
      applicant: {
        email: req.applicant.email,
        name: latest.name || req.applicant.name || '',
        avatar: req.applicant.avatar || '',
        phone: latest.phone || '',
        current_location: latest.current_location || ''
      },
      myApplications
    });
  } catch (error) {
    console.error('Careers auth me error:', error);
    res.status(500).json({ success: false, message: 'Failed to load applicant profile' });
  }
});

// Get all open job openings for logged-in applicant
app.get('/api/careers/jobs', requireApplicant, async (req, res) => {
  try {
    const q = `
      SELECT
        j.id,
        j.title,
        j.department,
        j.experience_required,
        j.job_type,
        j.vacancies,
        j.location,
        j.salary_range,
        j.description,
        j.requirements,
        j.status,
        j.created_at,
        EXISTS (
          SELECT 1 FROM candidates c
          WHERE c.job_id = j.id AND LOWER(c.email) = $1
        ) AS already_applied
      FROM hrms_job_openings j
      WHERE LOWER(COALESCE(j.status, 'open')) = 'open'
      ORDER BY j.created_at DESC
    `;
    const { rows } = await pool.query(q, [req.applicant.email]);
    res.json({ success: true, jobs: rows });
  } catch (error) {
    console.error('Careers list jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to load job openings' });
  }
});

// Parse uploaded resume on Careers portal to autofill application fields
app.post('/api/careers/parse-resume', requireApplicant, upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No resume file uploaded' });
  }
  try {
    const rawText = extractResumeText(req.file.path, req.file.mimetype, req.file.originalname);
    const extracted = parseResumeDetails(rawText, req.file.originalname);
    res.json({
      success: true,
      extracted,
      file: {
        path: req.file.path,
        originalname: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Careers parse resume error:', error);
    res.status(500).json({ success: false, message: 'Failed to parse resume' });
  }
});

// Submit Job Application -> goes directly into HRMS Candidate ATS Pipeline (Applied stage)
app.post('/api/careers/apply', requireApplicant, upload.single('resume'), async (req, res) => {
  try {
    const {
      job_id,
      name,
      phone,
      experience_years,
      expected_salary,
      current_location,
      notice_period,
      linkedin_url,
      portfolio_url,
      cover_letter,
      resume_file
    } = req.body || {};

    const applicantEmail = req.applicant.email;
    const jobIdNum = Number(job_id);
    if (!Number.isFinite(jobIdNum) || jobIdNum <= 0) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { } }
      return res.status(400).json({ success: false, message: 'Please select a valid job opening.' });
    }

    const cleanName = (name || '').trim();
    const cleanPhoneDigits = String(phone || '').replace(/\D/g, '').slice(-10);
    if (cleanName.length < 2) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { } }
      return res.status(400).json({ success: false, message: 'Full name must be at least 2 characters.' });
    }
    if (!/^[6-9]\d{9}$/.test(cleanPhoneDigits)) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { } }
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number starting with 6-9.' });
    }

    // Check job exists & is open
    const jobQ = await pool.query(`SELECT * FROM hrms_job_openings WHERE id = $1`, [jobIdNum]);
    if (jobQ.rows.length === 0) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { } }
      return res.status(404).json({ success: false, message: 'Job opening not found.' });
    }
    const job = jobQ.rows[0];
    if (String(job.status || 'open').toLowerCase() !== 'open') {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { } }
      return res.status(400).json({ success: false, message: 'This job opening is no longer accepting applications.' });
    }

    // Check duplicate application for the same job + email
    const dupQ = await pool.query(
      `SELECT id FROM candidates WHERE job_id = $1 AND LOWER(email) = $2 LIMIT 1`,
      [jobIdNum, applicantEmail]
    );
    if (dupQ.rows.length > 0) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { } }
      return res.status(409).json({ success: false, message: `You have already applied for ${job.title}.` });
    }

    // Determine attached resume (either uploaded directly in this request OR pre-uploaded via parse-resume)
    let attachedFile = null;
    if (req.file) {
      attachedFile = {
        path: req.file.path,
        originalname: req.file.originalname,
        size: req.file.size
      };
    } else if (resume_file) {
      try {
        const parsedFile = typeof resume_file === 'string' ? JSON.parse(resume_file) : resume_file;
        if (parsedFile && parsedFile.path) {
          const resolvedUpload = path.resolve(parsedFile.path);
          const resolvedDir = path.resolve(UPLOADS_DIR);
          if (resolvedUpload.startsWith(resolvedDir) && fs.existsSync(resolvedUpload)) {
            attachedFile = {
              path: resolvedUpload,
              originalname: parsedFile.originalname || path.basename(resolvedUpload),
              size: Number(parsedFile.size || fs.statSync(resolvedUpload).size || 0)
            };
          }
        }
      } catch { }
    }

    const cid = generateCandidateId();
    const initialStatus = attachedFile ? 'documents_uploaded' : 'pending';

    const insertCand = await pool.query(
      `INSERT INTO candidates (
        name, email, phone, position, candidate_id, status,
        stage, job_id, expected_salary, experience_years,
        cover_letter, portfolio_url, linkedin_url, current_location, notice_period, source
      ) VALUES ($1,$2,$3,$4,$5,$6,'applied',$7,$8,$9,$10,$11,$12,$13,$14,'careers_portal')
      RETURNING *`,
      [
        cleanName,
        applicantEmail,
        cleanPhoneDigits,
        job.title,
        cid,
        initialStatus,
        job.id,
        (expected_salary || '').trim() || null,
        (experience_years || '').trim() || null,
        (cover_letter || '').trim() || null,
        (portfolio_url || '').trim() || null,
        (linkedin_url || '').trim() || null,
        (current_location || '').trim() || null,
        (notice_period || '').trim() || null
      ]
    );

    const candidate = insertCand.rows[0];

    if (attachedFile) {
      await pool.query(
        `INSERT INTO candidate_uploads (candidate_id, file_name, file_path, file_size)
         VALUES ($1, $2, $3, $4)`,
        [candidate.id, attachedFile.originalname, attachedFile.path, attachedFile.size]
      );
    }

    // Send confirmation email to applicant & notification to HR/Admin (non-blocking)
    sendCareerApplicationConfirmation({
      to: applicantEmail,
      name: cleanName,
      jobTitle: job.title,
      department: job.department,
      candidateId: cid
    }).catch(err => console.error('[Mailer] Career confirmation email error:', err));

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
    if (adminEmail) {
      sendCareerNewApplicantAdminAlert({
        to: adminEmail,
        applicantName: cleanName,
        applicantEmail,
        applicantPhone: cleanPhoneDigits,
        jobTitle: job.title,
        experienceYears: experience_years,
        expectedSalary: expected_salary
      }).catch(err => console.error('[Mailer] Career admin alert email error:', err));
    }

    const myApplications = await fetchApplicantApplications(applicantEmail);

    res.status(201).json({
      success: true,
      message: `Application submitted for ${job.title}! Reference ID: ${cid}`,
      candidate,
      myApplications
    });
  } catch (error) {
    console.error('Careers apply error:', error);
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch { } }
    res.status(500).json({ success: false, message: 'Failed to submit application. Please try again.' });
  }
});

/* ----------------------- 5. Workforce Insights Analytics ----------------------- */

app.get('/api/hrms/insights', requireAuth, async (req, res) => {
  try {
    // 1. Headcount KPIs
    const headcountQ = await pool.query(`
      SELECT 
        COUNT(*) AS total_employees,
        COUNT(*) FILTER (WHERE is_active = TRUE) AS active_employees,
        COUNT(*) FILTER (WHERE role = 'admin') AS admin_count,
        COUNT(*) FILTER (WHERE role = 'employee') AS employee_count,
        COUNT(*) FILTER (WHERE created_at >= (NOW() - INTERVAL '30 days')) AS new_hires_month
      FROM admin_users
    `);

    // 2. Department Breakdown
    const deptQ = await pool.query(`
      SELECT 
        COALESCE(department, 'General / Other') AS department,
        COUNT(*)::int AS count
      FROM admin_users
      WHERE is_active = TRUE
      GROUP BY COALESCE(department, 'General / Other')
      ORDER BY count DESC
    `);

    // 3. Designation Breakdown
    const posQ = await pool.query(`
      SELECT 
        COALESCE(position, 'Team Member') AS position,
        COUNT(*)::int AS count
      FROM admin_users
      WHERE is_active = TRUE
      GROUP BY COALESCE(position, 'Team Member')
      ORDER BY count DESC
      LIMIT 6
    `);

    // 4. Attendance Rate This Month
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const attRateQ = await pool.query(`
      SELECT 
        COUNT(*) AS total_punches,
        COUNT(*) FILTER (WHERE status = 'present') AS present_count,
        COUNT(*) FILTER (WHERE status = 'late') AS late_count,
        COUNT(*) FILTER (WHERE status = 'half_day') AS half_day_count,
        COALESCE(SUM(total_hours), 0) AS total_hours_worked
      FROM hrms_attendance
      WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
    `, [currentMonth, currentYear]);

    // 5. Payroll Spend Analytics
    const payrollSpendQ = await pool.query(`
      SELECT 
        COALESCE(SUM(gross_earnings), 0) AS total_gross_spend,
        COALESCE(SUM(net_salary), 0) AS total_net_disbursed,
        COALESCE(SUM(pf_deduction), 0) AS total_pf_contribution,
        COALESCE(SUM(esi_deduction), 0) AS total_esi_contribution,
        COALESCE(SUM(tds_deduction), 0) AS total_tds_deducted,
        COALESCE(AVG(net_salary), 0) AS avg_salary
      FROM hrms_payrolls
      WHERE month = $1 AND year = $2
    `, [currentMonth, currentYear]);

    // 6. Recruitment Funnel Stats
    const recFunnelQ = await pool.query(`
      SELECT 
        COUNT(*) AS total_candidates,
        COUNT(*) FILTER (WHERE stage = 'applied') AS applied,
        COUNT(*) FILTER (WHERE stage = 'screening') AS screening,
        COUNT(*) FILTER (WHERE stage = 'interview') AS interview,
        COUNT(*) FILTER (WHERE stage = 'offer') AS offer,
        COUNT(*) FILTER (WHERE stage = 'hired') AS hired,
        COUNT(*) FILTER (WHERE stage = 'rejected') AS rejected
      FROM candidates
    `);

    // 7. Leave Usage
    const leaveQ = await pool.query(`
      SELECT 
        leave_type,
        COUNT(*)::int AS requests_count,
        COALESCE(SUM(total_days), 0)::int AS total_days_taken
      FROM leaves
      WHERE status = 'approved' AND EXTRACT(YEAR FROM start_date) = $1
      GROUP BY leave_type
    `, [currentYear]);

    res.json({
      success: true,
      headcount: headcountQ.rows[0] || {},
      departmentDistribution: deptQ.rows || [],
      designationDistribution: posQ.rows || [],
      attendanceMetrics: attRateQ.rows[0] || {},
      payrollMetrics: payrollSpendQ.rows[0] || {},
      recruitmentFunnel: recFunnelQ.rows[0] || {},
      leaveMetrics: leaveQ.rows || []
    });
  } catch (error) {
    console.error('Workforce insights error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate workforce insights' });
  }
});

/* ----------------------- 6. CRM Deals & Activities ----------------------- */

// Get CRM Overview & Pipeline Stats
app.get('/api/crm/stats', requireAuth, async (req, res) => {
  try {
    const dealsQ = await pool.query(`
      SELECT 
        COUNT(*) AS total_deals,
        COALESCE(SUM(value), 0) AS total_pipeline_value,
        COUNT(*) FILTER (WHERE stage = 'won') AS won_count,
        COALESCE(SUM(value) FILTER (WHERE stage = 'won'), 0) AS won_value,
        COUNT(*) FILTER (WHERE stage = 'lead') AS leads_count,
        COUNT(*) FILTER (WHERE stage IN ('proposal', 'negotiation')) AS in_progress_count
      FROM crm_deals
    `);

    const clientsCountQ = await pool.query(`SELECT COUNT(*) AS total_clients FROM clients`);
    const contactsCountQ = await pool.query(`SELECT COUNT(*) AS total_contacts FROM contacts`);

    res.json({
      success: true,
      stats: {
        ...(dealsQ.rows[0] || {}),
        totalClients: Number(clientsCountQ.rows[0]?.total_clients || 0),
        totalContacts: Number(contactsCountQ.rows[0]?.total_contacts || 0),
      }
    });
  } catch (error) {
    console.error('CRM stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch CRM statistics' });
  }
});

// List Deals
app.get('/api/crm/deals', requireAuth, async (req, res) => {
  try {
    const { stage, client_id } = req.query;
    let whereClauses = [];
    let params = [];

    if (stage) {
      params.push(stage);
      whereClauses.push(`d.stage = $${params.length}`);
    }
    if (client_id) {
      params.push(client_id);
      whereClauses.push(`d.client_id = $${params.length}`);
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const q = `
      SELECT 
        d.*,
        c.name AS client_name,
        co.name AS contact_name,
        u.name AS assigned_user_name
      FROM crm_deals d
      LEFT JOIN clients c ON c.id = d.client_id
      LEFT JOIN contacts co ON co.id = d.contact_id
      LEFT JOIN admin_users u ON u.id = d.assigned_to
      ${whereStr}
      ORDER BY d.created_at DESC
    `;
    const { rows } = await pool.query(q, params);

    // Group into Kanban stages
    const stages = {
      lead: [],
      contacted: [],
      proposal: [],
      negotiation: [],
      won: [],
      lost: []
    };

    rows.forEach(d => {
      const st = (d.stage || 'lead').toLowerCase();
      if (stages[st]) stages[st].push(d);
      else stages.lead.push(d);
    });

    res.json({ success: true, deals: rows, stages });
  } catch (error) {
    console.error('CRM deals error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve CRM deals' });
  }
});

// Create Deal
app.post('/api/crm/deals', requireAuth, async (req, res) => {
  try {
    const { title, client_id, contact_id, value, stage, probability, expected_close_date, assigned_to, description } = req.body || {};
    if (!title) return res.status(400).json({ success: false, message: 'Deal title is required' });

    const q = `
      INSERT INTO crm_deals (title, client_id, contact_id, value, stage, probability, expected_close_date, assigned_to, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const { rows } = await pool.query(q, [
      title,
      client_id || null,
      contact_id || null,
      value || 0,
      stage || 'lead',
      probability !== undefined ? probability : 50,
      expected_close_date || null,
      assigned_to || req.user.sub,
      description || null
    ]);

    res.status(201).json({ success: true, message: 'Deal created successfully', deal: rows[0] });
  } catch (error) {
    console.error('Create deal error:', error);
    res.status(500).json({ success: false, message: 'Failed to create deal' });
  }
});

// Update Deal
app.patch('/api/crm/deals/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, value, stage, probability, expected_close_date, assigned_to, description } = req.body || {};

    const q = `
      UPDATE crm_deals
      SET title = COALESCE($1, title),
          value = COALESCE($2, value),
          stage = COALESCE($3, stage),
          probability = COALESCE($4, probability),
          expected_close_date = COALESCE($5, expected_close_date),
          assigned_to = COALESCE($6, assigned_to),
          description = COALESCE($7, description),
          updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `;
    const { rows } = await pool.query(q, [title, value, stage, probability, expected_close_date, assigned_to, description, id]);
    res.json({ success: true, message: 'Deal updated successfully', deal: rows[0] });
  } catch (error) {
    console.error('Update deal error:', error);
    res.status(500).json({ success: false, message: 'Failed to update deal' });
  }
});

// Delete Deal
app.delete('/api/crm/deals/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`DELETE FROM crm_deals WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Deal deleted successfully' });
  } catch (error) {
    console.error('Delete deal error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete deal' });
  }
});

// List CRM Activities
app.get('/api/crm/activities', requireAuth, async (req, res) => {
  try {
    const { deal_id, client_id } = req.query;
    let whereClauses = [];
    let params = [];

    if (deal_id) {
      params.push(deal_id);
      whereClauses.push(`a.deal_id = $${params.length}`);
    }
    if (client_id) {
      params.push(client_id);
      whereClauses.push(`a.client_id = $${params.length}`);
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const q = `
      SELECT 
        a.*,
        u.name AS user_name,
        d.title AS deal_title,
        c.name AS client_name
      FROM crm_activities a
      LEFT JOIN admin_users u ON u.id = a.user_id
      LEFT JOIN crm_deals d ON d.id = a.deal_id
      LEFT JOIN clients c ON c.id = a.client_id
      ${whereStr}
      ORDER BY a.created_at DESC
      LIMIT 100
    `;
    const { rows } = await pool.query(q, params);
    res.json({ success: true, activities: rows });
  } catch (error) {
    console.error('CRM activities error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve CRM activities' });
  }
});

// Create CRM Activity
app.post('/api/crm/activities', requireAuth, async (req, res) => {
  try {
    const { deal_id, client_id, type, title, description, due_date } = req.body || {};
    if (!title) return res.status(400).json({ success: false, message: 'Activity title is required' });

    const q = `
      INSERT INTO crm_activities (deal_id, client_id, user_id, type, title, description, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const { rows } = await pool.query(q, [
      deal_id || null,
      client_id || null,
      req.user.sub,
      type || 'note',
      title,
      description || null,
      due_date || null
    ]);
    res.status(201).json({ success: true, message: 'Activity logged successfully', activity: rows[0] });
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to log activity' });
  }
});

// Toggle / Update CRM Activity
app.patch('/api/crm/activities/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { completed, due_date } = req.body || {};

    const q = `
      UPDATE crm_activities
      SET completed = COALESCE($1, completed),
          due_date = COALESCE($2, due_date)
      WHERE id = $3
      RETURNING *
    `;
    const { rows } = await pool.query(q, [completed !== undefined ? completed : null, due_date || null, id]);
    res.json({ success: true, message: 'Activity updated', activity: rows[0] });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to update activity' });
  }
});

// Delete CRM Activity
app.delete('/api/crm/activities/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM crm_activities WHERE id = $1', [id]);
    res.json({ success: true, message: 'Activity deleted' });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete activity' });
  }
});

/* ----------------------- 7. Zoho-Grade Enterprise CRM APIs ----------------------- */

// --- 7.1 CRM Leads Management & 1-Click Conversion ---

// List Leads with search & filters
app.get('/api/crm/leads', requireAuth, async (req, res) => {
  try {
    const { status, source, search, converted } = req.query;
    let whereClauses = [];
    let params = [];

    if (converted !== undefined && converted !== '') {
      params.push(converted === 'true');
      whereClauses.push(`l.is_converted = $${params.length}`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`l.status = $${params.length}`);
    }

    if (source) {
      params.push(source);
      whereClauses.push(`l.source = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(l.first_name ILIKE $${params.length} OR l.last_name ILIKE $${params.length} OR l.company ILIKE $${params.length} OR l.email ILIKE $${params.length} OR l.phone ILIKE $${params.length})`);
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const q = `
      SELECT 
        l.*,
        u.name AS assigned_user_name,
        c.name AS converted_client_name,
        d.title AS converted_deal_title
      FROM crm_leads l
      LEFT JOIN admin_users u ON u.id = l.assigned_to
      LEFT JOIN clients c ON c.id = l.converted_client_id
      LEFT JOIN crm_deals d ON d.id = l.converted_deal_id
      ${whereStr}
      ORDER BY l.created_at DESC
    `;
    const { rows } = await pool.query(q, params);
    res.json({ success: true, leads: rows });
  } catch (error) {
    console.error('List leads error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve leads' });
  }
});

// Get single lead details
app.get('/api/crm/leads/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(`
      SELECT l.*, u.name as assigned_user_name
      FROM crm_leads l
      LEFT JOIN admin_users u ON u.id = l.assigned_to
      WHERE l.id = $1
    `, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, lead: rows[0] });
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve lead' });
  }
});

// Create Lead
app.post('/api/crm/leads', requireAuth, async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      company,
      email,
      phone,
      source,
      status,
      industry,
      annual_revenue,
      lead_score,
      assigned_to,
      description
    } = req.body || {};

    if (!first_name) {
      return res.status(400).json({ success: false, message: 'First name is required' });
    }

    const q = `
      INSERT INTO crm_leads (
        first_name, last_name, company, email, phone, source, status,
        industry, annual_revenue, lead_score, assigned_to, description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const { rows } = await pool.query(q, [
      first_name,
      last_name || null,
      company || null,
      email || null,
      phone || null,
      source || 'Website',
      status || 'new',
      industry || null,
      annual_revenue ? Number(annual_revenue) : null,
      lead_score !== undefined ? Number(lead_score) : 10,
      assigned_to || req.user.sub,
      description || null
    ]);

    res.status(201).json({ success: true, message: 'Lead created successfully', lead: rows[0] });
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ success: false, message: 'Failed to create lead' });
  }
});

// Update Lead
app.put('/api/crm/leads/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      first_name,
      last_name,
      company,
      email,
      phone,
      source,
      status,
      industry,
      annual_revenue,
      lead_score,
      assigned_to,
      description
    } = req.body || {};

    const q = `
      UPDATE crm_leads
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          company = COALESCE($3, company),
          email = COALESCE($4, email),
          phone = COALESCE($5, phone),
          source = COALESCE($6, source),
          status = COALESCE($7, status),
          industry = COALESCE($8, industry),
          annual_revenue = COALESCE($9, annual_revenue),
          lead_score = COALESCE($10, lead_score),
          assigned_to = COALESCE($11, assigned_to),
          description = COALESCE($12, description),
          updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `;
    const { rows } = await pool.query(q, [
      first_name,
      last_name,
      company,
      email,
      phone,
      source,
      status,
      industry,
      annual_revenue !== undefined ? Number(annual_revenue) : null,
      lead_score !== undefined ? Number(lead_score) : null,
      assigned_to,
      description,
      id
    ]);

    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, message: 'Lead updated successfully', lead: rows[0] });
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ success: false, message: 'Failed to update lead' });
  }
});

// Delete Lead
app.delete('/api/crm/leads/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM crm_leads WHERE id = $1', [id]);
    res.json({ success: true, message: 'Lead deleted' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete lead' });
  }
});

// ⭐ Iconic Zoho CRM 1-Click Lead Conversion API
app.post('/api/crm/leads/:id/convert', requireAuth, async (req, res) => {
  const clientConn = await pool.connect();
  try {
    await clientConn.query('BEGIN');
    const leadId = Number(req.params.id);
    const { create_deal, deal_name, deal_amount, deal_stage, expected_close_date } = req.body || {};

    const leadRes = await clientConn.query('SELECT * FROM crm_leads WHERE id = $1', [leadId]);
    if (!leadRes.rows.length) {
      await clientConn.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    const lead = leadRes.rows[0];

    if (lead.is_converted) {
      await clientConn.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Lead is already converted' });
    }

    const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'New Contact';
    const companyName = lead.company || fullName;

    // 1. Create or Find Client (Account)
    let clientId = lead.converted_client_id;
    if (!clientId) {
      const existingClient = await clientConn.query(
        'SELECT id FROM clients WHERE LOWER(company) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1',
        [companyName, lead.email || '']
      );
      if (existingClient.rows.length) {
        clientId = existingClient.rows[0].id;
      } else {
        const insertClient = await clientConn.query(
          `INSERT INTO clients (name, email, phone, company, industry, annual_revenue)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [fullName, lead.email || 'contact@client.com', lead.phone || 'N/A', companyName, lead.industry || 'General', lead.annual_revenue || 0]
        );
        clientId = insertClient.rows[0].id;
      }
    }

    // 2. Create B2B CRM Contact
    const contactRes = await clientConn.query(
      `INSERT INTO crm_contacts (client_id, name, email, phone, position, department, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
      [clientId, fullName, lead.email || null, lead.phone || null, 'Decision Maker', lead.industry || 'Operations']
    );
    const contactId = contactRes.rows[0].id;

    // 3. Optionally Create Deal
    let dealId = null;
    if (create_deal) {
      const dTitle = deal_name || `${companyName} - Enterprise Opportunity`;
      const dAmount = Number(deal_amount || lead.annual_revenue || 150000);
      const dStage = deal_stage || 'proposal';
      const dClose = expected_close_date || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      const dealRes = await clientConn.query(
        `INSERT INTO crm_deals (title, client_id, contact_id, value, stage, probability, expected_close_date, assigned_to, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [dTitle, clientId, contactId, dAmount, dStage, 60, dClose, req.user.sub, `Converted from lead #${lead.id}: ${lead.description || ''}`]
      );
      dealId = dealRes.rows[0].id;

      // Automatically create a kickoff follow-up activity
      await clientConn.query(
        `INSERT INTO crm_activities (deal_id, client_id, user_id, type, title, description, due_date)
         VALUES ($1, $2, $3, 'call', $4, $5, NOW() + INTERVAL '1 day')`,
        [dealId, clientId, req.user.sub, `Discovery Call with ${fullName}`, `Initial follow-up call after converting lead from ${lead.source || 'Website'}`]
      );
    }

    // 4. Update Lead to Converted Status
    await clientConn.query(
      `UPDATE crm_leads
       SET is_converted = TRUE,
           status = 'converted',
           converted_at = NOW(),
           converted_client_id = $1,
           converted_contact_id = $2,
           converted_deal_id = $3
       WHERE id = $4`,
      [clientId, contactId, dealId, leadId]
    );

    await clientConn.query('COMMIT');
    res.json({
      success: true,
      message: 'Lead converted successfully into Account, Contact, and Deal!',
      conversion: {
        client_id: clientId,
        contact_id: contactId,
        deal_id: dealId
      }
    });
  } catch (error) {
    await clientConn.query('ROLLBACK');
    console.error('Convert lead error:', error);
    res.status(500).json({ success: false, message: 'Failed to convert lead: ' + error.message });
  } finally {
    clientConn.release();
  }
});

// --- 7.2 Accounts (Clients 360° View) ---

// List Accounts with aggregated sales metrics
app.get('/api/crm/accounts', requireAuth, async (req, res) => {
  try {
    const q = `
      SELECT 
        c.*,
        COUNT(DISTINCT d.id) AS total_deals_count,
        COALESCE(SUM(d.value), 0) AS total_pipeline_value,
        COALESCE(SUM(d.value) FILTER (WHERE d.stage = 'won'), 0) AS total_won_value,
        COUNT(DISTINCT co.id) AS total_contacts_count,
        COUNT(DISTINCT a.id) FILTER (WHERE a.completed = FALSE) AS open_activities_count
      FROM clients c
      LEFT JOIN crm_deals d ON d.client_id = c.id
      LEFT JOIN crm_contacts co ON co.client_id = c.id
      LEFT JOIN crm_activities a ON a.client_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;
    const { rows } = await pool.query(q);
    res.json({ success: true, accounts: rows });
  } catch (error) {
    console.error('List accounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve accounts' });
  }
});

// 360° Account Full View (Account details + Contacts + Deals + Quotes + Activities)
app.get('/api/crm/accounts/:id/360', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const clientRes = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (!clientRes.rows.length) return res.status(404).json({ success: false, message: 'Account not found' });

    const [contactsRes, dealsRes, quotesRes, activitiesRes] = await Promise.all([
      pool.query('SELECT * FROM crm_contacts WHERE client_id = $1 ORDER BY is_primary DESC, created_at DESC', [id]),
      pool.query('SELECT * FROM crm_deals WHERE client_id = $1 ORDER BY created_at DESC', [id]),
      pool.query('SELECT * FROM crm_quotes WHERE client_id = $1 ORDER BY created_at DESC', [id]),
      pool.query(`
        SELECT a.*, u.name as user_name, d.title as deal_title
        FROM crm_activities a
        LEFT JOIN admin_users u ON u.id = a.user_id
        LEFT JOIN crm_deals d ON d.id = a.deal_id
        WHERE a.client_id = $1
        ORDER BY a.created_at DESC
      `, [id])
    ]);

    res.json({
      success: true,
      account: clientRes.rows[0],
      contacts: contactsRes.rows,
      deals: dealsRes.rows,
      quotes: quotesRes.rows,
      activities: activitiesRes.rows
    });
  } catch (error) {
    console.error('Account 360 error:', error);
    res.status(500).json({ success: false, message: 'Failed to load 360 account view' });
  }
});

// Create Account (Client)
app.post('/api/crm/accounts', requireAuth, async (req, res) => {
  try {
    const { name, email, phone, company, industry, website, annual_revenue, address, city, country } = req.body || {};
    if (!name && !company) return res.status(400).json({ success: false, message: 'Company or Contact name is required' });

    const q = `
      INSERT INTO clients (name, email, phone, company, industry, website, annual_revenue, address, city, country)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const { rows } = await pool.query(q, [
      name || company,
      email || 'contact@client.com',
      phone || 'N/A',
      company || name,
      industry || 'Technology',
      website || null,
      annual_revenue ? Number(annual_revenue) : 0,
      address || null,
      city || null,
      country || 'India'
    ]);
    res.status(201).json({ success: true, message: 'Account created successfully', account: rows[0] });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ success: false, message: 'Failed to create account' });
  }
});

// --- 7.3 B2B Contacts ---

// List B2B Contacts
app.get('/api/crm/contacts', requireAuth, async (req, res) => {
  try {
    const { client_id } = req.query;
    let whereStr = client_id ? 'WHERE co.client_id = $1' : '';
    let params = client_id ? [client_id] : [];

    const q = `
      SELECT 
        co.*,
        c.company AS client_company,
        c.name AS client_name
      FROM crm_contacts co
      LEFT JOIN clients c ON c.id = co.client_id
      ${whereStr}
      ORDER BY co.created_at DESC
    `;
    const { rows } = await pool.query(q, params);
    res.json({ success: true, contacts: rows });
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve contacts' });
  }
});

// Create B2B Contact
app.post('/api/crm/contacts', requireAuth, async (req, res) => {
  try {
    const { client_id, name, email, phone, position, department, is_primary, linkedin_url, notes } = req.body || {};
    if (!name) return res.status(400).json({ success: false, message: 'Contact name is required' });

    const q = `
      INSERT INTO crm_contacts (client_id, name, email, phone, position, department, is_primary, linkedin_url, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const { rows } = await pool.query(q, [
      client_id || null,
      name,
      email || null,
      phone || null,
      position || null,
      department || null,
      Boolean(is_primary),
      linkedin_url || null,
      notes || null
    ]);
    res.status(201).json({ success: true, message: 'Contact created successfully', contact: rows[0] });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ success: false, message: 'Failed to create contact' });
  }
});

// Delete B2B Contact
app.delete('/api/crm/contacts/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM crm_contacts WHERE id = $1', [id]);
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete contact' });
  }
});

// --- 7.4 Products & Services Catalog ---

// List Products
app.get('/api/crm/products', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM crm_products ORDER BY id ASC');
    res.json({ success: true, products: rows });
  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve products' });
  }
});

// Create Product
app.post('/api/crm/products', requireAuth, async (req, res) => {
  try {
    const { code, name, category, unit_price, tax_percentage, description } = req.body || {};
    if (!name || !code) return res.status(400).json({ success: false, message: 'Product code and name are required' });

    const q = `
      INSERT INTO crm_products (code, name, category, unit_price, tax_percentage, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const { rows } = await pool.query(q, [
      code.toUpperCase(),
      name,
      category || 'Software',
      Number(unit_price || 0),
      Number(tax_percentage || 18.0),
      description || null
    ]);
    res.status(201).json({ success: true, message: 'Product created successfully', product: rows[0] });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

// --- 7.5 Quotations & Invoicing (CPQ) ---

// List Quotes
app.get('/api/crm/quotes', requireAuth, async (req, res) => {
  try {
    const q = `
      SELECT 
        q.*,
        c.company AS client_company,
        c.name AS client_name,
        d.title AS deal_title,
        co.name AS contact_name
      FROM crm_quotes q
      LEFT JOIN clients c ON c.id = q.client_id
      LEFT JOIN crm_deals d ON d.id = q.deal_id
      LEFT JOIN crm_contacts co ON co.id = q.contact_id
      ORDER BY q.created_at DESC
    `;
    const { rows } = await pool.query(q);
    res.json({ success: true, quotes: rows });
  } catch (error) {
    console.error('List quotes error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve quotes' });
  }
});

// Get Quote with Line Items
app.get('/api/crm/quotes/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const quoteRes = await pool.query(`
      SELECT 
        q.*,
        c.company AS client_company,
        c.name AS client_name,
        c.email AS client_email,
        c.phone AS client_phone,
        c.address AS client_address,
        d.title AS deal_title
      FROM crm_quotes q
      LEFT JOIN clients c ON c.id = q.client_id
      LEFT JOIN crm_deals d ON d.id = q.deal_id
      WHERE q.id = $1
    `, [id]);

    if (!quoteRes.rows.length) return res.status(404).json({ success: false, message: 'Quote not found' });

    const itemsRes = await pool.query(`
      SELECT qi.*, p.code as product_code, p.name as product_name
      FROM crm_quote_items qi
      LEFT JOIN crm_products p ON p.id = qi.product_id
      WHERE qi.quote_id = $1
      ORDER BY qi.id ASC
    `, [id]);

    res.json({
      success: true,
      quote: quoteRes.rows[0],
      items: itemsRes.rows
    });
  } catch (error) {
    console.error('Get quote error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve quote details' });
  }
});

// Create Quote with Line Items
app.post('/api/crm/quotes', requireAuth, async (req, res) => {
  const clientConn = await pool.connect();
  try {
    await clientConn.query('BEGIN');
    const {
      subject,
      deal_id,
      client_id,
      contact_id,
      valid_until,
      items = [],
      discount_percentage = 0,
      terms_and_conditions,
      notes
    } = req.body || {};

    if (!subject || !client_id) {
      await clientConn.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Subject and Client are required' });
    }

    // Generate unique quote number
    const countRes = await clientConn.query('SELECT COUNT(*) FROM crm_quotes');
    const nextNum = Number(countRes.rows[0].count) + 1;
    const quoteNumber = `QT-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;

    // Calculate line items totals
    let subtotal = 0;
    let totalTax = 0;

    const computedItems = (items || []).map(it => {
      const qty = Number(it.quantity || 1);
      const price = Number(it.unit_price || 0);
      const disc = Number(it.discount_percentage || 0);
      const taxRate = Number(it.tax_percentage || 18.0);

      const baseAmount = qty * price;
      const discountedAmount = baseAmount - (baseAmount * (disc / 100));
      const lineTax = discountedAmount * (taxRate / 100);
      const totalAmount = discountedAmount + lineTax;

      subtotal += discountedAmount;
      totalTax += lineTax;

      return {
        product_id: it.product_id || null,
        description: it.description || 'Custom Item',
        quantity: qty,
        unit_price: price,
        discount_percentage: disc,
        tax_percentage: taxRate,
        total_amount: Math.round(totalAmount * 100) / 100
      };
    });

    const overallDiscountAmt = subtotal * (Number(discount_percentage) / 100);
    const grandTotal = Math.round((subtotal - overallDiscountAmt + totalTax) * 100) / 100;

    const quoteRes = await clientConn.query(`
      INSERT INTO crm_quotes (
        quote_number, subject, deal_id, client_id, contact_id,
        valid_until, status, subtotal, discount_percentage, discount_amount,
        tax_amount, grand_total, terms_and_conditions, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      quoteNumber,
      subject,
      deal_id || null,
      client_id,
      contact_id || null,
      valid_until || (new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)),
      Math.round(subtotal * 100) / 100,
      Number(discount_percentage),
      Math.round(overallDiscountAmt * 100) / 100,
      Math.round(totalTax * 100) / 100,
      grandTotal,
      terms_and_conditions || 'Standard Zorvixe Technologies Payment terms: 50% advance, 50% upon milestone delivery. GST extra as applicable.',
      notes || null,
      req.user.sub
    ]);

    const createdQuote = quoteRes.rows[0];

    // Insert line items
    for (const item of computedItems) {
      await clientConn.query(`
        INSERT INTO crm_quote_items (quote_id, product_id, description, quantity, unit_price, discount_percentage, tax_percentage, total_amount)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        createdQuote.id,
        item.product_id,
        item.description,
        item.quantity,
        item.unit_price,
        item.discount_percentage,
        item.tax_percentage,
        item.total_amount
      ]);
    }

    await clientConn.query('COMMIT');
    res.status(201).json({ success: true, message: 'Quote created successfully', quote: createdQuote });
  } catch (error) {
    await clientConn.query('ROLLBACK');
    console.error('Create quote error:', error);
    res.status(500).json({ success: false, message: 'Failed to create quotation: ' + error.message });
  } finally {
    clientConn.release();
  }
});

// Update Quote Status
app.patch('/api/crm/quotes/:id/status', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE crm_quotes SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Quote not found' });
    res.json({ success: true, message: `Quote marked as ${status}`, quote: rows[0] });
  } catch (error) {
    console.error('Update quote status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update quote status' });
  }
});

// Delete Quote
app.delete('/api/crm/quotes/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM crm_quotes WHERE id = $1', [id]);
    res.json({ success: true, message: 'Quote deleted' });
  } catch (error) {
    console.error('Delete quote error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete quote' });
  }
});

// --- 7.6 CRM Analytics, Funnel & Forecasting ---

app.get('/api/crm/analytics', requireAuth, async (req, res) => {
  try {
    // 1. Leads Funnel metrics
    const leadsQ = await pool.query(`
      SELECT 
        COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE status = 'new') AS new_leads,
        COUNT(*) FILTER (WHERE status = 'contacted' OR status = 'attempted_to_contact') AS contacted_leads,
        COUNT(*) FILTER (WHERE status = 'qualified') AS qualified_leads,
        COUNT(*) FILTER (WHERE is_converted = TRUE) AS converted_leads
      FROM crm_leads
    `);

    // 2. Deals Weighted Forecasting
    const dealsQ = await pool.query(`
      SELECT 
        COUNT(*) AS total_deals,
        COALESCE(SUM(value), 0) AS pipeline_value,
        COALESCE(SUM(value * (probability::numeric / 100.0)), 0) AS weighted_forecast_value,
        COUNT(*) FILTER (WHERE stage = 'won') AS won_deals,
        COALESCE(SUM(value) FILTER (WHERE stage = 'won'), 0) AS won_revenue,
        COUNT(*) FILTER (WHERE stage = 'lost') AS lost_deals,
        COALESCE(SUM(value) FILTER (WHERE stage = 'lost'), 0) AS lost_value
      FROM crm_deals
    `);

    // 3. Loss Reasons Breakdown
    const lossReasonsQ = await pool.query(`
      SELECT 
        COALESCE(loss_reason, 'Other / Unspecified') AS reason,
        COUNT(*) AS count,
        COALESCE(SUM(value), 0) AS value
      FROM crm_deals
      WHERE stage = 'lost'
      GROUP BY loss_reason
      ORDER BY count DESC
    `);

    // 4. Sales Rep Leaderboard
    const repsQ = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.email,
        COUNT(d.id) AS deals_count,
        COALESCE(SUM(d.value) FILTER (WHERE d.stage = 'won'), 0) AS won_revenue,
        COUNT(d.id) FILTER (WHERE d.stage = 'won') AS won_count
      FROM admin_users u
      LEFT JOIN crm_deals d ON d.assigned_to = u.id
      GROUP BY u.id, u.name, u.email
      ORDER BY won_revenue DESC
      LIMIT 5
    `);

    // 5. Quotes Summary
    const quotesQ = await pool.query(`
      SELECT 
        COUNT(*) AS total_quotes,
        COALESCE(SUM(grand_total), 0) AS total_quotes_value,
        COUNT(*) FILTER (WHERE status = 'accepted') AS accepted_quotes,
        COALESCE(SUM(grand_total) FILTER (WHERE status = 'accepted'), 0) AS accepted_quotes_value
      FROM crm_quotes
    `);

    const leads = leadsQ.rows[0] || {};
    const deals = dealsQ.rows[0] || {};
    const winRate = Number(deals.total_deals) > 0
      ? Math.round((Number(deals.won_deals) / Number(deals.total_deals)) * 100)
      : 0;

    res.json({
      success: true,
      analytics: {
        leads,
        deals: {
          ...deals,
          win_rate: winRate
        },
        loss_reasons: lossReasonsQ.rows,
        reps_leaderboard: repsQ.rows,
        quotes: quotesQ.rows[0] || {}
      }
    });
  } catch (error) {
    console.error('CRM analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate CRM analytics' });
  }
});

/* ---------------- 7.7 CRM Phase 2: Automation, Web-to-Lead & Communications ---------------- */

// 1. Public Web-to-Lead Capture Webhook (No auth required)
app.post('/api/public/crm/leads', async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      company,
      email,
      phone,
      description,
      source = 'Website Form',
      utm_source,
      utm_medium,
      utm_campaign,
      budget
    } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone number is required.' });
    }

    // Dynamic initial lead score calculation
    let initialScore = 60;
    if (email && email.includes('@') && !email.endsWith('@gmail.com') && !email.endsWith('@yahoo.com')) {
      initialScore += 15; // Corporate domain bonus
    }
    if (phone) initialScore += 10;
    if (company) initialScore += 10;

    const result = await pool.query(
      `INSERT INTO crm_leads (
        first_name, last_name, company, email, phone, 
        source, status, annual_revenue, lead_score, description,
        utm_source, utm_medium, utm_campaign
      ) VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        first_name || 'Website',
        last_name || 'Visitor',
        company || 'Self / Unspecified',
        email || null,
        phone || null,
        source,
        budget ? Number(budget) : null,
        initialScore,
        description || 'Captured via Public Website Lead Form',
        utm_source || null,
        utm_medium || null,
        utm_campaign || null
      ]
    );

    // Optional alert to internal notification service
    try {
      if (typeof sendEmail === 'function' && process.env.ADMIN_ALERT_EMAIL) {
        sendEmail({
          to: process.env.ADMIN_ALERT_EMAIL,
          subject: `⚡ New Lead Inbound: ${company || first_name} (${source})`,
          text: `A new inbound lead was submitted:\nName: ${first_name} ${last_name}\nEmail: ${email}\nPhone: ${phone}\nCompany: ${company}\nDetails: ${description}`
        }).catch(() => { });
      }
    } catch (_) { }

    res.status(201).json({
      success: true,
      message: 'Thank you! Your inquiry has been received. Our team will contact you shortly.',
      lead_id: result.rows[0].id
    });
  } catch (err) {
    console.error('Public lead capture error:', err);
    res.status(500).json({ success: false, message: 'Failed to capture lead' });
  }
});

// 2. Email Templates APIs
app.get('/api/crm/email-templates', requireAuth, async (req, res) => {
  try {
    const q = await pool.query(`SELECT * FROM crm_email_templates ORDER BY is_system DESC, name ASC`);
    res.json({ success: true, templates: q.rows });
  } catch (err) {
    console.error('Failed to list email templates:', err);
    res.status(500).json({ success: false, message: 'Failed to list email templates' });
  }
});

app.post('/api/crm/email-templates', requireAuth, async (req, res) => {
  try {
    const { name, category, subject, body } = req.body;
    if (!name || !subject || !body) {
      return res.status(400).json({ success: false, message: 'Name, subject, and body are required' });
    }
    const q = await pool.query(
      `INSERT INTO crm_email_templates (name, category, subject, body, is_system)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING *`,
      [name, category || 'sales', subject, body]
    );
    res.status(201).json({ success: true, template: q.rows[0] });
  } catch (err) {
    console.error('Failed to create email template:', err);
    res.status(500).json({ success: false, message: 'Failed to create email template' });
  }
});

app.put('/api/crm/email-templates/:id', requireAuth, async (req, res) => {
  try {
    const { name, category, subject, body } = req.body;
    const q = await pool.query(
      `UPDATE crm_email_templates 
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           subject = COALESCE($3, subject),
           body = COALESCE($4, body),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name, category, subject, body, req.params.id]
    );
    if (!q.rows.length) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    res.json({ success: true, template: q.rows[0] });
  } catch (err) {
    console.error('Failed to update email template:', err);
    res.status(500).json({ success: false, message: 'Failed to update email template' });
  }
});

app.delete('/api/crm/email-templates/:id', requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `DELETE FROM crm_email_templates WHERE id = $1 AND is_system = FALSE RETURNING id`,
      [req.params.id]
    );
    if (!q.rows.length) {
      return res.status(400).json({ success: false, message: 'Cannot delete default system templates' });
    }
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (err) {
    console.error('Failed to delete email template:', err);
    res.status(500).json({ success: false, message: 'Failed to delete template' });
  }
});

// 3. Send Email & Log Communication
app.post('/api/crm/send-email', requireAuth, async (req, res) => {
  try {
    const { to, toName, subject, body, relatedType, relatedId } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ success: false, message: 'Recipient email, subject and body are required' });
    }

    let emailSent = false;

    try {
      if (typeof sendEmail === 'function') {
        const htmlBody = body.replace(/\n/g, '<br/>');
        await sendEmail({
          to,
          subject,
          text: body,
          html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #172b4d;">${htmlBody}</div>`
        });
        emailSent = true;
      }
    } catch (mErr) {
      console.warn('Mail dispatch warning (SMTP simulation/offline):', mErr.message);
    }

    // Record in crm_emails history
    const emailRecord = await pool.query(
      `INSERT INTO crm_emails (recipient_email, recipient_name, subject, body, related_type, related_id, sent_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [to, toName || '', subject, body, relatedType || null, relatedId ? Number(relatedId) : null, req.user?.id || null, emailSent ? 'sent' : 'queued']
    );

    // Auto-log to crm_activities so it appears in the 360° timeline
    try {
      await pool.query(
        `INSERT INTO crm_activities (
          client_id, deal_id, type, title, description, due_date, completed, outcome, assigned_to
        ) VALUES (
          $1, $2, 'email', $3, $4, NOW(), TRUE, 'sent', $5
        )`,
        [
          relatedType === 'account' ? relatedId : null,
          relatedType === 'deal' ? relatedId : null,
          `Email: ${subject}`,
          `Sent to ${toName ? toName + ' <' + to + '>' : to}:\n\n${body.slice(0, 300)}${body.length > 300 ? '...' : ''}`,
          req.user?.id || null
        ]
      );
    } catch (_) { }

    res.json({
      success: true,
      message: emailSent ? 'Email dispatched successfully!' : 'Email recorded and queued for delivery.',
      email: emailRecord.rows[0]
    });
  } catch (err) {
    console.error('Failed to send CRM email:', err);
    res.status(500).json({ success: false, message: 'Failed to dispatch email' });
  }
});

// 4. List Sent Email Logs
app.get('/api/crm/emails', requireAuth, async (req, res) => {
  try {
    const { related_type, related_id } = req.query;
    let params = [];
    let whereClauses = [];

    if (related_type) {
      params.push(related_type);
      whereClauses.push(`e.related_type = $${params.length}`);
    }
    if (related_id) {
      params.push(Number(related_id));
      whereClauses.push(`e.related_id = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const q = await pool.query(
      `SELECT e.*, u.name AS sender_name
       FROM crm_emails e
       LEFT JOIN admin_users u ON e.sent_by = u.id
       ${whereSql}
       ORDER BY e.created_at DESC
       LIMIT 50`,
      params
    );
    res.json({ success: true, emails: q.rows });
  } catch (err) {
    console.error('Failed to fetch CRM emails:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch emails' });
  }
});

// 5. CRM Team Members for Rep Assignment
app.get('/api/crm/team', requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT id, name, email, role, avatar FROM admin_users ORDER BY name ASC`
    );
    res.json({ success: true, team: q.rows });
  } catch (err) {
    console.error('Failed to fetch CRM team:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch team' });
  }
});

// 6. Deal Stage Automation & Transitions
app.patch('/api/crm/deals/:id/stage', requireAuth, async (req, res) => {
  try {
    const { stage, probability, loss_reason, loss_notes } = req.body;
    if (!stage) {
      return res.status(400).json({ success: false, message: 'Stage is required' });
    }

    let defaultProb = probability;
    if (defaultProb === undefined) {
      const probMap = { lead: 20, contacted: 40, proposal: 60, negotiation: 80, won: 100, lost: 0 };
      defaultProb = probMap[stage] !== undefined ? probMap[stage] : 50;
    }

    const q = await pool.query(
      `UPDATE crm_deals
       SET stage = $1,
           probability = $2,
           loss_reason = CASE WHEN $1 = 'lost' THEN $3 ELSE loss_reason END,
           loss_notes = CASE WHEN $1 = 'lost' THEN $4 ELSE loss_notes END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [stage, defaultProb, loss_reason || null, loss_notes || null, req.params.id]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }

    const deal = q.rows[0];

    // AUTOMATION HOOK 1: When deal is WON
    if (stage === 'won') {
      // Auto-mark any linked quote as accepted
      await pool.query(
        `UPDATE crm_quotes SET status = 'accepted', updated_at = NOW() WHERE deal_id = $1`,
        [deal.id]
      );
      // Auto-log activity
      await pool.query(
        `INSERT INTO crm_activities (deal_id, client_id, type, title, description, due_date, completed, outcome)
         VALUES ($1, $2, 'task', '🎉 Deal Closed Won Milestone', $3, NOW(), TRUE, 'won')`,
        [deal.id, deal.client_id, `Deal successfully won with total value of ₹${deal.value}. Client onboarding initiated.`]
      );
    }

    // AUTOMATION HOOK 2: When deal is LOST
    if (stage === 'lost') {
      await pool.query(
        `INSERT INTO crm_activities (deal_id, client_id, type, title, description, due_date, completed, outcome)
         VALUES ($1, $2, 'note', 'Deal Closed Lost', $3, NOW(), TRUE, 'lost')`,
        [deal.id, deal.client_id, `Deal marked lost. Reason: ${loss_reason || 'Unspecified'}. Notes: ${loss_notes || 'None'}`]
      );
    }

    res.json({ success: true, deal });
  } catch (err) {
    console.error('Failed to update deal stage:', err);
    res.status(500).json({ success: false, message: 'Failed to update deal stage' });
  }
});

/* --------------------------------- Start ---------------------------------- */
initDb()
  .then(() => app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`)))
  .catch((e) => { console.error('Failed to start server.', e); process.exit(1) })