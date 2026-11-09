const assert = require('node:assert/strict');
const { normalizarObservacion } = require('../src/services/odontogramaService');
assert.equal(normalizarObservacion(undefined), undefined, 'Omitido debe conservarse');
assert.equal(normalizarObservacion(null), null, 'null debe borrar');
assert.equal(normalizarObservacion('   '), null, 'Vacío debe borrar');
assert.equal(normalizarObservacion('  control  '), 'control', 'Texto debe normalizarse');
assert.notEqual(normalizarObservacion(null), 'null', 'Nunca debe producir la cadena null');
console.log('OK - observaciones distinguen omitido, borrado y texto normalizado');
