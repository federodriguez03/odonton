const { normalizePhoneForStorage } = require('../services/whatsappClient.service');

function validarEntradaPaciente(req, res, next) {
  try {
    const body = req.body || {};
    const isPost = req.method === 'POST';
    const errores = {};
    const nameRegex = /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u;

    if (isPost) {
      if (!String(body.nombre || '').trim()) errores.nombre = 'El nombre es obligatorio';
      if (!String(body.apellido || '').trim()) errores.apellido = 'El apellido es obligatorio';
      if (!String(body.dni || '').trim()) errores.dni = 'El DNI es obligatorio';
    } else {
      const allowed = ['nombre', 'apellido', 'dni', 'nacionalidad', 'domicilio', 'telefono', 'email', 'fecha_nacimiento', 'observaciones', 'alergias', 'condiciones', 'estado_tratamiento'];
      if (!allowed.some((key) => Object.prototype.hasOwnProperty.call(body, key))) return res.status(400).json({ mensaje: 'No hay campos para actualizar' });
    }

    for (const field of ['nombre', 'apellido']) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const value = String(body[field] || '').normalize('NFC').trim().replace(/\s+/g, ' ');
      if (!value) errores[field] = `El ${field} es obligatorio`;
      else if (!nameRegex.test(value)) errores[field] = 'Usá sólo letras, espacios, guiones y apóstrofes';
      if (value.length > 100) errores[field] = 'No puede superar los 100 caracteres';
      body[field] = value;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'dni')) {
      body.dni = String(body.dni || '').trim();
      if (!body.dni) errores.dni = 'El DNI es obligatorio';
      else if (!/^[0-9]{7,10}$/.test(body.dni)) errores.dni = 'El DNI debe contener entre 7 y 10 dígitos';
    }

    if (Object.prototype.hasOwnProperty.call(body, 'telefono')) {
      const rawPhone = String(body.telefono || '').trim();
      if (!rawPhone) body.telefono = null;
      else {
        const normalizedPhone = normalizePhoneForStorage(rawPhone);
        if (!normalizedPhone) errores.telefono = 'Ingresá un teléfono válido con código de área';
        else body.telefono = normalizedPhone;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'email')) {
      body.email = String(body.email || '').trim().toLowerCase() || null;
      if (body.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) errores.email = 'Ingresá un email válido';
    }

    if (Object.prototype.hasOwnProperty.call(body, 'fecha_nacimiento')) {
      const value = String(body.fecha_nacimiento || '').trim();
      body.fecha_nacimiento = value || null;
      if (value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
        const valid = date && date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
        const today = new Date();
        const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        if (!valid) errores.fecha_nacimiento = 'Ingresá una fecha válida';
        else if (date.getTime() > todayUtc) errores.fecha_nacimiento = 'La fecha de nacimiento no puede ser futura';
      }
    }

    for (const field of ['nacionalidad', 'domicilio', 'observaciones']) {
      if (Object.prototype.hasOwnProperty.call(body, field)) body[field] = String(body[field] || '').trim() || null;
    }

    if (Object.keys(errores).length) return res.status(400).json({ mensaje: 'Revisá los campos indicados', errores });
    return next();
  } catch (error) {
    return next(error);
  }
}

function validarConsultaPacientes(req, res, next) {
  try {
    const { page, limit, sort, q, dni } = req.query || {};
    if (page !== undefined && (Number.isNaN(Number.parseInt(page, 10)) || Number.parseInt(page, 10) < 1)) return res.status(400).json({ mensaje: 'Parametro page invalido. Debe ser un numero >= 1' });
    if (limit !== undefined && (Number.isNaN(Number.parseInt(limit, 10)) || Number.parseInt(limit, 10) < 1 || Number.parseInt(limit, 10) > 100)) return res.status(400).json({ mensaje: 'Parametro limit invalido. Debe estar entre 1 y 100' });
    if (sort !== undefined) {
      const [field, rawDir] = String(sort).split(':');
      if (!['apellido', 'nombre', 'dni', 'created_at', 'updated_at'].includes(field)) return res.status(400).json({ mensaje: 'Parametro sort invalido. Columna no permitida' });
      if (rawDir !== undefined && !['asc', 'desc'].includes(String(rawDir).toLowerCase())) return res.status(400).json({ mensaje: 'Parametro sort invalido. Direccion permitida: asc o desc' });
    }
    if (q !== undefined && (typeof q !== 'string' || q.length > 120)) return res.status(400).json({ mensaje: 'Parametro q invalido' });
    if (dni !== undefined && !/^[0-9]{7,10}$/.test(String(dni).trim())) return res.status(400).json({ mensaje: 'Parametro dni invalido. Debe contener entre 7 y 10 digitos' });
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { validarEntradaPaciente, validarConsultaPacientes };
