const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const TARGET = 'odonton_demo_2026';
process.env.DB_NAME = TARGET;
process.env.ODONTON_DEMO_MODE = 'true';
const baseUrl = process.env.DEMO_API_URL || 'http://127.0.0.1:3000';
const accounts = [
  { email: 'dueno.demo.2026@example.com', role: 'dueno', variable: 'DEMO_OWNER_PASSWORD' },
  { email: 'recepcion.demo.2026@example.com', role: 'recepcion', variable: 'DEMO_RECEPTION_PASSWORD' },
  { email: 'odontologa1.demo.2026@example.com', role: 'odontologo', variable: 'DEMO_DENTIST_1_PASSWORD' },
  { email: 'odontologo2.demo.2026@example.com', role: 'odontologo', variable: 'DEMO_DENTIST_2_PASSWORD' },
  { email: 'odontologa3.demo.2026@example.com', role: 'odontologo', variable: 'DEMO_DENTIST_3_PASSWORD' },
];

async function api(pathname, token) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

(async () => {
  if (process.env.DB_NAME !== TARGET) throw new Error(`DB_NAME no apunta a ${TARGET}.`);
  if (String(process.env.ODONTON_DEMO_MODE).toLowerCase() !== 'true') throw new Error('ODONTON_DEMO_MODE no está activo.');
  const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: TARGET });
  const identity = await pool.query(`SELECT current_database() db,(SELECT count(*) FROM pacientes)::int pacientes,(SELECT count(*) FROM turnos)::int turnos,(SELECT count(*) FROM documentos_paciente)::int archivos`);
  const fixtures = await Promise.all(['radiografia-demo.png', 'informe-demo.pdf'].map((name) => fs.access(path.resolve(__dirname, '..', 'uploads', 'demo-2026', name)).then(() => true, () => false)));
  await pool.end();
  if (identity.rows[0].db !== TARGET || fixtures.some((value) => !value)) throw new Error('La base efectiva o los fixtures demo no son válidos.');

  const health = await api('/health');
  if (health.status !== 200) throw new Error(`Health respondió ${health.status}.`);
  const whatsapp = await api('/api/whatsapp/status');
  if (whatsapp.status !== 503 || whatsapp.body?.codigo !== 'DEMO_EXTERNAL_SENDS_DISABLED') throw new Error('WhatsApp no quedó bloqueado por el modo demo.');

  const missing = accounts.filter((account) => !process.env[account.variable]).map((account) => account.variable);
  if (missing.length) {
    console.log(JSON.stringify({ ok: true, database: identity.rows[0], health: health.status, external_sends: 'disabled', fixtures: 2, login: 'pending_missing_variables', missing }));
    process.exitCode = 2;
    return;
  }

  let samplePatientId = null;
  for (const account of accounts) {
    const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: process.env[account.variable] }) });
    const login = await response.json().catch(() => ({}));
    if (response.status !== 200 || login.user?.rol !== account.role) throw new Error(`Falló el login o rol de ${account.email}.`);
    const patients = await api('/api/pacientes?limit=1', login.token);
    const turns = await api('/api/turnos?limit=1', login.token);
    if (patients.status !== 200 || turns.status !== 200) throw new Error(`Falló el acceso operativo de ${account.email}.`);
    samplePatientId ||= patients.body?.pacientes?.[0]?.id;
    if (account.role !== 'recepcion' && samplePatientId) {
      const documents = await api(`/api/documentos?paciente_id=${samplePatientId}`, login.token);
      if (documents.status !== 200) throw new Error(`Falló el acceso a archivos clínicos de ${account.email}.`);
    }
  }
  console.log(JSON.stringify({ ok: true, database: identity.rows[0], health: health.status, external_sends: 'disabled', fixtures: 2, logins: accounts.length, patients_turns: 'ok', clinical_files: 'ok' }));
})().catch((error) => { console.error(`ERROR DEMO LOCAL: ${error.message}`); process.exitCode = 1; });

