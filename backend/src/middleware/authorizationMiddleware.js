function denegar(res, codigo, mensaje, status = 403) {
  return res.status(status).json({ codigo, mensaje });
}

function tieneRol(identity, rol) {
  return Array.isArray(identity?.roles) && identity.roles.includes(rol);
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
  autorizarEscrituraClinica,
  autorizarLecturaClinica,
  autorizarPacientesAdministrativos,
  exigirAlgunRol,
  exigirTodosLosRoles,
  tieneRol,
};
