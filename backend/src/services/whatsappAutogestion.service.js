const { pool } = require('../config/db');
const { sendWhatsAppMessage, normalizePhoneDigits, normalizePhoneForStorage } = require('./whatsappClient.service');
const {
  consultarDisponibilidad,
  crearTurno,
  crearSolicitudTurno,
  reprogramarTurno,
  obtenerTurnoDetalle,
} = require('./turnosService');
const { registrarAuditoria } = require('./auditoriaService');
const { obtenerConfiguracion, AUTOGESTION_KEYWORDS_DEFAULT } = require('./configuracionService');
const {
  completarTelefonoPacienteSiVacio,
  createPacienteMinimo,
} = require('./whatsappPaciente.service');
const {
  TURN_STATES_WHATSAPP_CANCELABLE,
  TURN_STATES_WHATSAPP_REPROGRAMMABLE,
  determinarTipoPaciente,
} = require('../domain/turnoActivityRules');
const {
  crearSolicitudTurnoPendiente,
  abrirSolicitudCambioTurno,
  pacienteTieneTurnoOSolicitudActiva,
  buildObservacionSolicitud,
} = require('./turnoSolicitudesService');

let schemaReady = false;

const ACTIVE_STATUS = 'active';
const COMPLETED_STATUS = 'completed';
const CANCELLED_STATUS = 'cancelled';
const EXPIRED_STATUS = 'expired';
const DEFAULT_SESSION_TIMEOUT_MINUTES = 10;
const CANCEL_LINE = 'Podés escribir "cancelar" para salir.';
const CANCELLED_MESSAGE = 'La operacion fue cancelada correctamente.\n\nMuchas gracias por comunicarte con Odonton.';
const EXPIRED_MESSAGE = '⚠️ La conversación anterior expiró por inactividad.\n\nPara iniciar una gestión, escribí 1 para sacar turno, 2 para reprogramar o 3 para cancelar.';
const TEXT_ONLY_MESSAGE = 'Por ahora solo puedo procesar mensajes de texto 😕\n\nPodés escribir "cancelar" para salir.';
const OUTGOING_DEDUP_MS = 3500;
const recentOutgoingMessages = new Map();
const COURTESY_MESSAGE = '😊 ¡Gracias a vos! Ante cualquier consulta, escribinos nuevamente por este medio.';
const ACTIVE_TURN_DUPLICATE_MESSAGE = '⚠️ Ya tenés un turno futuro activo. Si necesitás cambiarlo o cancelarlo, elegí 2 para reprogramar o 3 para cancelar.';
const ACTIVE_REQUEST_DUPLICATE_MESSAGE = '⚠️ Ya existe una solicitud pendiente. El consultorio debe revisarla antes de registrar otra solicitud.';

function buildActiveDuplicateMessage(activity) {
  return activity?.tipo === 'turno'
    ? ACTIVE_TURN_DUPLICATE_MESSAGE
    : ACTIVE_REQUEST_DUPLICATE_MESSAGE;
}

async function ensureAutogestionSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_conversations (
      id BIGSERIAL PRIMARY KEY,
      phone VARCHAR(30) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      step VARCHAR(80) NOT NULL,
      paciente_id INTEGER,
      prestacion_id INTEGER,
      profesional_id INTEGER,
      turno_id INTEGER,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_phone_status ON whatsapp_conversations(phone, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_expires ON whatsapp_conversations(expires_at)`);

  schemaReady = true;
}

function sessionTimeoutMinutes() {
  const value = Number.parseInt(
    process.env.WHATSAPP_SESSION_TIMEOUT_MINUTES || process.env.AUTOGESTION_WHATSAPP_SESSION_MINUTES || DEFAULT_SESSION_TIMEOUT_MINUTES,
    10,
  );
  return Number.isFinite(value) && value >= 7 && value <= 10 ? value : DEFAULT_SESSION_TIMEOUT_MINUTES;
}

function withCancel(message) {
  return `${message}\n\nPodés escribir "0" para cancelar esta operación.`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateYmd(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatFechaHumana(ymd) {
  const [year, month, day] = String(ymd).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatTurnoFechaHora(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { fecha: 's/d', hora: 's/d' };
  return {
    fecha: date.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    }),
    hora: date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeDni(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseKeywords(value) {
  return String(value || AUTOGESTION_KEYWORDS_DEFAULT)
    .split(/[\n,;]/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

async function shouldStartAutogestion(body) {
  const config = await obtenerConfiguracion();
  const keywords = parseKeywords(config.consultorio?.autogestion_keywords);
  const text = normalizeText(body);
  if (!text) return false;
  return text === 'turno' || keywords.some((keyword) => text === keyword);
}

function parseOption(body) {
  const text = normalizeText(body);
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  return null;
}

function parseTimeInput(body) {
  const raw = String(body || '').trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function isValidDni(value) {
  return /^[0-9]{7,8}$/.test(normalizeDni(value));
}

function isValidStrictDni(value) {
  return /^[0-9]{7,8}$/.test(String(value || '').trim());
}

function isValidName(value) {
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{2,50}$/.test(String(value || '').trim());
}

function isCancelCommand(body) {
  return ['0', 'cancelar', 'salir', 'terminar', 'cancelar conversacion'].includes(normalizeText(body));
}

function isCourtesyMessage(body) {
  const text = normalizeText(body);
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

function isStrictMenuCommand(body) {
  return [1, 2, 3].includes(parseOption(body));
}

function isCancelAppointmentIntent(body) {
  const text = normalizeText(body);
  return [
    'cancelar turno',
    'cancelar mi turno',
    'anular turno',
    'anular mi turno',
    'dar de baja turno',
  ].some((intent) => text.includes(intent));
}

function isRescheduleAppointmentIntent(body) {
  const text = normalizeText(body);
  return [
    'reprogramar turno',
    'reprogramar mi turno',
    'cambiar turno',
    'cambiar mi turno',
    'mover turno',
  ].some((intent) => text.includes(intent));
}

async function safeSend(phone, message) {
  const normalized = normalizePhoneDigits(phone);
  const text = String(message || '').trim();
  const key = `${normalized}:${text}`;
  const now = Date.now();
  const lastSentAt = recentOutgoingMessages.get(key);

  if (lastSentAt && now - lastSentAt < OUTGOING_DEDUP_MS) {
    console.warn('[WHATSAPP AUTOGESTION] Mensaje duplicado omitido:', { phone: normalized });
    return null;
  }

  recentOutgoingMessages.set(key, now);
  for (const [itemKey, sentAt] of recentOutgoingMessages.entries()) {
    if (now - sentAt > OUTGOING_DEDUP_MS) recentOutgoingMessages.delete(itemKey);
  }

  await sendWhatsAppMessage(phone, message);
  return true;
}

async function audit(data) {
  try {
    await registrarAuditoria(data);
  } catch (error) {
    console.warn('[WHATSAPP AUTOGESTION] No se pudo registrar auditoria:', error.message);
  }
}

async function getActiveSessionState(phone) {
  await ensureAutogestionSchema();
  const normalized = normalizePhoneDigits(phone);

  const expiredRes = await pool.query(
    `
      UPDATE whatsapp_conversations
      SET status = $3, updated_at = NOW()
      WHERE phone = $1 AND status = $2 AND expires_at <= NOW()
      RETURNING *
    `,
    [normalized, ACTIVE_STATUS, EXPIRED_STATUS],
  );

  if (expiredRes.rowCount > 0) {
    return { session: null, expired: expiredRes.rows[0] };
  }

  const { rows } = await pool.query(
    `
      SELECT *
      FROM whatsapp_conversations
      WHERE phone = $1 AND status = $2 AND expires_at > NOW()
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [normalized, ACTIVE_STATUS],
  );

  return { session: rows[0] || null, expired: null };
}

async function hasActiveAutogestionSession(phone) {
  const state = await getActiveSessionState(phone);
  return Boolean(state.session || state.expired);
}

async function createSession(phone, step, data = {}) {
  await ensureAutogestionSchema();
  const normalized = normalizePhoneDigits(phone);

  await pool.query(
    `UPDATE whatsapp_conversations SET status = $2, updated_at = NOW() WHERE phone = $1 AND status = $3`,
    [normalized, CANCELLED_STATUS, ACTIVE_STATUS],
  );

  const { rows } = await pool.query(
    `
      INSERT INTO whatsapp_conversations (phone, step, data, expires_at)
      VALUES ($1, $2, $3::jsonb, NOW() + ($4::text || ' minutes')::INTERVAL)
      RETURNING *
    `,
    [normalized, step, JSON.stringify(data || {}), sessionTimeoutMinutes()],
  );

  return rows[0];
}

