require('dotenv').config();
const bcrypt = require('bcrypt');
const { Client, Pool } = require('pg');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const { generarToken } = require('../src/utils/jwt');

const cfg = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD };
const pool = new Pool({ ...cfg, database: process.env.DB_NAME });
const suffix = Date.now();
const password = `Test-${suffix}!`;
const ids = [];
const children = [];
let isolatedDatabase = null;

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Servidor no disponible: ${url}`);
}

async function startBackend({ database, port }) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DB_NAME: database, PORT: String(port), REMINDERS_ENABLED: 'false', WHATSAPP_AUTO_START: 'false' },
    stdio: 'ignore',
  });
  children.push(child);
  await waitFor(`http://127.0.0.1:${port}/health`);
  return `http://127.0.0.1:${port}`;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

(async () => {
  const database = (await pool.query('SELECT current_database() db')).rows[0].db;
  if (database !== 'odonton_ficha_20261109_test') throw new Error(`Base no autorizada: ${database}`);
  try {
    const mainPort = await freePort();
    const baseUrl = await startBackend({ database, port: mainPort });
    const hash = await bcrypt.hash(password, 4);
    const users = await pool.query(`INSERT INTO usuarios(nombre,email,password_hash,activo,puede_cobrar,debe_cambiar_password,es_demo,updated_at) VALUES
      ($1,$2,$4,true,false,false,true,NOW()),($1,$3,$4,true,false,false,true,NOW()),($1,$5,$4,true,false,false,true,NOW()) RETURNING id,email`,
    [`Auth temporal ${suffix}`, `owner.auth.${suffix}@test`, `norole.auth.${suffix}@test`, hash, `inactive.auth.${suffix}@test`]);
    ids.push(...users.rows.map((user) => user.id));
    const [owner, noRole, inactive] = users.rows;
    const roles = await pool.query("SELECT id,codigo FROM roles WHERE codigo IN ('dueno','odontologo','recepcion')");
    const byRole = new Map(roles.rows.map((role) => [role.codigo, role.id]));
    await pool.query(`INSERT INTO usuarios_roles_vigentes(usuario_id,rol_id,asignado_por_usuario_id,motivo) VALUES
      ($1,$3,$1,'Prueba HTTP temporal'),($2,$4,$1,'Prueba HTTP temporal')`, [owner.id, inactive.id, byRole.get('dueno'), byRole.get('recepcion')]);

    const loginOwner = await request(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: owner.email, password }) });
    if (loginOwner.status !== 200 || loginOwner.body.user.rol !== 'dueno' || !loginOwner.body.user.permisos.acceso_total) throw new Error(`Login dueño fallo: ${JSON.stringify(loginOwner)}`);
    const token = loginOwner.body.token;
    const headers = { Authorization: `Bearer ${token}` };
    const modules = ['/api/pacientes?limit=1', '/api/turnos?page=1&limit=1', '/api/prestaciones', '/api/cargos?page=1&limit=1', '/api/pagos?page=1&limit=1', '/api/reportes/resumen', '/api/configuracion'];
    const moduleResults = {};
    for (const route of modules) {
      const result = await request(`${baseUrl}${route}`, { headers });
      moduleResults[route] = result.status;
      if ([401, 403, 503].includes(result.status)) throw new Error(`Dueño sin acceso a ${route}: ${result.status}`);
    }

    const noRoleLogin = await request(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: noRole.email, password }) });
    if (noRoleLogin.status !== 403 || noRoleLogin.body.codigo !== 'CUENTA_SIN_ROL') throw new Error(`Cuenta sin rol no rechazada: ${JSON.stringify(noRoleLogin)}`);
    const inactiveToken = generarToken({ userId: inactive.id });
    await pool.query('UPDATE usuarios SET activo=false WHERE id=$1', [inactive.id]);
    const inactiveMe = await request(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${inactiveToken}` } });
    if (inactiveMe.status !== 401 || inactiveMe.body.codigo !== 'CUENTA_INACTIVA') throw new Error(`Cuenta inactiva no rechazada: ${JSON.stringify(inactiveMe)}`);

    await pool.query('UPDATE usuarios_roles_vigentes SET rol_id=$2 WHERE usuario_id=$1', [owner.id, byRole.get('odontologo')]);
    const changedMe = await request(`${baseUrl}/api/auth/me`, { headers });
    const changedRestricted = await request(`${baseUrl}/api/configuracion`, { headers });
    if (changedMe.status !== 200 || changedMe.body.user.rol !== 'odontologo' || changedRestricted.status !== 403 || changedRestricted.body.codigo !== 'RUTA_RESERVADA_DUENO') throw new Error('El cambio de rol no se reflejo con el mismo token');

    isolatedDatabase = `odonton_auth_missing_${suffix}`;
    const admin = new Client({ ...cfg, database: 'postgres' });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${isolatedDatabase}"`);
    await admin.end();
    const isolatedClient = new Client({ ...cfg, database: isolatedDatabase });
    await isolatedClient.connect();
    await isolatedClient.query('CREATE TABLE usuarios(id SERIAL PRIMARY KEY,nombre TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,activo BOOLEAN DEFAULT true)');
    await isolatedClient.query('INSERT INTO usuarios(nombre,email,password_hash,activo) VALUES($1,$2,$3,true)', [`Sin esquema ${suffix}`, `schema.auth.${suffix}@test`, hash]);
    await isolatedClient.end();
    const isolatedPort = await freePort();
    const isolatedBaseUrl = await startBackend({ database: isolatedDatabase, port: isolatedPort });
    const missing = await request(`${isolatedBaseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `schema.auth.${suffix}@test`, password }) });
    if (missing.status !== 503 || missing.body.codigo !== 'IDENTIDAD_ESQUEMA_AUSENTE') throw new Error(`Esquema ausente no detectado: ${JSON.stringify(missing)}`);
    console.log(JSON.stringify({ ok: true, database, backend_propio: mainPort, dueno: { login: loginOwner.status, modulos: moduleResults }, sin_rol: noRoleLogin.status, inactiva: inactiveMe.status, cambio_rol_mismo_token: { me: changedMe.body.user.rol, restringido: changedRestricted.status }, esquema_ausente: missing.status }));
  } finally {
    await Promise.all(children.map(stopChild));
    if (ids.length) {
      await pool.query('DELETE FROM auditoria WHERE usuario_id=ANY($1::int[])', [ids]);
      await pool.query('DELETE FROM usuarios_roles_vigentes WHERE usuario_id=ANY($1::int[])', [ids]);
      await pool.query('DELETE FROM usuarios WHERE id=ANY($1::int[])', [ids]);
    }
    if (isolatedDatabase) {
      const admin = new Client({ ...cfg, database: 'postgres' });
      await admin.connect().catch(() => {});
      await admin.query(`DROP DATABASE IF EXISTS "${isolatedDatabase}" WITH (FORCE)`).catch(() => {});
      await admin.end().catch(() => {});
    }
    await pool.end();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
