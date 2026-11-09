const assert = require('node:assert/strict');

async function main() {
  const queries = [];
  let insertIntentos = 0;
  const pool = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      queries.push({ text, params });
      if (text.startsWith('INSERT INTO odontograma_referencias')) {
        insertIntentos += 1;
        return { rows: [{ id: 10, codigo: params[0], nombre: params[1], color: params[2], alcance: 'cara', activo: true }], rowCount: 1 };
      }
      if (text.startsWith('UPDATE odontograma_referencias')) return { rows: [{ id: params[0], codigo: 'ref_nueva', nombre: params[1], color: params[2], alcance: 'cara', activo: params[3] }], rowCount: 1 };
      if (text.startsWith('SELECT codigo')) return { rows: [{ codigo: params[0], nombre: 'Referencia', color: '#123456', alcance: 'cara', activo: false }], rowCount: 1 };
      if (text.startsWith('SELECT 1 FROM odontograma')) return params[0] === 1 ? { rows: [{ '?column?': 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  };
  const dbPath = require.resolve('../src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool } };
  const service = require('../src/services/odontogramaReferenciasService');
  const nueva = await service.crear({ nombre: 'Referencia Nueva', color: '#12ABef' });
  assert.equal(nueva.codigo, 'ref_referencia_nueva');
  assert.equal(nueva.color, '#12abef');
  const inactiva = await service.actualizar(10, { nombre: 'Referencia Nueva', color: '#123456', activo: false });
  assert.equal(inactiva.activo, false);
  await service.validarParaGuardar({ codigo: 'ref_nueva', pacienteId: 1, diente: 11, cara: 'vestibular' });
  await assert.rejects(service.validarParaGuardar({ codigo: 'ref_nueva', pacienteId: 2, diente: 11, cara: 'vestibular' }), /inactiva/);
  assert.equal(insertIntentos, 1);
  console.log('OK - crea codigo estable y color configurable para una referencia nueva');
  console.log('OK - permite inactivar y conservar usos previos, pero no aplicar usos nuevos');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
