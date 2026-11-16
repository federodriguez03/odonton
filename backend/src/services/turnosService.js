const { pool } = require('../config/db');
const { obtenerConfiguracion } = require('./configuracionService');
const { resolverRecordatorioHabilitado } = require('../domain/recordatorioTurno');
const { requireSchema } = require('./schemaValidationService');

const {
  cerrarSolicitudesPendientes,
  sincronizarSolicitudesPendientesConTurnos,
} = require('./turnoSolicitudesService');

let turnosReminderColumnsReady = false;
let turnosProfesionalColumnsReady = false;
let horariosProfesionalesReady = false;

const ESTADOS_OCUPAN_HORARIO = ['programado', 'reprogramado', 'confirmado'];
const ESTADOS_EDITABLES = ['programado', 'reprogramado', 'confirmado', 'solicitado', 'reprogramacion_solicitada'];
const ESTADOS_CANCELABLES = ['programado', 'reprogramado', 'confirmado', 'solicitado', 'reprogramacion_solicitada', 'cancelacion_solicitada'];
const ESTADOS_RECHAZABLES = ['solicitado', 'reprogramacion_solicitada', 'cancelacion_solicitada'];

function crearErrorDisponibilidad() {
  const error = new Error('El horario seleccionado ya no esta disponible');
  error.code = 'AGENDA_CONFLICT';
  return error;
}