async function updateSession(session, patch = {}) {
  const data = {
    ...(session.data || {}),
    ...(patch.data || {}),
  };

  const { rows } = await pool.query(
    `
      UPDATE whatsapp_conversations
      SET step = COALESCE($2, step),
          paciente_id = COALESCE($3, paciente_id),
          prestacion_id = COALESCE($4, prestacion_id),
          profesional_id = COALESCE($5, profesional_id),
          turno_id = COALESCE($6, turno_id),
          data = $7::jsonb,
          expires_at = NOW() + ($8::text || ' minutes')::INTERVAL,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      session.id,
      patch.step || null,
      patch.paciente_id || null,
      patch.prestacion_id || null,
      patch.profesional_id || null,
      patch.turno_id || null,
      JSON.stringify(data),
      sessionTimeoutMinutes(),
    ],
  );

  return rows[0];
}

async function finishSession(session, status = COMPLETED_STATUS) {
  await pool.query(
    `UPDATE whatsapp_conversations SET status = $2, updated_at = NOW() WHERE id = $1`,
    [session.id, status],
  );
}

async function findPacienteByDni(dni) {
  const { rows } = await pool.query(
    `
      SELECT id, nombre, apellido, dni, telefono
      FROM pacientes
      WHERE dni = $1
      LIMIT 1
    `,
    [normalizeDni(dni)],
  );
  return rows[0] || null;
}

async function findNextManagedAppointment(phone, allowedStates) {
  await ensureAutogestionSchema();
  const rawChatId = String(phone || '').trim().toLowerCase();
  const normalized = normalizePhoneDigits(phone);
  const normalizedDigits = /^\d+$/.test(normalized) ? normalized : null;
  if ((!normalized && !rawChatId) || !Array.isArray(allowedStates) || allowedStates.length === 0) return null;

  const { rows } = await pool.query(
    `
      SELECT t.id
      FROM turnos t
      JOIN pacientes p ON p.id = t.paciente_id
      WHERE t.fecha_hora_inicio > NOW()
        AND t.estado = ANY($1)
        AND (
          ($2::text IS NOT NULL AND regexp_replace(COALESCE(p.telefono, ''), '[^0-9]', '', 'g') = $2)
          OR EXISTS (
            SELECT 1
            FROM whatsapp_conversations wc
            WHERE (wc.paciente_id = t.paciente_id OR wc.turno_id = t.id)
              AND (
                wc.phone = $3
                OR wc.phone = $4
                OR ($2::text IS NOT NULL AND regexp_replace(COALESCE(wc.phone, ''), '[^0-9]', '', 'g') = $2)
              )
          )
        )
      ORDER BY t.fecha_hora_inicio ASC
      LIMIT 1
    `,
    [allowedStates, normalizedDigits, normalized, rawChatId],
  );

  if (!rows[0]?.id) return null;
  return obtenerTurnoDetalle(rows[0].id);
}

function buildManagedAppointmentMessage(turno, intro) {
  const { fecha, hora } = formatTurnoFechaHora(turno.fecha_hora_inicio);
  const prestacion = turno?.prestacion?.nombre || 'Prestación';
  const profesional = turno?.profesional?.nombre || 'Profesional';

  return `${intro}\n\n📅 Fecha: ${fecha}\n🕒 Hora: ${hora}\n🦷 Prestación: ${prestacion}\n👩‍⚕️ Profesional: ${profesional}`;
}

function menuPrincipalMessage() {
  return '👋 Hola. Somos el consultorio Odonton.\n\n'
    + '¿En qué podemos ayudarte? Ingresá el número de la opción:\n\n'
    + '1. 📅 Sacar un turno\n'
    + '2. 📅 Reprogramar un turno\n'
    + '3. ❌ Cancelar un turno\n'
    + '0. Cancelar conversación';
}

function invalidMenuMessage() {
  return '⚠️ No pude reconocer esa opción.\n\n'
    + 'Por favor, ingresá una opción válida:\n\n'
    + '1. 📅 Sacar un turno\n'
    + '2. 📅 Reprogramar un turno\n'
    + '3. ❌ Cancelar un turno\n'
    + '0. Cancelar conversación';
}

function splitNombreApellido(value) {
  const parts = String(value || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (parts.length < 2) return null;
  return {
    nombre: parts[0],
    apellido: parts.slice(1).join(' '),
    nombreApellido: parts.join(' '),
  };
}

async function findNextFutureAppointmentByPacienteId(pacienteId, allowedStates) {
  if (!pacienteId || !Array.isArray(allowedStates) || allowedStates.length === 0) return null;

  const { rows } = await pool.query(
    `
      SELECT id
      FROM turnos
      WHERE paciente_id = $1
        AND fecha_hora_inicio > NOW()
        AND estado = ANY($2)
      ORDER BY fecha_hora_inicio ASC
      LIMIT 1
    `,
    [pacienteId, allowedStates],
  );
  if (!rows[0]?.id) return null;
  return obtenerTurnoDetalle(rows[0].id);
}

async function registerPendingRequestFromSession(session, phone) {
  const data = session.data || {};
  const tipoSolicitud = data.tipo_solicitud || 'nuevo_turno';
  const nombreApellido = data.paciente_nombre || data.nombre_apellido || [data.nombre, data.apellido].filter(Boolean).join(' ') || null;
  const dni = data.dni || null;
  const telefono = normalizePhoneForStorage(phone) || normalizePhoneDigits(phone) || String(phone || '').replace('@c.us', '');
  let pacienteId = session.paciente_id || null;
  let turnoSolicitudId = session.turno_id || data.turno_id || null;

  if (!dni) {
    throw new Error('No se pudo registrar la solicitud porque falta el DNI en la conversacion');
  }
  if (!telefono) {
    throw new Error('No se pudo registrar la solicitud porque falta el telefono');
  }

  if (!pacienteId && tipoSolicitud === 'primera_consulta') {
    const paciente = await createPacienteMinimo({
      nombre: data.nombre,
      apellido: data.apellido,
      dni,
      phone,
      storagePhone: data.telefono_resuelto || null,
      conversationId: session.id,
    });
    pacienteId = paciente.id;
  }

  if (['nuevo_turno', 'primera_consulta'].includes(tipoSolicitud)) {
    if (!pacienteId) {
      throw new Error('No se pudo registrar la solicitud porque falta el paciente');
    }

    const activo = await pacienteTieneTurnoOSolicitudActiva({
      pacienteId,
    });
    if (activo.activa) {
      const error = new Error('El paciente ya tiene un turno o solicitud activa');
      error.code = 'PACIENTE_CON_SOLICITUD_ACTIVA';
      error.tipoActividad = activo.tipo;
      throw error;
    }

    const preferencia = [
      data.motivo ? `Motivo: ${data.motivo}` : null,
      data.preferencia_horaria ? `Preferencia: ${data.preferencia_horaria}` : null,
      tipoSolicitud === 'primera_consulta' ? 'Tipo: primera consulta' : null,
    ].filter(Boolean).join('\n');
    const observaciones = buildObservacionSolicitud({
      motivo: data.motivo,
      preferenciaHoraria: data.preferencia_horaria,
      observaciones: tipoSolicitud === 'primera_consulta' ? 'Solicitud recibida por WhatsApp. Tipo: primera consulta.' : null,
    });

    const turno = await crearSolicitudTurno({
      pacienteId,
      prestacionId: null,
      origen: 'autogestion_whatsapp',
      preferencia,
      observaciones,
    });
    turnoSolicitudId = turno.id;
  }

  return crearSolicitudTurnoPendiente({
    tipoSolicitud,
    pacienteId,
    nombreApellido,
    dni,
    telefono,
    motivo: data.motivo || null,
    preferenciaHoraria: data.preferencia_horaria || null,
    turnoId: turnoSolicitudId,
    observaciones: data.observaciones || null,
    auditoria: {
      phone: normalizePhoneDigits(phone),
      conversation_id: session.id,
      tipo_solicitud: tipoSolicitud,
    },
  });
}

async function getOrCreatePrimeraConsulta() {
  const { rows } = await pool.query(
    `
      SELECT id, nombre, duracion_minutos, precio_base, COALESCE(activo, true) AS activo
      FROM prestaciones
      WHERE translate(lower(trim(nombre)), 'áéíóúäëïöüñ', 'aeiouaeioun') = 'primera consulta'
      ORDER BY COALESCE(activo, true) DESC, id ASC
      LIMIT 1
    `,
  );

  if (rows[0]) return rows[0];

  const created = await pool.query(
    `
      INSERT INTO prestaciones (nombre, duracion_minutos, precio_base, activo)
      VALUES ('Primera consulta', 30, 0, true)
      RETURNING id, nombre, duracion_minutos, precio_base, activo
    `,
  );
  return created.rows[0];
}

async function sendPrestaciones(session, phone) {
  return askAppointmentPreferences(session, phone);
}

async function askAppointmentPreferences(session, phone) {
  const updated = await updateSession(session, {
    step: 'ASK_REQUEST_PREFERENCES',
  });

  await safeSend(
    phone,
    withCancel(
      'Contanos el motivo de la consulta.\n\nPor ejemplo:\n- Dolor\n- Control\n- Limpieza\n- Consulta por tratamiento',
    ),
  );
  return updated;
}

async function handleRequestPreferences(session, phone, body) {
  const motivo = String(body || '').trim();
  if (motivo.length < 3) {
    await safeSend(phone, withCancel('Necesito un poquito más de detalle sobre el motivo. Por ejemplo: "dolor en una muela" o "control".'));
    return { ok: false };
  }

  const updated = await updateSession(session, {
    step: 'ASK_REQUEST_DAYS',
    data: { motivo_consulta: motivo },
  });

  await safeSend(
    phone,
    withCancel(
      'Perfecto. Ahora contanos que dias te quedan mejor.\n\nPor ejemplo:\n- Lunes y miercoles\n- Cualquier dia\n- Viernes por la tarde',
    ),
  );
  return { ok: true, session: updated };
}

async function handleRequestDays(session, phone, body) {
  const diasPreferidos = String(body || '').trim();
  if (diasPreferidos.length < 3) {
    await safeSend(phone, withCancel('Necesito que me indiques una preferencia de dias. Por ejemplo: "lunes y miercoles" o "cualquier dia".'));
    return { ok: false };
  }

  const updated = await updateSession(session, {
    step: 'ASK_REQUEST_TIME_BLOCK',
    data: { dias_preferidos: diasPreferidos },
  });

  await safeSend(
    phone,
    withCancel('Gracias. Y en que momento preferis el turno?\n\n1. Manana\n2. Tarde\n3. Me da igual'),
  );
  return { ok: true, session: updated };
}

function parsePreferredTimeBlock(body) {
  const option = parseOption(body);
  const text = normalizeText(body);
  if (option === 1 || text.includes('manana')) return 'manana';
  if (option === 2 || text.includes('tarde')) return 'tarde';
  if (option === 3 || text.includes('igual') || text.includes('cualquiera') || text.includes('indistinto')) return 'indistinto';
  return null;
}

async function handleRequestTimeBlock(session, phone, body) {
  const momentoPreferido = parsePreferredTimeBlock(body);
  if (!momentoPreferido) {
    await safeSend(phone, withCancel('No pude entender esa preferencia.\n\nResponde:\n1. Manana\n2. Tarde\n3. Me da igual'));
    return { ok: false };
  }

  const updated = await updateSession(session, {
    step: 'CONFIRM_REQUEST',
    data: { momento_preferido: momentoPreferido },
  });
  const data = updated.data || {};
  const pacienteNombre = data.paciente_nombre || 'paciente';

  await safeSend(
    phone,
    withCancel(
      `Vamos a enviar esta solicitud al consultorio:\n\nPaciente: ${pacienteNombre}\nDNI: ${data.dni || '-'}\nMotivo: ${data.motivo_consulta || '-'}\nDias preferidos: ${data.dias_preferidos || '-'}\nHorario preferido: ${momentoPreferido}\n\n1. Enviar solicitud\n2. Cancelar`,
    ),
  );
  return { ok: true };
}

// Flujo legado: estas funciones listaban dias/horarios para que el paciente eligiera
// por WhatsApp. La regla actual de negocio no permite esa seleccion; los estados
// asociados se cortan desde resetLegacyAppointmentFlow para conservar referencias
// sin reactivar el flujo anterior.
async function buildAvailableDays({ prestacionId, profesionalId = null, maxDays = 10 }) {
  const days = [];
  const today = new Date();

  for (let offset = 0; offset < 45 && days.length < maxDays; offset += 1) {
    const date = addDays(today, offset);
    const fecha = formatDateYmd(date);
    const slots = await consultarDisponibilidad({ profesionalId, fecha, prestacionId });
    const disponibles = slots.filter((slot) => slot.disponible);
    if (disponibles.length) {
      days.push({
        fecha,
        label: formatFechaHumana(fecha),
        disponibles: disponibles.length,
      });
    }
  }

  return days;
}

async function sendAvailableDays(session, phone, { step = 'SELECT_DAY' } = {}) {
  const prestacionId = session.prestacion_id || session.data?.prestacion_id;
  const profesionalId = session.profesional_id || session.data?.profesional_id || null;
  const days = await buildAvailableDays({ prestacionId, profesionalId });

  if (!days.length) {
    await safeSend(phone, 'No encontré días disponibles para esa prestación en este momento.\n\nProbá más tarde o comunicate con el consultorio. 🦷');
    await finishSession(session, CANCELLED_STATUS);
    return null;
  }

  const lista = days.map((day, index) => `${index + 1}. ${day.label}`).join('\n');
  const updated = await updateSession(session, {
    step,
    data: { days, selectedDay: null, slotGroups: null, selectedBlock: null, slots: null, selectedSlot: null },
  });

  const backText = step.includes('RESCHEDULE') ? '' : '\n\n0. Volver a elegir prestación';
  await safeSend(phone, withCancel(`Elegí un día disponible:\n\n${lista}${backText}`));
  return updated;
}

function slotMinutes(slot) {
  const [hour, minute] = String(slot?.inicio || '').split(':').map(Number);
  return hour * 60 + minute;
}

function splitSlotsByBlock(slots = []) {
  return {
    manana: slots.filter((slot) => {
      const minutes = slotMinutes(slot);
      return minutes >= 8 * 60 && minutes <= 12 * 60 + 59;
    }),
    tarde: slots.filter((slot) => slotMinutes(slot) >= 13 * 60),
  };
}

function blockLabel(block) {
  return block === 'manana' ? 'mañana' : 'tarde';
}

function listSlots(slots = []) {
  return slots.map((slot, index) => `${index + 1}. ${slot.inicio}`).join('\n');
}

async function sendBlockQuestion(session, phone, selectedDay, groups, { step = 'SELECT_BLOCK' } = {}) {
  const updated = await updateSession(session, {
    step,
    data: {
      selectedDay,
      slotGroups: groups,
      selectedBlock: null,
      slots: null,
      selectedSlot: null,
      backToBlock: false,
    },
  });

  await safeSend(
    phone,
    withCancel(`Elegiste ${selectedDay.label}.\n\n¿En qué momento preferís el turno?\n\n1. Mañana\n2. Tarde\n\n0. Volver a elegir día`),
  );
  return updated;
}

async function sendSlotsForBlock(session, phone, slots, block, { step = 'SELECT_TIME', backToBlock = false } = {}) {
  const data = session.data || {};
  const selectedDay = data.selectedDay || {};
  const updated = await updateSession(session, {
    step,
    data: {
      selectedBlock: block,
      slots,
      selectedSlot: null,
      backToBlock,
    },
  });

  const zeroText = backToBlock ? '0. Volver a elegir mañana/tarde' : '0. Volver a elegir día';
  await safeSend(
    phone,
    withCancel(`Horarios disponibles para ${selectedDay.label} por la ${blockLabel(block)}:\n\n${listSlots(slots)}\n\n${zeroText}`),
  );
  return updated;
}

async function sendAvailableTimes(session, phone, selectedDay, { step = 'SELECT_TIME' } = {}) {
  const prestacionId = session.prestacion_id || session.data?.prestacion_id;
  const profesionalId = session.profesional_id || session.data?.profesional_id || null;
  const slots = await consultarDisponibilidad({ profesionalId, fecha: selectedDay.fecha, prestacionId });
  const disponibles = slots.filter((slot) => slot.disponible);

  if (!disponibles.length) {
    const updated = await updateSession(session, {
      step: step.includes('RESCHEDULE') ? 'RESCHEDULE_SELECT_DAY' : 'SELECT_DAY',
    });
    await safeSend(phone, withCancel('Ese día ya no tiene horarios disponibles. Elegí otro día.'));
    return sendAvailableDays(updated, phone, { step: updated.step });
  }

  const groups = splitSlotsByBlock(disponibles);
  const hasMorning = groups.manana.length > 0;
  const hasAfternoon = groups.tarde.length > 0;
  const timeStep = step.includes('RESCHEDULE') ? 'RESCHEDULE_SELECT_TIME' : 'SELECT_TIME';

  if (hasMorning && hasAfternoon) {
    return sendBlockQuestion(session, phone, selectedDay, groups, {
      step: step.includes('RESCHEDULE') ? 'RESCHEDULE_SELECT_BLOCK' : 'SELECT_BLOCK',
    });
  }

  const block = hasMorning ? 'manana' : 'tarde';
  const slotsForBlock = hasMorning ? groups.manana : groups.tarde;
  const updated = await updateSession(session, {
    data: { selectedDay, slotGroups: groups },
  });

  await safeSend(phone, `Para ese día solo hay horarios disponibles por la ${blockLabel(block)}.`);
  return sendSlotsForBlock(updated, phone, slotsForBlock, block, { step: timeStep, backToBlock: false });
}

async function askAppointmentConfirmation(session, phone, selectedSlot, { step = 'CONFIRM_APPOINTMENT' } = {}) {
  const data = session.data || {};
  const prestacion = data.prestacion || {};
  const selectedDay = data.selectedDay || {};
  const pacienteNombre = data.paciente_nombre || 'paciente';
  const updated = await updateSession(session, {
    step,
    data: { selectedSlot },
  });

  await safeSend(
    phone,
    withCancel(
      `Confirmá el turno:\n\nPaciente: ${pacienteNombre}\nDNI: ${data.dni || ''}\nPrestación: ${prestacion.nombre || 'seleccionada'}\nFecha: ${selectedDay.label || selectedDay.fecha}\nHora: ${selectedSlot.inicio}\n\n1. Confirmar\n2. Cancelar\n0. Volver a elegir horario`,
    ),
  );
  return updated;
}

async function startAutogestion(phone, { storagePhone = null, auditContext = {} } = {}) {
  const session = await createSession(phone, 'esperando_opcion_menu', {
    mode: 'guided_requests',
    ...(storagePhone && { telefono_resuelto: storagePhone }),
  });
  await audit({
    accion: 'BOT_SESSION_STARTED',
    recurso: 'whatsapp_conversations',
    recursoId: session.id,
    metadata: {
      phone: normalizePhoneDigits(phone),
      sourceEvent: auditContext.sourceEvent || null,
      messageId: auditContext.messageId || null,
      messageTimestamp: auditContext.messageTimestamp || null,
      trigger: 'exact_keyword',
    },
  });
  await safeSend(phone, menuPrincipalMessage());
  return { ok: true, started: true, session_id: session.id };
}

async function handleGuidedMenu(session, phone, body) {
  const option = parseOption(body);

  if (option === 1) {
    await updateSession(session, {
      step: 'esperando_dni',
      data: { tipo_solicitud: 'nuevo_turno' },
    });
    await safeSend(phone, withCancel('📅 Perfecto. Para solicitar un turno, ingresá tu DNI sin puntos ni espacios.'));
    return { ok: true };
  }

  if (option === 2 || option === 3) {
    const tipoSolicitud = option === 2 ? 'reprogramacion' : 'cancelacion';
    await updateSession(session, {
      step: 'esperando_dni',
      data: { tipo_solicitud: tipoSolicitud },
    });
    await safeSend(phone, withCancel(`${option === 2 ? '📅 Elegiste solicitar la reprogramación de un turno.' : '❌ Elegiste solicitar la cancelación de un turno.'}\n\nPor favor, ingresá tu DNI sin puntos ni espacios.`));
    return { ok: true };
  }

  if (option === null) {
    await safeSend(phone, invalidMenuMessage());
    return { ok: false };
  }

  await safeSend(phone, invalidMenuMessage());
  return { ok: false };
}

async function handleGuidedNombreApellido(session, phone, body) {
  const parsed = splitNombreApellido(body);
  if (!parsed || !isValidName(parsed.nombre) || !isValidName(parsed.apellido)) {
    await safeSend(phone, withCancel('No pude validar el nombre y apellido.\n\nEnvia ambos datos juntos. Ejemplo: Mariana Lopez'));
    return { ok: false };
  }

  const data = session.data || {};
  const nextData = {
    nombre: parsed.nombre,
    apellido: parsed.apellido,
    nombre_apellido: parsed.nombreApellido,
    paciente_nombre: parsed.nombreApellido,
  };

  if (data.dni) {
    await updateSession(session, {
      step: 'esperando_motivo',
      data: nextData,
    });
    await safeSend(phone, withCancel(`Gracias, ${parsed.nombre}. Como no encontramos una ficha con ese DNI, la solicitud sera de primera consulta.\n\nAhora indicame el motivo de la consulta.`));
    return { ok: true };
  }

  await updateSession(session, {
    step: 'esperando_dni',
    data: nextData,
  });
  await safeSend(phone, withCancel(`Gracias, ${parsed.nombre}.\n\nAhora ingresa tu DNI sin puntos ni espacios.\nEjemplo: 23456123`));
  return { ok: true };
}

async function handleGuidedDniNotFound(session, phone, body) {
  const option = parseOption(body);
  if (option === 1) {
    await updateSession(session, { step: 'esperando_dni' });
    await safeSend(phone, withCancel('Por favor, ingresa tu DNI nuevamente, sin puntos ni espacios.\nEjemplo: 23456123'));
    return { ok: true };
  }
  if (option === 2) {
    await updateSession(session, { step: 'esperando_opcion_menu', data: { tipo_solicitud: null, dni: null } });
    await safeSend(phone, menuPrincipalMessage());
    return { ok: true };
  }
  if (option === 3) {
    await finishSession(session, CANCELLED_STATUS);
    await safeSend(phone, CANCELLED_MESSAGE);
    return { ok: true, cancelled: true };
  }
  await safeSend(phone, 'No pude reconocer esa opcion.\n\n1. Ingresar DNI nuevamente\n2. Volver al menu principal\n3. Cancelar operacion');
  return { ok: false };
}

async function handleGuidedDni(session, phone, body) {
  if (!isValidStrictDni(body)) {
    await safeSend(phone, withCancel('El DNI ingresado no parece valido.\n\nPor favor, envia tu DNI nuevamente, sin puntos ni espacios.\nEjemplo: 23456123'));
    return { ok: false };
  }

  const data = session.data || {};
  const dni = String(body).trim();
  const tipoSolicitud = data.tipo_solicitud || 'nuevo_turno';
  const pacienteEncontrado = await findPacienteByDni(dni);
  const paciente = pacienteEncontrado
    ? await completarTelefonoPacienteSiVacio(pacienteEncontrado, {
      phone,
      storagePhone: data.telefono_resuelto || null,
    })
    : null;
  const identificacion = determinarTipoPaciente(paciente);

  if (!paciente) {
    if (['nuevo_turno', 'primera_consulta'].includes(tipoSolicitud)) {
      if (tipoSolicitud === 'primera_consulta' && data.nombre && data.apellido) {
        await updateSession(session, { step: 'esperando_motivo', data: { dni } });
        await safeSend(phone, withCancel('Perfecto. La solicitud sera de primera consulta.\n\nAhora indicame el motivo de la consulta.'));
        return { ok: true, paciente_tipo: identificacion.tipo };
      }

      await updateSession(session, {
        step: 'esperando_nombre_apellido',
        data: {
          dni,
          tipo_solicitud: identificacion.tipoSolicitud,
          paciente_tipo: identificacion.tipo,
        },
      });
      await safeSend(phone, withCancel('No encontramos una ficha asociada a ese DNI. Vamos a registrar una solicitud de primera consulta.\n\nPor favor, indica tu nombre y apellido.\nEjemplo: Mariana Lopez'));
      return { ok: true, paciente_tipo: identificacion.tipo };
    }

    await updateSession(session, { step: 'esperando_dni_no_encontrado', data: { dni } });
    await safeSend(phone, 'No encontramos una ficha asociada a ese DNI.\n\nPodes intentar ingresarlo nuevamente, sin puntos ni espacios.\n\n1. Ingresar DNI nuevamente\n2. Volver al menu principal\n3. Cancelar operacion');
    return { ok: false, paciente_tipo: identificacion.tipo };
  }

  const tipoSolicitudEfectiva = tipoSolicitud === 'primera_consulta'
    ? identificacion.tipoSolicitud
    : tipoSolicitud;
  const pacienteNombre = `${paciente.nombre || ''} ${paciente.apellido || ''}`.trim();
  const updated = await updateSession(session, {
    paciente_id: paciente.id,
    data: {
      dni,
      paciente_nombre: pacienteNombre,
      paciente_tipo: identificacion.tipo,
      tipo_solicitud: tipoSolicitudEfectiva,
    },
  });

  if (tipoSolicitudEfectiva === 'nuevo_turno') {
    const activo = await pacienteTieneTurnoOSolicitudActiva({
      pacienteId: paciente.id,
    });
    if (activo.activa) {
      await finishSession(updated, COMPLETED_STATUS);
      await safeSend(phone, buildActiveDuplicateMessage(activo));
      return { ok: true, duplicated: true };
    }
  }

  if (tipoSolicitudEfectiva === 'reprogramacion' || tipoSolicitudEfectiva === 'cancelacion') {
    const allowedStates = tipoSolicitudEfectiva === 'reprogramacion'
      ? TURN_STATES_WHATSAPP_REPROGRAMMABLE
      : TURN_STATES_WHATSAPP_CANCELABLE;
    const turno = await findNextFutureAppointmentByPacienteId(paciente.id, allowedStates);
    if (!turno) {
      await finishSession(updated, COMPLETED_STATUS);
      await safeSend(phone, 'No encontramos un turno futuro activo asociado a tu ficha.\n\nSi necesitas ayuda, escribi tu consulta y en la brevedad nos pondremos en contacto con vos.');
      return { ok: true };
    }

    const { fecha, hora } = formatTurnoFechaHora(turno.fecha_hora_inicio);
    const withTurno = await updateSession(updated, {
      turno_id: turno.id,
      data: { turno_id: turno.id, turno_fecha: fecha, turno_hora: hora },
    });

    if (tipoSolicitudEfectiva === 'reprogramacion') {
      const { solicitud, creada } = await abrirSolicitudCambioTurno({
        tipoSolicitud: 'reprogramacion',
        pacienteId: paciente.id,
        nombreApellido: pacienteNombre,
        dni,
        telefono: normalizePhoneForStorage(phone) || normalizePhoneDigits(phone),
        turnoId: turno.id,
        observaciones: `Solicitud de reprogramacion por WhatsApp. Turno actual: ${fecha} ${hora}`,
        auditoria: { phone: normalizePhoneDigits(phone), conversation_id: session.id, tipo_solicitud: 'reprogramacion' },
      });

      await finishSession(withTurno, COMPLETED_STATUS);
      await safeSend(
        phone,
        creada
          ? `✅ Entendido, ${paciente.nombre}. Registramos tu solicitud de reprogramación. El consultorio revisará la agenda y se comunicará con vos para coordinar un nuevo día y horario.`
          : `⚠️ Entendido, ${paciente.nombre}. Tu solicitud de reprogramación ya estaba registrada. El consultorio revisará la agenda y se comunicará con vos para coordinar un nuevo día y horario.`,
      );
      return { ok: true, solicitud };
    }

    await updateSession(withTurno, { step: 'esperando_confirmacion_cancelacion' });
    await safeSend(phone, withCancel(`📅 Encontré tu ficha, ${paciente.nombre}.\n\nTenés un turno programado para el día ${fecha} a las ${hora}.\n\n¿Deseás solicitar la cancelación de este turno?\n\n1. Sí, solicitar cancelación\n2. No, conservar mi turno`));
    return { ok: true };
  }

  await updateSession(updated, { step: 'esperando_motivo' });
  await safeSend(phone, withCancel(`Encontre tu ficha, ${paciente.nombre}.\n\nPor favor, indicame el motivo de la consulta.\nEjemplo: dolor, control, limpieza, extraccion, chequeo, etc.`));
  return { ok: true };
}

async function handleGuidedMotivo(session, phone, body) {
  const motivo = String(body || '').trim();
  if (motivo.length < 3) {
    await safeSend(phone, withCancel('El motivo no puede estar vacio.\n\nPor favor, indicame brevemente el motivo de la consulta.'));
    return { ok: false };
  }

  await updateSession(session, {
    step: 'esperando_preferencia_horaria',
    data: { motivo },
  });
  await safeSend(
    phone,
    withCancel('🕐 Perfecto. Ahora indicame tus dias y horarios de preferencia.\n\n'
      + 'Ejemplo:\n'
      + 'Lunes o miercoles a la manana.\n'
      + 'Viernes despues de las 16.\n'
      + 'Cualquier dia por la tarde.\n\n'
      + 'Mientras mas opciones indiques, mas facil sera encontrar disponibilidad.'),
  );
  return { ok: true };
}

async function handleGuidedPreference(session, phone, body) {
  const preferencia = String(body || '').trim();
  if (preferencia.length < 3) {
    await safeSend(phone, withCancel('La preferencia horaria no puede estar vacia.\n\nIndicanos dias y horarios posibles.'));
    return { ok: false };
  }

  const data = session.data || {};
  const tipoSolicitud = data.tipo_solicitud || 'nuevo_turno';
  const step = tipoSolicitud === 'reprogramacion'
    ? 'esperando_confirmacion_reprogramacion'
    : 'esperando_confirmacion_solicitud';

  const updated = await updateSession(session, {
    step,
    data: { preferencia_horaria: preferencia },
  });
  const nextData = updated.data || {};

  if (tipoSolicitud === 'reprogramacion') {
    await safeSend(
      phone,
      `Perfecto. Registramos esta solicitud de reprogramacion:\n\n`
        + `Paciente: ${nextData.paciente_nombre || '-'}\n`
        + `Turno actual: ${nextData.turno_fecha || '-'} a las ${nextData.turno_hora || '-'}\n`
        + `Nueva preferencia: ${preferencia}\n\n`
        + 'Recorda que el cambio todavia no queda confirmado. El consultorio revisara la disponibilidad y te enviara la confirmacion correspondiente.\n\n'
        + 'Deseas confirmar esta solicitud?\n\n'
        + '1. Si, confirmar solicitud de reprogramacion\n'
        + '2. No, cancelar solicitud',
    );
    return { ok: true };
  }

  const title = tipoSolicitud === 'primera_consulta'
    ? 'Perfecto. Registramos esta solicitud de primera consulta:'
    : 'Perfecto. Registramos esta solicitud:';
  const patientLine = tipoSolicitud === 'primera_consulta'
    ? `Nombre y apellido: ${nextData.nombre_apellido || nextData.paciente_nombre || '-'}`
    : `Paciente: ${nextData.paciente_nombre || '-'}`;

  await safeSend(
    phone,
    `${title}\n\n`
      + `${patientLine}\n`
      + `DNI: ${nextData.dni || '-'}\n`
      + `Motivo: ${nextData.motivo || '-'}\n`
      + `Preferencia: ${preferencia}\n\n`
      + 'Recorda que el turno todavia no queda confirmado. El consultorio revisara la disponibilidad y te enviara la confirmacion correspondiente.\n\n'
      + 'Deseas confirmar esta solicitud?\n\n'
      + '1. Si, confirmar solicitud\n'
      + '2. No, cancelar solicitud',
  );
  return { ok: true };
}

async function handleGuidedConfirmRequest(session, phone, body) {
  const option = parseOption(body);
  if (![1, 2].includes(option)) {
    await safeSend(phone, 'No pude reconocer esa opcion.\n\n1. Si, confirmar solicitud\n2. No, cancelar solicitud');
    return { ok: false };
  }

  if (option === 2) {
    await finishSession(session, CANCELLED_STATUS);
    await safeSend(phone, CANCELLED_MESSAGE);
    return { ok: true, cancelled: true };
  }

  let solicitud;
  try {
    solicitud = await registerPendingRequestFromSession(session, phone);
  } catch (error) {
    if (error.code === 'PACIENTE_CON_SOLICITUD_ACTIVA') {
      await finishSession(session, COMPLETED_STATUS);
      await safeSend(phone, buildActiveDuplicateMessage({ tipo: error.tipoActividad }));
      return { ok: true, duplicated: true };
    }
    console.error('[WHATSAPP AUTOGESTION] No se pudo guardar la solicitud:', {
      error: error.message,
      phone: normalizePhoneDigits(phone),
      conversation_id: session.id,
      step: session.step,
      data: session.data,
    });
    throw error;
  }
  await finishSession(session, COMPLETED_STATUS);
  await audit({
    accion: 'WHATSAPP_TURNO_SOLICITUD_REGISTRADA',
    recurso: 'turno_solicitudes',
    recursoId: solicitud.id,
    statusCode: 201,
    metadata: { phone: normalizePhoneDigits(phone), conversation_id: session.id, tipo_solicitud: solicitud.tipo_solicitud },
  });

  const isPrimeraConsulta = solicitud.tipo_solicitud === 'primera_consulta';
  await safeSend(
    phone,
    `${isPrimeraConsulta ? 'Listo. Tu solicitud de primera consulta fue registrada correctamente.' : 'Listo. Tu solicitud fue registrada correctamente.'}\n\n`
      + 'En la brevedad te enviaremos un mensaje con los datos del turno y la consulta.\n\n'
      + 'Muchas gracias por comunicarte con Odonton.',
  );
  return { ok: true, solicitud };
}

async function handleGuidedConfirmCancellation(session, phone, body) {
  const option = parseOption(body);
  if (![1, 2].includes(option)) {
    await safeSend(phone, 'No pude reconocer esa opcion.\n\n1. Si, solicitar cancelacion\n2. No, conservar mi turno');
    return { ok: false };
  }

  if (option === 2) {
    const data = session.data || {};
    await finishSession(session, COMPLETED_STATUS);
    await safeSend(phone, `Perfecto, tu turno se mantiene programado para el dia ${data.turno_fecha || '-'} a las ${data.turno_hora || '-'}.\n\nMuchas gracias por comunicarte con Odonton.`);
    return { ok: true };
  }

  const data = session.data || {};
  const { solicitud, creada } = await abrirSolicitudCambioTurno({
    tipoSolicitud: 'cancelacion',
    pacienteId: session.paciente_id || null,
    nombreApellido: data.paciente_nombre || null,
    dni: data.dni,
    telefono: normalizePhoneForStorage(phone) || normalizePhoneDigits(phone),
    turnoId: session.turno_id || data.turno_id || null,
    observaciones: `Solicitud de cancelacion por WhatsApp. Turno actual: ${data.turno_fecha || '-'} ${data.turno_hora || '-'}`,
    auditoria: { phone: normalizePhoneDigits(phone), conversation_id: session.id, tipo_solicitud: 'cancelacion' },
  });

  await finishSession(session, COMPLETED_STATUS);
  await audit({
    accion: 'WHATSAPP_CANCELACION_SOLICITADA',
    recurso: 'turno_solicitudes',
    recursoId: solicitud.id,
    statusCode: 201,
    metadata: { phone: normalizePhoneDigits(phone), conversation_id: session.id, turno_id: session.turno_id },
  });

  await safeSend(
    phone,
    creada
      ? '✅ Tu solicitud de cancelación fue registrada correctamente. El turno todavía no queda cancelado definitivamente. El consultorio revisará la solicitud y te enviará la confirmación correspondiente.'
      : '⚠️ Tu solicitud de cancelación ya fue registrada. El turno todavía no queda cancelado definitivamente. El consultorio revisará la solicitud y te enviará la confirmación correspondiente.',
  );
  return { ok: true, solicitud };
}

async function resetLegacyAppointmentFlow(session, phone) {
  await finishSession(session, CANCELLED_STATUS);
  await safeSend(phone, '⚠️ Actualizamos el flujo de autogestión. Para iniciar una nueva gestión, escribí 1 para sacar turno, 2 para reprogramar o 3 para cancelar.');
  return { ok: true, reset: true };
}

async function handleExistingDni(session, phone, body) {
  const dni = normalizeDni(body);
  if (!isValidDni(dni)) {
    await safeSend(phone, withCancel('El DNI debe tener 7 u 8 números. Podés enviarlo con o sin puntos.'));
    return { ok: false };
  }

  const paciente = await findPacienteByDni(dni);
  if (paciente) {
    const updated = await updateSession(session, {
      paciente_id: paciente.id,
      data: {
        dni,
        paciente_nombre: `${paciente.nombre} ${paciente.apellido}`,
      },
    });
    await safeSend(phone, `Encontré tu ficha, ${paciente.nombre} ✅`);
    await askAppointmentPreferences(updated, phone);
    return { ok: true };
  }

  await updateSession(session, {
    step: 'ASK_NOMBRE',
    data: { dni, is_new_patient: true },
  });
  await safeSend(phone, withCancel('No encontré un paciente con ese DNI. Para registrarte, enviame tu nombre.'));
  return { ok: true };
}

async function handleAskNombre(session, phone, body) {
  const nombre = String(body || '').trim();
  if (!isValidName(nombre)) {
    await safeSend(phone, withCancel('No pude validar el nombre 😕\n\nEnviame solo letras y espacios, entre 2 y 50 caracteres.'));
    return { ok: false };
  }

  await updateSession(session, {
    step: 'ASK_APELLIDO',
    data: { nombre },
  });
  await safeSend(phone, withCancel('Ahora enviame tu apellido.'));
  return { ok: true };
}

async function handleAskApellido(session, phone, body) {
  const apellido = String(body || '').trim();
  if (!isValidName(apellido)) {
    await safeSend(phone, withCancel('No pude validar el apellido 😕\n\nEnviame solo letras y espacios, entre 2 y 50 caracteres.'));
    return { ok: false };
  }

  const data = { ...(session.data || {}), apellido };
  if (!data.dni) {
    await updateSession(session, {
      step: 'ASK_DNI_NEW',
      data: { apellido },
    });
    await safeSend(phone, withCancel('Por último, enviame tu DNI, solo números.'));
    return { ok: true };
  }

  const paciente = await createPacienteMinimo({
    nombre: data.nombre,
    apellido,
    dni: data.dni,
    phone,
    conversationId: session.id,
  });
  const updated = await updateSession(session, {
    paciente_id: paciente.id,
    data: {
      paciente_nombre: `${paciente.nombre} ${paciente.apellido}`,
    },
  });
  await safeSend(phone, `Listo, ${paciente.nombre}. Ya te registré ✅`);
  await askAppointmentPreferences(updated, phone);
  return { ok: true };
}

async function handleAskDniNew(session, phone, body) {
  const dni = normalizeDni(body);
  if (!isValidDni(dni)) {
    await safeSend(phone, withCancel('El DNI debe tener 7 u 8 números. Podés enviarlo con o sin puntos.'));
    return { ok: false };
  }

  const data = session.data || {};
  const paciente = await createPacienteMinimo({
    nombre: data.nombre,
    apellido: data.apellido,
    dni,
    phone,
    conversationId: session.id,
  });
  const updated = await updateSession(session, {
    paciente_id: paciente.id,
    data: {
      dni,
      paciente_nombre: `${paciente.nombre} ${paciente.apellido}`,
    },
  });
  await safeSend(phone, `Listo, ${paciente.nombre}. Ya podemos buscar un turno ✅`);
  await askAppointmentPreferences(updated, phone);
  return { ok: true };
}

async function handleSelectPrestacion(session, phone, body) {
  const option = parseOption(body);
  const prestaciones = session.data?.prestaciones || [];
  if (!option || option < 1 || option > prestaciones.length) {
    await safeSend(phone, withCancel('No pude encontrar esa prestación 😕\n\nElegí una opción válida respondiendo con el número de la lista.'));
    return { ok: false };
  }

  const prestacion = prestaciones[option - 1];
  const updated = await updateSession(session, {
    prestacion_id: prestacion.id,
    data: {
      prestacion_id: prestacion.id,
      prestacion,
    },
  });

  await audit({
    accion: 'SERVICE_SELECTED_FROM_WHATSAPP',
    recurso: 'whatsapp_conversations',
    recursoId: session.id,
    metadata: { phone: normalizePhoneDigits(phone), prestacion_id: prestacion.id },
  });

  await safeSend(phone, `Elegiste: ${prestacion.nombre} ✅`);
  await askAppointmentPreferences(updated, phone);
  return { ok: true };
}

async function handleSelectDay(session, phone, body, { reschedule = false } = {}) {
  const option = parseOption(body);
  const days = session.data?.days || [];
  if (option === 0 && !reschedule) {
    await sendPrestaciones(session, phone);
    return { ok: true, back: true };
  }
  if (!option || option < 1 || option > days.length) {
    await safeSend(phone, withCancel('No pude encontrar ese día 😕\n\nElegí una opción válida respondiendo con el número de la lista.'));
    return { ok: false };
  }

  const selectedDay = days[option - 1];
  await audit({
    accion: 'DAY_SELECTED_FROM_WHATSAPP',
    recurso: 'whatsapp_conversations',
    recursoId: session.id,
    metadata: { phone: normalizePhoneDigits(phone), fecha: selectedDay.fecha },
  });
  await sendAvailableTimes(session, phone, selectedDay, {
    step: reschedule ? 'RESCHEDULE_SELECT_TIME' : 'SELECT_TIME',
  });
  return { ok: true };
}

async function handleSelectBlock(session, phone, body, { reschedule = false } = {}) {
  const option = parseOption(body);
  if (option === 0) {
    const updated = await updateSession(session, {
      step: reschedule ? 'RESCHEDULE_SELECT_DAY' : 'SELECT_DAY',
      data: {
        selectedBlock: null,
        slots: null,
        selectedSlot: null,
      },
    });
    await sendAvailableDays(updated, phone, { step: updated.step });
    return { ok: true, back: true };
  }

  if (![1, 2].includes(option)) {
    await safeSend(phone, withCancel('No pude entender tu respuesta 😕\n\nElegí:\n1. Mañana\n2. Tarde\n0. Volver a elegir día'));
    return { ok: false };
  }

  const block = option === 1 ? 'manana' : 'tarde';
  const slots = session.data?.slotGroups?.[block] || [];
  if (!slots.length) {
    await safeSend(phone, withCancel(`No hay horarios disponibles por la ${blockLabel(block)}.\n\nElegí otra opción.`));
    return { ok: false };
  }

  await audit({
    accion: 'TIME_BLOCK_SELECTED_FROM_WHATSAPP',
    recurso: 'whatsapp_conversations',
    recursoId: session.id,
    metadata: { phone: normalizePhoneDigits(phone), block },
  });

  await sendSlotsForBlock(session, phone, slots, block, {
    step: reschedule ? 'RESCHEDULE_SELECT_TIME' : 'SELECT_TIME',
    backToBlock: true,
  });
  return { ok: true };
}

async function handleSelectTime(session, phone, body, { reschedule = false } = {}) {
  const option = parseOption(body);

  if (option === 0) {
    if (session.data?.backToBlock) {
      const updated = await updateSession(session, {
        step: reschedule ? 'RESCHEDULE_SELECT_BLOCK' : 'SELECT_BLOCK',
        data: { slots: null, selectedSlot: null },
      });
      await sendBlockQuestion(updated, phone, updated.data.selectedDay, updated.data.slotGroups, { step: updated.step });
      return { ok: true, back: true };
    }

    const updated = await updateSession(session, {
      step: reschedule ? 'RESCHEDULE_SELECT_DAY' : 'SELECT_DAY',
      data: {
        selectedDay: null,
        slots: null,
        selectedSlot: null,
      },
    });
    await sendAvailableDays(updated, phone, { step: updated.step });
    return { ok: true, back: true };
  }

  const slots = session.data?.slots || [];
  const timeInput = parseTimeInput(body);
  const selectedSlot = timeInput
    ? slots.find((slot) => slot.inicio === timeInput)
    : option && option >= 1 && option <= slots.length
      ? slots[option - 1]
      : null;

  if (!selectedSlot) {
    const message = timeInput
      ? 'Ese horario no está disponible 😕\n\nPor favor elegí una opción de la lista.'
      : 'No pude interpretar esa respuesta 😕\n\nElegí una opción escribiendo el número o el horario exacto, por ejemplo 1 o 13:45.';
    await safeSend(phone, withCancel(message));
    return { ok: false };
  }

  await audit({
    accion: 'TIME_SELECTED_FROM_WHATSAPP',
    recurso: 'whatsapp_conversations',
    recursoId: session.id,
    metadata: { phone: normalizePhoneDigits(phone), time: selectedSlot.inicio },
  });

  await askAppointmentConfirmation(session, phone, selectedSlot, {
    step: reschedule ? 'RESCHEDULE_CONFIRM' : 'CONFIRM_APPOINTMENT',
  });
  return { ok: true };
}

async function isSelectedSlotStillAvailable(session) {
  const data = session.data || {};
  const selectedDay = data.selectedDay;
  const selectedSlot = data.selectedSlot;
  const prestacionId = session.prestacion_id || data.prestacion_id;
  const profesionalId = session.profesional_id || data.profesional_id || null;
  if (!selectedDay?.fecha || !selectedSlot?.inicio || !prestacionId) return false;

  const slots = await consultarDisponibilidad({ profesionalId, fecha: selectedDay.fecha, prestacionId });
  return slots.some((slot) => slot.disponible && slot.inicio === selectedSlot.inicio);
}

async function restartTimeSelection(session, phone, { reschedule = false } = {}) {
  const data = session.data || {};
  await safeSend(phone, 'Lo siento, ese horario acaba de ser reservado 😕\n\nTe muestro nuevamente los horarios disponibles.');
  return sendAvailableTimes(session, phone, data.selectedDay, {
    step: reschedule ? 'RESCHEDULE_SELECT_TIME' : 'SELECT_TIME',
  });
}

async function handleConfirmRequest(session, phone, body) {
  const option = parseOption(body);
  if (![1, 2].includes(option)) {
    await safeSend(phone, withCancel('No pude entender tu respuesta 😕\n\nRespondé:\n1. Enviar solicitud\n2. Cancelar'));
    return { ok: false };
  }

  if (option === 2) {
    await finishSession(session, CANCELLED_STATUS);
    await safeSend(phone, CANCELLED_MESSAGE);
    return { ok: true, cancelled: true };
  }

  const data = session.data || {};
  const motivo = data.motivo_consulta || 'Sin motivo informado';
  const diasPreferidos = data.dias_preferidos || 'Sin preferencia indicada';
  const momentoPreferido = data.momento_preferido || 'Sin preferencia indicada';
  const preferencia = [
    `Motivo: ${motivo}`,
    `Dias preferidos: ${diasPreferidos}`,
    `Horario preferido: ${momentoPreferido}`,
  ].join('\n');
  const turno = await crearSolicitudTurno({
    pacienteId: session.paciente_id,
    prestacionId: null,
    origen: 'autogestion_whatsapp',
    preferencia,
    observaciones: `Solicitud por WhatsApp.\n${preferencia}`,
  });
  const turnoDetalle = await obtenerTurnoDetalle(turno.id);

  await finishSession(session, COMPLETED_STATUS);
  await audit({
    accion: 'APPOINTMENT_REQUESTED_FROM_WHATSAPP',
    recurso: 'turnos',
    recursoId: turno.id,
    statusCode: 200,
    metadata: {
      phone: normalizePhoneDigits(phone),
      conversation_id: session.id,
      motivo,
      dias_preferidos: diasPreferidos,
      momento_preferido: momentoPreferido,
    },
  });

  await safeSend(
    phone,
    `✅ Recibimos tu solicitud de turno.\n\n📝 Motivo: ${motivo}\n\nEl consultorio revisará tu consulta y te confirmará el día y horario por WhatsApp. Gracias.`,
  );

  return { ok: true, turno: turnoDetalle };
}

async function handleConfirmRequestV2(session, phone, body) {
  const option = parseOption(body);
  if (![1, 2].includes(option)) {
    await safeSend(phone, withCancel('No pude entender tu respuesta.\n\nResponde:\n1. Enviar solicitud\n2. Cancelar'));
    return { ok: false };
  }

  if (option === 2) {
    await finishSession(session, CANCELLED_STATUS);
    await safeSend(phone, CANCELLED_MESSAGE);
    return { ok: true, cancelled: true };
  }

  const data = session.data || {};
  const motivo = data.motivo_consulta || 'Sin motivo informado';
  const diasPreferidos = data.dias_preferidos || 'Sin preferencia indicada';
  const momentoPreferido = data.momento_preferido || 'Sin preferencia indicada';
  const preferencia = [
    `Motivo: ${motivo}`,
    `Dias preferidos: ${diasPreferidos}`,
    `Horario preferido: ${momentoPreferido}`,
  ].join('\n');

  const turno = await crearSolicitudTurno({
    pacienteId: session.paciente_id,
    prestacionId: null,
    origen: 'autogestion_whatsapp',
    preferencia,
    observaciones: `Solicitud por WhatsApp.\n${preferencia}`,
  });
  const turnoDetalle = await obtenerTurnoDetalle(turno.id);

  await finishSession(session, COMPLETED_STATUS);
  await audit({
    accion: 'APPOINTMENT_REQUESTED_FROM_WHATSAPP',
    recurso: 'turnos',
    recursoId: turno.id,
    statusCode: 200,
    metadata: {
      phone: normalizePhoneDigits(phone),
      conversation_id: session.id,
      motivo,
      dias_preferidos: diasPreferidos,
      momento_preferido: momentoPreferido,
    },
  });

  await safeSend(
    phone,
    `Solicitud recibida correctamente.\n\nMotivo: ${motivo}\nDias preferidos: ${diasPreferidos}\nHorario preferido: ${momentoPreferido}\n\nEl consultorio revisara tu consulta y te confirmara el dia y horario por WhatsApp. Gracias.`,
  );

  return { ok: true, turno: turnoDetalle };
}

async function handleConfirmAppointment(session, phone, body) {
  const option = parseOption(body);
  if (option === 0) {
    return handleSelectTime(session, phone, '0');
  }
  if (![1, 2].includes(option)) {
    await safeSend(phone, withCancel('No pude entender tu respuesta 😕\n\nRespondé:\n1. Confirmar turno\n2. Cancelar solicitud\n0. Volver a elegir horario'));
    return { ok: false };
  }

  if (option === 2) {
    await finishSession(session, CANCELLED_STATUS);
    await safeSend(phone, CANCELLED_MESSAGE);
    return { ok: true, cancelled: true };
  }

  if (!(await isSelectedSlotStillAvailable(session))) {
    return restartTimeSelection(session, phone);
  }

  const data = session.data || {};
  const fechaHoraInicio = new Date(data.selectedSlot.fecha_hora_inicio);
  const turno = await crearTurno({
    pacienteId: session.paciente_id,
    prestacionId: session.prestacion_id,
    profesionalId: session.profesional_id || data.profesional_id || null,
    fechaHoraInicio,
    origen: 'autogestion_whatsapp',
    observaciones: 'Turno solicitado por WhatsApp',
  });

  const { rows } = await pool.query(
    `UPDATE turnos SET estado = 'confirmado', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [turno.id],
  );
  const turnoDetalle = await obtenerTurnoDetalle(turno.id);

  await finishSession(session, COMPLETED_STATUS);
  await audit({
    accion: 'APPOINTMENT_CONFIRMED_FROM_WHATSAPP',
    recurso: 'turnos',
    recursoId: turno.id,
    statusCode: 200,
    metadata: { phone: normalizePhoneDigits(phone), conversation_id: session.id },
  });

  await safeSend(
    phone,
    `✅ Tu turno quedó confirmado.\n\n📅 Fecha: ${data.selectedDay.label || formatFechaHumana(formatDateYmd(fechaHoraInicio))}\n🕒 Hora: ${data.selectedSlot.inicio}\n🦷 Prestación: ${data.prestacion?.nombre || 'seleccionada'}\n\nTe enviaremos un recordatorio 24 horas antes.\n\nSi necesitás cancelar o reprogramar más adelante, podés escribir:\n"cancelar turno"\no\n"reprogramar turno".`,
  );

  return { ok: true, turno: turnoDetalle || rows[0] };
}

