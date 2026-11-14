const { pool } = require('../config/db');
const { resolverMensajeConfigurado } = require('../utils/whatsappMessageTemplate');
const { requireSchema } = require('./schemaValidationService');

let configReady = false;

const DIAS = [
  { key: 0, label: 'Domingo' },
  { key: 1, label: 'Lunes' },
  { key: 2, label: 'Martes' },
  { key: 3, label: 'Miercoles' },
  { key: 4, label: 'Jueves' },
  { key: 5, label: 'Viernes' },
  { key: 6, label: 'Sabado' },
];

const MENSAJES_DEFAULT = {
  principal_whatsapp:
    'Hola {paciente}, somos {consultorio}. Te escribimos por tu atención odontológica. 🦷',
  recordatorio_turno:
    '¡Hola, {paciente}! 😊 Te recordamos tu turno odontológico:\n\n📅 Fecha: {fecha}\n🕒 Hora: {hora}\n🦷 Profesional: {profesional}\n\nRespondé con una opción:\n1️⃣ Confirmar turno\n2️⃣ Cancelar turno\n3️⃣ Reprogramar turno\n\nTambién podés escribir "cancelar" para finalizar la conversación.',
  confirmacion_turno:
    '¡Perfecto, {paciente}! ✅ Tu turno quedó confirmado.\n\n📅 Fecha: {fecha}\n🕒 Hora: {hora}\n\n¡Te esperamos! 🦷✨',
  cancelacion_turno:
    'Tu solicitud de cancelacion fue registrada correctamente. El turno todavia no queda cancelado definitivamente. El consultorio revisara la solicitud y te enviara la confirmacion correspondiente.',
  reprogramacion_turno:
    'Recibimos tu solicitud de reprogramacion. El consultorio revisara la agenda y se comunicara con vos para coordinar un nuevo dia y horario.',
};

const MENSAJES_DEFAULT_ANTERIORES = {
  principal_whatsapp:
    'Hola {paciente}, somos {consultorio}. Te escribimos por tu atencion odontologica.',
  recordatorio_turno:
    'Hola {paciente}, te recordamos tu turno odontologico:\nFecha: {fecha}\nHora: {hora}\nPrestacion: {prestacion}\n\nResponde:\n1 para confirmar\n2 para cancelar\n3 para solicitar reprogramacion',
  confirmacion_turno:
    'Tu turno fue confirmado. Te esperamos el {fecha} a las {hora}. Gracias!',
  cancelacion_turno:
    'Tu turno fue cancelado. Gracias por avisarnos.',
  reprogramacion_turno:
    'Recibimos tu solicitud de reprogramacion. El consultorio se comunicara con vos.',
};

const MENSAJES_DEFAULT_ACTUALES = {
  principal_whatsapp:
    '👋 Hola {paciente}, somos {consultorio}. Te escribimos por tu atención odontológica. 🦷',
  recordatorio_turno:
    'Hola {paciente}, te recordamos tu turno de {prestacion} el {fecha} a las {hora}. Responde CONFIRMAR, CANCELAR o REPROGRAMAR.',
  confirmacion_turno:
    '✅ Hola {paciente}, tu turno de {prestacion} fue confirmado para el {fecha} a las {hora}. Te esperamos en {consultorio}.',
  cancelacion_turno:
    'Hola {paciente}, te informamos que tu turno de {prestacion} del {fecha} a las {hora} fue cancelado. Para coordinar uno nuevo, comunicate con {consultorio}.',
  reprogramacion_turno:
    'Hola {paciente}, tu turno de {prestacion} fue reprogramado para el {fecha} a las {hora}. Te esperamos en {consultorio}.',
  rechazo_solicitud_turno:
    'Hola {paciente}. Tu solicitud no pudo ser aceptada por {consultorio}. Si necesitás realizar una nueva gestión, podés volver a comunicarte con nosotros.',
};

