const { pool } = require('../config/db');

const ROLES_ADMIN_PACIENTES = new Set(['dueno', 'recepcion', 'odontologo']);
const ROLES_CLINICA_PACIENTES = new Set(['dueno', 'odontologo']);
const CAMPOS_CLINICOS = new Set([
  'antecedentes', 'observaciones', 'observaciones_clinicas', 'alergias', 'condiciones',
  'estado_tratamiento', 'declaracion', 'declaracion_salud', 'respuestas', 'odontograma',
  'odontograma_snapshot', 'historia_clinica_id', 'historias_clinicas', 'atenciones',
  'tratamientos', 'protesis', 'protesis_fijas', 'protesis_removibles', 'documentos',
]);

function denegar(res, mensaje, codigo) { return res.status(403).json({ mensaje, codigo }); }

function autorizarAdministracionPacientes(req, res, next) {
  if (!req.user || !ROLES_ADMIN_PACIENTES.has(req.user.rol)) {
    return denegar(res, 'No tiene permiso para acceder a los datos administrativos de pacientes', 'PACIENTES_ADMIN_DENEGADO');
  }
  return next();
}

function autorizarClinicaPacientes(req, res, next) {
  if (!req.user || !ROLES_CLINICA_PACIENTES.has(req.user.rol)) {
    return denegar(res, 'No tiene permiso para acceder a datos clinicos de pacientes', 'PACIENTES_CLINICA_DENEGADO');
  }
  return next();
}

function rechazarCamposClinicosEnAdministracion(req, res, next) {
  const encontrados = Object.keys(req.body || {}).filter((campo) => CAMPOS_CLINICOS.has(campo));
  if (encontrados.length) {
    return res.status(400).json({ mensaje: 'Los datos clínicos no pueden modificarse desde una ruta administrativa', codigo: 'CAMPOS_CLINICOS_NO_PERMITIDOS', campos: encontrados });
  }
  return next();
}

async function exigirProfesionalConfirmado(req, res, next) {
  try {
    if (req.user?.rol === 'dueno') return next();
    if (req.user?.rol !== 'odontologo') return denegar(res, 'La operación requiere un profesional odontólogo', 'PROFESIONAL_REQUERIDO');
    const { rows } = await pool.query(
      `SELECT id, nombre_mostrado FROM profesionales
       WHERE usuario_id = $1 AND activo = TRUE AND vinculo_confirmado_at IS NOT NULL LIMIT 1`,
      [req.user.id],
    );
    if (!rows[0]) return denegar(res, 'La cuenta no tiene un perfil profesional confirmado y activo', 'PROFESIONAL_NO_CONFIRMADO');
    req.profesional = rows[0];
    req.auditMeta = { ...(req.auditMeta || {}), profesional_id: rows[0].id };
    return next();
  } catch (error) { return next(error); }
}

module.exports = { autorizarAdministracionPacientes, autorizarClinicaPacientes, rechazarCamposClinicosEnAdministracion, exigirProfesionalConfirmado };