async function handleConfirmReschedule(session, phone, body) {
  const option = parseOption(body);
  if (option === 0) return handleSelectTime(session, phone, '0', { reschedule: true });

  if (![1, 2].includes(option)) {
    await safeSend(phone, withCancel('No pude entender tu respuesta 😕\n\nRespondé:\n1. Confirmar reprogramación\n2. Cancelar solicitud\n0. Volver a elegir horario'));
    return { ok: false };
  }

  if (option === 2) {
    await finishSession(session, CANCELLED_STATUS);
    await safeSend(phone, CANCELLED_MESSAGE);
    return { ok: true, cancelled: true };
  }

  if (!(await isSelectedSlotStillAvailable(session))) {
    return restartTimeSelection(session, phone, { reschedule: true });
  }

  const data = session.data || {};
  const fechaInicio = new Date(data.selectedSlot.fecha_hora_inicio);
  const fechaFin = new Date(data.selectedSlot.fecha_hora_fin);
  const turno = await reprogramarTurno(session.turno_id, fechaInicio, fechaFin);
  const { rows } = await pool.query(
    `UPDATE turnos SET estado = 'confirmado', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [turno.id],
  );
  const turnoDetalle = await obtenerTurnoDetalle(turno.id);

  await finishSession(session, COMPLETED_STATUS);
  await audit({
    accion: 'APPOINTMENT_CONFIRMED_FROM_WHATSAPP',
    recurso: 'turnos',
    recursoId: turno.id,
    statusCode: 200,
    metadata: { phone: normalizePhoneDigits(phone), conversation_id: session.id, rescheduled: true },
  });

  await safeSend(
    phone,
    `✅ Tu turno fue reprogramado y quedó confirmado.\n\n📅 Fecha: ${data.selectedDay.label}\n🕒 Hora: ${data.selectedSlot.inicio}\n🦷 Prestación: ${data.prestacion?.nombre || 'seleccionada'}`,
  );

  return { ok: true, turno: turnoDetalle || rows[0] };
}

async function startCancelAppointmentFlow(phone) {
  const turno = await findNextManagedAppointment(phone, TURN_STATES_WHATSAPP_CANCELABLE);
  if (!turno) {
    await safeSend(phone, 'No encontré un turno futuro asociado a este número.\n\nSi necesitás ayuda, comunicate con el consultorio. 🦷');
    return { handled: true, ok: false, codigo: 'NO_UPCOMING_APPOINTMENT' };
  }

  const session = await createSession(phone, 'MANAGE_CANCEL_CONFIRM', {
    mode: 'cancel_appointment',
    paciente_nombre: `${turno.paciente?.nombre || ''} ${turno.paciente?.apellido || ''}`.trim(),
    prestacion: turno.prestacion,
    turno_id: turno.id,
  });

  await updateSession(session, {
    paciente_id: turno.paciente?.id,
    prestacion_id: turno.prestacion?.id,
    profesional_id: turno.profesional?.id,
    turno_id: turno.id,
  });

  await audit({
    accion: 'WHATSAPP_CANCEL_FLOW_STARTED',
    recurso: 'turnos',
    recursoId: turno.id,
    metadata: { phone: normalizePhoneDigits(phone), conversation_id: session.id },
  });

  await safeSend(
    phone,
    withCancel(
      `${buildManagedAppointmentMessage(turno, 'Encontré tu próximo turno:')}\n\n¿Querés cancelarlo?\n\n1. Sí, cancelar turno\n2. No, mantener turno`,
    ),
  );

  return { handled: true, ok: true, session_id: session.id };
}

async function startManagedRescheduleFlow(phone) {
  const turno = await findNextManagedAppointment(phone, TURN_STATES_WHATSAPP_REPROGRAMMABLE);
  if (!turno) {
    await safeSend(phone, 'No encontré un turno futuro asociado a este número.\n\nSi necesitás ayuda, comunicate con el consultorio. 🦷');
    return { handled: true, ok: false, codigo: 'NO_UPCOMING_APPOINTMENT' };
  }

  return startRescheduleFlow(phone, turno.id);
}

async function handleManagedCancelConfirm(session, phone, body) {
  const option = parseOption(body);

  if (![1, 2].includes(option)) {
    await safeSend(phone, withCancel('No pude entender tu respuesta 😕\n\nRespondé:\n1. Sí, cancelar turno\n2. No, mantener turno'));
    return { ok: false };
  }

  if (option === 2) {
    await finishSession(session, CANCELLED_STATUS);
    await safeSend(phone, 'Perfecto, mantenemos tu turno ✅\n\nNo hice ningún cambio.');
    return { ok: true, cancelled: true };
  }

  const turnoDetallePendiente = await obtenerTurnoDetalle(session.turno_id);
  const fechaHoraPendiente = formatTurnoFechaHora(turnoDetallePendiente.fecha_hora_inicio);
  const { solicitud, creada } = await abrirSolicitudCambioTurno({
    tipoSolicitud: 'cancelacion',
    pacienteId: turnoDetallePendiente.paciente?.id || session.paciente_id || null,
    nombreApellido: `${turnoDetallePendiente.paciente?.nombre || ''} ${turnoDetallePendiente.paciente?.apellido || ''}`.trim() || session.data?.paciente_nombre || null,
    dni: turnoDetallePendiente.paciente?.dni || session.data?.dni || 'sin_dni',
    telefono: normalizePhoneForStorage(phone) || normalizePhoneDigits(phone),
    turnoId: turnoDetallePendiente.id,
    observaciones: `Solicitud de cancelacion por WhatsApp. Turno actual: ${fechaHoraPendiente.fecha} ${fechaHoraPendiente.hora}`,
    auditoria: { phone: normalizePhoneDigits(phone), conversation_id: session.id, tipo_solicitud: 'cancelacion' },
  });

  await finishSession(session, COMPLETED_STATUS);
  await audit({
    accion: 'WHATSAPP_CANCELACION_SOLICITADA',
    recurso: 'turno_solicitudes',
    recursoId: solicitud.id,
    statusCode: 201,
    metadata: { phone: normalizePhoneDigits(phone), conversation_id: session.id, turno_id: turnoDetallePendiente.id },
  });
  await safeSend(
    phone,
    creada
      ? '✅ Tu solicitud de cancelación fue registrada correctamente. El turno todavía no queda cancelado definitivamente. El consultorio revisará la solicitud y te enviará la confirmación correspondiente.'
      : '⚠️ Tu solicitud de cancelación ya fue registrada. El turno todavía no queda cancelado definitivamente. El consultorio revisará la solicitud y te enviará la confirmación correspondiente.',
  );
  return { ok: true, turno: turnoDetallePendiente, solicitud };

}

async function processAutogestionMessage(phone, body, {
  storagePhone = null,
  allowSessionStart = false,
  sourceEvent = null,
  messageId = null,
  messageTimestamp = null,
  fromMe = null,
} = {}) {
  await ensureAutogestionSchema();
  const text = String(body || '').trim();
  if (!text) return { handled: false };

  const telefonoResuelto = normalizePhoneForStorage(storagePhone);

  const state = await getActiveSessionState(phone);
  let session = state.session;

  if (!session && state.expired) {
    if (isCourtesyMessage(text)) {
      await safeSend(phone, COURTESY_MESSAGE);
      return { handled: true, courtesy: true };
    }
    await audit({
      accion: 'BOT_SESSION_EXPIRED',
      recurso: 'whatsapp_conversations',
      recursoId: state.expired.id,
      metadata: { phone: normalizePhoneDigits(phone) },
    });
    await safeSend(phone, EXPIRED_MESSAGE);
    return { handled: true, expired: true };
  }

  if (!session) {
    const canStartSession = allowSessionStart === true
      && sourceEvent === 'message'
      && fromMe === false;
    if (!canStartSession) {
      return { handled: false, codigo: 'SESSION_START_NOT_ALLOWED' };
    }

    if (isCourtesyMessage(text)) {
      await safeSend(phone, COURTESY_MESSAGE);
      return { handled: true, courtesy: true };
    }
    const isDirectMenuCommand = isStrictMenuCommand(text);
    if (!isDirectMenuCommand && !(await shouldStartAutogestion(text))) {
      return { handled: false, codigo: 'NO_AUTOGESTION_COMMAND' };
    }

    if (!isDirectMenuCommand) {
      const result = await startAutogestion(phone, {
        storagePhone: telefonoResuelto,
        auditContext: { sourceEvent, messageId, messageTimestamp },
      });
      return { handled: true, ...result };
    }

    session = await createSession(phone, 'esperando_opcion_menu', {
      mode: 'guided_requests',
      ...(telefonoResuelto && { telefono_resuelto: telefonoResuelto }),
    });
    await audit({
      accion: 'BOT_SESSION_STARTED',
      recurso: 'whatsapp_conversations',
      recursoId: session.id,
      metadata: {
        phone: normalizePhoneDigits(phone),
        command: text,
        sourceEvent,
        messageId,
        messageTimestamp,
        trigger: 'direct_command',
      },
    });
    const result = await handleGuidedMenu(session, phone, text);
    return { handled: true, started: true, session_id: session.id, ...result };
  }

  if (telefonoResuelto && !session.data?.telefono_resuelto) {
    session = await updateSession(session, {
      data: { telefono_resuelto: telefonoResuelto },
    });
  }

  if (isCancelCommand(text)) {
    await finishSession(session, CANCELLED_STATUS);
    await audit({
      accion: 'BOT_SESSION_CANCELLED',
      recurso: 'whatsapp_conversations',
      recursoId: session.id,
      metadata: { phone: normalizePhoneDigits(phone), step: session.step },
    });
    await safeSend(phone, CANCELLED_MESSAGE);
    return { handled: true, cancelled: true };
  }

  await audit({
    accion: 'WHATSAPP_AUTOGESTION_MESSAGE',
    recurso: 'whatsapp_conversations',
    recursoId: session.id,
    metadata: { phone: normalizePhoneDigits(phone), step: session.step, body: text },
  });

  const handlers = {
    esperando_opcion_menu: () => handleGuidedMenu(session, phone, text),
    esperando_dni: () => handleGuidedDni(session, phone, text),
    esperando_dni_no_encontrado: () => handleGuidedDniNotFound(session, phone, text),
    esperando_nombre_apellido: () => handleGuidedNombreApellido(session, phone, text),
    esperando_motivo: () => handleGuidedMotivo(session, phone, text),
    esperando_preferencia_horaria: () => handleGuidedPreference(session, phone, text),
    esperando_confirmacion_solicitud: () => handleGuidedConfirmRequest(session, phone, text),
    esperando_confirmacion_reprogramacion: () => handleGuidedConfirmRequest(session, phone, text),
    esperando_confirmacion_cancelacion: () => handleGuidedConfirmCancellation(session, phone, text),
    ASK_EXISTING: () => resetLegacyAppointmentFlow(session, phone),
    ASK_DNI_EXISTING: () => resetLegacyAppointmentFlow(session, phone),
    ASK_NOMBRE: () => resetLegacyAppointmentFlow(session, phone),
    ASK_APELLIDO: () => resetLegacyAppointmentFlow(session, phone),
    ASK_DNI_NEW: () => resetLegacyAppointmentFlow(session, phone),
    SELECT_PRESTACION: () => resetLegacyAppointmentFlow(session, phone),
    ASK_REQUEST_PREFERENCES: () => resetLegacyAppointmentFlow(session, phone),
    ASK_REQUEST_DAYS: () => resetLegacyAppointmentFlow(session, phone),
    ASK_REQUEST_TIME_BLOCK: () => resetLegacyAppointmentFlow(session, phone),
    CONFIRM_REQUEST: () => resetLegacyAppointmentFlow(session, phone),
    SELECT_DAY: () => resetLegacyAppointmentFlow(session, phone),
    SELECT_BLOCK: () => resetLegacyAppointmentFlow(session, phone),
    SELECT_TIME: () => resetLegacyAppointmentFlow(session, phone),
    CONFIRM_APPOINTMENT: () => resetLegacyAppointmentFlow(session, phone),
    RESCHEDULE_SELECT_DAY: () => resetLegacyAppointmentFlow(session, phone),
    RESCHEDULE_SELECT_BLOCK: () => resetLegacyAppointmentFlow(session, phone),
    RESCHEDULE_SELECT_TIME: () => resetLegacyAppointmentFlow(session, phone),
    RESCHEDULE_CONFIRM: () => resetLegacyAppointmentFlow(session, phone),
    MANAGE_CANCEL_CONFIRM: () => handleManagedCancelConfirm(session, phone, text),
  };

  const handler = handlers[session.step];
  if (!handler) {
    await finishSession(session, CANCELLED_STATUS);
    await safeSend(phone, '⚠️ La conversación anterior no pudo continuar.\n\nPara iniciar una nueva gestión, escribí 1 para sacar turno, 2 para reprogramar o 3 para cancelar.');
    return { handled: true, reset: true };
  }

  try {
    const result = await handler();
    if (result && result.ok === false) {
      await audit({
        accion: 'BOT_INVALID_RESPONSE',
        recurso: 'whatsapp_conversations',
        recursoId: session.id,
        metadata: { phone: normalizePhoneDigits(phone), step: session.step, body: text },
      });
    }
    return { handled: true, session_id: session.id, ...result };
  } catch (error) {
    console.error('[WHATSAPP AUTOGESTION] Error:', error);
    await audit({
      accion: 'WHATSAPP_BOT_ERROR',
      recurso: 'whatsapp_conversations',
      recursoId: session.id,
      statusCode: 500,
      metadata: { phone: normalizePhoneDigits(phone), step: session.step, error: error.message },
    });
    await safeSend(phone, 'Ocurrió un problema al procesar tu solicitud 😕\n\nPor favor intentá nuevamente más tarde o comunicate con el consultorio.');
    return { handled: true, error: true };
  }
}

async function processAutogestionNonTextMessage(phone) {
  const state = await getActiveSessionState(phone);
  if (!state.session && state.expired) {
    await safeSend(phone, EXPIRED_MESSAGE);
    return { handled: true, expired: true };
  }
  if (!state.session) return { handled: false };
  await safeSend(phone, TEXT_ONLY_MESSAGE);
  return { handled: true };
}

async function startRescheduleFlow(phone, appointmentId) {
  const turno = await obtenerTurnoDetalle(appointmentId);
  if (!TURN_STATES_WHATSAPP_REPROGRAMMABLE.includes(turno.estado)) {
    await safeSend(phone, 'Ese turno no se puede reprogramar por WhatsApp.\n\nSi necesitás ayuda, comunicate con el consultorio. 🦷');
    return { ok: false };
  }

  const { fecha, hora } = formatTurnoFechaHora(turno.fecha_hora_inicio);
  const { solicitud, creada } = await abrirSolicitudCambioTurno({
    tipoSolicitud: 'reprogramacion',
    pacienteId: turno.paciente?.id || null,
    nombreApellido: `${turno.paciente?.nombre || ''} ${turno.paciente?.apellido || ''}`.trim() || null,
    dni: turno.paciente?.dni || 'sin_dni',
    telefono: normalizePhoneForStorage(phone) || normalizePhoneDigits(phone),
    turnoId: turno.id,
    observaciones: `Solicitud de reprogramacion por WhatsApp. Turno actual: ${fecha} ${hora}`,
    auditoria: { phone: normalizePhoneDigits(phone), appointment_id: turno.id, tipo_solicitud: 'reprogramacion' },
  });

  await audit({
    accion: 'WHATSAPP_REPROGRAMACION_SOLICITADA',
    recurso: 'turno_solicitudes',
    recursoId: solicitud.id,
    statusCode: 201,
    metadata: { phone: normalizePhoneDigits(phone), turno_id: turno.id },
  });

  const pacienteNombre = `${turno.paciente?.nombre || ''} ${turno.paciente?.apellido || ''}`.trim() || 'paciente';
  await safeSend(
    phone,
    creada
      ? `✅ Entendido, ${pacienteNombre}. Registramos tu solicitud de reprogramación. El consultorio revisará la agenda y se comunicará con vos para coordinar un nuevo día y horario.`
      : `⚠️ Entendido, ${pacienteNombre}. Tu solicitud de reprogramación ya estaba registrada. El consultorio revisará la agenda y se comunicará con vos para coordinar un nuevo día y horario.`,
  );
  return { ok: true, solicitud, created: creada };

}

module.exports = {
  ensureAutogestionSchema,
  shouldStartAutogestion,
  processAutogestionMessage,
  processAutogestionNonTextMessage,
  hasActiveAutogestionSession,
  startRescheduleFlow,
};
