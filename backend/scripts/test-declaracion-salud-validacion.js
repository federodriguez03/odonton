const assert = require('node:assert/strict');
const questionnaire = require('../src/domain/declaracionSaludCuestionario');
const service = require('../src/services/declaracionesSaludService');

const allNo = Object.fromEntries(questionnaire.questions.map((question) => [question.id, { answer: 'no' }]));

const partial = service.validateAndNormalizeResponses({ enfermedad_actual: { answer: 'yes' } });
assert.ok(service.getMissingFields({ respondidoPor: 'paciente', nombreTutor: null, responses: partial }).includes('enfermedad_actual.descripcion'));

const complete = service.validateAndNormalizeResponses(allNo);
assert.deepEqual(service.getMissingFields({ respondidoPor: 'paciente', nombreTutor: null, responses: complete }), []);

const allergyMissing = service.validateAndNormalizeResponses({ ...allNo, alergias: { answer: 'yes' } });
assert.ok(service.getMissingFields({ respondidoPor: 'paciente', nombreTutor: null, responses: allergyMissing }).includes('alergias.tipos'));

const allergyComplete = service.validateAndNormalizeResponses({ ...allNo, alergias: { answer: 'yes', details: { tipos: ['Penicilina'] } } });
assert.equal(service.getMissingFields({ respondidoPor: 'paciente', nombreTutor: null, responses: allergyComplete }).length, 0);
assert.match(service.summarizeResponses(allergyComplete).find((item) => item.id === 'alergias').value, /Penicilina/);
assert.throws(() => service.validateAndNormalizeResponses({ pregunta_inventada: { answer: 'no' } }), /desconocidas/);
assert.ok(service.getMissingFields({ respondidoPor: 'tutor', nombreTutor: '', responses: complete }).includes('nombre_tutor'));

console.log('OK: parcial, finalización, condicionales, resumen y tutor validados.');
