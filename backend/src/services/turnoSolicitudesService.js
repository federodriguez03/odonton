const { pool } = require('../config/db');
const { registrarAuditoria } = require('./auditoriaService');
const { crearPaciente } = require('./pacientesService');

let solicitudesReady = false;

const ESTADOS_TURNO_ACTIVO = [
  'programado',
  'confirmado',
  'reprogramado',
  'solicitado',
  'reprogramacion_solicitada',
  'cancelacion_solicitada',
];

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildObservacionSolicitud({ motivo = null, preferenciaHoraria = null, observaciones = null } = {}) {
  const textoObservaciones = String(observaciones || '').trim();
  const motivoTexto = String(motivo || '').trim();
  const preferenciaTexto = String(preferenciaHoraria || '').trim();

  if (textoObservaciones) {
    const normalizada = textoObservaciones.toLowerCase();
    const partes = [textoObservaciones];
    if (motivoTexto && !normalizada.includes(motivoTexto.toLowerCase()) && !normalizada.includes('motivo:')) {
      partes.push(`Motivo: ${motivoTexto}.`);
    }
    if (preferenciaTexto && !normalizada.includes(preferenciaTexto.toLowerCase()) && !normalizada.includes('preferencia:')) {
      partes.push(`Preferencia: ${preferenciaTexto}.`);
    }
    return partes.join(' ').replace(/\s+/g, ' ').trim();
  }

  const partes = ['Solicitud recibida por WhatsApp.'];
  if (motivoTexto) partes.push(`Motivo: ${motivoTexto}.`);
  if (preferenciaTexto) partes.push(`Preferencia: ${preferenciaTexto}.`);
  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

async function asegurarTablaTurnoSolicitudes() {
  if (solicitudesReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS turno_solicitudes (
      id BIGSERIAL PRIMARY KEY,
      tipo_solicitud VARCHAR(40) NOT NULL,
      estado VARCHAR(30) NOT NULL DEFAULT 'pendiente',
      paciente_id INTEGER NULL,
      nombre_apellido TEXT NULL,
      dni VARCHAR(20) NOT NULL,
      telefono VARCHAR(30) NOT NULL,
      motivo TEXT NULL,
      preferencia_horaria TEXT NULL,
      turno_id INTEGER NULL,
      observaciones TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS tipo_solicitud VARCHAR(40)`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS estado VARCHAR(30) DEFAULT 'pendiente'`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS paciente_id INTEGER NULL`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS nombre_apellido TEXT NULL`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS dni VARCHAR(20)`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS telefono VARCHAR(30)`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS motivo TEXT NULL`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS preferencia_horaria TEXT NULL`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS turno_id INTEGER NULL`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS observaciones TEXT NULL`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
  await pool.query(`ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  await pool.query(`ALTER TABLE turno_solicitudes ALTER COLUMN estado SET DEFAULT 'pendiente'`);
  await pool.query(`UPDATE turno_solicitudes SET estado = 'pendiente' WHERE estado IS NULL`);
  await pool.query(`UPDATE turno_solicitudes SET created_at = NOW() WHERE created_at IS NULL`);
  await pool.query(`UPDATE turno_solicitudes SET updated_at = NOW() WHERE updated_at IS NULL`);
  await pool.query(`ALTER TABLE turno_solicitudes ALTER COLUMN estado SET NOT NULL`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_turno_solicitudes_estado ON turno_solicitudes(estado)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_turno_solicitudes_paciente ON turno_solicitudes(paciente_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_turno_solicitudes_turno ON turno_solicitudes(turno_id)`);

  solicitudesReady = true;
}

async function crearSolicitudTurnoPendiente({
  tipoSolicitud,
  pacienteId = null,
  nombreApellido = null,
  dni,
  telefono,
  motivo = null,
  preferenciaHoraria = null,
  turnoId = null,
  observaciones = null,
  auditoria = {},
}) {
  await asegurarTablaTurnoSolicitudes();

  if (!tipoSolicitud) throw new Error('Tipo de solicitud obligatorio');
  if (!dni) throw new Error('DNI obligatorio');
  if (!telefono) throw new Error('Telefono obligatorio');

  const observacionesFinal = buildObservacionSolicitud({ motivo, preferenciaHoraria, observaciones });

  const { rows } = await pool.query(
    `
      INSERT INTO turno_solicitudes (
        tipo_solicitud,
        estado,
        paciente_id,
        nombre_apellido,
        dni,
        telefono,
        motivo,
        preferencia_horaria,
        turno_id,
        observaciones
      )
      VALUES ($1, 'pendiente', $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
    [tipoSolicitud, pacienteId, nombreApellido, dni, telefono, motivo, preferenciaHoraria, turnoId, observacionesFinal],
  );

  try {
    await registrarAuditoria({
      accion: 'TURNO_SOLICITUD_CREADA',
      recurso: 'turno_solicitudes',
      recursoId: rows[0].id,
      statusCode: 201,
      metadata: auditoria,
    });
  } catch (error) {
    console.warn('[TURNO SOLICITUDES] La auditoria fallo, pero la solicitud fue guardada:', error.message);
  }

  return rows[0];
}

async function obtenerSolicitudPendientePorTurno({ turnoId, tipoSolicitud }) {
  await asegurarTablaTurnoSolicitudes();

  if (!turnoId || !tipoSolicitud) return null;

  const { rows } = await pool.query(
    `
      SELECT *
      FROM turno_solicitudes
      WHERE turno_id = $1
        AND tipo_solicitud = $2
        AND estado = 'pendiente'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [turnoId, tipoSolicitud],
  );

  return rows[0] || null;
}

async function crearSolicitudPendienteSiNoExiste(payload = {}) {
  const existente = await obtenerSolicitudPendientePorTurno({
    turnoId: payload.turnoId,
    tipoSolicitud: payload.tipoSolicitud,
  });

  if (existente) {
    return { solicitud: existente, creada: false };
  }

  const solicitud = await crearSolicitudTurnoPendiente(payload);
  return { solicitud, creada: true };
}

async function pacienteTieneTurnoOSolicitudActiva({ pacienteId = null, dni = null, telefono = null } = {}) {
  await asegurarTablaTurnoSolicitudes();

  const dniNormalizado = normalizeDigits(dni);
  const telefonoNormalizado = normalizeDigits(telefono);

  const turnoParams = [ESTADOS_TURNO_ACTIVO];
  const turnoConditions = [`t.estado = ANY($1)`];

  if (pacienteId) {
    turnoParams.push(pacienteId);
    turnoConditions.push(`t.paciente_id = $${turnoParams.length}`);
  }
  if (dniNormalizado) {
    turnoParams.push(dniNormalizado);
    turnoConditions.push(`regexp_replace(COALESCE(p.dni, ''), '[^0-9]', '', 'g') = $${turnoParams.length}`);
  }
  if (telefonoNormalizado) {
    turnoParams.push(telefonoNormalizado);
    turnoConditions.push(`regexp_replace(COALESCE(p.telefono, ''), '[^0-9]', '', 'g') = $${turnoParams.length}`);
  }

  if (turnoConditions.length > 1) {
    const { rows } = await pool.query(
      `
        SELECT t.id, t.estado
        FROM turnos t
        LEFT JOIN pacientes p ON p.id = t.paciente_id
        WHERE ${turnoConditions[0]}
          AND (${turnoConditions.slice(1).join(' OR ')})
        ORDER BY t.fecha_hora_inicio NULLS LAST, t.id DESC
        LIMIT 1
      `,
      turnoParams,
    );
    if (rows[0]) return { activa: true, tipo: 'turno', registro: rows[0] };
  }

  const solicitudParams = [];
  const solicitudConditions = [`estado = 'pendiente'`];

  if (pacienteId) {
    solicitudParams.push(pacienteId);
    solicitudConditions.push(`paciente_id = $${solicitudParams.length}`);
  }
  if (dniNormalizado) {
    solicitudParams.push(dniNormalizado);
    solicitudConditions.push(`regexp_replace(COALESCE(dni, ''), '[^0-9]', '', 'g') = $${solicitudParams.length}`);
  }
  if (telefonoNormalizado) {
    solicitudParams.push(telefonoNormalizado);
    solicitudConditions.push(`regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = $${solicitudParams.length}`);
  }

  if (solicitudConditions.length > 1) {
    const { rows } = await pool.query(
      `
        SELECT id, tipo_solicitud, estado
        FROM turno_solicitudes
        WHERE ${solicitudConditions[0]}
          AND (${solicitudConditions.slice(1).join(' OR ')})
        ORDER BY created_at DESC
        LIMIT 1
      `,
      solicitudParams,
    );
    if (rows[0]) return { activa: true, tipo: 'solicitud', registro: rows[0] };
  }

  return { activa: false };
}

async function listarSolicitudesTurno({ estado = 'pendiente', tipoSolicitud = null, limit = 100 } = {}) {
  await asegurarTablaTurnoSolicitudes();

  const params = [];
  const conditions = [];

  if (estado) {
    params.push(estado);
    conditions.push(`ts.estado = $${params.length}`);
  }

  if (tipoSolicitud) {
    params.push(tipoSolicitud);
    conditions.push(`ts.tipo_solicitud = $${params.length}`);
  }

  params.push(Math.min(Number(limit) || 100, 200));

  const { rows } = await pool.query(
    `
      SELECT
        ts.*,
        p.nombre AS paciente_nombre,
        p.apellido AS paciente_apellido,
        t.fecha_hora_inicio AS turno_fecha_hora_inicio,
        t.estado AS turno_estado
      FROM turno_solicitudes ts
      LEFT JOIN pacientes p ON p.id = ts.paciente_id
      LEFT JOIN turnos t ON t.id = ts.turno_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY ts.created_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return rows;
}

function splitNombreApellido(value) {
  const parts = String(value || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!parts.length) return { nombre: 'Paciente', apellido: 'WhatsApp' };
  return {
    nombre: parts[0],
    apellido: parts.slice(1).join(' ') || 'WhatsApp',
  };
}

async function resolverPacienteSolicitud(solicitud) {
  if (solicitud.paciente_id) return solicitud.paciente_id;

  const dni = String(solicitud.dni || '').trim();
  if (!dni) return null;

  const existente = await pool.query('SELECT id FROM pacientes WHERE dni = $1 LIMIT 1', [dni]);
  if (existente.rows[0]?.id) return existente.rows[0].id;

  const { nombre, apellido } = splitNombreApellido(solicitud.nombre_apellido);
  try {
    const paciente = await crearPaciente({
      nombre,
      apellido,
      dni,
      telefono: solicitud.telefono,
      observaciones: 'Paciente creado automaticamente desde solicitud de WhatsApp',
    });
    return paciente.id;
  } catch (error) {
    if (String(error.message || '').includes('DNI')) {
      const retry = await pool.query('SELECT id FROM pacientes WHERE dni = $1 LIMIT 1', [dni]);
      return retry.rows[0]?.id || null;
    }
    throw error;
  }
}

async function sincronizarSolicitudesPendientesConTurnos() {
  await asegurarTablaTurnoSolicitudes();

  const { rows: solicitudes } = await pool.query(`
    SELECT *
    FROM turno_solicitudes
    WHERE estado = 'pendiente'
      AND tipo_solicitud IN ('nuevo_turno', 'primera_consulta')
      AND turno_id IS NULL
    ORDER BY created_at ASC
    LIMIT 50
  `);

  for (const solicitud of solicitudes) {
    try {
      const pacienteId = await resolverPacienteSolicitud(solicitud);
      if (!pacienteId) continue;

      const preferencia = [
        solicitud.motivo ? `Motivo: ${solicitud.motivo}` : null,
        solicitud.preferencia_horaria ? `Preferencia: ${solicitud.preferencia_horaria}` : null,
        solicitud.tipo_solicitud === 'primera_consulta' ? 'Tipo: primera consulta' : null,
      ].filter(Boolean).join('\n');
      const observaciones = buildObservacionSolicitud({
        motivo: solicitud.motivo,
        preferenciaHoraria: solicitud.preferencia_horaria,
        observaciones: solicitud.tipo_solicitud === 'primera_consulta' ? 'Solicitud recibida por WhatsApp. Tipo: primera consulta.' : null,
      });

      const inserted = await pool.query(
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
          VALUES ($1, NULL, NULL, NULL, NULL, 'solicitado', 'autogestion_whatsapp', $2, $3)
          RETURNING id
        `,
        [pacienteId, observaciones, preferencia],
      );

      await pool.query(
        `
          UPDATE turno_solicitudes
          SET paciente_id = $2,
              turno_id = $3,
              updated_at = NOW()
          WHERE id = $1
        `,
        [solicitud.id, pacienteId, inserted.rows[0].id],
      );
    } catch (error) {
      console.warn('[TURNO SOLICITUDES] No se pudo sincronizar una solicitud con turnos:', {
        solicitud_id: solicitud.id,
        error: error.message,
      });
    }
  }
}

module.exports = {
  asegurarTablaTurnoSolicitudes,
  crearSolicitudTurnoPendiente,
  crearSolicitudPendienteSiNoExiste,
  obtenerSolicitudPendientePorTurno,
  listarSolicitudesTurno,
  pacienteTieneTurnoOSolicitudActiva,
  buildObservacionSolicitud,
  sincronizarSolicitudesPendientesConTurnos,
};
