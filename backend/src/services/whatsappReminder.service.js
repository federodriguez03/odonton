const { pool } = require('../config/db');
const {
  sendWhatsAppMessage,
  normalizePhoneDigits,
  normalizePhoneToChatId,
} = require('./whatsappClient.service');
const { registrarAuditoria } = require('./auditoriaService');
const { renderizarMensajeAutomatico } = require('./configuracionService');
const { abrirSolicitudCambioTurno } = require('./turnoSolicitudesService');

let schemaReady = false;

async function ensureWhatsAppReminderSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_reminders (
      id SERIAL PRIMARY KEY,
      appointment_id INTEGER NOT NULL,
      patient_id INTEGER,
      phone VARCHAR(30) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending_response',
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMP NULL,
      response_text TEXT NULL,
      channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`ALTER TABLE whatsapp_reminders ADD COLUMN IF NOT EXISTS channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp'`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_procesado_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_enviado_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_estado TEXT`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_error TEXT`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS respuesta_paciente TEXT`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS respuesta_paciente_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS profesional_id INTEGER`);

  schemaReady = true;
}

function isPhoneValid(phone) {
  try {
    const raw = String(phone || '').trim();
    if (raw.endsWith('@lid') || raw.endsWith('@c.us')) return true;
    return /^\d{10,15}$/.test(normalizePhoneDigits(phone));
  } catch (_) {
    return false;
  }
}

async function tableExists(tableName) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS name', [`public.${tableName}`]);
  return Boolean(rows[0]?.name);
}

