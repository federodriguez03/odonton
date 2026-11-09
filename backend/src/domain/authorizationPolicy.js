function hasRole(identity, role) {
  return Array.isArray(identity?.roles) && identity.roles.includes(role);
}

function permissionsFor(identity) {
  const administrador = hasRole(identity, 'administrador');
  const recepcion = hasRole(identity, 'recepcion');
  const odontologo = hasRole(identity, 'odontologo');
  const perfilClinicoActivo = Boolean(
    odontologo && identity?.profesional_perfil_id && identity?.profesional?.activo === true,
  );
  const finanzas = administrador || recepcion;

  return {
    agenda: recepcion ? 'general' : (perfilClinicoActivo ? 'propia' : null),
    pacientes_administrativos: recepcion || odontologo,
    clinica_lectura: odontologo,
    clinica_escritura: perfilClinicoActivo,
    prestaciones_consulta: administrador || recepcion || odontologo,
    prestaciones_admin: administrador,
    finanzas_consulta: finanzas,
    cargos_crear: finanzas,
    pagos_registrar: finanzas && identity?.puede_cobrar === true,
    pagos_anular: administrador,
    reportes: finanzas,
    configuracion_admin: administrador,
    whatsapp_admin: administrador,
    identidades_admin: administrador,
  };
}

module.exports = { hasRole, permissionsFor };
