const assert = require('node:assert/strict');
const {
  TURN_STATES_WHATSAPP_CANCELABLE,
  TURN_STATES_WHATSAPP_REPROGRAMMABLE,
  coincideIdentidadPaciente,
  determinarTipoPaciente,
  solicitudBloqueaNuevaSolicitud,
  turnoBloqueaNuevaSolicitud,
} = require('../src/domain/turnoActivityRules');

const now = new Date('2026-08-14T12:00:00-03:00');
const past = '2026-06-08T15:45:00-03:00';
const future = '2026-08-20T10:00:00-03:00';

assert.equal(
  turnoBloqueaNuevaSolicitud({ estado: 'realizado', fecha_hora_inicio: past }, now),
  false,
  'A. Un turno realizado historico no debe bloquear',
);

assert.equal(
  turnoBloqueaNuevaSolicitud({ estado: 'cancelado', fecha_hora_inicio: past }, now),
  false,
  'B. Un turno cancelado historico no debe bloquear',
);

assert.equal(
  solicitudBloqueaNuevaSolicitud({
    estado: 'pendiente',
    turno_id: 17,
    turno_estado: 'realizado',
    turno_fecha_hora_inicio: past,
  }, now),
  false,
  'C. Una solicitud pendiente ligada a un turno realizado no debe bloquear',
);

assert.equal(
  solicitudBloqueaNuevaSolicitud({
    estado: 'pendiente',
    turno_id: 16,
    turno_estado: 'cancelado',
    turno_fecha_hora_inicio: past,
  }, now),
  false,
  'D. Una solicitud pendiente ligada a un turno cancelado no debe bloquear',
);

assert.equal(
  solicitudBloqueaNuevaSolicitud({ estado: 'pendiente', turno_id: null }, now),
  true,
  'E. Una solicitud pendiente sin turno asociado debe bloquear',
);

assert.equal(
  turnoBloqueaNuevaSolicitud({ estado: 'confirmado', fecha_hora_inicio: future }, now),
  true,
  'F. Un turno futuro confirmado debe bloquear',
);

assert.equal(
  coincideIdentidadPaciente(
    { pacienteId: 1, dni: '10173234' },
    { paciente_id: 2, dni: '99888777', telefono: '3515550000' },
  ),
  false,
  'G. Otro paciente no debe coincidir aunque comparta telefono',
);

assert.deepEqual(
  determinarTipoPaciente({ id: 1 }),
  { tipo: 'existente', tipoSolicitud: 'nuevo_turno' },
  'H. Un DNI encontrado debe continuar como paciente existente',
);

assert.deepEqual(
  determinarTipoPaciente(null),
  { tipo: 'nuevo', tipoSolicitud: 'primera_consulta' },
  'I. Un DNI inexistente debe continuar como paciente nuevo y primera consulta',
);

assert.deepEqual(
  TURN_STATES_WHATSAPP_CANCELABLE,
  ['programado', 'confirmado', 'reprogramado'],
);
assert.deepEqual(
  TURN_STATES_WHATSAPP_REPROGRAMMABLE,
  ['programado', 'confirmado', 'reprogramado'],
);

console.log('OK: reglas de actividad e identificacion del bot (9 casos + estados WhatsApp)');
