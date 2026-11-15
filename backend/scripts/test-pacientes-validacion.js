const assert = require('node:assert/strict');
const { validarEntradaPaciente } = require('../src/middlewares/pacientesMiddleware');

function validate(body, method = 'POST') {
  let nextCalled = false;
  let response = null;
  const req = { body: { ...body }, method };
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(data) { response = { status: this.statusCode, data }; return this; },
  };
  validarEntradaPaciente(req, res, (error) => {
    if (error) throw error;
    nextCalled = true;
  });
  return { nextCalled, response, body: req.body };
}

const valid = validate({
  nombre: '  María-José  ', apellido: 'D’Ángelo', dni: '0012345678',
  telefono: '(351) 555-1234', email: ' Persona@Ejemplo.com ',
  fecha_nacimiento: '1990-02-28', nacionalidad: 'Argentina',
});
assert.equal(valid.nextCalled, true);
assert.equal(valid.body.nombre, 'María-José');
assert.equal(valid.body.dni, '0012345678');
assert.match(valid.body.telefono, /^\d{10,15}$/);
assert.equal(valid.body.email, 'persona@ejemplo.com');
assert.equal(Object.prototype.hasOwnProperty.call(valid.body, 'observaciones'), false);

const invalid = validate({
  nombre: 'Juan3', apellido: '', dni: '12.345.678', telefono: 'abc',
  email: 'sin-arroba', fecha_nacimiento: '2999-01-01',
});
assert.equal(invalid.response.status, 400);
for (const field of ['nombre', 'apellido', 'dni', 'telefono', 'email', 'fecha_nacimiento']) {
  assert.ok(invalid.response.data.errores[field], `Falta error para ${field}`);
}

const optional = validate({ nombre: 'Ana', apellido: 'Pérez', dni: '12345678', telefono: '', email: '', fecha_nacimiento: '' });
assert.equal(optional.nextCalled, true);
assert.equal(optional.body.telefono, null);
assert.equal(optional.body.email, null);
assert.equal(optional.body.fecha_nacimiento, null);

const invalidEdit = validate({ nombre: '', apellido: 'Pérez', dni: '' }, 'PUT');
assert.equal(invalidEdit.response.status, 400);
assert.ok(invalidEdit.response.data.errores.nombre);
assert.ok(invalidEdit.response.data.errores.dni);

console.log('OK - nombres Unicode, DNI textual, teléfono WhatsApp, email, fecha y opcionales');