function timeToMinutes(hora) {
  const [h, m] = String(hora || '').split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fechaLocalDesdeFechaYHora(fecha, hora) {
  // El consultorio opera en America/Buenos_Aires (UTC-03, sin horario de verano vigente).
  return new Date(`${fecha}T${hora}:00-03:00`);
}

function esFechaValida(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

async function asegurarColumnasProfesionalTurnos() {
  if (turnosProfesionalColumnsReady) return;
  await requireSchema('turnos_profesional', [
    'turnos.profesional_id', 'turnos.profesional_perfil_id', 'turnos.solicitud_preferencia',
    'turnos.solicitud_confirmada_at', 'turnos.solicitud_rechazada_at',
    'turnos.fecha_hora_inicio', 'turnos.fecha_hora_fin', 'turnos.estado',
  ]);

  turnosProfesionalColumnsReady = true;
}

async function asegurarHorariosProfesionales() {
  if (horariosProfesionalesReady) return;
  await requireSchema('horarios_profesionales', [
    'profesionales_horarios_atencion.profesional_id', 'profesionales_horarios_atencion.dia_semana',
    'profesionales_horarios_atencion.activo', 'profesionales_horarios_atencion.hora_desde',
    'profesionales_horarios_atencion.hora_hasta',
  ]);

  horariosProfesionalesReady = true;
}

async function normalizarPerfilProfesionalId(profesionalPerfilId) {
  const id = Number(profesionalPerfilId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Debe seleccionar un perfil profesional');
  const { rowCount } = await pool.query(
    `SELECT p.id FROM profesionales p
     JOIN usuarios u ON u.id=p.usuario_id AND COALESCE(u.activo,true)=true
     JOIN usuarios_roles_vigentes ur ON ur.usuario_id=u.id
     JOIN roles r ON r.id=ur.rol_id AND r.codigo IN ('odontologo','dueno')
     WHERE p.id=$1 AND p.activo=true AND p.vinculo_confirmado_at IS NOT NULL`, [id]);
  if (!rowCount) throw new Error('El perfil profesional no esta confirmado, activo o habilitado');
  return id;
}

async function existeSolapamientoPerfil(fechaInicio, fechaFin, turnoId, profesionalPerfilId) {
  const params = [fechaInicio, fechaFin, profesionalPerfilId];
  let excluir = '';
  if (turnoId) { params.push(turnoId); excluir = 'AND id <> $4'; }
  const { rows } = await pool.query(`SELECT EXISTS(SELECT 1 FROM turnos
    WHERE profesional_perfil_id=$3 AND fecha_hora_inicio<$2 AND fecha_hora_fin>$1
      AND estado IN ('programado','reprogramado','confirmado') ${excluir}) existe`, params);
  return rows[0].existe;
}

async function obtenerHorarioProfesionalParaFecha(profesionalId, fechaInicio) {
  await asegurarHorariosProfesionales();
  const diaSemana = fechaInicio.getDay();

  const horarioProfesional = await pool.query(
    `
      SELECT dia_semana, activo, TO_CHAR(hora_desde, 'HH24:MI') AS hora_desde, TO_CHAR(hora_hasta, 'HH24:MI') AS hora_hasta
      FROM profesionales_horarios_atencion
      WHERE profesional_id = $1 AND dia_semana = $2
      LIMIT 1
    `,
    [profesionalId, diaSemana],
  );

  if (horarioProfesional.rows.length) return horarioProfesional.rows[0];

  await obtenerConfiguracion();
  const horarioGlobal = await pool.query(
    `
      SELECT dia_semana, activo, TO_CHAR(hora_desde, 'HH24:MI') AS hora_desde, TO_CHAR(hora_hasta, 'HH24:MI') AS hora_hasta
      FROM configuracion_horarios_atencion
      WHERE dia_semana = $1
      LIMIT 1
    `,
    [diaSemana],
  );

  return horarioGlobal.rows[0] || null;
}

async function validarHorarioProfesional(profesionalId, fechaInicio, fechaFin) {
  const horario = await obtenerHorarioProfesionalParaFecha(profesionalId, fechaInicio);

  if (!horario || !horario.activo) {
    throw new Error('No hay atención configurada para ese profesional en ese día');
  }

  const inicioMinutos = fechaInicio.getHours() * 60 + fechaInicio.getMinutes();
  const finMinutos = fechaFin.getHours() * 60 + fechaFin.getMinutes();
  const desdeMinutos = timeToMinutes(horario.hora_desde);
  const hastaMinutos = timeToMinutes(horario.hora_hasta);

  if (inicioMinutos < desdeMinutos || finMinutos > hastaMinutos) {
    throw new Error(`Horario invalido. El profesional atiende de ${horario.hora_desde} a ${horario.hora_hasta}`);
  }
}

async function asegurarColumnasRecordatorioTurnos() {
  if (turnosReminderColumnsReady) return;
  await requireSchema('turnos_recordatorios', [
    'turnos.recordatorio_enviado_at', 'turnos.recordatorio_estado', 'turnos.recordatorio_error',
    'turnos.respuesta_paciente', 'turnos.respuesta_paciente_at',
  ]);

  turnosReminderColumnsReady = true;
}

async function existeSolapamiento(fechaInicio, fechaFin, turnoId = null, profesionalId = null) {
  await asegurarColumnasProfesionalTurnos();

  // Solo los estados con horario definitivo bloquean espacio en la agenda profesional.
  const whereProfesional = profesionalId ? 'AND profesional_id = $3' : '';
  const whereTurno = turnoId ? `AND id <> $${profesionalId ? 4 : 3}` : '';
  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM turnos
      WHERE
        fecha_hora_inicio < $2
        AND fecha_hora_fin > $1
        AND estado IN ('programado', 'reprogramado', 'confirmado')
        AND fecha_hora_inicio IS NOT NULL
        AND fecha_hora_fin IS NOT NULL
        ${whereProfesional}
        ${whereTurno}
    ) AS existe;
  `;

  const params = [fechaInicio, fechaFin];
  if (profesionalId) params.push(profesionalId);
  if (turnoId) params.push(turnoId);
  const { rows } = await pool.query(query, params);
  return rows[0].existe;
}

function validarDuracionTurno(duracionMinutos, fallback = null) {
  const duracionFinal = Number(duracionMinutos) || Number(fallback) || null;
  if (!duracionFinal || duracionFinal <= 0) {
    throw new Error('Debe indicar una duración válida');
  }
  if (duracionFinal < 15) {
    throw new Error('La duración mínima para un turno es de 15 minutos');
  }
  return duracionFinal;
}

function normalizarPrestacionIds(prestacionIds, prestacionId = null) {
  const raw = Array.isArray(prestacionIds) && prestacionIds.length ? prestacionIds : (prestacionId ? [prestacionId] : []);
  const ids = raw.map(Number);
  if (!ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Debe seleccionar al menos una prestación válida');
  }
  if (new Set(ids).size !== ids.length) throw new Error('No se permiten prestaciones duplicadas');
  return ids;
}

async function obtenerPrestacionesCatalogo(client, ids, { soloActivas = false } = {}) {
  const { rows } = await client.query(
    `SELECT id, nombre, duracion_minutos FROM prestaciones
      WHERE id = ANY($1::int[]) ${soloActivas ? 'AND COALESCE(activo, true) = true' : ''}`,
    [ids],
  );
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  if (byId.size !== ids.length) throw new Error('Una o mas prestaciones no existen o no estan activas');
  return ids.map((id, index) => {
    const row = byId.get(id);
    const duracion = Number(row.duracion_minutos);
    if (!Number.isFinite(duracion) || duracion <= 0) throw new Error(`La prestación ${row.nombre} no tiene una duración válida`);
    return { prestacion_id: id, orden: index + 1, nombre_snapshot: row.nombre, duracion_minutos_snapshot: duracion };
  });
}

async function obtenerPrestacionesTurno(client, turnoId) {
  const { rows } = await client.query(
    `SELECT prestacion_id, orden, nombre_snapshot, duracion_minutos_snapshot
       FROM turno_prestaciones WHERE turno_id = $1 ORDER BY orden`, [turnoId],
  );
  return rows;
}

async function obtenerPrestacionesPorTurnos(client, turnoIds) {
  if (!turnoIds.length) return new Map();
  const { rows } = await client.query(
    `SELECT turno_id, prestacion_id AS id, orden, nombre_snapshot AS nombre,
            duracion_minutos_snapshot AS duracion_minutos
       FROM turno_prestaciones WHERE turno_id = ANY($1::int[]) ORDER BY turno_id, orden`,
    [turnoIds],
  );
  const map = new Map();
  rows.forEach((row) => map.set(Number(row.turno_id), [...(map.get(Number(row.turno_id)) || []), row]));
  return map;
}

async function reemplazarPrestacionesTurno(client, turnoId, prestaciones) {
  await client.query('DELETE FROM turno_prestaciones WHERE turno_id = $1', [turnoId]);
  for (const item of prestaciones) {
    await client.query(
      `INSERT INTO turno_prestaciones
        (turno_id, prestacion_id, orden, nombre_snapshot, duracion_minutos_snapshot)
       VALUES ($1,$2,$3,$4,$5)`,
      [turnoId, item.prestacion_id, item.orden, item.nombre_snapshot, item.duracion_minutos_snapshot],
    );
  }
}

function mismaSeleccion(actuales, ids) {
  return actuales.length === ids.length && actuales.every((item, index) => Number(item.prestacion_id) === ids[index]);
}

function sumarDuraciones(prestaciones) {
  return prestaciones.reduce((total, item) => total + Number(item.duracion_minutos_snapshot), 0);
}

async function crearTurno({
  pacienteId,
  prestacionId,
  prestacionIds,
  fechaHoraInicio,
  duracionMinutos = null,
  origen = 'interno',
  observaciones = null,
  profesionalPerfilId,
  recordatorioHabilitado = true,
}) {
  await asegurarColumnasProfesionalTurnos();

  if (fechaHoraInicio < new Date()) {
    throw new Error('No se pueden crear turnos en el pasado');
  }

  const ids = normalizarPrestacionIds(prestacionIds, prestacionId);
  const profesionalFinalId = await normalizarPerfilProfesionalId(profesionalPerfilId);
  const recordatorioFinal = resolverRecordatorioHabilitado(recordatorioHabilitado, { defaultValue: true });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pacienteResult = await client.query('SELECT id FROM pacientes WHERE id = $1', [pacienteId]);
    if (!pacienteResult.rowCount) throw new Error('El paciente seleccionado no existe');
    const prestaciones = await obtenerPrestacionesCatalogo(client, ids, { soloActivas: true });
    const duracionFinal = validarDuracionTurno(duracionMinutos, sumarDuraciones(prestaciones));
    const fechaHoraFin = new Date(fechaHoraInicio.getTime() + duracionFinal * 60000);
    await validarHorarioProfesional(profesionalFinalId, fechaHoraInicio, fechaHoraFin);
    if (await existeSolapamientoPerfil(fechaHoraInicio, fechaHoraFin, null, profesionalFinalId)) throw crearErrorDisponibilidad();
    const { rows } = await client.query(
      `INSERT INTO turnos
        (paciente_id, prestacion_id, profesional_id, profesional_perfil_id, fecha_hora_inicio, fecha_hora_fin, estado, origen, observaciones, recordatorio_habilitado)
       VALUES ($1,$2,NULL,$3,$4,$5,'programado',$6,$7,$8) RETURNING *`,
      [pacienteId, ids[0], profesionalFinalId, fechaHoraInicio, fechaHoraFin, origen, observaciones, recordatorioFinal],
    );
    await reemplazarPrestacionesTurno(client, rows[0].id, prestaciones);
    await client.query('COMMIT');
    return { ...rows[0], duracion_minutos: duracionFinal };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function crearSolicitudTurno({
  pacienteId,
  prestacionId = null,
  origen = 'autogestion_whatsapp',
  observaciones = null,
  preferencia = null,
}) {
  await asegurarColumnasProfesionalTurnos();

  const pacienteResult = await pool.query('SELECT id FROM pacientes WHERE id = $1', [pacienteId]);
  if (pacienteResult.rowCount === 0) throw new Error('El paciente seleccionado no existe');

  if (prestacionId) {
    const prestacionResult = await pool.query('SELECT id FROM prestaciones WHERE id = $1', [prestacionId]);
    if (prestacionResult.rowCount === 0) throw new Error('La prestación seleccionada no existe');
  }

  const { rows } = await pool.query(
    `
      INSERT INTO turnos (
        paciente_id,
        prestacion_id,
        profesional_id,
        fecha_hora_inicio,
        fecha_hora_fin,
        estado,
        origen,
        observaciones,
        solicitud_preferencia
      )
      VALUES ($1, $2, NULL, NULL, NULL, 'solicitado', $3, $4, $5)
      RETURNING *;
    `,
    [pacienteId, prestacionId, origen, observaciones, preferencia],
  );

  return rows[0];
}

async function reprogramarTurno(
  turnoId,
  fechaHoraInicio,
  fechaHoraFin,
  { recordatorioHabilitado } = {},
) {
  await asegurarColumnasProfesionalTurnos();
  const turnoResult = await pool.query('SELECT * FROM turnos WHERE id = $1', [turnoId]);

  if (fechaHoraInicio < new Date()) {
    throw new Error('No se pueden reprogramar turnos en el pasado');
  }

  if (turnoResult.rowCount === 0) {
    throw new Error('El turno no existe');
  }

  const turno = turnoResult.rows[0];
  const recordatorioFinal = resolverRecordatorioHabilitado(recordatorioHabilitado);
  const estadosPermitidos = ['programado', 'reprogramado', 'confirmado', 'reprogramacion_solicitada'];
  if (!estadosPermitidos.includes(turno.estado)) {
    throw new Error('El turno no puede reprogramarse');
  }

  const profesionalId = turno.profesional_perfil_id || turno.profesional_id;
  if (!profesionalId) throw new Error('El turno no tiene un profesional responsable');
  await validarHorarioProfesional(profesionalId, fechaHoraInicio, fechaHoraFin);
  const hayConflicto = turno.profesional_perfil_id
    ? await existeSolapamientoPerfil(fechaHoraInicio, fechaHoraFin, turnoId, profesionalId)
    : await existeSolapamiento(fechaHoraInicio, fechaHoraFin, turnoId, profesionalId);
  if (hayConflicto) {
    throw crearErrorDisponibilidad();
  }

  const query = `
    WITH turno_actualizado AS (
      UPDATE turnos
      SET
        fecha_hora_inicio = $1,
        fecha_hora_fin = $2,
        estado = 'reprogramado',
        recordatorio_habilitado = COALESCE($4::boolean, recordatorio_habilitado),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    ), solicitudes_resueltas AS (
      UPDATE turno_solicitudes
      SET estado = 'resuelta',
          updated_at = NOW()
      WHERE turno_id = $3
        AND tipo_solicitud = 'reprogramacion'
        AND estado = 'pendiente'
      RETURNING id
    )
    SELECT * FROM turno_actualizado;
  `;

  const { rows } = await pool.query(query, [fechaHoraInicio, fechaHoraFin, turnoId, recordatorioFinal]);
  return rows[0];
}

async function editarTurno(
  turnoId,
  {
    pacienteId,
    prestacionId,
    prestacionIds,
    fechaHoraInicio,
    duracionMinutos = null,
    observaciones = null,
    profesionalPerfilId,
    recordatorioHabilitado,
  },
) {
  await asegurarColumnasProfesionalTurnos();
  if (!pacienteId) throw new Error('El paciente es obligatorio');
  if (!(prestacionIds?.length || prestacionId)) throw new Error('La prestación es obligatoria');

  const fechaInicio = new Date(fechaHoraInicio);
  if (Number.isNaN(fechaInicio.getTime())) {
    throw new Error('Fecha y hora de inicio invalidas');
  }

  if (fechaInicio < new Date()) {
    throw new Error('No se pueden programar turnos en el pasado');
  }

  const ids = normalizarPrestacionIds(prestacionIds, prestacionId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const turnoResult = await client.query('SELECT * FROM turnos WHERE id = $1 FOR UPDATE', [turnoId]);
    if (!turnoResult.rowCount) throw new Error('El turno no existe');
    const turno = turnoResult.rows[0];
    if (!ESTADOS_EDITABLES.includes(turno.estado)) throw new Error(`No se puede editar un turno en estado "${turno.estado}".`);
    const pacienteResult = await client.query('SELECT id FROM pacientes WHERE id = $1', [pacienteId]);
    if (!pacienteResult.rowCount) throw new Error('El paciente seleccionado no existe');
    const actuales = await obtenerPrestacionesTurno(client, turnoId);
    const seleccionCambio = !mismaSeleccion(actuales, ids);
    const prestaciones = seleccionCambio ? await obtenerPrestacionesCatalogo(client, ids, { soloActivas: true }) : actuales;
    const duracionActual = turno.fecha_hora_inicio && turno.fecha_hora_fin
      ? Math.round((new Date(turno.fecha_hora_fin) - new Date(turno.fecha_hora_inicio)) / 60000) : null;
    const duracionBase = seleccionCambio ? sumarDuraciones(prestaciones) : duracionActual || sumarDuraciones(prestaciones);
    const duracionFinal = validarDuracionTurno(duracionMinutos, duracionBase);
    const profesionalFinalId = await normalizarPerfilProfesionalId(profesionalPerfilId);
    const fechaFin = new Date(fechaInicio.getTime() + duracionFinal * 60000);
    await validarHorarioProfesional(profesionalFinalId, fechaInicio, fechaFin);
    if (await existeSolapamientoPerfil(fechaInicio, fechaFin, turnoId, profesionalFinalId)) throw crearErrorDisponibilidad();
    const recordatorioFinal = resolverRecordatorioHabilitado(recordatorioHabilitado);
    const { rows } = await client.query(
      `UPDATE turnos SET paciente_id=$1, prestacion_id=$2, profesional_id=NULL, profesional_perfil_id=$3,
        fecha_hora_inicio=$4, fecha_hora_fin=$5, observaciones=$6,
        recordatorio_habilitado=COALESCE($7::boolean,recordatorio_habilitado), updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [pacienteId, ids[0], profesionalFinalId, fechaInicio, fechaFin, observaciones, recordatorioFinal, turnoId],
    );
    if (seleccionCambio) await reemplazarPrestacionesTurno(client, turnoId, prestaciones);
    await client.query('COMMIT');
    return { ...rows[0], duracion_minutos: duracionFinal };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Cancela el turno y resuelve sus solicitudes pendientes en una sola transacción.
 */
async function cancelarTurno(turnoId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const turnoResult = await client.query(
      'SELECT * FROM turnos WHERE id = $1 FOR UPDATE',
      [turnoId],
    );
    if (turnoResult.rowCount === 0) throw new Error('El turno no existe');

    const turno = turnoResult.rows[0];
    if (!ESTADOS_CANCELABLES.includes(turno.estado)) {
      throw new Error(
        `No se puede cancelar un turno en estado "${turno.estado}".`,
      );
    }

    const { rows } = await client.query(
      `
        UPDATE turnos
        SET estado = 'cancelado',
            fecha_cancelacion = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
      [turnoId],
    );

    await cerrarSolicitudesPendientes(client, {
      turnoId,
      estadoFinal: 'resuelta',
    });

    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function confirmarTurno(turnoId) {
  const turnoResult = await pool.query('SELECT * FROM turnos WHERE id = $1', [turnoId]);
  if (turnoResult.rowCount === 0) throw new Error('El turno no existe');

  const turno = turnoResult.rows[0];
  if (turno.estado !== 'programado') {
    throw new Error('Solo se pueden confirmar turnos en estado "programado"');
  }

  const query = `
    UPDATE turnos
    SET
      estado = 'confirmado',
      updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;

  const { rows } = await pool.query(query, [turnoId]);
  return rows[0];
}

/**
 * Confirma la solicitud y cierra sus registros pendientes de forma atómica.
 */
async function confirmarSolicitudTurno(
  turnoId,
  {
    profesionalPerfilId,
    prestacionId = null,
    prestacionIds = null,
    fechaHoraInicio,
    duracionMinutos,
    observaciones = null,
    recordatorioHabilitado,
  },
) {
  await asegurarColumnasProfesionalTurnos();

  const turnoResult = await pool.query('SELECT * FROM turnos WHERE id = $1', [turnoId]);
  if (turnoResult.rowCount === 0) throw new Error('El turno no existe');

  const turno = turnoResult.rows[0];
  const recordatorioFinal = resolverRecordatorioHabilitado(recordatorioHabilitado);
  if (turno.estado !== 'solicitado') {
    throw new Error('Solo pueden confirmarse solicitudes en estado solicitado');
  }

  const fechaInicio = new Date(fechaHoraInicio);
  if (!esFechaValida(fechaInicio)) throw new Error('Fecha y hora de inicio invalidas');
  if (fechaInicio < new Date()) throw new Error('No se pueden confirmar turnos en el pasado');

  const ids = normalizarPrestacionIds(prestacionIds, prestacionId || turno.prestacion_id);
  const prestaciones = await obtenerPrestacionesCatalogo(pool, ids, { soloActivas: true });

  const duracionActual = turno.fecha_hora_inicio && turno.fecha_hora_fin
    ? Math.round((new Date(turno.fecha_hora_fin).getTime() - new Date(turno.fecha_hora_inicio).getTime()) / 60000)
    : null;
  const duracionFinal = validarDuracionTurno(duracionMinutos, duracionActual || sumarDuraciones(prestaciones));
  const profesionalFinalId = await normalizarPerfilProfesionalId(profesionalPerfilId);
  const fechaFin = new Date(fechaInicio.getTime() + duracionFinal * 60000);

  await validarHorarioProfesional(profesionalFinalId, fechaInicio, fechaFin);
  const hayConflicto = await existeSolapamientoPerfil(fechaInicio, fechaFin, turnoId, profesionalFinalId);
  if (hayConflicto) throw crearErrorDisponibilidad();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Revalida bajo bloqueo porque las comprobaciones previas pueden quedar desactualizadas.
    const turnoBloqueado = await client.query(
      'SELECT id, estado FROM turnos WHERE id = $1 FOR UPDATE',
      [turnoId],
    );
    if (!turnoBloqueado.rowCount) throw new Error('El turno no existe');
    if (turnoBloqueado.rows[0].estado !== 'solicitado') {
      throw new Error('Solo pueden confirmarse solicitudes en estado solicitado');
    }

    const { rows } = await client.query(
      `
        UPDATE turnos
        SET profesional_id = NULL,
            profesional_perfil_id = $2,
            prestacion_id = $3,
            fecha_hora_inicio = $4,
            fecha_hora_fin = $5,
            observaciones = COALESCE($6, observaciones),
            recordatorio_habilitado = COALESCE($7::boolean, recordatorio_habilitado),
            estado = 'confirmado',
            solicitud_confirmada_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND estado = 'solicitado'
        RETURNING *
      `,
      [turnoId, profesionalFinalId, ids[0], fechaInicio, fechaFin, observaciones, recordatorioFinal],
    );
    if (!rows.length) throw new Error('La solicitud de turno ya no se encuentra pendiente');

    await reemplazarPrestacionesTurno(client, turnoId, prestaciones);
    await cerrarSolicitudesPendientes(client, {
      turnoId,
      tipos: ['nuevo_turno', 'primera_consulta'],
      estadoFinal: 'resuelta',
    });

    await client.query('COMMIT');
    return {
      ...rows[0],
      duracion_minutos: duracionFinal,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Rechaza la solicitud y restaura el estado aplicable sin dejar registros pendientes.
 */
async function rechazarSolicitudTurno(turnoId, { observaciones = null } = {}) {
  await asegurarColumnasProfesionalTurnos();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const turnoResult = await client.query(
      'SELECT * FROM turnos WHERE id = $1 FOR UPDATE',
      [turnoId],
    );
    if (turnoResult.rowCount === 0) throw new Error('El turno no existe');
    const turno = turnoResult.rows[0];
    if (!ESTADOS_RECHAZABLES.includes(turno.estado)) {
      throw new Error('Solo pueden rechazarse solicitudes pendientes');
    }

    const nuevoEstado = turno.estado === 'solicitado' ? 'rechazado' : 'programado';
    const tiposSolicitud = {
      solicitado: ['nuevo_turno', 'primera_consulta'],
      reprogramacion_solicitada: ['reprogramacion'],
      cancelacion_solicitada: ['cancelacion'],
    }[turno.estado];

    const { rows } = await client.query(
      `
        UPDATE turnos
        SET estado = $3,
            observaciones = COALESCE($2, observaciones),
            solicitud_rechazada_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND estado = $4
        RETURNING *
      `,
      [turnoId, observaciones, nuevoEstado, turno.estado],
    );
    if (!rows.length) throw new Error('La solicitud de turno ya no se encuentra pendiente');

    await cerrarSolicitudesPendientes(client, {
      turnoId,
      tipos: tiposSolicitud,
      estadoFinal: 'rechazada',
    });

    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function obtenerTelefonoPaciente(pacienteId) {
  const { rows } = await pool.query('SELECT telefono FROM pacientes WHERE id = $1', [pacienteId]);
  if (!rows.length) return null;
  return rows[0].telefono || null;
}

async function obtenerTurnoDetalle(turnoId) {
  await asegurarColumnasProfesionalTurnos();

  const query = `
    SELECT
      t.id,
      t.paciente_id,
      t.prestacion_id,
      t.profesional_id,
      t.profesional_perfil_id,
      t.fecha_hora_inicio,
      t.fecha_hora_fin,
      t.estado,
      t.origen,
      t.observaciones,
      t.solicitud_preferencia,
      t.solicitud_confirmada_at,
      t.solicitud_rechazada_at,
      t.recordatorio_habilitado,
      t.created_at,
      t.updated_at,
      p.nombre AS paciente_nombre,
      p.apellido AS paciente_apellido,
      p.dni AS paciente_dni,
      p.telefono AS paciente_telefono,
      pr.nombre AS prestacion_nombre,
      COALESCE(pf.nombre_mostrado,u.nombre) AS profesional_nombre,
      COALESCE(up.email,u.email) AS profesional_email
    FROM turnos t
    LEFT JOIN pacientes p ON p.id = t.paciente_id
    LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
    LEFT JOIN usuarios u ON u.id = t.profesional_id
    LEFT JOIN profesionales pf ON pf.id=t.profesional_perfil_id
    LEFT JOIN usuarios up ON up.id=pf.usuario_id
    WHERE t.id = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [turnoId]);
  if (!rows.length) throw new Error('El turno no existe');

  const row = rows[0];
  const prestaciones = (await obtenerPrestacionesPorTurnos(pool, [row.id])).get(Number(row.id)) || [];
  const prestacionPrincipal = prestaciones[0] || { id: row.prestacion_id, nombre: row.prestacion_nombre };
  return {
    id: row.id,
    fecha_hora_inicio: row.fecha_hora_inicio,
    fecha_hora_fin: row.fecha_hora_fin,
    estado: row.estado,
    origen: row.origen,
    observaciones: row.observaciones,
    solicitud_preferencia: row.solicitud_preferencia,
    solicitud_confirmada_at: row.solicitud_confirmada_at,
    solicitud_rechazada_at: row.solicitud_rechazada_at,
    recordatorio_habilitado: row.recordatorio_habilitado,
    created_at: row.created_at,
    updated_at: row.updated_at,
    paciente: {
      id: row.paciente_id,
      nombre: row.paciente_nombre,
      apellido: row.paciente_apellido,
      dni: row.paciente_dni,
      telefono: row.paciente_telefono,
    },
    prestaciones,
    prestacion: { id: prestacionPrincipal.id, nombre: prestaciones.map((item) => item.nombre).join(' + ') || prestacionPrincipal.nombre },
    profesional: {
      id: row.profesional_perfil_id || row.profesional_id,
      perfil_id: row.profesional_perfil_id,
      referencia: row.profesional_perfil_id ? 'perfil' : 'historica_usuario',
      nombre: row.profesional_nombre,
      email: row.profesional_email,
    },
  };
}

async function listarTurnos({
  page = 1,
  limit = 20,
  estado = null,
  pacienteId = null,
  q = null,
  fechaDesde = null,
  fechaHasta = null,
  sort = 'fecha_hora_inicio:asc',
  profesionalPerfilId = null,
  incluirObservaciones = true,
}) {
  await asegurarColumnasRecordatorioTurnos();
  await asegurarColumnasProfesionalTurnos();
  await sincronizarSolicitudesPendientesConTurnos();

  page = Number.parseInt(page, 10) || 1;
  limit = Number.parseInt(limit, 10) || 20;
  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  const where = [];
  const values = [];
  let idx = 1;
  const normalizarBusqueda = (texto) =>
    String(texto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const normalizarDesde = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00`;
    return raw;
  };

  const normalizarHastaExclusiva = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    // Si viene solo fecha, usamos limite exclusivo al dia siguiente para incluir todo el dia.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00`;
    return raw;
  };

  if (estado) {
    where.push(`t.estado = $${idx}`);
    values.push(estado);
    idx++;
  }

  if (pacienteId) {
    where.push(`t.paciente_id = $${idx}`);
    values.push(pacienteId);
    idx++;
  }

  if (profesionalPerfilId) {
    where.push(`t.profesional_perfil_id = $${idx}`);
    values.push(profesionalPerfilId);
    idx++;
  }

  if (q) {
    where.push(`(
      translate(lower(p.nombre), 'áéíóúäëïöüñ', 'aeiouaeioun') LIKE $${idx}
      OR translate(lower(p.apellido), 'áéíóúäëïöüñ', 'aeiouaeioun') LIKE $${idx}
      OR lower(CAST(p.dni AS TEXT)) LIKE $${idx}
    )`);
    values.push(`%${normalizarBusqueda(q)}%`);
    idx++;
  }

  if (fechaDesde) {
    const esDiaConsultorio = /^\d{4}-\d{2}-\d{2}$/.test(String(fechaDesde).trim());
    const limiteDesde = esDiaConsultorio
      ? `($${idx}::date::timestamp AT TIME ZONE 'America/Buenos_Aires')`
      : `$${idx}::timestamptz`;
    where.push(`(
      t.fecha_hora_inicio >= ${limiteDesde}
      OR (
        t.estado = 'solicitado'
        AND t.fecha_hora_inicio IS NULL
        AND t.created_at >= ${limiteDesde}
      )
    )`);
    values.push(esDiaConsultorio ? String(fechaDesde).trim() : normalizarDesde(fechaDesde));
    idx++;
  }

  if (fechaHasta) {
    const hasta = normalizarHastaExclusiva(fechaHasta);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(fechaHasta).trim())) {
      where.push(`(
        t.fecha_hora_inicio < ((($${idx}::date + 1)::timestamp) AT TIME ZONE 'America/Buenos_Aires')
        OR (
          t.estado = 'solicitado'
          AND t.fecha_hora_inicio IS NULL
          AND t.created_at < ((($${idx}::date + 1)::timestamp) AT TIME ZONE 'America/Buenos_Aires')
        )
      )`);
      values.push(String(fechaHasta).trim());
    } else {
      where.push(`(
        t.fecha_hora_inicio <= $${idx}
        OR (
          t.estado = 'solicitado'
          AND t.fecha_hora_inicio IS NULL
          AND t.created_at <= $${idx}
        )
      )`);
      values.push(hasta);
    }
    idx++;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM turnos t
    LEFT JOIN pacientes p ON p.id = t.paciente_id
    ${whereClause}
  `;
  const countRes = await pool.query(countQuery, values);
  const total = countRes.rows[0].total;

  const sortMap = {
    fecha_hora_inicio: 't.fecha_hora_inicio',
    fecha_hora_fin: 't.fecha_hora_fin',
    estado: 't.estado',
    created_at: 't.created_at',
  };

  let orderBy = 't.fecha_hora_inicio ASC NULLS LAST, t.created_at DESC';
  if (sort) {
    const [field, rawDir] = String(sort).split(':');
    const dbField = sortMap[field];
    const dir = String(rawDir || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    if (dbField) orderBy = `${dbField} ${dir}`;
  }

  const offset = (page - 1) * limit;

  const dataQuery = `
    SELECT
      t.id,
      t.paciente_id,
      t.prestacion_id,
      t.profesional_id,
      t.profesional_perfil_id,
      t.fecha_hora_inicio,
      t.fecha_hora_fin,
      t.estado,
      t.origen,
      t.observaciones,
      t.solicitud_preferencia,
      t.solicitud_confirmada_at,
      t.solicitud_rechazada_at,
      t.recordatorio_habilitado,
      t.recordatorio_enviado_at,
      t.recordatorio_estado,
      t.recordatorio_error,
      t.respuesta_paciente,
      t.respuesta_paciente_at,
      t.created_at,
      t.updated_at,
      p.nombre AS paciente_nombre,
      p.apellido AS paciente_apellido,
      p.dni AS paciente_dni,
      p.telefono AS paciente_telefono,
      pr.nombre AS prestacion_nombre,
      COALESCE(pf.nombre_mostrado,u.nombre) AS profesional_nombre,
      COALESCE(up.email,u.email) AS profesional_email
    FROM turnos t
    LEFT JOIN pacientes p ON p.id = t.paciente_id
    LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
    LEFT JOIN usuarios u ON u.id = t.profesional_id
    LEFT JOIN profesionales pf ON pf.id=t.profesional_perfil_id
    LEFT JOIN usuarios up ON up.id=pf.usuario_id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  values.push(limit, offset);
  const dataRes = await pool.query(dataQuery, values);
  const prestacionesPorTurno = await obtenerPrestacionesPorTurnos(pool, dataRes.rows.map((row) => row.id));

  return {
    total,
    page,
    limit,
    turnos: dataRes.rows.map((row) => {
      const prestaciones = prestacionesPorTurno.get(Number(row.id)) || [];
      const principal = prestaciones[0] || { id: row.prestacion_id, nombre: row.prestacion_nombre };
      return ({
      id: row.id,
      fecha_hora_inicio: row.fecha_hora_inicio,
      fecha_hora_fin: row.fecha_hora_fin,
      estado: row.estado,
      origen: row.origen,
      ...(incluirObservaciones ? { observaciones: row.observaciones } : {}),
      solicitud_preferencia: row.solicitud_preferencia,
      solicitud_confirmada_at: row.solicitud_confirmada_at,
      solicitud_rechazada_at: row.solicitud_rechazada_at,
      recordatorio_habilitado: row.recordatorio_habilitado,
      recordatorio_enviado_at: row.recordatorio_enviado_at,
      recordatorio_estado: row.recordatorio_estado,
      recordatorio_error: row.recordatorio_error,
      respuesta_paciente: row.respuesta_paciente,
      respuesta_paciente_at: row.respuesta_paciente_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      paciente: {
        id: row.paciente_id,
        nombre: row.paciente_nombre,
        apellido: row.paciente_apellido,
        dni: row.paciente_dni,
        telefono: row.paciente_telefono,
      },
      prestaciones,
      prestacion: { id: principal.id, nombre: prestaciones.map((item) => item.nombre).join(' + ') || principal.nombre },
      profesional: {
        id: row.profesional_perfil_id || row.profesional_id,
        perfil_id: row.profesional_perfil_id,
        referencia: row.profesional_perfil_id ? 'perfil' : 'historica_usuario',
        nombre: row.profesional_nombre,
        email: row.profesional_email,
      },
    }); }),
  };
}

async function listarProfesionales({ profesionalPerfilId = null } = {}) {
  const { rows } = await pool.query(`
    SELECT p.id, p.nombre_mostrado AS nombre, u.email
    FROM profesionales p
    JOIN usuarios u ON u.id=p.usuario_id AND COALESCE(u.activo,true)=true
    JOIN usuarios_roles_vigentes ur ON ur.usuario_id=u.id
    JOIN roles r ON r.id=ur.rol_id AND r.codigo IN ('odontologo','dueno')
    WHERE p.activo=true AND p.vinculo_confirmado_at IS NOT NULL
      AND ($1::int IS NULL OR p.id=$1)
    ORDER BY p.nombre_mostrado ASC, p.id ASC
  `, [profesionalPerfilId]);

  return rows;
}

async function consultarDisponibilidad({ profesionalPerfilId, fecha, prestacionId, prestacionIds = null, turnoId = null, duracionMinutos = null }) {
  await asegurarColumnasProfesionalTurnos();
  await asegurarHorariosProfesionales();

  const profesionalFinalId = await normalizarPerfilProfesionalId(profesionalPerfilId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) {
    throw new Error('fecha invalida. Use formato YYYY-MM-DD');
  }

  const dia = new Date(`${fecha}T00:00:00-03:00`);
  if (!esFechaValida(dia)) throw new Error('fecha invalida');

  const ids = normalizarPrestacionIds(prestacionIds, prestacionId);
  const prestaciones = await obtenerPrestacionesCatalogo(pool, ids, { soloActivas: true });
  let duracionBase = sumarDuraciones(prestaciones);
  if (turnoId && mismaSeleccion(await obtenerPrestacionesTurno(pool, turnoId), ids)) {
    const actual = await pool.query('SELECT EXTRACT(EPOCH FROM (fecha_hora_fin-fecha_hora_inicio))/60 AS duracion FROM turnos WHERE id=$1', [turnoId]);
    duracionBase = Number(actual.rows[0]?.duracion) || duracionBase;
  }
  const duracion = Number(duracionMinutos) || duracionBase;
  if (!Number.isFinite(duracion) || duracion < 15) {
    throw new Error('La prestación no tiene una duración válida');
  }

  const horario = await obtenerHorarioProfesionalParaFecha(profesionalFinalId, dia);
  if (!horario || !horario.activo) return [];

  const desde = timeToMinutes(horario.hora_desde);
  const hasta = timeToMinutes(horario.hora_hasta);
  const fechaDesde = fechaLocalDesdeFechaYHora(fecha, horario.hora_desde);
  const fechaHasta = fechaLocalDesdeFechaYHora(fecha, horario.hora_hasta);
  const ahora = new Date();

  const turnosRes = await pool.query(
    `
      SELECT fecha_hora_inicio, fecha_hora_fin, estado
      FROM turnos
      WHERE profesional_perfil_id = $1
        AND estado = ANY($2)
        AND fecha_hora_inicio IS NOT NULL
        AND fecha_hora_fin IS NOT NULL
        AND fecha_hora_inicio < $4
        AND fecha_hora_fin > $3
        AND ($5::int IS NULL OR id <> $5)
      ORDER BY fecha_hora_inicio ASC
    `,
    [profesionalFinalId, ESTADOS_OCUPAN_HORARIO, fechaDesde, fechaHasta, Number(turnoId) || null],
  );

  const ocupados = turnosRes.rows.map((turno) => ({
    inicio: new Date(turno.fecha_hora_inicio),
    fin: new Date(turno.fecha_hora_fin),
  }));

  const slots = [];
  for (let inicioMinutos = desde; inicioMinutos + duracion <= hasta; inicioMinutos += 15) {
    const finMinutos = inicioMinutos + duracion;
    const inicioTexto = minutesToTime(inicioMinutos);
    const finTexto = minutesToTime(finMinutos);
    const inicio = fechaLocalDesdeFechaYHora(fecha, inicioTexto);
    const fin = fechaLocalDesdeFechaYHora(fecha, finTexto);
    const ocupado = ocupados.some((turno) => inicio < turno.fin && fin > turno.inicio);
    const disponible = !ocupado && inicio >= ahora;

    slots.push({
      inicio: inicioTexto,
      fin: finTexto,
      disponible,
      fecha_hora_inicio: inicio.toISOString(),
      fecha_hora_fin: fin.toISOString(),
    });
  }

  return slots;
}

module.exports = {
  crearTurno,
  crearSolicitudTurno,
  reprogramarTurno,
  editarTurno,
  cancelarTurno,
  confirmarTurno,
  confirmarSolicitudTurno,
  rechazarSolicitudTurno,
  obtenerTelefonoPaciente,
  obtenerTurnoDetalle,
  listarTurnos,
  existeSolapamiento,
  listarProfesionales,
  consultarDisponibilidad,
};


