const { pool } = require('../config/db');
const { obtenerConfiguracion } = require('./configuracionService');

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
  return new Date(`${fecha}T${hora}:00`);
}

function esFechaValida(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

async function asegurarColumnasProfesionalTurnos() {
  if (turnosProfesionalColumnsReady) return;

  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS profesional_id INTEGER`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS solicitud_preferencia TEXT`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS solicitud_confirmada_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS solicitud_rechazada_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE turnos ALTER COLUMN prestacion_id DROP NOT NULL`);
  await pool.query(`ALTER TABLE turnos ALTER COLUMN fecha_hora_inicio DROP NOT NULL`);
  await pool.query(`ALTER TABLE turnos ALTER COLUMN fecha_hora_fin DROP NOT NULL`);
  await pool.query(`ALTER TABLE turnos DROP CONSTRAINT IF EXISTS turnos_estado_check`);
  await pool.query(`
    UPDATE turnos
    SET profesional_id = (
      SELECT id
      FROM usuarios
      WHERE COALESCE(activo, true) = true
      ORDER BY id ASC
      LIMIT 1
    )
    WHERE profesional_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM usuarios
        WHERE COALESCE(activo, true) = true
      )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_turnos_profesional_inicio ON turnos(profesional_id, fecha_hora_inicio)`);

  turnosProfesionalColumnsReady = true;
}

async function asegurarHorariosProfesionales() {
  if (horariosProfesionalesReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profesionales_horarios_atencion (
      id SERIAL PRIMARY KEY,
      profesional_id INTEGER NOT NULL,
      dia_semana INTEGER NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT false,
      hora_desde TIME,
      hora_hasta TIME,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (profesional_id, dia_semana)
    )
  `);

  horariosProfesionalesReady = true;
}

async function obtenerProfesionalDefault() {
  await asegurarColumnasProfesionalTurnos();

  const { rows } = await pool.query(`
    SELECT id
    FROM usuarios
    WHERE COALESCE(activo, true) = true
    ORDER BY id ASC
    LIMIT 1
  `);

  return rows[0]?.id || null;
}

async function normalizarProfesionalId(profesionalId = null) {
  await asegurarColumnasProfesionalTurnos();

  const id = Number(profesionalId) || await obtenerProfesionalDefault();
  if (!id) throw new Error('Debe seleccionar un profesional');

  const { rowCount } = await pool.query(
    'SELECT id FROM usuarios WHERE id = $1 AND COALESCE(activo, true) = true',
    [id],
  );

  if (!rowCount) throw new Error('El profesional seleccionado no existe o no esta activo');
  return id;
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
    throw new Error('No hay atencion configurada para ese profesional en ese dia');
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

  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_enviado_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_estado TEXT`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_error TEXT`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS respuesta_paciente TEXT`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS respuesta_paciente_at TIMESTAMPTZ`);

  turnosReminderColumnsReady = true;
}

async function existeSolapamiento(fechaInicio, fechaFin, turnoId = null, profesionalId = null) {
  await asegurarColumnasProfesionalTurnos();

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
    throw new Error('Debe indicar una duracion valida');
  }
  if (duracionFinal < 15) {
    throw new Error('La duracion minima para un turno es 15 minutos');
  }
  return duracionFinal;
}