const MENSAJES_DEFAULT_EVENTOS_PENDIENTES = {
  cancelacion_turno:
    '✅ Tu solicitud de cancelación fue registrada correctamente. El turno todavía no queda cancelado definitivamente. El consultorio revisará la solicitud y te enviará la confirmación correspondiente.',
  reprogramacion_turno:
    '✅ Recibimos tu solicitud de reprogramación. El consultorio revisará la agenda y se comunicará con vos para coordinar un nuevo día y horario.',
};

const AUTOGESTION_KEYWORDS_DEFAULT = 'turno, turnito, cita, consulta, odontologo, odontóloga, odontologia, odontología';

function defaultTimeRange() {
  return {
    hora_desde: '08:00',
    hora_hasta: '20:00',
  };
}

async function asegurarConfiguracion() {
  if (configReady) return;

  await requireSchema('configuracion', [
    'configuracion_consultorio.autogestion_keywords', 'configuracion_consultorio.timezone',
    'configuracion_horarios_atencion.dia_semana', 'configuracion_horarios_atencion.hora_desde',
    'configuracion_mensajes_automaticos.tipo', 'configuracion_mensajes_automaticos.contenido',
  ]);

  const consultorioRes = await pool.query('SELECT id FROM configuracion_consultorio LIMIT 1');
  if (!consultorioRes.rowCount) {
    await pool.query(
      `
        INSERT INTO configuracion_consultorio (nombre_consultorio, whatsapp_numero, timezone)
        VALUES ($1, $2, $3)
      `,
      ['Odonton', '', 'America/Argentina/Buenos_Aires'],
    );
  }

  for (const dia of DIAS) {
    const base = defaultTimeRange();
    await pool.query(
      `
        INSERT INTO configuracion_horarios_atencion (dia_semana, activo, hora_desde, hora_hasta)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (dia_semana) DO NOTHING
      `,
      [dia.key, dia.key >= 1 && dia.key <= 5, base.hora_desde, base.hora_hasta],
    );
  }

  for (const [tipo, contenido] of Object.entries(MENSAJES_DEFAULT_ACTUALES)) {
    await pool.query(
      `
        INSERT INTO configuracion_mensajes_automaticos (tipo, contenido, activo)
        VALUES ($1, $2, true)
        ON CONFLICT (tipo) DO NOTHING
      `,
      [tipo, contenido],
    );

    if (MENSAJES_DEFAULT_ANTERIORES[tipo]) {
      await pool.query(
        `
          UPDATE configuracion_mensajes_automaticos
          SET contenido = $1,
              updated_at = NOW()
          WHERE tipo = $2
            AND contenido IN ($3, $4, $5)
        `,
        [
          contenido,
          tipo,
          MENSAJES_DEFAULT_ANTERIORES[tipo],
          MENSAJES_DEFAULT[tipo],
          MENSAJES_DEFAULT_EVENTOS_PENDIENTES[tipo] || '',
        ],
      );
    }
  }

  configReady = true;
}