async function findAutogestionPhoneForAppointment(turno) {
  if (!(await tableExists('whatsapp_conversations'))) return null;

  const { rows } = await pool.query(
    `
      SELECT phone
      FROM whatsapp_conversations
      WHERE (turno_id = $1 OR paciente_id = $2)
        AND COALESCE(TRIM(phone), '') <> ''
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
    [turno.id, turno.paciente_id],
  );

  return rows[0]?.phone || null;
}

async function resolveReminderPhone(turno) {
  const fichaPhone = String(turno?.paciente_telefono || '').trim();
  if (isPhoneValid(fichaPhone)) {
    return fichaPhone.endsWith('@lid') ? normalizePhoneToChatId(fichaPhone) : normalizePhoneDigits(fichaPhone);
  }

  const autogestionPhone = await findAutogestionPhoneForAppointment(turno);
  if (!isPhoneValid(autogestionPhone)) return null;

  const resolved = String(autogestionPhone || '').trim().endsWith('@lid')
    ? normalizePhoneToChatId(autogestionPhone)
    : normalizePhoneDigits(autogestionPhone);

  if (/^\d{10,15}$/.test(resolved)) {
    await pool.query(
      `
        UPDATE pacientes
        SET telefono = $1, updated_at = NOW()
        WHERE id = $2
          AND COALESCE(TRIM(telefono), '') = ''
      `,
      [resolved, turno.paciente_id],
    );
  }

  return resolved;
}

function formatFechaHora(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { fecha: 's/d', hora: 's/d' };
  return {
    fecha: date.toLocaleDateString('es-AR'),
    hora: date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
  };
}

function buildPatientName(source = {}) {
  return [source.paciente_nombre, source.paciente_apellido].filter(Boolean).join(' ').trim() || 'Paciente';
}

function buildFriendlyInvalidReply() {
  return 'No pude entender tu respuesta 😕\n\nPor favor, respondé con una de estas opciones:\n\n1️⃣ Confirmar turno\n2️⃣ Cancelar turno\n3️⃣ Reprogramar turno\n\nO escribí "cancelar" para finalizar la conversación.';
}

function buildConversationCancelledReply() {
  return 'Listo, cancelé esta conversación ✅\n\nPodés escribirnos nuevamente cuando quieras.';
}

function buildNoPendingReminderReply() {
  return 'No encontré un turno pendiente asociado a este número.\n\nSi necesitás sacar un turno, escribí "turno".';
}

function buildInactiveAppointmentReply() {
  return 'Este turno ya no está disponible para responder por WhatsApp.\n\nSi necesitás ayuda, comunicate con el consultorio. 🦷';
}

function isConversationCancelCommand(body) {
  const text = String(body || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ['0', 'salir', 'terminar', 'cancelar conversacion'].includes(text);
}

function buildFriendlyInvalidReplyV2() {
  return '⚠️ No pude entender tu respuesta.\n\nPor favor, respondé con una de estas opciones:\n\n✅ CONFIRMAR\n❌ CANCELAR\n📅 REPROGRAMAR\n\nO escribí "0", "salir" o "terminar" para finalizar la conversación.';
}

function buildConversationCancelledReplyV2() {
  return '✅ Listo, cancelé esta conversación.\n\nPodés escribirnos nuevamente cuando quieras.';
}

function buildNoPendingReminderReplyV2() {
  return '⚠️ No encontré un turno pendiente asociado a este número.\n\nPara iniciar una gestión, escribí 1 para sacar turno, 2 para reprogramar o 3 para cancelar.';
}

function buildInactiveAppointmentReplyV2() {
  return '⚠️ Este turno ya no está disponible para responder por WhatsApp.\n\nSi necesitás ayuda, comunicate con el consultorio. 🦷';
}

function buildCourtesyReply() {
  return '😊 ¡Gracias a vos! Ante cualquier consulta, escribinos nuevamente por este medio.';
}

function isCourtesyMessage(body) {
  const text = String(body || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return [
    'gracias',
    'muchas gracias',
    'ok',
    'okay',
    'dale',
    'listo',
    'perfecto',
    'genial',
    'barbaro',
    'bueno',
    'joya',
  ].includes(text);
}

async function buildReminderMessage(turno) {
  return renderizarMensajeAutomatico('recordatorio_turno', {
    turno: {
      id: turno.id,
      fecha_hora_inicio: turno.fecha_hora_inicio,
      paciente: {
        id: turno.paciente_id,
        nombre: turno.paciente_nombre,
        apellido: turno.paciente_apellido,
      },
      prestacion: {
        id: turno.prestacion_id,
        nombre: turno.prestacion_nombre,
      },
      profesional: {
        id: turno.profesional_id,
        nombre: turno.profesional_nombre,
      },
    },
  });
}

async function getAppointment(appointmentId) {
  await ensureWhatsAppReminderSchema();
  const { rows } = await pool.query(
    `
      SELECT
        t.id,
        t.paciente_id,
        t.prestacion_id,
        COALESCE(t.profesional_perfil_id,t.profesional_id) AS profesional_id,
        t.fecha_hora_inicio,
        t.fecha_hora_fin,
        t.estado,
        t.recordatorio_habilitado,
        p.nombre AS paciente_nombre,
        p.apellido AS paciente_apellido,
        p.dni AS paciente_dni,
        p.telefono AS paciente_telefono,
        pr.nombre AS prestacion_nombre,
        COALESCE(pp.nombre_mostrado,u.nombre) AS profesional_nombre
      FROM turnos t
      JOIN pacientes p ON p.id = t.paciente_id
      LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
      LEFT JOIN usuarios u ON u.id = t.profesional_id
      LEFT JOIN profesionales pp ON pp.id=t.profesional_perfil_id
      WHERE t.id = $1
      LIMIT 1
    `,
    [appointmentId],
  );

  return rows[0] || null;
}

async function hasReminderForAppointment(appointmentId) {
  const { rows } = await pool.query(
    `
      SELECT id, status
      FROM whatsapp_reminders
      WHERE appointment_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [appointmentId],
  );
  return rows[0] || null;
}

/**
 * Envía un recordatorio respetando la habilitación y evitando duplicados salvo envío forzado.
 */
