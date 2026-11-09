const assert = require('node:assert/strict');

async function main() {
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      queries.push({ text, params });
      if (text.startsWith('SELECT id FROM pacientes')) return { rows: [{ id: params[0] }], rowCount: 1 };
      if (text.startsWith('SELECT id FROM historias_clinicas')) {
        return params[0] === 10 && params[1] === 1
          ? { rows: [{ id: 10 }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (text.startsWith('INSERT INTO documentos_paciente')) {
        return { rows: [{ id: 20, paciente_id: params[0], historia_clinica_id: params[1] }], rowCount: 1 };
      }
      if (text.startsWith('SELECT id, paciente_id, historia_clinica_id')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  };

  const dbPath = require.resolve('../src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool } };
  const service = require('../src/services/documentosService');

  const creado = await service.crearDocumento({
    paciente_id: 1,
    historia_clinica_id: 10,
    nombre_archivo: 'radiografia.png',
    ruta_archivo: 'uploads/documentos/prueba.png',
    tipo_archivo: 'image/png',
  });
  assert.equal(creado.historia_clinica_id, 10);

  const insertsAntes = queries.filter(({ text }) => text.startsWith('INSERT INTO documentos_paciente')).length;
  await assert.rejects(
    service.crearDocumento({
      paciente_id: 2,
      historia_clinica_id: 10,
      nombre_archivo: 'ajeno.pdf',
      ruta_archivo: 'uploads/documentos/ajeno.pdf',
      tipo_archivo: 'application/pdf',
    }),
    /no pertenece al paciente/i,
  );
  const insertsDespues = queries.filter(({ text }) => text.startsWith('INSERT INTO documentos_paciente')).length;
  assert.equal(insertsDespues, insertsAntes, 'Una relacion invalida no debe insertar documentos');

  await service.listarDocumentosPorPaciente(1);
  const listadoGeneral = queries.at(-1);
  assert.match(listadoGeneral.text, /historia_clinica_id IS NULL/);

  await service.listarDocumentosPorPaciente(1, 10);
  const listadoAtencion = queries.at(-1);
  assert.match(listadoAtencion.text, /historia_clinica_id = \$2/);
  assert.deepEqual(listadoAtencion.params, [1, 10]);

  console.log('OK - valida que atencion y archivo correspondan al mismo paciente');
  console.log('OK - conserva separados documentos generales y documentos de atencion');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
