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
    const ok =
      file.mimetype === "application/pdf" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/jpg";
    cb(ok ? null : new Error("Only JPG/PNG/PDF allowed"), ok);
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

    await pool.query('UPDATE admin_users SET last_login_at=NOW() WHERE id=$1', [admin.id])

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
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  res.json({ message: 'Logged out' })
})
app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ me: req.user })
})

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
      where.push(`(LOWER(name) LIKE $${idx} OR LOWER(email) LIKE $${idx} OR LOWER(username) LIKE $${idx})`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const c = await pool.query(`SELECT COUNT(*)::BIGINT AS total FROM admin_users ${whereSql}`, params)
    const total = Number(c.rows[0]?.total || 0)

    const data = await pool.query(
      `SELECT id, email, username, name, role, is_active, last_login_at, created_at, updated_at
       FROM admin_users
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )

    res.json({ data: data.rows, page, limit, total, total_pages: Math.ceil(total / limit) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { name = '', email = '', username = '', role = 'employee', password = '' } = req.body || {}
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email, password required' })
    const roleVal = role === 'admin' ? 'admin' : 'employee'
    const uname = username ? username.toLowerCase() : null

    const hash = await bcrypt.hash(password, 12)
    const sql = `
      INSERT INTO admin_users (name, email, username, role, password_hash, is_active)
      VALUES ($1,$2,$3,$4,$5,TRUE)
      RETURNING id, email, username, name, role, is_active, created_at, updated_at
    `
    const { rows } = await pool.query(sql, [name, email.toLowerCase(), uname, roleVal, hash])
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
    const { name, email, username, role, is_active, password } = req.body || {}
    if (typeof name === 'string') { params.push(name); sets.push(`name=$${params.length}`) }
    if (typeof email === 'string') { params.push(email.toLowerCase()); sets.push(`email=$${params.length}`) }
    if (typeof username === 'string') { params.push(username.toLowerCase() || null); sets.push(`username=$${params.length}`) }
    if (role === 'admin' || role === 'employee') { params.push(role); sets.push(`role=$${params.length}`) }
    if (typeof is_active === 'boolean') { params.push(is_active); sets.push(`is_active=$${params.length}`) }
    if (typeof password === 'string' && password.length >= 6) {
      const hash = await bcrypt.hash(password, 12)
      params.push(hash); sets.push(`password_hash=$${params.length}`)
    }
    if (!sets.length) return res.status(400).json({ message: 'No changes submitted' })
    params.push(id)
    const { rows } = await pool.query(
      `UPDATE admin_users SET ${sets.join(', ')} WHERE id=$${params.length}
       RETURNING id, email, username, name, role, is_active, last_login_at, created_at, updated_at`,
      params
    )
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

// Create candidate (ADMIN)
app.post('/api/admin/candidates', requireAdmin, async (req, res) => {
  const { name, email, phone, position } = req.body || {}
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
    res.status(201).json({ success: true, candidate: result.rows[0] })
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
    const onboardingUrl = `https://www.zorvixetechnologies.com/onboarding/${token}`
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

// Admin download of uploaded PDF (ADMIN)
app.get('/api/admin/candidate-download/:candidateId', requireAdmin, async (req, res) => {
  const { candidateId } = req.params
  try {
    const q = await pool.query(
      `SELECT cu.*, c.name AS candidate_name
       FROM candidate_uploads cu
       JOIN candidates c ON cu.candidate_id = c.id
       WHERE cu.candidate_id = $1`,
      [candidateId]
    )
    if (q.rows.length === 0) return res.status(404).json({ success: false, message: 'No uploaded file found' })
    const upload = q.rows[0]
    const filePath = path.resolve(upload.file_path)
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${upload.candidate_name}-certificates.pdf"`)
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

app.get('/api/stats/notifications', requireAuth, async (_req, res) => {
  try {
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
          creator.name AS created_by_name
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
        LIMIT 15  -- Increased limit to get more login activities
      `),

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

    // User login activities - SIMULATE LOGOUTS BY USING LOGIN TIMESTAMPS
    // We'll create both login and "logout" events from the login data
    recentLogins.rows.forEach((r, index) => {
      // Add login activity
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

      // Simulate logout activity (create a logout event 1 hour after login)
      // This is a simple simulation since we don't have actual logout tracking
      const logoutTime = new Date(r.last_login_at);
      logoutTime.setHours(logoutTime.getHours() + 1);
      
      // Only add logout if it's in the past (not future)
      if (logoutTime < new Date()) {
        acts.push({
          type: "user_logout",
          at: logoutTime.toISOString(),
          text: `${r.name} logged out`,
          data: {
            ...r,
            name: r.name,
            email: r.email
          }
        });
      }
    });

    // Sort by date (newest first)
    acts.sort((a, b) => new Date(b.at) - new Date(a.at));
    const activityFeed = acts.slice(0, 20); // Get top 20 most recent activities

    // Build response
    res.json({
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

// GET /api/stats/tickets — robust + debug-friendly
app.get("/api/stats/tickets", requireAuth, async (req, res) => {
  try {
    const authUser = req.user || {};
    // DEBUG: log req.user so we can see what's coming in
    console.log("[stats/tickets] req.user:", JSON.stringify(authUser));

    const role = String((authUser.role || "")).toLowerCase();
    const isAdmin = role === "admin";
    const uid = isAdmin ? null : Number(req.user.sub); // Convert to number

    console.log(`[stats/tickets] isAdmin=${isAdmin} uid=${uid}`);

    // If non-admin and no uid, return empty safe response
    if (!isAdmin && !uid) {
      console.warn("[stats/tickets] non-admin request but no uid present — returning empty result");
      return res.json({
        totals: { tickets: 0 },
        statusBreakdowns: { byStatus: [], byPriority: [] },
        trendsLast30: { tickets: [], comments: [] },
        activityFeed: [],
        recentData: { tickets: [], ticketComments: [] },
      });
    }

    // Build queries separately for admin / non-admin to avoid string manipulation errors
    const params = isAdmin ? [] : [uid];

    // 1) tickets count
    const qTicketsCount = isAdmin
      ? `SELECT COUNT(*)::BIGINT AS c FROM tickets`
      : `SELECT COUNT(*)::BIGINT AS c FROM tickets t
         WHERE (t.created_by = $1 OR t.assigned_to = $1
                OR EXISTS (SELECT 1 FROM ticket_comments tc2 WHERE tc2.ticket_id = t.id AND tc2.user_id = $1))`;

    // 2) recent tickets
    const qTicketsRecent = isAdmin
      ? `
        SELECT t.id, t.title, t.status, t.priority, t.created_at, t.updated_at,
               au.name AS assigned_to_name, au.email AS assigned_to_email,
               creator.name AS created_by_name
        FROM tickets t
        LEFT JOIN admin_users au ON au.id = t.assigned_to
        LEFT JOIN admin_users creator ON creator.id = t.created_by
        ORDER BY t.created_at DESC
        LIMIT 10
      `
      : `
        SELECT t.id, t.title, t.status, t.priority, t.created_at, t.updated_at,
               au.name AS assigned_to_name, au.email AS assigned_to_email,
               creator.name AS created_by_name
        FROM tickets t
        LEFT JOIN admin_users au ON au.id = t.assigned_to
        LEFT JOIN admin_users creator ON creator.id = t.created_by
        WHERE (t.created_by = $1 OR t.assigned_to = $1
               OR EXISTS (SELECT 1 FROM ticket_comments tc2 WHERE tc2.ticket_id = t.id AND tc2.user_id = $1))
        ORDER BY t.created_at DESC
        LIMIT 10
      `;

    // 3) recent ticket comments (limit 10): show comments either on visible tickets or comments authored by the user
    const qTicketCommentsRecent = isAdmin
      ? `
        SELECT tc.id, tc.ticket_id, tc.comment_text, tc.created_at,
               t.title AS ticket_title, t.status AS ticket_status,
               u.name AS user_name, u.email AS user_email
        FROM ticket_comments tc
        JOIN tickets t ON t.id = tc.ticket_id
        JOIN admin_users u ON u.id = tc.user_id
        ORDER BY tc.created_at DESC
        LIMIT 10
      `
      : `
        SELECT tc.id, tc.ticket_id, tc.comment_text, tc.created_at,
               t.title AS ticket_title, t.status AS ticket_status,
               u.name AS user_name, u.email AS user_email
        FROM ticket_comments tc
        JOIN tickets t ON t.id = tc.ticket_id
        JOIN admin_users u ON u.id = tc.user_id
        WHERE (t.created_by = $1 OR t.assigned_to = $1 OR tc.user_id = $1)
        ORDER BY tc.created_at DESC
        LIMIT 10
      `;

    // 4) tickets by status
    const qTicketsByStatus = isAdmin
      ? `SELECT status, COUNT(*)::BIGINT AS count FROM tickets GROUP BY status`
      : `
        SELECT status, COUNT(*)::BIGINT AS count
        FROM tickets t
        WHERE (t.created_by = $1 OR t.assigned_to = $1
               OR EXISTS (SELECT 1 FROM ticket_comments tc2 WHERE tc2.ticket_id = t.id AND tc2.user_id = $1))
        GROUP BY status
      `;

    // 5) tickets by priority
    const qTicketsByPriority = isAdmin
      ? `SELECT priority, COUNT(*)::BIGINT AS count FROM tickets GROUP BY priority`
      : `
        SELECT priority, COUNT(*)::BIGINT AS count
        FROM tickets t
        WHERE (t.created_by = $1 OR t.assigned_to = $1
               OR EXISTS (SELECT 1 FROM ticket_comments tc2 WHERE tc2.ticket_id = t.id AND tc2.user_id = $1))
        GROUP BY priority
      `;

    // 6) tickets last 30 days
    const qTicketsLast30 = isAdmin
      ? `
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::BIGINT AS count
        FROM tickets
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `
      : `
        SELECT date_trunc('day', t.created_at) AS day, COUNT(*)::BIGINT AS count
        FROM tickets t
        WHERE (t.created_by = $1 OR t.assigned_to = $1
               OR EXISTS (SELECT 1 FROM ticket_comments tc2 WHERE tc2.ticket_id = t.id AND tc2.user_id = $1))
          AND t.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `;

    // 7) comments last 30 days
    const qCommentsLast30 = isAdmin
      ? `
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::BIGINT AS count
        FROM ticket_comments
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `
      : `
        SELECT date_trunc('day', tc.created_at) AS day, COUNT(*)::BIGINT AS count
        FROM ticket_comments tc
        JOIN tickets t ON t.id = tc.ticket_id
        WHERE (t.created_by = $1 OR t.assigned_to = $1 OR tc.user_id = $1)
          AND tc.created_at >= NOW() - INTERVAL '30 days'
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
      pool.query(qTicketsCount, params),
      pool.query(qTicketsRecent, params),
      pool.query(qTicketCommentsRecent, params),
      pool.query(qTicketsByStatus, params),
      pool.query(qTicketsByPriority, params),
      pool.query(qTicketsLast30, params),
      pool.query(qCommentsLast30, params),
    ]);

    console.log("[stats/tickets] rows recent:", ticketsRecentQ.rows.length, "commentsRecent:", ticketCommentsRecentQ.rows.length);

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
    const activityFeed = acts.slice(0, 20);

    res.json({
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


/* --------------------------------- Tickets API --------------------------------- */
// Get all tickets
app.get('/api/tickets', requireAuth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200);
    const offset = (page - 1) * limit;
    const status = (req.query.status || '').toString();
    const priority = (req.query.priority || '').toString();
    const search = (req.query.search || '').toString().trim();

    let where = [];
    let params = [];

    if (status && status !== 'all') {
      params.push(status);
      where.push(`t.status = $${params.length}`);
    }

    if (priority && priority !== 'all') {
      params.push(priority);
      where.push(`t.priority = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Get total count
    const countQuery = await pool.query(
      `SELECT COUNT(*)::BIGINT AS total FROM tickets t ${whereSql}`,
      params
    );
    const total = Number(countQuery.rows[0]?.total || 0);

    // Get tickets with creator and assignee info
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
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    res.json({
      success: true,
      tickets: dataQuery.rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
    });
  } catch (e) {
    console.error(e);
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
        assignee.id AS assignee_id, assignee.name AS assignee_name, assignee.email AS assignee_email
      FROM tickets t
      LEFT JOIN admin_users creator ON creator.id = t.created_by
      LEFT JOIN admin_users assignee ON assignee.id = t.assigned_to
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

    res.status(201).json({ success: true, ticket: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update a ticket
app.patch('/api/tickets/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ticket id' });

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

    params.push(id);
    const result = await pool.query(`
      UPDATE tickets 
      SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, ticket: result.rows[0] });
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
    if (!exists.rows.length) return res.status(404).json({ success:false, message:'Ticket not found' });

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

    res.status(201).json({ success:true, comment: joined.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:'Server error' });
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
    if (!own.rows.length) return res.status(404).json({ success:false, message:'Comment not found or access denied' });

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

    res.json({ success:true, comment: joined.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:'Server error' });
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
    if (!t) return res.status(404).json({ success:false, message:'Ticket not found' });

    // Only creator or admin
    if (t.created_by !== req.user.sub && !isAdmin(req)) {
      return res.status(403).json({ success:false, message:'Forbidden' });
    }

    await pool.query(`DELETE FROM tickets WHERE id=$1`, [id]);
    return res.json({ success:true, message:'Deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});


/* --------------------------------- Start ---------------------------------- */
initDb()
  .then(() => app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`)))
  .catch((e) => { console.error('Failed to start server.', e); process.exit(1) })