async function sendAppointmentReminder(appointmentId, { force = false, automatic = false } = {}) {
  await ensureWhatsAppReminderSchema();
  if (!appointmentId) throw new Error('appointmentId es obligatorio');

  const turno = await getAppointment(appointmentId);
  if (!turno) throw new Error('Turno no encontrado');
  if (!['programado', 'confirmado'].includes(turno.estado)) {
    throw new Error('Solo se envian recordatorios para turnos programados o confirmados');
  }
  if (new Date(turno.fecha_hora_inicio) <= new Date()) throw new Error('No se envian recordatorios para turnos vencidos');
  if (automatic && turno.recordatorio_habilitado !== true) {
    return {
      skipped: true,
      sent: false,
      appointment_id: appointmentId,
      reason: 'AUTOMATIC_REMINDER_DISABLED',
      mensaje: 'El recordatorio automatico esta deshabilitado para este turno',
    };
  }

  const existing = await hasReminderForAppointment(appointmentId);
  if (existing && !force) {
    return {
      skipped: true,
      appointment_id: appointmentId,
      reminder_id: existing.id,
      status: existing.status,
      mensaje: 'El turno ya tiene un recordatorio registrado',
    };
  }

  const message = await buildReminderMessage(turno);
  if (message === null) {
    return {
      skipped: true,
      sent: false,
      appointment_id: appointmentId,
      reason: 'MESSAGE_DISABLED',
      mensaje: 'El mensaje de recordatorio esta desactivado en Configuracion',
    };
  }

  const phone = await resolveReminderPhone(turno);
  if (!phone) throw new Error('El paciente no tiene un telefono valido');

  try {
    const sent = await sendWhatsAppMessage(phone, message);
    const { rows } = await pool.query(
      `
        INSERT INTO whatsapp_reminders (appointment_id, patient_id, phone, status, sent_at, channel)
        VALUES ($1, $2, $3, 'pending_response', NOW(), 'whatsapp')
        RETURNING *
      `,
      [turno.id, turno.paciente_id, phone],
    );

    await pool.query(
      `
        UPDATE turnos
        SET recordatorio_enviado_at = NOW(),
            recordatorio_procesado_at = NOW(),
            recordatorio_estado = 'enviado',
            recordatorio_error = NULL,
            updated_at = NOW()
        WHERE id = $1
      `,
      [turno.id],
    );

    await registrarAuditoria({
      accion: 'WHATSAPP_REMINDER_SENT',
      recurso: 'turnos',
      recursoId: turno.id,
      statusCode: 200,
      metadata: { phone, message_id: sent?.id?._serialized || sent?.id || null },
    });

    return {
      appointment_id: turno.id,
      reminder: rows[0],
      sent: true,
    };
  } catch (error) {
    await pool.query(
      `
        UPDATE turnos
        SET recordatorio_procesado_at = NOW(),
            recordatorio_estado = 'error',
            recordatorio_error = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [turno.id, error.message],
    );

    await registrarAuditoria({
      accion: 'WHATSAPP_REMINDER_ERROR',
      recurso: 'turnos',
      recursoId: turno.id,
      statusCode: 500,
      metadata: { phone: turno.paciente_telefono, error: error.message },
    });

    throw error;
  }
}

async function findPendingReminderByPhone(phone) {
  await ensureWhatsAppReminderSchema();
  const raw = String(phone || '').trim();
  const normalized = normalizePhoneDigits(phone);
  const exactChatId = raw.endsWith('@lid') || raw.endsWith('@c.us') ? raw : null;

  const { rows } = await pool.query(
    `
      SELECT
        wr.*,
        t.estado AS appointment_status,
        t.fecha_hora_inicio,
        t.paciente_id,
        t.prestacion_id,
        COALESCE(t.profesional_perfil_id,t.profesional_id) AS profesional_id,
        p.nombre AS paciente_nombre,
        p.apellido AS paciente_apellido,
        p.dni AS paciente_dni,
        p.telefono AS paciente_telefono,
        pr.nombre AS prestacion_nombre,
        COALESCE(pp.nombre_mostrado,u.nombre) AS profesional_nombre
      FROM whatsapp_reminders wr
      JOIN turnos t ON t.id = wr.appointment_id
      JOIN pacientes p ON p.id = t.paciente_id
      LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
      LEFT JOIN usuarios u ON u.id = t.profesional_id
      LEFT JOIN profesionales pp ON pp.id=t.profesional_perfil_id
      WHERE (
          regexp_replace(wr.phone, '[^0-9]', '', 'g') = $1
          OR ($2::text IS NOT NULL AND wr.phone = $2)
        )
        AND wr.status = 'pending_response'
      ORDER BY wr.sent_at DESC
      LIMIT 1
    `,
    [normalized, exactChatId],
  );

  return rows[0] || null;
}

async function hasPendingReminderForPhone(phone) {
  const reminder = await findPendingReminderByPhone(phone);
  return Boolean(reminder);
}

function parseReply(body) {
  const text = String(body || '').trim().toLowerCase();
  if (['1', 'confirmar', 'confirmo', 'confirmado', 'si', 'sí'].includes(text)) return 'confirmed';
  if (['2', 'cancelar', 'cancelar turno', 'cancelo turno', 'cancelado', 'no'].includes(text)) return 'cancelled';
  if (['3', 'reprogramar', 'cambiar', 'cambiar turno', 'reagendar'].includes(text)) return 'reschedule_requested';
  return null;
}

async function buildConfirmationReply(reminder) {
  return renderizarMensajeAutomatico('confirmacion_turno', {
    turno: {
      id: reminder.appointment_id,
      fecha_hora_inicio: reminder.fecha_hora_inicio,
      paciente: {
        id: reminder.paciente_id,
        nombre: reminder.paciente_nombre,
        apellido: reminder.paciente_apellido,
      },
      prestacion: {
        id: reminder.prestacion_id,
        nombre: reminder.prestacion_nombre,
      },
      profesional: {
        id: reminder.profesional_id,
        nombre: reminder.profesional_nombre,
      },
    },
  });
}

function buildCancellationRequestReply() {
  return '✅ Tu solicitud de cancelación fue registrada correctamente. El turno todavía no queda cancelado definitivamente. El consultorio revisará la solicitud y te enviará la confirmación correspondiente.';
}

function buildRescheduleRequestReply(reminder) {
  return `✅ Entendido, ${buildPatientName(reminder)}. Registramos tu solicitud de reprogramación. El consultorio revisará la agenda y se comunicará con vos para coordinar un nuevo día y horario.`;
}

async function registerAppointmentRequestFromReminder(reminder, tipoSolicitud, phone) {
  const { fecha, hora } = formatFechaHora(reminder.fecha_hora_inicio);
  const observaciones = tipoSolicitud === 'cancelacion'
    ? `Solicitud de cancelacion por WhatsApp. Turno actual: ${fecha} ${hora}`
    : `Solicitud de reprogramacion por WhatsApp. Turno actual: ${fecha} ${hora}`;

  return abrirSolicitudCambioTurno({
    tipoSolicitud,
    pacienteId: reminder.paciente_id,
    nombreApellido: buildPatientName(reminder),
    dni: reminder.paciente_dni || 'sin_dni',
    telefono: normalizePhoneDigits(phone),
    turnoId: reminder.appointment_id,
    observaciones,
    auditoria: {
      phone: normalizePhoneDigits(phone),
      reminder_id: reminder.id,
      appointment_id: reminder.appointment_id,
      tipo_solicitud: tipoSolicitud,
    },
  });
}

async function safeReply(phone, message) {
  try {
    await sendWhatsAppMessage(phone, message);
    return { sent: true, error: null };
  } catch (error) {
    console.warn('[WHATSAPP REMINDERS] No se pudo enviar respuesta automatica:', error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Persiste la respuesta y sus efectos antes de contestar por WhatsApp.
 */
async function processPatientReply(phone, body, { replyWhenNoPending = true } = {}) {
  await ensureWhatsAppReminderSchema();
  const text = String(body || '').trim();
  if (!text) return null;

  await registrarAuditoria({
    accion: 'WHATSAPP_REPLY_RECEIVED',
    recurso: 'whatsapp_reminders',
    metadata: { phone: normalizePhoneDigits(phone), body: text },
  });

  const reminder = await findPendingReminderByPhone(phone);
  if (!reminder) {
    if (isCourtesyMessage(text)) {
      const reply = replyWhenNoPending ? await safeReply(phone, buildCourtesyReply()) : null;
      return { ok: true, codigo: 'COURTESY', reply };
    }
    if (!replyWhenNoPending) {
      return { ok: false, codigo: 'NO_PENDING_REMINDER', reply: null };
    }
    const reply = await safeReply(phone, buildNoPendingReminderReplyV2());
    return { ok: false, codigo: 'NO_PENDING_REMINDER', reply };
  }

  if (isConversationCancelCommand(text)) {
    await pool.query(
      `
        UPDATE whatsapp_reminders
        SET status = 'conversation_cancelled',
            responded_at = NOW(),
            response_text = $2
        WHERE id = $1
      `,
      [reminder.id, text],
    );

    await registrarAuditoria({
      accion: 'WHATSAPP_REMINDER_CONVERSATION_CANCELLED',
      recurso: 'whatsapp_reminders',
      recursoId: reminder.id,
      statusCode: 200,
      metadata: { appointment_id: reminder.appointment_id, phone: normalizePhoneDigits(phone) },
    });

    const reply = await safeReply(phone, buildConversationCancelledReplyV2());
    return { ok: true, codigo: 'CONVERSATION_CANCELLED', reply };
  }

  if (isCourtesyMessage(text)) {
    const reply = await safeReply(phone, buildCourtesyReply());
    return { ok: true, codigo: 'COURTESY', reply };
  }

  if (!['programado', 'confirmado'].includes(reminder.appointment_status) || new Date(reminder.fecha_hora_inicio) <= new Date()) {
    await pool.query(
      `
        UPDATE whatsapp_reminders
        SET status = 'expired',
            responded_at = NOW(),
            response_text = $2
        WHERE id = $1
      `,
      [reminder.id, text],
    );
    const reply = await safeReply(phone, buildInactiveAppointmentReplyV2());
    return { ok: false, codigo: 'APPOINTMENT_NOT_ACTIVE', reply };
  }

  const action = parseReply(text);
  if (!action) {
    const reply = await safeReply(phone, buildFriendlyInvalidReplyV2());
    return { ok: false, codigo: 'INVALID_REPLY', reply };
  }

  let solicitudResult = null;
  if (action === 'cancelled') {
    solicitudResult = await registerAppointmentRequestFromReminder(reminder, 'cancelacion', phone);
  }
  if (action === 'reschedule_requested') {
    solicitudResult = await registerAppointmentRequestFromReminder(reminder, 'reprogramacion', phone);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let appointmentState = null;
    let auditAction = '';
    let replyMessage = '';

    if (action === 'confirmed') {
      appointmentState = 'confirmado';
      auditAction = 'APPOINTMENT_CONFIRMED_BY_WHATSAPP';
      replyMessage = await buildConfirmationReply(reminder);
    } else if (action === 'cancelled') {
      auditAction = 'APPOINTMENT_CANCELLATION_REQUESTED_BY_WHATSAPP';
      replyMessage = buildCancellationRequestReply();
    } else {
      auditAction = 'APPOINTMENT_RESCHEDULE_REQUESTED_BY_WHATSAPP';
      replyMessage = buildRescheduleRequestReply(reminder);
    }

    await client.query(
      `
        UPDATE turnos
        SET estado = COALESCE($2::varchar, estado),
            respuesta_paciente = $3,
            respuesta_paciente_at = NOW(),
            recordatorio_estado = 'respondido',
            updated_at = NOW()
        WHERE id = $1
      `,
      [reminder.appointment_id, appointmentState, action],
    );

    await client.query(
      `
        UPDATE whatsapp_reminders
        SET status = $2,
            responded_at = NOW(),
            response_text = $3
        WHERE id = $1
      `,
      [reminder.id, action, text],
    );

    await client.query('COMMIT');

    if (action === 'cancelled') {
      if (!solicitudResult.creada) {
        replyMessage = '⚠️ Tu solicitud de cancelación ya fue registrada. El turno todavía no queda cancelado definitivamente. El consultorio revisará la solicitud y te enviará la confirmación correspondiente.';
      }
    }

    if (action === 'reschedule_requested') {
      if (!solicitudResult.creada) {
        replyMessage = `⚠️ Entendido, ${buildPatientName(reminder)}. Tu solicitud de reprogramación ya estaba registrada. El consultorio revisará la agenda y se comunicará con vos para coordinar un nuevo día y horario.`;
      }
    }

    await registrarAuditoria({
      accion: auditAction,
      recurso: 'turnos',
      recursoId: reminder.appointment_id,
      statusCode: 200,
      metadata: { reminder_id: reminder.id, phone: normalizePhoneDigits(phone), response_text: text },
    });

    // La respuesta externa ocurre después del COMMIT para no revertir la persistencia.
    const reply = replyMessage === null
      ? { sent: false, error: null, skipped: true, reason: 'MESSAGE_DISABLED' }
      : await safeReply(phone, replyMessage);

    return {
      ok: true,
      appointment_id: reminder.appointment_id,
      reminder_id: reminder.id,
      action,
      reply,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function findUpcomingAppointmentsForReminders({ hours = 24, limit = 25 } = {}) {
  await ensureWhatsAppReminderSchema();
  const windowHours = Math.min(Math.max(Number(hours) || 24, 1), 24);
  const batchLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const { rows } = await pool.query(
    `
      SELECT t.id
      FROM turnos t
      JOIN pacientes p ON p.id = t.paciente_id
      LEFT JOIN whatsapp_reminders wr ON wr.appointment_id = t.id
      WHERE t.estado IN ('programado', 'confirmado')
        AND t.recordatorio_habilitado = TRUE
        AND t.fecha_hora_inicio > NOW()
        AND t.fecha_hora_inicio <= NOW() + ($1::text || ' hours')::INTERVAL
        AND t.recordatorio_enviado_at IS NULL
        AND COALESCE(TRIM(p.telefono), '') <> ''
        AND wr.id IS NULL
      ORDER BY t.fecha_hora_inicio ASC
      LIMIT $2
    `,
    [windowHours, batchLimit],
  );

  return rows;
}

async function processAutomaticReminders() {
  // El flag global detiene el lote; cada turno conserva además su habilitación individual.
  if (String(process.env.REMINDERS_ENABLED || 'false').toLowerCase() !== 'true') {
    return { enabled: false, processed: 0, sent: 0, failed: 0, results: [] };
  }

  const hours = Number.parseInt(process.env.REMINDER_WINDOW_HOURS || process.env.REMINDER_HOURS_BEFORE || '24', 10);
  const limit = Number.parseInt(process.env.WHATSAPP_REMINDER_BATCH_SIZE || '25', 10);
  const appointments = await findUpcomingAppointmentsForReminders({
    hours: Number.isNaN(hours) ? 24 : hours,
    limit: Number.isNaN(limit) ? 25 : limit,
  });

  const results = [];
  let sent = 0;
  let failed = 0;

  for (const appointment of appointments) {
    try {
      const result = await sendAppointmentReminder(appointment.id, { automatic: true });
      sent += result.sent ? 1 : 0;
      results.push({
        appointment_id: appointment.id,
        sent: Boolean(result.sent),
        skipped: Boolean(result.skipped),
        reason: result.reason || null,
      });
    } catch (error) {
      failed += 1;
      results.push({ appointment_id: appointment.id, sent: false, error: error.message });
    }
  }

  return {
    enabled: true,
    processed: appointments.length,
    sent,
    failed,
    results,
  };
}

module.exports = {
  ensureWhatsAppReminderSchema,
  sendAppointmentReminder,
  processPatientReply,
  hasPendingReminderForPhone,
  findUpcomingAppointmentsForReminders,
  processAutomaticReminders,
};
