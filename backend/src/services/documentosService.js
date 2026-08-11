const { pool } = require('../config/db');

let initDone = false;

async function asegurarTabla() {
  if (initDone) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documentos_paciente (
      id SERIAL PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
      nombre_archivo TEXT NOT NULL,
      ruta_archivo TEXT NOT NULL,
      tipo_archivo VARCHAR(100) NOT NULL,
      descripcion TEXT,
      fecha_subida TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_documentos_paciente_paciente_id ON documentos_paciente (paciente_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_documentos_paciente_fecha ON documentos_paciente (fecha_subida DESC)');

  initDone = true;
}

function validarPacienteId(pacienteId) {
  const pid = Number.parseInt(pacienteId, 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('paciente_id invalido');
  }
  return pid;
}

async function crearDocumento({ paciente_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion }) {
  await asegurarTabla();
  const pid = validarPacienteId(paciente_id);

  const pacienteRes = await pool.query('SELECT id FROM pacientes WHERE id = $1', [pid]);
  if (pacienteRes.rowCount === 0) {
    throw new Error('Paciente no encontrado');
  }

  const result = await pool.query(
    `
      INSERT INTO documentos_paciente (paciente_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, paciente_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion, fecha_subida
    `,
    [pid, nombre_archivo, ruta_archivo, tipo_archivo, descripcion || null]
  );

  return result.rows[0];
}

async function listarDocumentosPorPaciente(pacienteId) {
  await asegurarTabla();
  const pid = validarPacienteId(pacienteId);

  const { rows } = await pool.query(
    `
      SELECT id, paciente_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion, fecha_subida
      FROM documentos_paciente
      WHERE paciente_id = $1
      ORDER BY fecha_subida DESC, id DESC
    `,
    [pid]
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
      SELECT id, paciente_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion, fecha_subida
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
