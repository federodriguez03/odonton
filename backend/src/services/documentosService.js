const { pool } = require('../config/db');

const { requireSchema } = require('./schemaValidationService');

let initDone = false;

async function asegurarTabla() {
  if (initDone) return;

  await requireSchema('documentos', [
    'documentos_paciente.paciente_id', 'documentos_paciente.nombre_archivo',
    'documentos_paciente.ruta_archivo', 'documentos_paciente.tipo_archivo',
    'documentos_paciente.historia_clinica_id', 'documentos_paciente.fecha_subida',
  ]);

  initDone = true;
}

function validarPacienteId(pacienteId) {
  const pid = Number.parseInt(pacienteId, 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('paciente_id invalido');
  }
  return pid;
}

async function validarHistoriaPaciente(historiaClinicaId, pacienteId) {
  if (historiaClinicaId === null || historiaClinicaId === undefined || historiaClinicaId === '') return null;
  const historiaId = Number.parseInt(historiaClinicaId, 10);
  if (!Number.isInteger(historiaId) || historiaId <= 0) throw new Error('historia_clinica_id invalido');
  const { rowCount } = await pool.query(
    'SELECT id FROM historias_clinicas WHERE id = $1 AND paciente_id = $2',
    [historiaId, pacienteId]
  );
  if (!rowCount) throw new Error('La atencion no pertenece al paciente indicado');
  return historiaId;
}

async function crearDocumento({ paciente_id, historia_clinica_id = null, nombre_archivo, ruta_archivo, tipo_archivo, descripcion }) {
  await asegurarTabla();
  const pid = validarPacienteId(paciente_id);

  const pacienteRes = await pool.query('SELECT id FROM pacientes WHERE id = $1', [pid]);
  if (pacienteRes.rowCount === 0) {
    throw new Error('Paciente no encontrado');
  }
  const historiaId = await validarHistoriaPaciente(historia_clinica_id, pid);

  const result = await pool.query(
    `
      INSERT INTO documentos_paciente (paciente_id, historia_clinica_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, paciente_id, historia_clinica_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion, fecha_subida
    `,
    [pid, historiaId, nombre_archivo, ruta_archivo, tipo_archivo, descripcion || null]
  );

  return result.rows[0];
}

async function listarDocumentosPorPaciente(pacienteId, historiaClinicaId = null) {
  await asegurarTabla();
  const pid = validarPacienteId(pacienteId);

  const historiaId = await validarHistoriaPaciente(historiaClinicaId, pid);
  const { rows } = await pool.query(
    `
      SELECT id, paciente_id, historia_clinica_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion, fecha_subida
      FROM documentos_paciente
      WHERE paciente_id = $1
        AND historia_clinica_id ${historiaId === null ? 'IS NULL' : '= $2'}
      ORDER BY fecha_subida DESC, id DESC
    `,
    historiaId === null ? [pid] : [pid, historiaId]
  );

  return rows;
}

async function obtenerDocumentoPorId(id) {
  await asegurarTabla();
  const docId = Number.parseInt(id, 10);
  if (!Number.isInteger(docId) || docId <= 0) {
    throw new Error('id invalido');
  }

  const { rows } = await pool.query(
    `
      SELECT id, paciente_id, historia_clinica_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion, fecha_subida
      FROM documentos_paciente
      WHERE id = $1
    `,
    [docId]
  );

  return rows[0] || null;
}

async function eliminarDocumentoPorId(id) {
  await asegurarTabla();
  const docId = Number.parseInt(id, 10);
  if (!Number.isInteger(docId) || docId <= 0) {
    throw new Error('id invalido');
  }

  const { rows } = await pool.query(
    `
      DELETE FROM documentos_paciente
      WHERE id = $1
      RETURNING id, paciente_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion, fecha_subida
    `,
    [docId]
  );

  return rows[0] || null;
}

module.exports = {
  crearDocumento,
  listarDocumentosPorPaciente,
  obtenerDocumentoPorId,
  eliminarDocumentoPorId,
};
