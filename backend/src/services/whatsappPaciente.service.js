const { pool } = require('../config/db');
const { crearPaciente } = require('./pacientesService');
const { registrarAuditoria } = require('./auditoriaService');
const { normalizePhoneDigits, normalizePhoneForStorage } = require('./whatsappClient.service');
const { diagnosticFingerprint } = require('../utils/whatsappPrivacy');

function normalizeDni(value) {
  return String(value || '').replace(/\D/g, '');
}

function adaptarTelefonoWhatsappAFormatoPaciente(phone) {
  const normalized = normalizePhoneForStorage(phone);
  if (!normalized) return null;

  const countryCode = String(process.env.DEFAULT_COUNTRY_CODE || '54').replace(/\D/g, '');
  const mobilePrefix = String(process.env.DEFAULT_MOBILE_PREFIX || '9').replace(/\D/g, '');
  const mobileInternationalPrefix = `${countryCode}${mobilePrefix}`;

  if (mobilePrefix && normalized.startsWith(mobileInternationalPrefix)) {
    const nationalNumber = normalized.slice(mobileInternationalPrefix.length);
    if (/^[1-9]\d{9}$/.test(nationalNumber)) return nationalNumber;
  }

  if (countryCode && normalized.startsWith(countryCode)) {
    const nationalNumber = normalized.slice(countryCode.length);
    if (/^[1-9]\d{9}$/.test(nationalNumber)) return nationalNumber;
  }

  return normalized;
}

function obtenerTelefonoPersistibleWhatsapp({ phone = null, storagePhone = null } = {}) {
  return adaptarTelefonoWhatsappAFormatoPaciente(storagePhone)
    || adaptarTelefonoWhatsappAFormatoPaciente(phone)
    || null;
}

async function completarTelefonoPacienteSiVacio(paciente, { phone = null, storagePhone = null } = {}) {
  if (!paciente?.id || String(paciente.telefono || '').trim()) return paciente;

  const telefono = obtenerTelefonoPersistibleWhatsapp({ phone, storagePhone });
  if (!telefono) return paciente;

  const { rows } = await pool.query(
    `
      UPDATE pacientes
      SET telefono = $1, updated_at = NOW()
      WHERE id = $2
        AND COALESCE(TRIM(telefono), '') = ''
      RETURNING id, nombre, apellido, dni, telefono
    `,
    [telefono, paciente.id],
  );

  return rows[0] || paciente;
}

async function createPacienteMinimo({
  nombre,
  apellido,
  dni,
  phone = null,
  storagePhone = null,
  conversationId = null,
} = {}) {
  const dniNormalizado = normalizeDni(dni);
  const existenteResult = await pool.query(
    'SELECT id, nombre, apellido, dni, telefono FROM pacientes WHERE dni = $1 LIMIT 1',
    [dniNormalizado],
  );
  const existente = existenteResult.rows[0] || null;

  if (existente) {
    return completarTelefonoPacienteSiVacio(existente, { phone, storagePhone });
  }

  const telefono = obtenerTelefonoPersistibleWhatsapp({ phone, storagePhone });
  const paciente = await crearPaciente({
    nombre,
    apellido,
    dni: dniNormalizado,
    telefono,
  });

  try {
    await registrarAuditoria({
      accion: 'PATIENT_CREATED_FROM_WHATSAPP',
      recurso: 'pacientes',
      recursoId: paciente.id,
      statusCode: 200,
      metadata: {
        phone_fingerprint: diagnosticFingerprint(telefono || normalizePhoneDigits(phone)),
        conversation_id: conversationId,
      },
    });
  } catch (error) {
    console.warn('[WHATSAPP AUTOGESTION] No se pudo registrar auditoria:', error.message);
  }

  return paciente;
}

module.exports = {
  adaptarTelefonoWhatsappAFormatoPaciente,
  completarTelefonoPacienteSiVacio,
  createPacienteMinimo,
  obtenerTelefonoPersistibleWhatsapp,
};
