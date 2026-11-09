require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const assert = require('node:assert/strict');
const http = require('node:http');
const { pool } = require('../src/config/db');
const { validarEntornoDemo } = require('../src/domain/demoSafety');
const { generarToken } = require('../src/utils/jwt');
const { obtenerIdentidadPorId } = require('../src/services/identityService');
const { app } = require('../src/app');

function validarDestino() {
  const database = pool.options.database || process.env.DB_NAME;
  validarEntornoDemo(process.env, process.argv.slice(2), database);
  if (!['localhost', '127.0.0.1', '::1'].includes(pool.options.host)) {
    throw new Error('La prueba HTTP de identidad sólo puede usar PostgreSQL local');
  }
  if (!process.env.DEMO_RECEPCION_PASSWORD || !process.env.DEMO_ODONTOLOGO_PASSWORD) {
    throw new Error('Faltan contraseñas demo en el entorno de prueba');
  }
  return database;
}

async function request(baseUrl, path, { token = null, method = 'GET', body = null } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function main() {
  const database = validarDestino();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let usuarioTemporalId = null;
  try {
    const adminToken = generarToken({ userId: 1, email: 'desarrollo@local.test' });
    const admin = await request(baseUrl, '/api/auth/me', { token: adminToken });
    assert.equal(admin.status, 200);
    assert.deepEqual(admin.data.user.roles, ['administrador']);
    assert.equal(admin.data.user.puede_cobrar, false);
    assert.equal(admin.data.user.profesional_perfil_id, null);
    assert.equal((await request(baseUrl, '/api/pacientes?limit=1', { token: adminToken })).status, 403);

    const loginRecepcion = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'recepcion.demo@odonton.test', password: process.env.DEMO_RECEPCION_PASSWORD },
    });
    assert.equal(loginRecepcion.status, 200);
    assert.deepEqual(loginRecepcion.data.user.roles, ['recepcion']);
    assert.equal(loginRecepcion.data.user.profesional_perfil_id, null);
    assert.equal((await request(baseUrl, '/api/pacientes?limit=1', { token: loginRecepcion.data.token })).status, 200);

    const loginOdontologo = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'odontologo.demo@odonton.test', password: process.env.DEMO_ODONTOLOGO_PASSWORD },
    });
    assert.equal(loginOdontologo.status, 200);
    assert.deepEqual(loginOdontologo.data.user.roles, ['odontologo']);
    assert.equal(loginOdontologo.data.user.profesional_perfil_id, 2);
    assert.equal(loginOdontologo.data.user.profesional.id, 2);
    assert.equal(loginOdontologo.data.user.profesional.es_ficticio, true);
    assert.equal((await request(baseUrl, '/api/pacientes?limit=1', { token: loginOdontologo.data.token })).status, 200);

    const recepcionToken = loginRecepcion.data.token;
    await pool.query('UPDATE usuarios SET activo=FALSE,updated_at=NOW() WHERE id=2');
    const inactiva = await request(baseUrl, '/api/auth/me', { token: recepcionToken });
    assert.equal(inactiva.status, 401);
    const loginInactiva = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'recepcion.demo@odonton.test', password: process.env.DEMO_RECEPCION_PASSWORD },
    });
    assert.equal(loginInactiva.status, 401);
    await pool.query('UPDATE usuarios SET activo=TRUE,updated_at=NOW() WHERE id=2');

    await pool.query(`
      INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id)
      SELECT 2,id,1 FROM roles WHERE codigo='administrador'
    `);
    const rolAgregado = await request(baseUrl, '/api/auth/me', { token: recepcionToken });
    assert.deepEqual(rolAgregado.data.user.roles, ['administrador', 'recepcion']);
    await pool.query(`
      DELETE FROM usuarios_roles WHERE usuario_id=2 AND rol_id=(SELECT id FROM roles WHERE codigo='administrador')
    `);
    const rolRetirado = await request(baseUrl, '/api/auth/me', { token: recepcionToken });
    assert.deepEqual(rolRetirado.data.user.roles, ['recepcion']);

    const temporal = await pool.query(`
      INSERT INTO usuarios(nombre,email,password_hash,activo,es_demo,updated_at)
      VALUES('Usuario sin rol de prueba',$1,'TEST_ONLY_NOT_A_LOGIN_HASH',TRUE,TRUE,NOW()) RETURNING id
    `, [`sin.rol.${Date.now()}@odonton.test`]);
    usuarioTemporalId = temporal.rows[0].id;
    const sinRolToken = generarToken({ userId: usuarioTemporalId });
    const sinRol = await request(baseUrl, '/api/auth/me', { token: sinRolToken });
    assert.equal(sinRol.status, 200);
    assert.deepEqual(sinRol.data.user.roles, []);
    assert.equal(sinRol.data.user.profesional_perfil_id, null);
    assert.equal((await request(baseUrl, '/api/pacientes?limit=1', { token: sinRolToken })).status, 403);

    const schemaError = Object.assign(new Error('tabla ausente'), { code: '42P01' });
    await assert.rejects(
      obtenerIdentidadPorId(1, { query: async () => { throw schemaError; } }),
      (error) => error.code === 'IDENTIDAD_NO_CONFIGURADA' && error.status === 503,
    );

    const sinToken = await request(baseUrl, '/api/auth/me');
    assert.equal(sinToken.status, 401);

    console.log(`OK - autenticación e identidad vigentes en ${database}`);
    console.log('OK - administrador 1, recepción 2 y odontólogo 3/perfil 2 resueltos por separado');
    console.log('OK - inactivación y cambios de rol se reconocen con el mismo token');
    console.log('OK - no existe rol por defecto y el esquema faltante produce error explícito');
  } finally {
    await pool.query('UPDATE usuarios SET activo=TRUE,updated_at=NOW() WHERE id=2').catch(() => {});
    await pool.query(`DELETE FROM usuarios_roles WHERE usuario_id=2 AND rol_id=(SELECT id FROM roles WHERE codigo='administrador')`).catch(() => {});
    if (usuarioTemporalId) await pool.query('DELETE FROM usuarios WHERE id=$1', [usuarioTemporalId]).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
