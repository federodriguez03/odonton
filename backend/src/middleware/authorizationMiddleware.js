const { hasRole, permissionsFor } = require('../domain/authorizationPolicy');

function denegar(res, codigo, mensaje, status = 403) {
  return res.status(status).json({ codigo, mensaje });
}

function tieneRol(identity, rol) {
  return hasRole(identity, rol);
}

function exigirPermiso(permiso) {
  return function autorizar(req, res, next) {
    if (!permissionsFor(req.user)[permiso]) {
      return denegar(res, 'PERMISO_INSUFICIENTE', 'No tiene permisos para realizar esta operación');
    }
    return next();
  };
}

function exigirAlgunRol(...roles) {
  return function autorizar(req, res, next) {
    if (!roles.some((rol) => tieneRol(req.user, rol))) {
      return denegar(res, 'PERMISO_INSUFICIENTE', 'No tiene permisos para realizar esta operación');
    }
    return next();
  };
}

function exigirTodosLosRoles(...roles) {
  return function autorizar(req, res, next) {
    if (!roles.every((rol) => tieneRol(req.user, rol))) {
      return denegar(res, 'PERMISO_INSUFICIENTE', 'No tiene permisos para realizar esta operación');
    }
    return next();
  };
}

const autorizarPacientesAdministrativos = exigirAlgunRol('recepcion', 'odontologo');
const autorizarLecturaClinica = exigirAlgunRol('odontologo');

function autorizarAgenda(req, res, next) {
  const recepcion = tieneRol(req.user, 'recepcion');
  const odontologo = tieneRol(req.user, 'odontologo');
  if (!recepcion && !odontologo) {
    return denegar(res, 'PERMISO_AGENDA_REQUERIDO', 'Se requiere rol recepción u odontólogo');
  }
  if (recepcion) {
    req.agendaAccess = { alcance: 'general', usuario_id: req.user.usuario_id };
    return next();
  }
  if (!req.user.profesional_perfil_id || req.user.profesional?.activo !== true) {
    return denegar(res, 'PERFIL_PROFESIONAL_NO_HABILITADO', 'El perfil profesional no está habilitado para operar agenda');
  }
  req.agendaAccess = {
    alcance: 'propia',
    usuario_id: req.user.usuario_id,
    profesional_perfil_id: req.user.profesional_perfil_id,
  };
  return next();
}

function autorizarEscrituraClinica(req, res, next) {
  if (!tieneRol(req.user, 'odontologo')) {
    return denegar(res, 'PERMISO_CLINICO_REQUERIDO', 'Se requiere rol odontólogo');
  }
  const perfil = req.user?.profesional;
  if (!req.user?.profesional_perfil_id || !perfil || perfil.activo !== true) {
    return denegar(
      res,
      'PERFIL_PROFESIONAL_NO_HABILITADO',
      'Se requiere un perfil profesional vinculado, activo y habilitado',
    );
  }
  req.clinicalActor = {
    usuario_id: req.user.usuario_id,
    profesional_perfil_id: req.user.profesional_perfil_id,
  };
  return next();
}

module.exports = {
  autorizarAgenda,
  autorizarEscrituraClinica,
  autorizarLecturaClinica,
  autorizarPacientesAdministrativos,
  exigirAlgunRol,
  exigirPermiso,
  exigirTodosLosRoles,
  tieneRol,
};
