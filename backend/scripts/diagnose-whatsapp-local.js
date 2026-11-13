const crypto = require('node:crypto');
const path = require('node:path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const TARGET_DATABASE = 'odonton_demo_2026';
const API_URL = process.env.DEMO_API_URL || 'http://127.0.0.1:3000';
const OBSERVATION_MS = Number.parseInt(process.env.WHATSAPP_DIAGNOSTIC_OBSERVATION_MS || '300000', 10);

if (process.env.DB_NAME !== TARGET_DATABASE) {
  throw new Error(`Diagnóstico rechazado: DB_NAME debe ser ${TARGET_DATABASE}.`);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: TARGET_DATABASE,
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let temporaryUserId = null;

async function request(pathname, options = {}) {
  const response = await fetch(`${API_URL}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.mensaje || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = body.codigo;
    throw error;
  }
  return body;
}

async function createTemporaryOwner() {
  const database = await pool.query('SELECT current_database() AS nombre');
  if (database.rows[0].nombre !== TARGET_DATABASE) throw new Error('La conexión efectiva no apunta a la demo.');
  const role = await pool.query("SELECT id FROM roles WHERE codigo = 'dueno' LIMIT 1");
  if (!role.rowCount) throw new Error('No existe el rol dueño en la base demo.');
  const password = crypto.randomBytes(24).toString('base64url');
  const email = `whatsapp-diagnostic-${crypto.randomUUID()}@example.invalid`;
  const hash = await bcrypt.hash(password, 10);
  const user = await pool.query(`
    INSERT INTO usuarios
      (nombre, email, password_hash, activo, puede_cobrar, debe_cambiar_password, es_demo, created_at, updated_at)
    VALUES ('Diagnóstico WhatsApp temporal', $1, $2, true, false, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `, [email, hash]);
  temporaryUserId = user.rows[0].id;
  await pool.query(`
    INSERT INTO usuarios_roles_vigentes (usuario_id, rol_id, asignado_por_usuario_id, motivo, asignado_at)
    VALUES ($1, $2, $1, 'Diagnóstico local temporal', CURRENT_TIMESTAMP)
  `, [temporaryUserId, role.rows[0].id]);
  await pool.query(`
    INSERT INTO usuarios_roles (usuario_id, rol_id, asignado_por_usuario_id, asignado_at)
    VALUES ($1, $2, $1, CURRENT_TIMESTAMP)
  `, [temporaryUserId, role.rows[0].id]);
  return { email, password };
}

async function cleanupTemporaryOwner() {
  if (!temporaryUserId) return;
  await pool.query('DELETE FROM usuarios_roles_vigentes WHERE usuario_id = $1', [temporaryUserId]);
  await pool.query('DELETE FROM usuarios_roles WHERE usuario_id = $1', [temporaryUserId]);
  await pool.query('DELETE FROM usuarios WHERE id = $1', [temporaryUserId]);
  temporaryUserId = null;
}

(async () => {
  try {
    const fixture = await createTemporaryOwner();
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fixture),
    });
    const headers = { Authorization: `Bearer ${login.token}` };
    const initial = await request('/api/whatsapp/status', { headers });
    if (initial.diagnostic_mode !== true || initial.external_sends_enabled !== false) {
      throw new Error('El backend no está en diagnóstico seguro sin envíos.');
    }
    await request('/api/whatsapp/connect', { method: 'POST', headers });

    const startedAt = Date.now();
    let previous = null;
    while (Date.now() - startedAt < OBSERVATION_MS) {
      const status = await request('/api/whatsapp/status', { headers });
      if (status.status !== previous) {
        console.log(JSON.stringify({
          status: status.status,
          elapsed_ms: Date.now() - startedAt,
          ready: status.ready === true,
          has_qr: status.has_qr === true,
          external_sends_enabled: status.external_sends_enabled,
          error: status.last_error || null,
        }));
        previous = status.status;
      }
      if (status.status === 'CONNECTED' || status.status === 'ERROR') break;
      await wait(1000);
    }
  } finally {
    await cleanupTemporaryOwner();
    await pool.end();
  }
})().catch((error) => {
  console.error(JSON.stringify({ status: 'DIAGNOSTIC_FAILED', error: error.message, code: error.code || null }));
  process.exitCode = 1;
});
