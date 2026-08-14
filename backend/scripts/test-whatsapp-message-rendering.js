const assert = require('node:assert/strict');
const { resolverMensajeConfigurado } = require('../src/utils/whatsappMessageTemplate');

function resolve(tipo, mensaje, context = {}) {
  return resolverMensajeConfigurado({
    tipo,
    mensajes: mensaje ? [{ tipo, ...mensaje }] : [],
    context,
  });
}

const active = resolve(
  'confirmacion_turno',
  { activo: true, contenido: 'Hola {paciente}, turno #{turno_id}: {fecha} {hora}.' },
  { paciente: 'Paciente de prueba', turno_id: 42, fecha: '14/08/2026', hora: '10:30' },
);
assert.equal(active.estado, 'activo');
assert.equal(active.contenido, 'Hola Paciente de prueba, turno #42: 14/08/2026 10:30.');

const inactive = resolve(
  'confirmacion_turno',
  { activo: false, contenido: 'Este texto no debe renderizarse' },
);
assert.equal(inactive.estado, 'inactivo');
assert.equal(inactive.contenido, null);

const validPlaceholder = resolve(
  'recordatorio_turno',
  { activo: true, contenido: '{paciente} - {prestacion}' },
  { paciente: 'Paciente de prueba', prestacion: 'Control' },
);
assert.equal(validPlaceholder.contenido, 'Paciente de prueba - Control');

const missingValue = resolve(
  'recordatorio_turno',
  { activo: true, contenido: 'Profesional: {profesional}.' },
);
assert.equal(missingValue.estado, 'activo');
assert.equal(missingValue.contenido, 'Profesional: .');
assert.equal(missingValue.contenido.includes('undefined'), false);

const missingType = resolve('tipo_inexistente', null);
assert.equal(missingType.estado, 'inexistente');
assert.equal(missingType.contenido, null);

const legacyPlaceholder = resolve(
  'reprogramacion_turno',
  { activo: true, contenido: 'Continuar: {enlace_reprogramacion}' },
);
assert.equal(legacyPlaceholder.estado, 'invalido');
assert.deepEqual(legacyPlaceholder.placeholdersNoSoportados, ['enlace_reprogramacion']);

const rejection = resolve(
  'rechazo_solicitud_turno',
  { activo: true, contenido: 'Hola {paciente}. {consultorio}: solicitud no aceptada. {whatsapp_consultorio}' },
  { paciente: 'Paciente de prueba', consultorio: 'Odonton', whatsapp_consultorio: 'Contacto de prueba' },
);
assert.equal(rejection.estado, 'activo');
assert.equal(
  rejection.contenido,
  'Hola Paciente de prueba. Odonton: solicitud no aceptada. Contacto de prueba',
);

const inactiveRejection = resolve(
  'rechazo_solicitud_turno',
  { activo: false, contenido: 'No debe enviarse' },
);
assert.equal(inactiveRejection.estado, 'inactivo');
assert.equal(inactiveRejection.contenido, null);

console.log('OK: renderizado de mensajes configurables (8 casos)');
