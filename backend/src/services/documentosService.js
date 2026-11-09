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

async function crearDocumento({ paciente_id, historia_clinica_id = null, nombre_archivo, ruta_archivo, tipo_archivo, descripcion, actor }) {
  await asegurarTabla();
  const pid = validarPacienteId(paciente_id);

  const pacienteRes = await pool.query('SELECT id FROM pacientes WHERE id = $1', [pid]);
  if (pacienteRes.rowCount === 0) {
    throw new Error('Paciente no encontrado');
  }

  if (historia_clinica_id) {
    const historia = await pool.query('SELECT paciente_id FROM historias_clinicas WHERE id=$1', [historia_clinica_id]);
    if (!historia.rowCount || historia.rows[0].paciente_id !== pid) throw new Error('La consulta no existe o pertenece a otro paciente');
  }

  const result = await pool.query(
    `
      INSERT INTO documentos_paciente
        (paciente_id,historia_clinica_id,nombre_archivo,ruta_archivo,tipo_archivo,descripcion,
         subido_por_usuario_id,profesional_perfil_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id,paciente_id,historia_clinica_id,nombre_archivo,tipo_archivo,descripcion,
                fecha_subida,subido_por_usuario_id,profesional_perfil_id
    `,
    [pid, historia_clinica_id || null, nombre_archivo, ruta_archivo, tipo_archivo, descripcion || null,
      actor.usuario_id, actor.profesional_perfil_id]
  );

  return result.rows[0];
}

async function listarDocumentosPorPaciente(pacienteId) {
  await asegurarTabla();
  const pid = validarPacienteId(pacienteId);

  const { rows } = await pool.query(
    `
      SELECT d.id, d.paciente_id, d.historia_clinica_id, d.nombre_archivo,
             d.tipo_archivo, d.descripcion, d.fecha_subida,
             d.subido_por_usuario_id, d.profesional_perfil_id,
             h.motivo_consulta AS consulta_motivo,
             COALESCE(h.fecha_atencion,h.created_at) AS consulta_fecha
      FROM documentos_paciente d
      LEFT JOIN historias_clinicas h ON h.id=d.historia_clinica_id
      WHERE d.paciente_id = $1
      ORDER BY d.fecha_subida DESC, d.id DESC
    `,
    [pid]
  );

  return rows;
}

async function asociarDocumentoAConsulta(id, historiaClinicaId) {
  const documento = await obtenerDocumentoPorId(id);
  if (!documento) throw new Error('Documento no encontrado');
  const historiaId = historiaClinicaId ? Number.parseInt(historiaClinicaId, 10) : null;
  if (historiaClinicaId && (!Number.isInteger(historiaId) || historiaId <= 0)) throw new Error('historia_clinica_id inválido');
  if (historiaId) {
    const historia = await pool.query('SELECT paciente_id FROM historias_clinicas WHERE id=$1', [historiaId]);
    if (!historia.rowCount || historia.rows[0].paciente_id !== documento.paciente_id) throw new Error('La atención no existe o pertenece a otro paciente');
  }
  const { rows } = await pool.query(
    `UPDATE documentos_paciente SET historia_clinica_id=$2 WHERE id=$1
     RETURNING id,paciente_id,historia_clinica_id,nombre_archivo,tipo_archivo,descripcion,
               fecha_subida,subido_por_usuario_id,profesional_perfil_id`,
    [documento.id, historiaId],
  );
  return rows[0];
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
      RETURNING id, paciente_id, historia_clinica_id, nombre_archivo, ruta_archivo, tipo_archivo, descripcion, fecha_subida
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
  asociarDocumentoAConsulta,
};
