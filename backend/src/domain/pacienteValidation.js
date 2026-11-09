const LIMITES = Object.freeze({
  nombre: 100, apellido: 100, dni: 20, nacionalidad: 50,
  domicilio: 255, telefono: 30, email: 150,
});

const NOMBRE_RE = /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u;
const DNI_RE = /^\d{7,10}$/;
const TELEFONO_RE = /^\+?[0-9][0-9 ()-]{5,28}[0-9]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function texto(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function fechaRealNoFutura(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return date.getTime() <= todayUtc;
}

function normalizarYValidarPaciente(body, { parcial = false } = {}) {
  const entrada = body || {};
  const errores = {};
  const resultado = {};
  const camposTexto = ['nombre', 'apellido', 'dni', 'nacionalidad', 'domicilio', 'telefono', 'email'];

  for (const campo of camposTexto) {
    if (!Object.prototype.hasOwnProperty.call(entrada, campo)) continue;
    resultado[campo] = texto(entrada[campo]);
    if (resultado[campo] && resultado[campo].length > LIMITES[campo]) errores[campo] = `Máximo ${LIMITES[campo]} caracteres`;
  }
  for (const campo of ['observaciones', 'alergias', 'condiciones', 'estado_tratamiento']) {
    if (Object.prototype.hasOwnProperty.call(entrada, campo)) resultado[campo] = texto(entrada[campo]);
  }

  if (!parcial) {
    for (const campo of ['nombre', 'apellido', 'dni']) if (!resultado[campo]) errores[campo] = 'Campo obligatorio';
  }
  for (const campo of ['nombre', 'apellido']) {
    if (Object.prototype.hasOwnProperty.call(resultado, campo) && (!resultado[campo] || !NOMBRE_RE.test(resultado[campo]))) {
      errores[campo] = 'Use letras, espacios, guiones o apóstrofes';
    }
  }
  if (resultado.dni !== undefined && (!resultado.dni || !DNI_RE.test(resultado.dni))) errores.dni = 'Debe contener entre 7 y 10 dígitos';
  if (resultado.telefono && !TELEFONO_RE.test(resultado.telefono)) errores.telefono = 'Formato de teléfono inválido';
  if (resultado.email && !EMAIL_RE.test(resultado.email)) errores.email = 'Formato de correo inválido';

  if (Object.prototype.hasOwnProperty.call(entrada, 'fecha_nacimiento')) {
    resultado.fecha_nacimiento = texto(entrada.fecha_nacimiento);
    if (resultado.fecha_nacimiento && !fechaRealNoFutura(resultado.fecha_nacimiento)) errores.fecha_nacimiento = 'Debe ser una fecha real y no futura';
  }

  if (Object.keys(errores).length) {
    const error = new Error('Revise los campos indicados');
    error.status = 400;
    error.errores = errores;
    throw error;
  }
  return resultado;
}

module.exports = { LIMITES, normalizarYValidarPaciente, fechaRealNoFutura };