async function crearTurno({
  pacienteId,
  prestacionId,
  fechaHoraInicio,
  duracionMinutos = null,
  origen = 'interno',
  observaciones = null,
  profesionalId = null,
}) {
  await asegurarColumnasProfesionalTurnos();

  if (fechaHoraInicio < new Date()) {
    throw new Error('No se pueden crear turnos en el pasado');
  }

  const pacienteResult = await pool.query('SELECT id FROM pacientes WHERE id = $1', [pacienteId]);
  if (pacienteResult.rowCount === 0) {
    throw new Error('El paciente seleccionado no existe');
  }

  const prestacionResult = await pool.query('SELECT id, duracion_minutos FROM prestaciones WHERE id = $1', [prestacionId]);
  if (prestacionResult.rowCount === 0) {
    throw new Error('La prestacion seleccionada no existe');
  }

  const duracionPrestacion = Number(prestacionResult.rows[0].duracion_minutos) || null;
  const duracionFinal = validarDuracionTurno(duracionMinutos, duracionPrestacion);

  const profesionalFinalId = await normalizarProfesionalId(profesionalId);
  const fechaHoraFin = new Date(fechaHoraInicio.getTime() + duracionFinal * 60000);
  await validarHorarioProfesional(profesionalFinalId, fechaHoraInicio, fechaHoraFin);

  const hayConflicto = await existeSolapamiento(fechaHoraInicio, fechaHoraFin, null, profesionalFinalId);
  if (hayConflicto) {
    throw new Error('El horario seleccionado no esta disponible');
  }

  const query = `
    INSERT INTO turnos (
      paciente_id,
      prestacion_id,
      profesional_id,
      fecha_hora_inicio,
      fecha_hora_fin,
      estado,
      origen,
      observaciones
    )
    VALUES ($1, $2, $3, $4, $5, 'programado', $6, $7)
    RETURNING *;
  `;

  const values = [pacienteId, prestacionId, profesionalFinalId, fechaHoraInicio, fechaHoraFin, origen, observaciones];
  const { rows } = await pool.query(query, values);

  return {
    ...rows[0],
    duracion_minutos: duracionFinal,
  };
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
    if (prestacionResult.rowCount === 0) throw new Error('La prestacion seleccionada no existe');
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

async function reprogramarTurno(turnoId, fechaHoraInicio, fechaHoraFin) {
  await asegurarColumnasProfesionalTurnos();
  const turnoResult = await pool.query('SELECT * FROM turnos WHERE id = $1', [turnoId]);

  if (fechaHoraInicio < new Date()) {
    throw new Error('No se pueden reprogramar turnos en el pasado');
  }

  if (turnoResult.rowCount === 0) {
    throw new Error('El turno no existe');
  }

  const turno = turnoResult.rows[0];
  const estadosPermitidos = ['programado', 'reprogramado', 'confirmado', 'reprogramacion_solicitada'];
  if (!estadosPermitidos.includes(turno.estado)) {
    throw new Error('El turno no puede reprogramarse');
  }

  const profesionalId = turno.profesional_id || await obtenerProfesionalDefault();
  await validarHorarioProfesional(profesionalId, fechaHoraInicio, fechaHoraFin);
  const hayConflicto = await existeSolapamiento(fechaHoraInicio, fechaHoraFin, turnoId, profesionalId);
  if (hayConflicto) {
    throw new Error('El horario seleccionado no esta disponible');
  }

  const query = `
    WITH turno_actualizado AS (
      UPDATE turnos
      SET
        fecha_hora_inicio = $1,
        fecha_hora_fin = $2,
        estado = 'reprogramado',
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

  const { rows } = await pool.query(query, [fechaHoraInicio, fechaHoraFin, turnoId]);
  return rows[0];
}

async function editarTurno(
  turnoId,
  {
    pacienteId,
    prestacionId,
    fechaHoraInicio,
    duracionMinutos = null,
    observaciones = null,
    profesionalId = null,
  },
) {
  await asegurarColumnasProfesionalTurnos();
  if (!pacienteId) throw new Error('El paciente es obligatorio');
  if (!prestacionId) throw new Error('La prestacion es obligatoria');

  const fechaInicio = new Date(fechaHoraInicio);
  if (Number.isNaN(fechaInicio.getTime())) {
    throw new Error('Fecha y hora de inicio invalidas');
  }

  if (fechaInicio < new Date()) {
    throw new Error('No se pueden programar turnos en el pasado');
  }

  const turnoResult = await pool.query('SELECT * FROM turnos WHERE id = $1', [turnoId]);
  if (turnoResult.rowCount === 0) throw new Error('El turno no existe');

  const turno = turnoResult.rows[0];
  if (!ESTADOS_EDITABLES.includes(turno.estado)) {
    throw new Error(
      `No se puede editar un turno en estado "${turno.estado}".`,
    );
  }

  const pacienteResult = await pool.query('SELECT id FROM pacientes WHERE id = $1', [pacienteId]);
  if (pacienteResult.rowCount === 0) throw new Error('El paciente seleccionado no existe');

  const prestacionResult = await pool.query('SELECT id, duracion_minutos FROM prestaciones WHERE id = $1', [prestacionId]);
  if (prestacionResult.rowCount === 0) throw new Error('La prestacion seleccionada no existe');

  const duracionActual = turno.fecha_hora_inicio && turno.fecha_hora_fin
    ? Math.round((new Date(turno.fecha_hora_fin).getTime() - new Date(turno.fecha_hora_inicio).getTime()) / 60000)
    : null;
  const duracionPrestacion = Number(prestacionResult.rows[0].duracion_minutos) || null;
  const duracionFinal = validarDuracionTurno(duracionMinutos, duracionActual || duracionPrestacion);

  const profesionalFinalId = await normalizarProfesionalId(profesionalId || turno.profesional_id);
  const fechaFin = new Date(fechaInicio.getTime() + duracionFinal * 60000);
  await validarHorarioProfesional(profesionalFinalId, fechaInicio, fechaFin);

  const hayConflicto = await existeSolapamiento(fechaInicio, fechaFin, turnoId, profesionalFinalId);
  if (hayConflicto) throw new Error('El horario seleccionado no esta disponible');

  const query = `
    UPDATE turnos
    SET
      paciente_id = $1,
      prestacion_id = $2,
      profesional_id = $3,
      fecha_hora_inicio = $4,
      fecha_hora_fin = $5,
      observaciones = $6,
      updated_at = NOW()
    WHERE id = $7
    RETURNING *;
  `;

  const values = [pacienteId, prestacionId, profesionalFinalId, fechaInicio, fechaFin, observaciones, turnoId];
  const { rows } = await pool.query(query, values);
  return {
    ...rows[0],
    duracion_minutos: duracionFinal,
  };
}

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

async function confirmarSolicitudTurno(
  turnoId,
  {
    profesionalId,
    prestacionId = null,
    fechaHoraInicio,
    duracionMinutos,
    observaciones = null,
  },
) {
  await asegurarColumnasProfesionalTurnos();

  const turnoResult = await pool.query('SELECT * FROM turnos WHERE id = $1', [turnoId]);
  if (turnoResult.rowCount === 0) throw new Error('El turno no existe');

  const turno = turnoResult.rows[0];
  if (turno.estado !== 'solicitado') {
    throw new Error('Solo pueden confirmarse solicitudes en estado solicitado');
  }

  const fechaInicio = new Date(fechaHoraInicio);
  if (!esFechaValida(fechaInicio)) throw new Error('Fecha y hora de inicio invalidas');
  if (fechaInicio < new Date()) throw new Error('No se pueden confirmar turnos en el pasado');

  const prestacionFinalId = Number(prestacionId) || turno.prestacion_id;
  const prestacionResult = await pool.query('SELECT id, duracion_minutos FROM prestaciones WHERE id = $1', [prestacionFinalId]);
  if (!prestacionResult.rowCount) throw new Error('La prestacion seleccionada no existe');

  const duracionActual = turno.fecha_hora_inicio && turno.fecha_hora_fin
    ? Math.round((new Date(turno.fecha_hora_fin).getTime() - new Date(turno.fecha_hora_inicio).getTime()) / 60000)
    : null;
  const duracionFinal = validarDuracionTurno(duracionMinutos, duracionActual || prestacionResult.rows[0].duracion_minutos);
  const profesionalFinalId = await normalizarProfesionalId(profesionalId || turno.profesional_id);
  const fechaFin = new Date(fechaInicio.getTime() + duracionFinal * 60000);

  await validarHorarioProfesional(profesionalFinalId, fechaInicio, fechaFin);
  const hayConflicto = await existeSolapamiento(fechaInicio, fechaFin, turnoId, profesionalFinalId);
  if (hayConflicto) throw new Error('El horario seleccionado no esta disponible');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
        SET profesional_id = $2,
            prestacion_id = $3,
            fecha_hora_inicio = $4,
            fecha_hora_fin = $5,
            observaciones = COALESCE($6, observaciones),
            estado = 'confirmado',
            solicitud_confirmada_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND estado = 'solicitado'
        RETURNING *
      `,
      [turnoId, profesionalFinalId, prestacionFinalId, fechaInicio, fechaFin, observaciones],
    );
    if (!rows.length) throw new Error('La solicitud de turno ya no se encuentra pendiente');

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
      t.fecha_hora_inicio,
      t.fecha_hora_fin,
      t.estado,
      t.origen,
      t.observaciones,
      t.solicitud_preferencia,
      t.solicitud_confirmada_at,
      t.solicitud_rechazada_at,
      t.created_at,
      t.updated_at,
      p.nombre AS paciente_nombre,
      p.apellido AS paciente_apellido,
      p.dni AS paciente_dni,
      p.telefono AS paciente_telefono,
      pr.nombre AS prestacion_nombre,
      u.nombre AS profesional_nombre,
      u.email AS profesional_email
    FROM turnos t
    LEFT JOIN pacientes p ON p.id = t.paciente_id
    LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
    LEFT JOIN usuarios u ON u.id = t.profesional_id
    WHERE t.id = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [turnoId]);
  if (!rows.length) throw new Error('El turno no existe');

  const row = rows[0];
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
    created_at: row.created_at,
    updated_at: row.updated_at,
    paciente: {
      id: row.paciente_id,
      nombre: row.paciente_nombre,
      apellido: row.paciente_apellido,
      dni: row.paciente_dni,
      telefono: row.paciente_telefono,
    },
    prestacion: {
      id: row.prestacion_id,
      nombre: row.prestacion_nombre,
    },
    profesional: {
      id: row.profesional_id,
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
    where.push(`(
      t.fecha_hora_inicio >= $${idx}
      OR (
        t.estado = 'solicitado'
        AND t.fecha_hora_inicio IS NULL
        AND t.created_at >= $${idx}
      )
    )`);
    values.push(normalizarDesde(fechaDesde));
    idx++;
  }

  if (fechaHasta) {
    const hasta = normalizarHastaExclusiva(fechaHasta);
    if (/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(hasta)) {
      where.push(`(
        t.fecha_hora_inicio < ($${idx}::timestamp + INTERVAL '1 day')
        OR (
          t.estado = 'solicitado'
          AND t.fecha_hora_inicio IS NULL
          AND t.created_at < ($${idx}::timestamp + INTERVAL '1 day')
        )
      )`);
      values.push(hasta);
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
      t.fecha_hora_inicio,
      t.fecha_hora_fin,
      t.estado,
      t.origen,
      t.observaciones,
      t.solicitud_preferencia,
      t.solicitud_confirmada_at,
      t.solicitud_rechazada_at,
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
      u.nombre AS profesional_nombre,
      u.email AS profesional_email
    FROM turnos t
    LEFT JOIN pacientes p ON p.id = t.paciente_id
    LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
    LEFT JOIN usuarios u ON u.id = t.profesional_id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  values.push(limit, offset);
  const dataRes = await pool.query(dataQuery, values);

  return {
    total,
    page,
    limit,
    turnos: dataRes.rows.map((row) => ({
      id: row.id,
      fecha_hora_inicio: row.fecha_hora_inicio,
      fecha_hora_fin: row.fecha_hora_fin,
      estado: row.estado,
      origen: row.origen,
      observaciones: row.observaciones,
      solicitud_preferencia: row.solicitud_preferencia,
      solicitud_confirmada_at: row.solicitud_confirmada_at,
      solicitud_rechazada_at: row.solicitud_rechazada_at,
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
      prestacion: {
        id: row.prestacion_id,
        nombre: row.prestacion_nombre,
      },
      profesional: {
        id: row.profesional_id,
        nombre: row.profesional_nombre,
        email: row.profesional_email,
      },
    })),
  };
}

async function listarProfesionales() {
  const { rows } = await pool.query(`
    SELECT id, nombre, email
    FROM usuarios
    WHERE COALESCE(activo, true) = true
    ORDER BY nombre ASC, email ASC
  `);

  return rows;
}

async function consultarDisponibilidad({ profesionalId, fecha, prestacionId, turnoId = null, duracionMinutos = null }) {
  await asegurarColumnasProfesionalTurnos();
  await asegurarHorariosProfesionales();

  const profesionalFinalId = await normalizarProfesionalId(profesionalId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) {
    throw new Error('fecha invalida. Use formato YYYY-MM-DD');
  }

  const dia = new Date(`${fecha}T00:00:00`);
  if (!esFechaValida(dia)) throw new Error('fecha invalida');

  const prestacionResult = await pool.query(
    'SELECT id, duracion_minutos FROM prestaciones WHERE id = $1 AND COALESCE(activo, true) = true',
    [prestacionId],
  );
  if (!prestacionResult.rowCount) throw new Error('La prestacion seleccionada no existe o no esta activa');

  const duracion = Number(duracionMinutos) || Number(prestacionResult.rows[0].duracion_minutos);
  if (!Number.isFinite(duracion) || duracion < 15) {
    throw new Error('La prestacion no tiene una duracion valida');
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
      WHERE profesional_id = $1
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
  normalizarProfesionalId,
};


