const assert = require('node:assert/strict');

async function main() {
  const queries = [];
  const pool = { query: async (sql, params = []) => { queries.push({ sql: String(sql), params }); return { rows: [], rowCount: 0 }; } };
  const dbPath = require.resolve('../src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool } };
  const refsPath = require.resolve('../src/services/odontogramaReferenciasService');
  require.cache[refsPath] = { id: refsPath, filename: refsPath, loaded: true, exports: { validarParaGuardar: async () => ({ activo: true }) } };
  const service = require('../src/services/odontogramaService');
  await service.guardarMeta(1, false, false, null);
  const upsert = queries.find(({ sql }) => sql.includes('INSERT INTO odontograma_meta'));
  assert.equal(upsert.params[3], null);
  assert.equal(upsert.params[4], true);
  assert.match(upsert.sql, /CASE WHEN \$5 THEN EXCLUDED\.observaciones/);
  console.log('OK - observaciones vacias se guardan como null y borran el texto anterior');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
