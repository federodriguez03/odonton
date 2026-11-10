import assert from 'node:assert/strict';
import { buildOdontogramaChangePayloads } from '../src/js/odontogramaChanges.js';

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
console.log('OK: sólo se genera escritura para la cara modificada.');