function normalizarTexto(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function validarHora(hora) {
  return /^\d{2}:\d{2}$/.test(String(hora || ''));
}

function timeToMinutes(hora) {
  const [h, m] = String(hora || '').split(':').map(Number);
  return h * 60 + m;
}

async function obtenerConfiguracion() {
  await asegurarConfiguracion();

  const [consultorioRes, horariosRes, mensajesRes] = await Promise.all([
    pool.query(`
      SELECT id, nombre_consultorio, whatsapp_numero, timezone, autogestion_keywords
      FROM configuracion_consultorio
      ORDER BY id ASC
      LIMIT 1
    `),
    pool.query(`
      SELECT id, dia_semana, activo, TO_CHAR(hora_desde, 'HH24:MI') AS hora_desde, TO_CHAR(hora_hasta, 'HH24:MI') AS hora_hasta
      FROM configuracion_horarios_atencion
      ORDER BY dia_semana ASC
    `),
    pool.query(`
      SELECT id, tipo, contenido, activo
      FROM configuracion_mensajes_automaticos
      ORDER BY CASE tipo
        WHEN 'principal_whatsapp' THEN 1
        WHEN 'recordatorio_turno' THEN 2
        WHEN 'confirmacion_turno' THEN 3
        WHEN 'cancelacion_turno' THEN 4
        WHEN 'reprogramacion_turno' THEN 5
        WHEN 'rechazo_solicitud_turno' THEN 6
        ELSE 99
      END, tipo ASC
    `),
  ]);

  const consultorio = consultorioRes.rows[0];

  return {
    consultorio,
    horarios: horariosRes.rows.map((row) => ({
      ...row,
      dia_label: DIAS.find((item) => item.key === row.dia_semana)?.label || `Dia ${row.dia_semana}`,
    })),
    mensajes: mensajesRes.rows,
  };
}

async function guardarConfiguracion({ consultorio = null, horarios = null, mensajes = null }) {
  await asegurarConfiguracion();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (consultorio) {
      const actualRes = await client.query('SELECT id FROM configuracion_consultorio ORDER BY id ASC LIMIT 1');
      const actualId = actualRes.rows[0].id;

      await client.query(
        `
          UPDATE configuracion_consultorio
          SET nombre_consultorio = $1,
              whatsapp_numero = $2,
              timezone = $3,
              autogestion_keywords = $4,
              updated_at = NOW()
          WHERE id = $5
        `,
        [
          normalizarTexto(consultorio.nombre_consultorio, 'Odonton'),
          normalizarTexto(consultorio.whatsapp_numero, ''),
          normalizarTexto(consultorio.timezone, 'America/Argentina/Buenos_Aires'),
          normalizarTexto(consultorio.autogestion_keywords, AUTOGESTION_KEYWORDS_DEFAULT),
          actualId,
        ],
      );
    }

    if (Array.isArray(horarios)) {
      for (const item of horarios) {
        const diaSemana = Number(item.dia_semana);
        const activo = Boolean(item.activo);
        const horaDesde = normalizarTexto(item.hora_desde);
        const horaHasta = normalizarTexto(item.hora_hasta);

        if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
          throw new Error('dia_semana invalido');
        }

        if (activo) {
          if (!validarHora(horaDesde) || !validarHora(horaHasta)) {
            throw new Error(`Horario invalido para dia ${diaSemana}`);
          }
          if (timeToMinutes(horaDesde) >= timeToMinutes(horaHasta)) {
            throw new Error(`Rango horario invalido para dia ${diaSemana}`);
          }
        }

        await client.query(
          `
            UPDATE configuracion_horarios_atencion
            SET activo = $1,
                hora_desde = $2,
                hora_hasta = $3,
                updated_at = NOW()
            WHERE dia_semana = $4
          `,
          [activo, activo ? horaDesde : null, activo ? horaHasta : null, diaSemana],
        );
      }
    }

    if (Array.isArray(mensajes)) {
      for (const item of mensajes) {
        const tipo = normalizarTexto(item.tipo);
        const contenido = normalizarTexto(item.contenido);
        const activo = item.activo !== false;

        if (!tipo) throw new Error('tipo de mensaje requerido');
        if (!contenido) throw new Error(`contenido requerido para ${tipo}`);

        await client.query(
          `
            UPDATE configuracion_mensajes_automaticos
            SET contenido = $1,
                activo = $2,
                updated_at = NOW()
            WHERE tipo = $3
          `,
          [contenido, activo, tipo],
        );
      }
    }

    await client.query('COMMIT');
    return obtenerConfiguracion();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function obtenerHorarioParaFecha(fechaInicio) {
  await asegurarConfiguracion();
  const diaSemana = fechaInicio.getDay();
  const { rows } = await pool.query(
    `
      SELECT dia_semana, activo, TO_CHAR(hora_desde, 'HH24:MI') AS hora_desde, TO_CHAR(hora_hasta, 'HH24:MI') AS hora_hasta
      FROM configuracion_horarios_atencion
      WHERE dia_semana = $1
      LIMIT 1
    `,
    [diaSemana],
  );
  return rows[0] || null;
}

async function validarHorarioConfigurado(fechaInicio, fechaFin) {
  const horario = await obtenerHorarioParaFecha(fechaInicio);

  if (!horario || !horario.activo) {
    throw new Error('No hay atencion configurada para ese dia');
  }

  const inicioMinutos = fechaInicio.getHours() * 60 + fechaInicio.getMinutes();
  const finMinutos = fechaFin.getHours() * 60 + fechaFin.getMinutes();
  const desdeMinutos = timeToMinutes(horario.hora_desde);
  const hastaMinutos = timeToMinutes(horario.hora_hasta);

  if (inicioMinutos < desdeMinutos || finMinutos > hastaMinutos) {
    throw new Error(`Horario invalido. El horario de atencion es de ${horario.hora_desde} a ${horario.hora_hasta}`);
  }
}

async function obtenerMensajesMap() {
  await asegurarConfiguracion();
  const { rows } = await pool.query(
    `
      SELECT tipo, contenido, activo
      FROM configuracion_mensajes_automaticos
    `,
  );

  return rows.reduce((acc, row) => {
    acc[row.tipo] = row;
    return acc;
  }, {});
}

function formatearFechaHora(fechaIso, timezone = 'America/Argentina/Buenos_Aires') {
  const date = new Date(fechaIso);
  if (Number.isNaN(date.getTime())) {
    return { fecha: 's/d', hora: 's/d' };
  }

  const fecha = new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);

  const hora = new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return { fecha, hora };
}

