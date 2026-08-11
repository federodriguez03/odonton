const crypto = require('crypto');
const { pool } = require('../config/db');
const turnosService = require('./turnosService');
const { enviarMensajeWhatsapp } = require('./whatsappService');

let autogestionInitReady = false;

async function asegurarTablaAutogestionTokens() {
  if (autogestionInitReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS autogestion_tokens (
      id BIGSERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      telefono TEXT,
      tipo_flujo TEXT NOT NULL DEFAULT 'solicitar_turno',
      creado_por TEXT NOT NULL DEFAULT 'whatsapp',
      estado TEXT NOT NULL DEFAULT 'activo',
      usado_en_turno_id INTEGER,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE autogestion_tokens ADD COLUMN IF NOT EXISTS tipo_flujo TEXT NOT NULL DEFAULT 'solicitar_turno'`);

  autogestionInitReady = true;
}

function getTokenHours() {
  const hours = Number.parseInt(process.env.AUTOGESTION_TOKEN_HOURS || '2', 10);
  if (Number.isNaN(hours) || hours < 1) return 2;
  return hours;
}

function getAutogestionBaseUrl() {
  const base = String(process.env.AUTOGESTION_BASE_URL || 'http://localhost:5173/autogestion/solicitar-turno').trim();
  return base || 'http://localhost:5173/autogestion/solicitar-turno';
}

function getAutogestionCancelBaseUrl() {
  const base = String(process.env.AUTOGESTION_CANCEL_BASE_URL || 'http://localhost:5173/autogestion/cancelar-turno').trim();
  return base || 'http://localhost:5173/autogestion/cancelar-turno';
}

function getCancelMinHours() {
  const hours = Number.parseInt(process.env.AUTOGESTION_CANCEL_MIN_HOURS || '24', 10);
  if (Number.isNaN(hours) || hours < 0) return 24;
  return hours;
}

function getReprogramMinHours() {
  const hours = Number.parseInt(process.env.AUTOGESTION_REPROGRAM_MIN_HOURS || '24', 10);
  if (Number.isNaN(hours) || hours < 0) return 24;
  return hours;
}

function validarDni(dni) {
  const raw = String(dni || '').replace(/\D/g, '');
  if (!/^\d{7,10}$/.test(raw)) {
    throw new Error('DNI invalido. Debe contener entre 7 y 10 digitos');
  }
  return raw;
}

function construirLinkToken(token) {
  const base = getAutogestionBaseUrl();
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

function construirLinkTokenCancelacion(token) {
  const base = getAutogestionCancelBaseUrl();
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

async function generarTokenAutogestion({ telefono = null, creadoPor = 'whatsapp', tipoFlujo = 'solicitar_turno' } = {}) {
  await asegurarTablaAutogestionTokens();

  const token = crypto.randomBytes(24).toString('hex');
  const hours = getTokenHours();

  const query = `
    INSERT INTO autogestion_tokens (token, telefono, tipo_flujo, creado_por, estado, expires_at)
    VALUES ($1, $2, $3, $4, 'activo', NOW() + ($5::text || ' hours')::INTERVAL)
    RETURNING token, telefono, tipo_flujo, estado, expires_at
  `;

  const { rows } = await pool.query(query, [token, telefono, tipoFlujo, creadoPor, hours]);
  const row = rows[0];
  const link = row.tipo_flujo === 'cancelar_turno'
    ? construirLinkTokenCancelacion(row.token)
    : construirLinkToken(row.token);

  return {
    token: row.token,
    telefono: row.telefono,
    tipo_flujo: row.tipo_flujo,
    estado: row.estado,
    expires_at: row.expires_at,
    link,
  };
}

async function enviarLinkAutogestionPorWhatsapp({ telefono, link }) {
  if (!telefono) {
    return { intentado: false, enviado: false, advertencia: 'Telefono no informado' };
  }
  return enviarMensajeWhatsapp({
    telefono,
    tipo: 'autogestion_link_turno',
    mensaje: `Para solicitar tu turno ingresa al enlace seguro: ${link}`,
  });
}

async function obtenerTokenAutogestion(token) {
  await asegurarTablaAutogestionTokens();

  const { rows } = await pool.query(
    `
      SELECT id, token, telefono, tipo_flujo, estado, usado_en_turno_id, expires_at, used_at, created_at
      FROM autogestion_tokens
      WHERE token = $1
      LIMIT 1
    `,
    [token],
  );
  return rows[0] || null;
}

async function validarTokenAutogestion(token) {
  const data = await obtenerTokenAutogestion(token);
  if (!data) throw new Error('Token invalido');
  if (data.estado !== 'activo') throw new Error('Token no disponible');
  if (data.used_at) throw new Error('Token ya utilizado');
  if (new Date(data.expires_at) <= new Date()) throw new Error('Token vencido');
  return data;
}

async function validarTokenAutogestionPorFlujo(token, tipoFlujoEsperado) {
  const data = await validarTokenAutogestion(token);
  if (String(data.tipo_flujo || 'solicitar_turno') !== tipoFlujoEsperado) {
    throw new Error('Token no corresponde al flujo solicitado');
  }
  return data;
}

async function marcarTokenComoUsado(token, turnoId) {
  await asegurarTablaAutogestionTokens();
  await pool.query(
    `
      UPDATE autogestion_tokens
      SET
        estado = 'usado',
        usado_en_turno_id = $1,
        used_at = NOW(),
        updated_at = NOW()
      WHERE token = $2
    `,
    [turnoId, token],
  );
}

async function buscarPacientePorDni(dni) {
  const { rows } = await pool.query(
    `
      SELECT id, nombre, apellido, dni, telefono, email
      FROM pacientes
      WHERE dni = $1
      LIMIT 1
    `,
    [dni],
  );
  return rows[0] || null;
}

async function crearPacienteMinimo({ dni, nombre, apellido = null, telefono }) {
  const nombreFinal = String(nombre || '').trim();
  if (!nombreFinal) throw new Error('Debe ingresar nombre si el paciente no existe');
  const telefonoFinal = String(telefono || '').trim();
  if (!telefonoFinal) throw new Error('Debe ingresar telefono si el paciente no existe');

  const apellidoFinal = String(apellido || '').trim() || 'No informado';

  const query = `
    INSERT INTO pacientes (nombre, apellido, dni, telefono, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING id, nombre, apellido, dni, telefono
  `;

  const { rows } = await pool.query(query, [nombreFinal, apellidoFinal, dni, telefonoFinal]);
  return rows[0];
}

async function actualizarTelefonoPacienteSiCorresponde(pacienteId, telefono) {
  const tel = String(telefono || '').trim();
  if (!tel) return;
  await pool.query(
    `
      UPDATE pacientes
      SET telefono = $1, updated_at = NOW()
      WHERE id = $2
    `,
    [tel, pacienteId],
  );
}

async function resolverPacientePorDni({ dni, nombre = null, apellido = null, telefono = null }) {
  const dniValido = validarDni(dni);
  const existente = await buscarPacientePorDni(dniValido);
  if (existente) {
    await actualizarTelefonoPacienteSiCorresponde(existente.id, telefono);
    return {
      ...existente,
      telefono: String(telefono || existente.telefono || '').trim() || null,
      existe_previamente: true,
    };
  }

  const nuevo = await crearPacienteMinimo({
    dni: dniValido,
    nombre,
    apellido,
    telefono,
  });

  return {
    ...nuevo,
    existe_previamente: false,
  };
}

async function consultarDisponibilidadAutogestion({ token, fechaDesde = null, fechaHasta = null }) {
  await validarTokenAutogestion(token);

  const desde = fechaDesde ? new Date(fechaDesde) : new Date();
  if (Number.isNaN(desde.getTime())) throw new Error('fechaDesde invalida');

  const hasta = fechaHasta ? new Date(fechaHasta) : new Date(desde.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(hasta.getTime())) throw new Error('fechaHasta invalida');
  if (hasta <= desde) throw new Error('fechaHasta debe ser mayor a fechaDesde');

  const turnosRes = await pool.query(
    `
      SELECT fecha_hora_inicio, fecha_hora_fin, estado
      FROM turnos
      WHERE
        fecha_hora_inicio >= $1
        AND fecha_hora_inicio <= $2
        AND estado IN ('programado', 'confirmado', 'reprogramado')
      ORDER BY fecha_hora_inicio ASC
    `,
    [desde, hasta],
  );

  const prestacionesRes = await pool.query(
    `
      SELECT id, nombre, duracion_minutos, precio_base
      FROM prestaciones
      ORDER BY nombre ASC
    `,
  );

  return {
    fecha_desde: desde.toISOString(),
    fecha_hasta: hasta.toISOString(),
    horario_atencion: {
      desde: Number(process.env.WORKDAY_START_HOUR || 8),
      hasta: Number(process.env.WORKDAY_END_HOUR || 20),
    },
    ocupados: turnosRes.rows,
    prestaciones: prestacionesRes.rows,
  };
}

async function confirmarSolicitudTurnoAutogestion({
  token,
  dni,
  nombre = null,
  apellido = null,
  telefono = null,
  prestacionId = null,
  fechaHoraInicio,
  observaciones = null,
}) {
  const tokenData = await validarTokenAutogestionPorFlujo(token, 'solicitar_turno');
  const paciente = await resolverPacientePorDni({ dni, nombre, apellido, telefono: telefono || tokenData.telefono });

  let preferencia = observaciones || '';
  if (fechaHoraInicio) {
    const inicio = new Date(fechaHoraInicio);
    if (Number.isNaN(inicio.getTime())) throw new Error('Fecha y hora de inicio invalidas');
    preferencia = [preferencia, `Preferencia indicada: ${inicio.toLocaleString('es-AR')}`].filter(Boolean).join('\n');
  }

  const turnoSolicitado = await turnosService.crearSolicitudTurno({
    pacienteId: paciente.id,
    prestacionId,
    origen: 'autogestion',
    observaciones: preferencia || 'Solicitud generada por autogestion',
    preferencia: preferencia || null,
  });

  const turnoDetalle = await turnosService.obtenerTurnoDetalle(turnoSolicitado.id);

  await marcarTokenComoUsado(token, turnoSolicitado.id);

  const prestacionNombre = turnoDetalle?.prestacion?.nombre || 'el motivo indicado';
  const waResult = await enviarMensajeWhatsapp({
    telefono: paciente.telefono,
    tipo: 'autogestion_solicitud_turno',
    mensaje: `Recibimos tu solicitud de turno para ${prestacionNombre}. El consultorio revisara la disponibilidad y te confirmara el dia y horario por WhatsApp.`,
  });

  return {
    mensaje: 'Solicitud de turno registrada correctamente',
    turno: turnoDetalle,
    paciente,
    token: {
      estado: 'usado',
      used_at: new Date().toISOString(),
    },
    notificacion: {
      intentado: waResult.intentado,
      enviado: waResult.enviado,
      advertencia: waResult.advertencia || null,
    },
  };
}

async function generarTokenCancelacionAutogestion({ telefono = null, creadoPor = 'whatsapp' } = {}) {
  return generarTokenAutogestion({
    telefono,
    creadoPor,
    tipoFlujo: 'cancelar_turno',
  });
}

async function generarTokenReprogramacionAutogestion({ telefono = null, creadoPor = 'whatsapp' } = {}) {
  return generarTokenAutogestion({
    telefono,
    creadoPor,
    tipoFlujo: 'reprogramar_turno',
  });
}

async function enviarLinkCancelacionPorWhatsapp({ telefono, link }) {
  if (!telefono) {
    return { intentado: false, enviado: false, advertencia: 'Telefono no informado' };
  }
  return enviarMensajeWhatsapp({
    telefono,
    tipo: 'autogestion_link_cancelacion_turno',
    mensaje: `Para cancelar tu turno ingresa al enlace seguro: ${link}`,
  });
}

async function enviarLinkReprogramacionPorWhatsapp({ telefono, link }) {
  if (!telefono) {
    return { intentado: false, enviado: false, advertencia: 'Telefono no informado' };
  }
  return enviarMensajeWhatsapp({
    telefono,
    tipo: 'autogestion_link_reprogramacion_turno',
    mensaje: `Para reprogramar tu turno ingresa al enlace seguro: ${link}`,
  });
}

async function listarTurnosCancelablesAutogestion({ token, dni }) {
  await validarTokenAutogestionPorFlujo(token, 'cancelar_turno');
  const dniValido = validarDni(dni);

  const paciente = await buscarPacientePorDni(dniValido);
  if (!paciente) {
    return {
      paciente: null,
      turnos: [],
      min_anticipacion_horas: getCancelMinHours(),
      mensaje: 'No se encontro paciente para el DNI informado',
    };
  }

  const minHours = getCancelMinHours();
  const { rows } = await pool.query(
    `
      SELECT
        t.id,
        t.fecha_hora_inicio,
        t.fecha_hora_fin,
        t.estado,
        t.observaciones,
        p.id AS prestacion_id,
        p.nombre AS prestacion_nombre
      FROM turnos t
      LEFT JOIN prestaciones p ON p.id = t.prestacion_id
      WHERE
        t.paciente_id = $1
        AND t.estado = 'confirmado'
        AND t.fecha_hora_inicio >= NOW() + ($2::text || ' hours')::INTERVAL
      ORDER BY t.fecha_hora_inicio ASC
    `,
    [paciente.id, minHours],
  );

  return {
    paciente: {
      id: paciente.id,
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      telefono: paciente.telefono,
    },
    turnos: rows.map((r) => ({
      id: r.id,
      fecha_hora_inicio: r.fecha_hora_inicio,
      fecha_hora_fin: r.fecha_hora_fin,
      estado: r.estado,
      observaciones: r.observaciones,
      prestacion: {
        id: r.prestacion_id,
        nombre: r.prestacion_nombre,
      },
    })),
    min_anticipacion_horas: minHours,
    mensaje: rows.length ? null : 'El paciente no tiene turnos futuros cancelables',
  };
}

async function cancelarTurnoPropioAutogestion({ token, dni, turnoId, confirmar }) {
  if (!turnoId) throw new Error('turnoId es obligatorio');
  if (confirmar !== true) throw new Error('Debe confirmar explicitamente la cancelacion');

  const tokenData = await validarTokenAutogestionPorFlujo(token, 'cancelar_turno');
  const dniValido = validarDni(dni);
  const paciente = await buscarPacientePorDni(dniValido);
  if (!paciente) throw new Error('Paciente no encontrado');

  const turnoSync = await turnosService.obtenerTurnoDetalle(turnoId);
  if (!turnoSync) throw new Error('Turno no encontrado');
  if (Number(turnoSync.paciente?.id) !== Number(paciente.id)) {
    throw new Error('El turno seleccionado no pertenece al paciente');
  }
  if (turnoSync.estado !== 'confirmado') {
    throw new Error('Solo pueden cancelarse turnos en estado confirmado');
  }

  const fechaInicio = new Date(turnoSync.fecha_hora_inicio);
  if (Number.isNaN(fechaInicio.getTime()) || fechaInicio <= new Date()) {
    throw new Error('Solo pueden cancelarse turnos futuros');
  }

  const minHours = getCancelMinHours();
  const limite = new Date(Date.now() + minHours * 60 * 60 * 1000);
  if (fechaInicio < limite) {
    throw new Error(`La cancelacion requiere una anticipacion minima de ${minHours} horas`);
  }

  const cancelado = await turnosService.cancelarTurno(turnoId);
  const canceladoDetalle = await turnosService.obtenerTurnoDetalle(cancelado.id);

  await marcarTokenComoUsado(tokenData.token, cancelado.id);

  const inicioTexto = new Date(canceladoDetalle.fecha_hora_inicio).toLocaleString('es-AR');
  const prestacion = canceladoDetalle?.prestacion?.nombre || 'Prestacion';
  const waResult = await enviarMensajeWhatsapp({
    telefono: paciente.telefono || tokenData.telefono,
    tipo: 'autogestion_confirmacion_cancelacion_turno',
    mensaje: `Tu turno #${canceladoDetalle.id} fue cancelado. ${prestacion} - ${inicioTexto}.`,
  });

  return {
    mensaje: 'Turno cancelado correctamente',
    turno: canceladoDetalle,
    paciente: {
      id: paciente.id,
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      telefono: paciente.telefono,
    },
    min_anticipacion_horas: minHours,
    notificacion: {
      intentado: waResult.intentado,
      enviado: waResult.enviado,
      advertencia: waResult.advertencia || null,
    },
  };
}

async function listarTurnosReprogramablesAutogestion({ token, dni }) {
  await validarTokenAutogestionPorFlujo(token, 'reprogramar_turno');
  const dniValido = validarDni(dni);

  const paciente = await buscarPacientePorDni(dniValido);
  if (!paciente) {
    return {
      paciente: null,
      turnos: [],
      min_anticipacion_horas: getReprogramMinHours(),
      mensaje: 'No se encontro paciente para el DNI informado',
    };
  }

  const minHours = getReprogramMinHours();
  const { rows } = await pool.query(
    `
      SELECT
        t.id,
        t.fecha_hora_inicio,
        t.fecha_hora_fin,
        t.estado,
        t.observaciones,
        t.prestacion_id,
        p.nombre AS prestacion_nombre
      FROM turnos t
      LEFT JOIN prestaciones p ON p.id = t.prestacion_id
      WHERE
        t.paciente_id = $1
        AND t.estado = 'confirmado'
        AND t.fecha_hora_inicio >= NOW() + ($2::text || ' hours')::INTERVAL
      ORDER BY t.fecha_hora_inicio ASC
    `,
    [paciente.id, minHours],
  );

  return {
    paciente: {
      id: paciente.id,
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      telefono: paciente.telefono,
    },
    turnos: rows.map((r) => ({
      id: r.id,
      fecha_hora_inicio: r.fecha_hora_inicio,
      fecha_hora_fin: r.fecha_hora_fin,
      estado: r.estado,
      observaciones: r.observaciones,
      prestacion: {
        id: r.prestacion_id,
        nombre: r.prestacion_nombre,
      },
    })),
    min_anticipacion_horas: minHours,
    mensaje: rows.length ? null : 'El paciente no tiene turnos futuros reprogramables',
  };
}

async function consultarDisponibilidadReprogramacionAutogestion({
  token,
  dni,
  turnoId,
  fechaDesde = null,
  fechaHasta = null,
}) {
  await validarTokenAutogestionPorFlujo(token, 'reprogramar_turno');
  const dniValido = validarDni(dni);
  if (!turnoId) throw new Error('turnoId es obligatorio');

  const paciente = await buscarPacientePorDni(dniValido);
  if (!paciente) throw new Error('Paciente no encontrado');

  const turno = await turnosService.obtenerTurnoDetalle(turnoId);
  if (!turno) throw new Error('Turno no encontrado');
  if (Number(turno.paciente?.id) !== Number(paciente.id)) {
    throw new Error('El turno seleccionado no pertenece al paciente');
  }
  if (turno.estado !== 'confirmado') {
    throw new Error('Solo pueden reprogramarse turnos en estado confirmado');
  }

  const minHours = getReprogramMinHours();
  const limite = new Date(Date.now() + minHours * 60 * 60 * 1000);
  const inicioOriginal = new Date(turno.fecha_hora_inicio);
  if (inicioOriginal < limite) {
    throw new Error(`La reprogramacion requiere una anticipacion minima de ${minHours} horas`);
  }

  const desde = fechaDesde ? new Date(fechaDesde) : new Date();
  if (Number.isNaN(desde.getTime())) throw new Error('fechaDesde invalida');

  const hasta = fechaHasta ? new Date(fechaHasta) : new Date(desde.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(hasta.getTime())) throw new Error('fechaHasta invalida');
  if (hasta <= desde) throw new Error('fechaHasta debe ser mayor a fechaDesde');

  const turnosRes = await pool.query(
    `
      SELECT fecha_hora_inicio, fecha_hora_fin, estado
      FROM turnos
      WHERE
        fecha_hora_inicio >= $1
        AND fecha_hora_inicio <= $2
        AND estado IN ('programado', 'confirmado', 'reprogramado')
        AND id <> $3
      ORDER BY fecha_hora_inicio ASC
    `,
    [desde, hasta, turnoId],
  );

  return {
    turno_original: {
      id: turno.id,
      fecha_hora_inicio: turno.fecha_hora_inicio,
      fecha_hora_fin: turno.fecha_hora_fin,
      prestacion: turno.prestacion,
    },
    fecha_desde: desde.toISOString(),
    fecha_hasta: hasta.toISOString(),
    horario_atencion: {
      desde: Number(process.env.WORKDAY_START_HOUR || 8),
      hasta: Number(process.env.WORKDAY_END_HOUR || 20),
    },
    ocupados: turnosRes.rows,
    min_anticipacion_horas: minHours,
  };
}

async function reprogramarTurnoPropioAutogestion({
  token,
  dni,
  turnoId,
  fechaHoraInicioNueva,
  confirmar,
}) {
  if (!turnoId) throw new Error('turnoId es obligatorio');
  if (!fechaHoraInicioNueva) throw new Error('fechaHoraInicioNueva es obligatoria');
  if (confirmar !== true) throw new Error('Debe confirmar explicitamente la reprogramacion');

  const tokenData = await validarTokenAutogestionPorFlujo(token, 'reprogramar_turno');
  const dniValido = validarDni(dni);
  const paciente = await buscarPacientePorDni(dniValido);
  if (!paciente) throw new Error('Paciente no encontrado');

  const turnoSync = await turnosService.obtenerTurnoDetalle(turnoId);
  if (!turnoSync) throw new Error('Turno no encontrado');
  if (Number(turnoSync.paciente?.id) !== Number(paciente.id)) {
    throw new Error('El turno seleccionado no pertenece al paciente');
  }
  if (turnoSync.estado !== 'confirmado') {
    throw new Error('Solo pueden reprogramarse turnos en estado confirmado');
  }

  const inicioOriginal = new Date(turnoSync.fecha_hora_inicio);
  const now = new Date();
  if (Number.isNaN(inicioOriginal.getTime()) || inicioOriginal <= now) {
    throw new Error('Solo pueden reprogramarse turnos futuros');
  }

  const minHours = getReprogramMinHours();
  const limite = new Date(now.getTime() + minHours * 60 * 60 * 1000);
  if (inicioOriginal < limite) {
    throw new Error(`La reprogramacion requiere una anticipacion minima de ${minHours} horas`);
  }

  const nuevoInicio = new Date(fechaHoraInicioNueva);
  if (Number.isNaN(nuevoInicio.getTime())) throw new Error('Fecha y hora nueva invalida');

  const finOriginal = new Date(turnoSync.fecha_hora_fin);
  const duracionMin = Math.max(15, Math.round((finOriginal.getTime() - inicioOriginal.getTime()) / 60000));
  const nuevoFin = new Date(nuevoInicio.getTime() + duracionMin * 60000);

  const reprogramado = await turnosService.reprogramarTurno(turnoId, nuevoInicio, nuevoFin);
  const reprogramadoDetalle = await turnosService.obtenerTurnoDetalle(reprogramado.id);

  await marcarTokenComoUsado(tokenData.token, reprogramado.id);

  const inicioTexto = new Date(reprogramadoDetalle.fecha_hora_inicio).toLocaleString('es-AR');
  const prestacion = reprogramadoDetalle?.prestacion?.nombre || 'Prestacion';
  const waResult = await enviarMensajeWhatsapp({
    telefono: paciente.telefono || tokenData.telefono,
    tipo: 'autogestion_confirmacion_reprogramacion_turno',
    mensaje: `Tu turno #${reprogramadoDetalle.id} fue reprogramado. ${prestacion} - ${inicioTexto}.`,
  });

  return {
    mensaje: 'Turno reprogramado correctamente',
    turno: reprogramadoDetalle,
    paciente: {
      id: paciente.id,
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      telefono: paciente.telefono,
    },
    min_anticipacion_horas: minHours,
    notificacion: {
      intentado: waResult.intentado,
      enviado: waResult.enviado,
      advertencia: waResult.advertencia || null,
    },
  };
}

module.exports = {
  generarTokenAutogestion,
  enviarLinkAutogestionPorWhatsapp,
  validarTokenAutogestion,
  consultarDisponibilidadAutogestion,
  confirmarSolicitudTurnoAutogestion,
  generarTokenCancelacionAutogestion,
  enviarLinkCancelacionPorWhatsapp,
  listarTurnosCancelablesAutogestion,
  cancelarTurnoPropioAutogestion,
  generarTokenReprogramacionAutogestion,
  enviarLinkReprogramacionPorWhatsapp,
  listarTurnosReprogramablesAutogestion,
  consultarDisponibilidadReprogramacionAutogestion,
  reprogramarTurnoPropioAutogestion,
};
