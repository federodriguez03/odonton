require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { app } = require('../src/app');
const { pool } = require('../src/config/db');
const { generarToken } = require('../src/utils/jwt');
const { validarEntornoDemo } = require('../src/domain/demoSafety');

async function request(base, path, token, options = {}) {
  const response = await fetch(base + path, { method: options.method || 'GET', headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function main() {
  validarEntornoDemo(process.env, process.argv.slice(2), pool.options.database);
  const destination = (await pool.query('SELECT current_database() db')).rows[0].db;
  assert.equal(destination, 'odonton_ficha_20261109_test');
  const originalReception = (await pool.query('SELECT puede_cobrar FROM usuarios WHERE id=2')).rows[0].puede_cobrar;
  const patient = (await pool.query('SELECT id FROM pacientes ORDER BY id LIMIT 1')).rows[0];
  assert.ok(patient);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = generarToken({ userId: 1 });
  const reception = generarToken({ userId: 2 });
  const dentist = generarToken({ userId: 3 });
  let temporaryUserId = null;
  try {
    await pool.query('UPDATE usuarios SET puede_cobrar=TRUE WHERE id=2');
    const adminMe = await request(base, '/api/auth/me', admin);
    const receptionMe = await request(base, '/api/auth/me', reception);
    const dentistMe = await request(base, '/api/auth/me', dentist);
    assert.equal(adminMe.data.user.permisos.identidades_admin, true);
    assert.equal(adminMe.data.user.permisos.clinica_lectura, false);
    assert.equal(receptionMe.data.user.permisos.agenda, 'general');
    assert.equal(receptionMe.data.user.permisos.pagos_registrar, true);
    assert.equal(dentistMe.data.user.permisos.agenda, 'propia');
    assert.equal(dentistMe.data.user.permisos.finanzas_consulta, false);

    for (const path of ['/api/turnos', '/api/pacientes']) assert.equal((await request(base, path, admin)).status, 403);
    assert.equal((await request(base, `/api/pacientes/${patient.id}/ficha-clinica`, admin)).status, 403);
    for (const path of ['/api/cargos', '/api/pagos', '/api/admin/identidades', '/api/configuracion', '/api/prestaciones']) assert.equal((await request(base, path, admin)).status, 200);
    assert.equal((await request(base, '/api/reportes/resumen?fecha_desde=2026-01-01&fecha_hasta=2026-01-31&resumen=true', admin)).status, 200);
    const created = await request(base, '/api/admin/identidades', admin, { method: 'POST', body: {
      nombre: 'Usuario temporal permisos', email: `permisos.${Date.now()}@odonton.test`, password: `${crypto.randomUUID()}!T`,
      roles: ['recepcion'], activo: true, puede_cobrar: true,
    } });
    assert.equal(created.status, 201);
    temporaryUserId = created.data.id;
    assert.ok(temporaryUserId);

    for (const path of ['/api/turnos', '/api/pacientes', '/api/cargos', '/api/pagos', '/api/prestaciones']) assert.equal((await request(base, path, reception)).status, 200);
    assert.equal((await request(base, '/api/reportes/resumen?fecha_desde=2026-01-01&fecha_hasta=2026-01-31&resumen=true', reception)).status, 200);
    assert.equal((await request(base, `/api/pacientes/${patient.id}/ficha-clinica`, reception)).status, 403);
    assert.equal((await request(base, `/api/documentos?paciente_id=${patient.id}`, reception)).status, 403);
    assert.equal((await request(base, '/api/configuracion', reception)).status, 403);
    assert.equal((await request(base, '/api/admin/identidades', reception)).status, 403);
    assert.equal((await request(base, '/api/pagos', reception, { method: 'POST', body: {} })).status, 400);
    assert.equal((await request(base, '/api/pagos/999999/anular', reception, { method: 'POST', body: { motivo: 'prueba' } })).status, 403);

    for (const path of ['/api/turnos', '/api/pacientes', `/api/pacientes/${patient.id}/ficha-clinica`, `/api/documentos?paciente_id=${patient.id}`, '/api/prestaciones']) assert.equal((await request(base, path, dentist)).status, 200);
    for (const path of ['/api/cargos', '/api/pagos', '/api/reportes/resumen?fecha_desde=2026-01-01&fecha_hasta=2026-01-31', '/api/configuracion', '/api/admin/identidades']) assert.equal((await request(base, path, dentist)).status, 403);
    assert.equal((await request(base, '/api/prestaciones', dentist, { method: 'POST', body: {} })).status, 403);

    await pool.query('UPDATE usuarios SET puede_cobrar=FALSE WHERE id=2');
    assert.equal((await request(base, '/api/pagos', reception, { method: 'POST', body: {} })).status, 403);
    console.log('OK - navegación efectiva expuesta por /api/auth/me');
    console.log('OK - odontología limitada a agenda, pacientes y clínica');
    console.log('OK - recepción administrativa y financiera sin clínica ni anulaciones');
    console.log('OK - administración sin acceso clínico implícito y con gestión administrativa');
    console.log('OK - puede_cobrar se revalida en cada solicitud');
  } finally {
    if (temporaryUserId) {
      await pool.query('DELETE FROM profesionales WHERE usuario_id=$1', [temporaryUserId]).catch(() => {});
      await pool.query('DELETE FROM usuarios_roles WHERE usuario_id=$1', [temporaryUserId]).catch(() => {});
      await pool.query('DELETE FROM usuarios WHERE id=$1', [temporaryUserId]).catch(() => {});
    }
    await pool.query('UPDATE usuarios SET puede_cobrar=$1 WHERE id=2', [originalReception]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
