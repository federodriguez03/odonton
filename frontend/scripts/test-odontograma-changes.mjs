import assert from 'node:assert/strict';
import { buildOdontogramaChangePayloads, getOdontogramaTargetFaces } from '../src/js/odontogramaChanges.js';

const registros = new Map([
  ['11-vestibular', 'existente'],
  ['12-mesial', 'sano'],
]);
const payloads = buildOdontogramaChangePayloads({
  pacienteId: 7,
  registros,
  dirtyKeys: new Set(['11-vestibular']),
});

assert.deepEqual(payloads, [{ paciente_id: 7, diente: 11, cara: 'vestibular', estado: 'existente' }]);
assert.equal(payloads.some((payload) => payload.diente === 12), false);
assert.equal(payloads.some((payload) => payload.estado === 'sin_evaluar'), false);
const faces = ['vestibular', 'mesial', 'distal', 'oclusal', 'lingual'];
assert.deepEqual(getOdontogramaTargetFaces({ face: 'mesial', alcance: 'cara', faces }), ['mesial']);
assert.deepEqual(getOdontogramaTargetFaces({ face: 'mesial', alcance: 'pieza', faces }), faces);
assert.deepEqual(getOdontogramaTargetFaces({ face: 'mesial', alcance: 'cara', faces }), ['mesial'], 'repetir la selección no debe alternar el alcance');
const reopened = new Map(payloads.map((payload) => [`${payload.diente}-${payload.cara}`, payload.estado]));
assert.equal(reopened.get('11-vestibular'), 'existente');
assert.equal(reopened.has('12-mesial'), false, 'la reapertura no debe inventar caras no guardadas');
console.log('OK: selección por cara/pieza estable, guardado explícito y reapertura sin estados inventados.');
