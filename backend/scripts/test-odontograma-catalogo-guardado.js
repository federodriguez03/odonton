const assert = require('node:assert/strict');
const dbPath = require.resolve('../src/config/db');
let anteriores = [];
let catalogo = [];
let escritos = [];
let eventos = [];
const client = {
  async query(sql, params = []) {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    eventos.push(q);
    if (['BEGIN','COMMIT','ROLLBACK'].includes(q)) return { rows: [], rowCount: 0 };
    if (q.startsWith('SELECT 1 FROM pacientes')) return { rows: [{}], rowCount: 1 };
    if (q.startsWith('SELECT diente,cara,estado')) return { rows: anteriores, rowCount: anteriores.length };
    if (q.startsWith('SELECT codigo,activa')) return { rows: catalogo, rowCount: catalogo.length };
    if (q.startsWith('INSERT INTO odontograma(')) { escritos.push(params); return { rows: [], rowCount: 1 }; }
    if (q.startsWith('SELECT id,nombre')) return { rows: [{ id: 1 }], rowCount: 1 };
    if (q.includes('FROM odontograma WHERE')) return { rows: anteriores, rowCount: anteriores.length };
    if (q.includes('FROM odontograma_meta')) return { rows: [], rowCount: 0 };
    throw new Error('SQL inesperado: ' + q);
  }, release() {}
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { pool: { connect: async () => client } } };
const service = require('../src/services/odontogramaService');
const registro = (estado, diente = 11) => ({ diente, cara: 'vestibular', estado });
async function guardar(registros) {
  escritos = []; eventos = [];
  return service.guardarOdontogramaCompleto({ paciente_id: 1, registros });
}
(async () => {
  catalogo = [{ codigo: 'sellador_nuevo', activa: true }];
  await guardar([registro('sellador_nuevo')]);
  assert.equal(escritos[0][3], 'sellador_nuevo');
  anteriores = [registro('existente')];
  catalogo = [{ codigo: 'existente', activa: false }, { codigo: 'sellador_nuevo', activa: true }];
  await guardar([registro('existente'), registro('sellador_nuevo', 12)]);
  assert.equal(escritos.length, 1);
  assert.equal(escritos[0][1], 12);
  await assert.rejects(guardar([registro('existente', 12)]), /no está activa/);
  assert.ok(eventos.includes('ROLLBACK'));
  await assert.rejects(guardar([registro('desconocida')]), /no existe/);
  anteriores = [registro('heredada_sin_catalogo')];
  catalogo = [];
  await guardar([registro('heredada_sin_catalogo')]);
  assert.equal(escritos.length, 0);
  console.log('OK - catálogo dinámico, conservación de inactivas y rechazo de nuevas asignaciones');
})().catch(error => { console.error(error); process.exitCode = 1; });
