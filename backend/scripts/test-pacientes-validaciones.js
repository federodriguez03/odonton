const assert = require('node:assert/strict');
const { normalizarYValidarPaciente } = require('../src/domain/pacienteValidation');

const valido = normalizarYValidarPaciente({
  nombre: '  María-José  ', apellido: "O'Connor", dni: '01234567',
  fecha_nacimiento: '2000-02-29', telefono: '+54 9 351 555-1234', email: '', domicilio: 'Av. Colón 123, 2° A',
});
assert.equal(valido.nombre, 'María-José');
assert.equal(valido.dni, '01234567', 'El DNI debe conservar ceros iniciales');
assert.equal(valido.email, null, 'Un opcional vacío debe poder borrarse');

for (const [campo, valor] of [['nombre','Ana2'],['apellido','---'],['dni','123'],['fecha_nacimiento','2035-01-01']]) {
  assert.throws(() => normalizarYValidarPaciente({ nombre:'Ana',apellido:'Pérez',dni:'12345678',[campo]:valor }), (e) => Boolean(e.errores?.[campo]));
}
const parcial = normalizarYValidarPaciente({ telefono: '', nacionalidad: null }, { parcial: true });
assert.deepEqual(parcial, { telefono: null, nacionalidad: null });
console.log('OK - altas y ediciones validan Unicode, DNI textual, fecha y opcionales vacíos');
