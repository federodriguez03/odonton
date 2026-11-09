const assert = require('node:assert/strict');

async function main() {
  let insertado = false;
  let snapshotGuardado = null;
  const queries = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      queries.push(text);
      if (text.startsWith('BEGIN') || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (text.includes('FROM turnos t') && text.includes('FOR UPDATE')) {
        return { rows: [{ id: 8, paciente_id: 1, estado: 'realizado', fecha_hora_inicio: '2026-10-10T13:30:00Z', profesional_id: 3, prestacion_id: 2 }], rowCount: 1 };
      }
      if (text.includes('FROM odontograma WHERE')) return { rows: [{ id: 50, diente: 11, cara: 'vestibular', estado: 'existente', fecha: '2026-10-09T10:00:00Z' }], rowCount: 1 };
      if (text.includes('FROM odontograma_meta')) return { rows: [{ sarro: true, periodontal: false, observaciones: 'Control' }], rowCount: 1 };
      if (text.includes('FROM tratamientos')) return { rows: [{ id: 70, diente: 11, tipo: 'Obturacion' }], rowCount: 1 };
      if (text.includes('FROM protesis_fijas')) return { rows: [], rowCount: 0 };
      if (text.includes('FROM protesis_removibles')) return { rows: [], rowCount: 0 };
      if (text.includes('FROM odontograma_referencias')) return { rows: [{ codigo: 'existente', nombre: 'Restauración previa', color: '#112233', alcance: 'cara', activo: true }], rowCount: 1 };
      if (text.includes('FROM historias_clinicas') && text.includes('FOR UPDATE')) {
        return params[1] === 1
          ? { rows: [{ id: 99, paciente_id: 1, turno_id: 8, descripcion: 'Anterior', odontograma_snapshot: snapshotGuardado, created_at: '2026-10-10T14:00:00Z' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (text.startsWith('UPDATE historias_clinicas')) {
        return { rows: [{ id: 99, paciente_id: 1, turno_id: 8, descripcion: params[2], odontograma_snapshot: snapshotGuardado, created_at: '2026-10-10T14:00:00Z' }], rowCount: 1 };
      }
      if (text.startsWith('INSERT INTO historias_clinicas')) {
        if (insertado) {
          const error = new Error('duplicate');
          error.code = '23505';
          throw error;
        }
        insertado = true;
        snapshotGuardado = JSON.parse(params[3]);
        return { rows: [{ id: 99, paciente_id: 1, turno_id: 8, descripcion: params[2], odontograma_snapshot: snapshotGuardado }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = { connect: async () => client };
  const dbPath = require.resolve('../src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool } };
  const service = require('../src/services/pacientesService');

  const atencion = await service.registrarAtencion({ pacienteId: 1, turnoId: 8, observaciones: 'Atencion realizada' });
  assert.equal(atencion.turno_id, 8);
  assert.equal(snapshotGuardado.registros[0].odontograma_id, 50);
  assert.equal(snapshotGuardado.registros[0].color, '#112233');
  assert.equal(snapshotGuardado.registros[0].nombre, 'Restauración previa');
  assert.equal(snapshotGuardado.meta.observaciones, 'Control');
  assert.equal(snapshotGuardado.referencias.tratamientos[0].id, 70);
  assert.ok(queries.includes('COMMIT'));

  await assert.rejects(
    service.registrarAtencion({ pacienteId: 1, turnoId: 8, observaciones: 'Duplicada' }),
    /Ya existe una atencion registrada para este turno/,
  );
  assert.ok(queries.includes('ROLLBACK'));
  const snapshotAntes = JSON.stringify(snapshotGuardado);
  const edicion = await service.editarAtencion({ pacienteId: 1, atencionId: 99, observaciones: 'Observacion corregida' });
  assert.equal(edicion.atencion.descripcion, 'Observacion corregida');
  assert.equal(edicion.atencion.turno_id, 8);
  assert.equal(JSON.stringify(edicion.atencion.odontograma_snapshot), snapshotAntes);
  assert.deepEqual(edicion.valoresAnteriores, { descripcion: 'Anterior' });
  assert.deepEqual(edicion.valoresNuevos, { descripcion: 'Observacion corregida' });
  const updatesAntes = queries.filter((query) => query.startsWith('UPDATE historias_clinicas')).length;
  await assert.rejects(service.editarAtencion({ pacienteId: 2, atencionId: 99, observaciones: 'No autorizada' }), /no pertenece/);
  assert.equal(queries.filter((query) => query.startsWith('UPDATE historias_clinicas')).length, updatesAntes);
  console.log('OK - guarda atencion y snapshot completo en una transaccion');
  console.log('OK - conserva referencias, colores y observaciones del odontograma');
  console.log('OK - rechaza duplicados por turno y revierte la transaccion');
  console.log('OK - edita solo observaciones y conserva turno y snapshot');
  console.log('OK - rechaza editar una atencion de otro paciente sin escritura');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
