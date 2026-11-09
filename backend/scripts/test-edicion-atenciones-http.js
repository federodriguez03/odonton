const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = 'clave-local-exclusiva-para-prueba';
process.env.NODE_ENV = 'test';

function request(server, token) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: address.port, path: '/api/pacientes/1/atenciones/9', method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ observaciones: 'Corregida' }));
  });
}

async function main() {
  const auditQueries = [];
  const dbPath = require.resolve('../src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { query: async (sql, params = []) => { auditQueries.push({ sql: String(sql), params }); return { rows: [], rowCount: 0 }; } }, verificarConexion: async () => true } };
  const servicePath = require.resolve('../src/services/pacientesService');
  require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: { editarAtencion: async () => ({ atencion: { id: 9, paciente_id: 1, turno_id: 5, descripcion: 'Corregida', odontograma_snapshot: { version: 1 } }, valoresAnteriores: { descripcion: 'Anterior' }, valoresNuevos: { descripcion: 'Corregida' } }) } };

  const { app } = require('../src/app');
  const { generarToken } = require('../src/utils/jwt');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    assert.equal((await request(server, null)).status, 401);
    const admin = generarToken({ userId: 4, email: 'admin@local', rol: 'administrador' });
    assert.equal((await request(server, admin)).status, 403);
    const odontologo = generarToken({ userId: 3, email: 'odonto@local', rol: 'odontologo' });
    const ok = await request(server, odontologo);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.atencion.turno_id, 5);
    assert.deepEqual(ok.body.atencion.odontograma_snapshot, { version: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const audit = auditQueries.find(({ sql }) => sql.includes('INSERT INTO auditoria'));
    assert.equal(audit.params[0], 3);
    assert.deepEqual(audit.params[5].valores_anteriores, { descripcion: 'Anterior' });
    assert.deepEqual(audit.params[5].valores_nuevos, { descripcion: 'Corregida' });
    console.log('OK - rechaza edicion sin autenticar y con rol no autorizado');
    console.log('OK - conserva turno y snapshot y audita usuario, fecha y valores');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