async function renderizarMensajeAutomatico(tipo, payload = {}) {
  const config = await obtenerConfiguracion();
  const consultorio = config.consultorio || {};
  const inicio = payload?.turno?.fecha_hora_inicio || payload?.fecha_hora_inicio || null;
  const formato = formatearFechaHora(inicio, consultorio.timezone);
  const pacienteNombre = [payload?.turno?.paciente?.nombre, payload?.turno?.paciente?.apellido]
    .filter(Boolean)
    .join(' ')
    .trim();

  const context = {
    paciente: pacienteNombre || 'Paciente',
    prestacion: payload?.turno?.prestacion?.nombre || payload?.prestacion || 'prestacion',
    fecha: formato.fecha,
    hora: formato.hora,
    turno_id: payload?.turno?.id || payload?.turno_id || '',
    consultorio: consultorio.nombre_consultorio || 'Consultorio',
    whatsapp_consultorio: consultorio.whatsapp_numero || '',
    profesional: payload?.turno?.profesional?.nombre || payload?.profesional || '',
  };

  const resultado = resolverMensajeConfigurado({
    tipo,
    mensajes: config.mensajes,
    context,
  });

  if (resultado.estado === 'inexistente') {
    const error = new Error(`No existe configuracion para el mensaje automatico ${tipo}`);
    error.code = 'WHATSAPP_MESSAGE_TYPE_NOT_FOUND';
    throw error;
  }

  if (resultado.estado === 'invalido') {
    const error = new Error(
      `El mensaje ${tipo} usa placeholders no vigentes: ${resultado.placeholdersNoSoportados
        .map((placeholder) => `{${placeholder}}`)
        .join(', ')}`,
    );
    error.code = 'WHATSAPP_MESSAGE_TEMPLATE_INVALID';
    throw error;
  }

  return resultado.contenido;
}

module.exports = {
  obtenerConfiguracion,
  guardarConfiguracion,
  validarHorarioConfigurado,
  renderizarMensajeAutomatico,
  AUTOGESTION_KEYWORDS_DEFAULT,
};
