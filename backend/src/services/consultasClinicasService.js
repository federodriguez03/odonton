const { pool } = require('../config/db');
const odontogramaService = require('./odontogramaService');

function idValido(value, nombre) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${nombre} inválido`);
  return id;
}

function textoOpcional(value) {
  if (value === undefined || value === null) return null;
  const valueNorm = String(value).trim();
  return valueNorm || null;
}

async function validarRelacionesConsulta(client, { pacienteId, profesionalId, turnoId = null, consultaId = null }) {
  const relations = await client.query(
    `SELECT EXISTS(SELECT 1 FROM pacientes WHERE id=$1) AS paciente,
            EXISTS(SELECT 1 FROM usuarios WHERE id=$2 AND activo=TRUE) AS profesional`,
    [pacienteId, profesionalId],
  );
  if (!relations.rows[0].paciente) throw new Error('Paciente no encontrado');
  if (!relations.rows[0].profesional) throw new Error('Profesional no encontrado o inactivo');
  if (!turnoId) return;
  const turno = await client.query('SELECT paciente_id FROM turnos WHERE id=$1', [turnoId]);
  if (!turno.rowCount) throw new Error('Turno no encontrado');
  if (turno.rows[0].paciente_id !== pacienteId) throw new Error('El turno pertenece a otro paciente');
  const asociado = await client.query(
    'SELECT id FROM historias_clinicas WHERE turno_id=$1 AND ($2::int IS NULL OR id<>$2)',
    [turnoId, consultaId],
  );
  if (asociado.rowCount) throw new Error('El turno ya está asociado a otra atención');
}

async function crearConsulta({ pacienteId, actorId, datos }) {
  const paciente_id = idValido(pacienteId, 'paciente_id');
  const profesional_id = idValido(datos.profesional_id || actorId, 'profesional_id');
  const motivo = textoOpcional(datos.motivo_consulta);
  if (!motivo) throw new Error('El motivo de consulta es obligatorio');
  const fecha = datos.fecha_atencion ? new Date(datos.fecha_atencion) : new Date();
  if (Number.isNaN(fecha.getTime())) throw new Error('Fecha y hora de atención inválida');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const turno_id = datos.turno_id ? idValido(datos.turno_id, 'turno_id') : null;
    await validarRelacionesConsulta(client, { pacienteId: paciente_id, profesionalId: profesional_id, turnoId: turno_id });

    if (datos.odontograma) {
      await odontogramaService.guardarOdontogramaCompleto({
        paciente_id,
        registros: datos.odontograma.registros || [],
        meta: datos.odontograma.meta || {},
      }, client);
    }
    const snapshot = datos.odontograma
      ? await odontogramaService.crearSnapshot(paciente_id, client)
      : null;

    const result = await client.query(
      `INSERT INTO historias_clinicas
       (paciente_id, turno_id, descripcion, fecha_atencion, profesional_id, motivo_consulta,
        diagnostico, tratamientos_realizados, plan_indicaciones, observaciones, odontograma_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [paciente_id, turno_id, motivo, fecha, profesional_id, motivo,
        textoOpcional(datos.diagnostico), textoOpcional(datos.tratamientos_realizados),
        textoOpcional(datos.plan_indicaciones), textoOpcional(datos.observaciones), snapshot],
    );
    const consulta = result.rows[0];

    for (const rawId of datos.documento_ids || []) {
      const documentoId = idValido(rawId, 'documento_id');
      const linked = await client.query(
        `UPDATE documentos_paciente SET historia_clinica_id=$1
         WHERE id=$2 AND paciente_id=$3 RETURNING id`,
        [consulta.id, documentoId, paciente_id],
      );
      if (!linked.rowCount) throw new Error('Uno de los documentos no existe o pertenece a otro paciente');
    }
    await client.query('COMMIT');
    return consulta;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function actualizarConsulta({ pacienteId, consultaId, actorId, datos }) {
  const paciente_id = idValido(pacienteId, 'paciente_id');
  const consulta_id = idValido(consultaId, 'consulta_id');
  const actor_id = idValido(actorId, 'actor_id');
  const profesional_id = idValido(datos.profesional_id, 'profesional_id');
  const turno_id = datos.turno_id ? idValido(datos.turno_id, 'turno_id') : null;
  const motivo = textoOpcional(datos.motivo_consulta);
  if (!motivo) throw new Error('El motivo de consulta es obligatorio');
  const fecha = new Date(datos.fecha_atencion);
  if (Number.isNaN(fecha.getTime())) throw new Error('Fecha y hora de atención inválida');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existente = await client.query('SELECT * FROM historias_clinicas WHERE id=$1 AND paciente_id=$2 FOR UPDATE', [consulta_id, paciente_id]);
    if (!existente.rowCount) throw new Error('Atención no encontrada para este paciente');
    await validarRelacionesConsulta(client, { pacienteId: paciente_id, profesionalId: profesional_id, turnoId: turno_id, consultaId: consulta_id });
    const { rows } = await client.query(
      `UPDATE historias_clinicas SET turno_id=$3, descripcion=$4, fecha_atencion=$5, profesional_id=$6,
        motivo_consulta=$4, diagnostico=$7, tratamientos_realizados=$8, plan_indicaciones=$9, observaciones=$10
       WHERE id=$1 AND paciente_id=$2 RETURNING *`,
      [consulta_id, paciente_id, turno_id, motivo, fecha, profesional_id, textoOpcional(datos.diagnostico),
        textoOpcional(datos.tratamientos_realizados), textoOpcional(datos.plan_indicaciones), textoOpcional(datos.observaciones)],
    );
    await client.query(
      `INSERT INTO historias_clinicas_revisiones(historia_clinica_id,actor_id,antes,despues)
       VALUES($1,$2,$3::jsonb,$4::jsonb)`,
      [consulta_id, actor_id, JSON.stringify(existente.rows[0]), JSON.stringify(rows[0])],
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}

async function listarConsultas(pacienteId) {
  const paciente_id = idValido(pacienteId, 'paciente_id');
  const { rows } = await pool.query(
    `SELECT h.*, u.nombre AS profesional_nombre,
      COALESCE(json_agg(json_build_object('id',d.id,'nombre_archivo',d.nombre_archivo,'tipo_archivo',d.tipo_archivo,'descripcion',d.descripcion,'fecha_subida',d.fecha_subida))
        FILTER (WHERE d.id IS NOT NULL), '[]') AS documentos
     FROM historias_clinicas h
     LEFT JOIN usuarios u ON u.id=h.profesional_id
     LEFT JOIN documentos_paciente d ON d.historia_clinica_id=h.id
     WHERE h.paciente_id=$1
     GROUP BY h.id,u.nombre
     ORDER BY COALESCE(h.fecha_atencion,h.created_at) DESC,h.id DESC`,
    [paciente_id],
  );
  return rows.map((row) => ({ ...row, odontograma_disponible: row.odontograma_snapshot !== null }));
}

module.exports = { crearConsulta, actualizarConsulta, listarConsultas };
