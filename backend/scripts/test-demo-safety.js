const assert = require('node:assert/strict');
const { validarEntornoDemo } = require('../src/domain/demoSafety');
assert.throws(() => validarEntornoDemo({NODE_ENV:'production'}, ['--confirm-demo','odonton_demo'], 'odonton_demo'), /producción/);
assert.throws(() => validarEntornoDemo({}, ['--confirm-demo','odonton_db'], 'odonton_db'), /_demo/);
assert.throws(() => validarEntornoDemo({}, [], 'odonton_demo'), /Confirme/);
assert.throws(() => validarEntornoDemo({}, ['--confirm-demo','otra_demo'], 'odonton_demo'), /Confirme/);
assert.doesNotThrow(() => validarEntornoDemo({}, ['--confirm-demo','odonton_demo'], 'odonton_demo'));
console.log('OK - carga demo requiere base dedicada y confirmación exacta');
