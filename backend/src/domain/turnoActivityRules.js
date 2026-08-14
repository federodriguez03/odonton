const TURN_STATES_BLOCKING_NEW_REQUEST = Object.freeze([
  'programado',
  'confirmado',
  'reprogramado',
  'reprogramacion_solicitada',
  'cancelacion_solicitada',
]);

const TURN_STATES_WHATSAPP_CANCELABLE = Object.freeze([
  'programado',
  'confirmado',
  'reprogramado',
]);

const TURN_STATES_WHATSAPP_REPROGRAMMABLE = Object.freeze([
  'programado',
  'confirmado',
  'reprogramado',
]);

function normalizeDniDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isFutureDate(value, now = new Date()) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date > now;
}

function turnoBloqueaNuevaSolicitud(turno, now = new Date()) {
  return TURN_STATES_BLOCKING_NEW_REQUEST.includes(turno?.estado)
    && isFutureDate(turno?.fecha_hora_inicio, now);
}

function solicitudBloqueaNuevaSolicitud(solicitud, now = new Date()) {
  if (solicitud?.estado !== 'pendiente') return false;
  if (solicitud.turno_id === null || solicitud.turno_id === undefined) return true;
  if (!solicitud.turno_estado) return false;
  if (solicitud.turno_estado === 'solicitado') return true;

  return turnoBloqueaNuevaSolicitud({
    estado: solicitud.turno_estado,
    fecha_hora_inicio: solicitud.turno_fecha_hora_inicio,
  }, now);
}

function coincideIdentidadPaciente({ pacienteId = null, dni = null } = {}, registro = {}) {
  if (pacienteId !== null && pacienteId !== undefined) {
    return Number(registro.paciente_id) === Number(pacienteId);
  }

  const dniNormalizado = normalizeDniDigits(dni);
  return Boolean(dniNormalizado) && normalizeDniDigits(registro.dni) === dniNormalizado;
}

function determinarTipoPaciente(paciente) {
  return paciente?.id
    ? { tipo: 'existente', tipoSolicitud: 'nuevo_turno' }
    : { tipo: 'nuevo', tipoSolicitud: 'primera_consulta' };
}

module.exports = {
  TURN_STATES_BLOCKING_NEW_REQUEST,
  TURN_STATES_WHATSAPP_CANCELABLE,
  TURN_STATES_WHATSAPP_REPROGRAMMABLE,
  coincideIdentidadPaciente,
  determinarTipoPaciente,
  isFutureDate,
  solicitudBloqueaNuevaSolicitud,
  turnoBloqueaNuevaSolicitud,
};
