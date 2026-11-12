const { pool } = require('../config/db');

const ROLES_AGENDA = new Set(['dueno', 'recepcion', 'odontologo']);

function error(res, status, mensaje, codigo) { return res.status(status).json({ mensaje, codigo }); }

function autorizarAgenda(req, res, next) {
  if (!req.user || !ROLES_AGENDA.has(req.user.rol)) return error(res, 403, 'No tiene permiso para acceder a Turnos', 'TURNOS_DENEGADO');
  return next();
}

async function obtenerPerfilUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.nombre_mostrado
     FROM profesionales p
     JOIN usuarios u ON u.id=p.usuario_id AND COALESCE(u.activo,true)=true
     JOIN usuarios_roles_vigentes ur ON ur.usuario_id=u.id
     JOIN roles r ON r.id=ur.rol_id AND r.codigo='odontologo'
     WHERE p.usuario_id=$1 AND p.activo=true AND p.vinculo_confirmado_at IS NOT NULL
     LIMIT 1`, [usuarioId]);
  return rows[0] || null;
}

async function resolverAlcanceAgenda(req, res, next) {
  try {
    if (req.user.rol !== 'odontologo') { req.agenda = { general: true, ocultarClinica: req.user.rol === 'recepcion' }; return next(); }
    const perfil = await obtenerPerfilUsuario(req.user.id);
    if (!perfil) return error(res, 403, 'La cuenta no tiene un perfil profesional confirmado y activo para acceder a su agenda', 'PROFESIONAL_NO_CONFIRMADO');
    req.agenda = { general: false, profesionalPerfilId: perfil.id, ocultarClinica: false };
    return next();
  } catch (e) { return next(e); }
}

async function validarPerfilElegible(id) {
  const perfilId = Number(id);
  if (!Number.isInteger(perfilId) || perfilId <= 0) return null;
  const { rows } = await pool.query(
    `SELECT p.id,p.nombre_mostrado FROM profesionales p
     JOIN usuarios u ON u.id=p.usuario_id AND COALESCE(u.activo,true)=true
     JOIN usuarios_roles_vigentes ur ON ur.usuario_id=u.id
     JOIN roles r ON r.id=ur.rol_id AND r.codigo IN ('odontologo','dueno')
     WHERE p.id=$1 AND p.activo=true AND p.vinculo_confirmado_at IS NOT NULL LIMIT 1`, [perfilId]);
  return rows[0] || null;
}

async function resolverProfesionalEscritura(req, res, next) {
  try {
    if (req.user.rol === 'odontologo') { req.profesionalResponsableId = req.agenda.profesionalPerfilId; return next(); }
    const enviado = req.body?.profesionalPerfilId ?? req.body?.profesionalId;
    if (enviado === undefined || enviado === null || enviado === '') return error(res, 400, 'Debe seleccionar un perfil profesional elegible', 'PROFESIONAL_REQUERIDO');
    const perfil = await validarPerfilElegible(enviado);
    if (!perfil) return error(res, 400, 'El perfil profesional no esta confirmado, activo o su cuenta no tiene un rol compatible', 'PROFESIONAL_NO_ELEGIBLE');
    req.profesionalResponsableId = perfil.id;
    return next();
  } catch (e) { return next(e); }
}

async function autorizarTurnoObjetivo(req, res, next) {
  try {
    if (req.agenda.general) return next();
    const id = Number(req.params.id);
    const { rowCount } = await pool.query('SELECT id FROM turnos WHERE id=$1 AND profesional_perfil_id=$2', [id, req.agenda.profesionalPerfilId]);
    if (!rowCount) return error(res, 403, 'El turno no pertenece a la agenda del profesional autenticado', 'AGENDA_AJENA');
    return next();
  } catch (e) { return next(e); }
}

module.exports = { autorizarAgenda, resolverAlcanceAgenda, resolverProfesionalEscritura, autorizarTurnoObjetivo };
