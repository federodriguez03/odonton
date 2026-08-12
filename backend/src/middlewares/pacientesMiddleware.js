/**
 * Middleware de validación para crear/actualizar paciente
 */
function validarEntradaPaciente(req, res, next) {
	try {
		const body = req.body || {};
		const isPost = req.method === 'POST';

		if (isPost) {
			const { nombre, apellido, dni } = body;
			if (!nombre || !apellido || !dni) {
				return res.status(400).json({ mensaje: 'Faltan campos obligatorios: nombre, apellido, dni' });
			}
		} else {
			// PUT: debe haber al menos un campo actualizable
			const allowed = [
				'nombre',
				'apellido',
				'dni',
				'nacionalidad',
				'domicilio',
				'telefono',
				'email',
				'fecha_nacimiento',
				'observaciones',
				'alergias',
				'condiciones',
				'estado_tratamiento',
			];
			const hasAny = allowed.some((k) => Object.prototype.hasOwnProperty.call(body, k));
			if (!hasAny) {
				return res.status(400).json({ mensaje: 'No hay campos para actualizar' });
			}
		}

		// Validaciones simples de formato
		if (body.dni) {
			const dniStr = String(body.dni);
			const dniRegex = /^[0-9]{7,10}$/; // ajustar según reglas locales
			if (!dniRegex.test(dniStr)) {
				return res.status(400).json({ mensaje: 'Formato de DNI inválido' });
			}
		}

		if (body.email) {
			const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
			if (!emailRegex.test(body.email)) {
				return res.status(400).json({ mensaje: 'Formato de email inválido' });
			}
		}

		return next();
	} catch (err) {
		return next(err);
	}
}

function validarConsultaPacientes(req, res, next) {
	try {
		const { page, limit, sort, q, dni } = req.query || {};

		if (page !== undefined) {
			const n = Number.parseInt(page, 10);
			if (Number.isNaN(n) || n < 1) {
				return res.status(400).json({ mensaje: 'Parametro page invalido. Debe ser un numero >= 1' });
			}
		}

		if (limit !== undefined) {
			const n = Number.parseInt(limit, 10);
			if (Number.isNaN(n) || n < 1 || n > 100) {
				return res.status(400).json({ mensaje: 'Parametro limit invalido. Debe estar entre 1 y 100' });
			}
		}

		if (sort !== undefined) {
			const [field, rawDir] = String(sort).split(':');
			const allowedFields = ['apellido', 'nombre', 'dni', 'created_at', 'updated_at'];
			if (!allowedFields.includes(field)) {
				return res.status(400).json({ mensaje: 'Parametro sort invalido. Columna no permitida' });
			}

			if (rawDir !== undefined) {
				const dir = String(rawDir).toLowerCase();
				if (!['asc', 'desc'].includes(dir)) {
					return res.status(400).json({ mensaje: 'Parametro sort invalido. Direccion permitida: asc o desc' });
				}
			}
		}

		if (q !== undefined) {
			if (typeof q !== 'string') {
				return res.status(400).json({ mensaje: 'Parametro q invalido' });
			}
			if (q.length > 120) {
				return res.status(400).json({ mensaje: 'Parametro q demasiado largo' });
			}
		}

		if (dni !== undefined) {
			const dniStr = String(dni).trim();
			const dniRegex = /^[0-9]{7,10}$/;
			if (!dniRegex.test(dniStr)) {
				return res.status(400).json({ mensaje: 'Parametro dni invalido. Debe contener entre 7 y 10 digitos' });
			}
		}

		return next();
	} catch (err) {
		return next(err);
	}
}

module.exports = {
	validarEntradaPaciente,
	validarConsultaPacientes,
};
