/**
 * Middleware de validación para crear/actualizar paciente
 */
const { normalizarYValidarPaciente } = require('../domain/pacienteValidation');

function validarEntradaPaciente(req, res, next) {
	try {
		const isPost = req.method === 'POST';
		const body = req.body || {};
		if (!isPost) {
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

		req.body = normalizarYValidarPaciente(req.body, { parcial: !isPost });
		return next();
	} catch (err) {
		if (err.errores) return res.status(400).json({ mensaje: err.message, errores: err.errores });
		return next(err);
	}
}

function validarConsultaPacientes(req, res, next) {
	try {
		const { page, limit, sort, q, dni } = req.query || {};

		if (page !== undefined) {
			const n = Number.parseInt(page, 10);
			if (Number.isNaN(n) || n < 1) {
				return res.status(400).json({ mensaje: 'Parámetro page inválido. Debe ser un número >= 1' });
			}
		}

		if (limit !== undefined) {
			const n = Number.parseInt(limit, 10);
			if (Number.isNaN(n) || n < 1 || n > 100) {
				return res.status(400).json({ mensaje: 'Parámetro limit inválido. Debe estar entre 1 y 100' });
			}
		}

		if (sort !== undefined) {
			const [field, rawDir] = String(sort).split(':');
			const allowedFields = ['apellido', 'nombre', 'dni', 'created_at', 'updated_at'];
			if (!allowedFields.includes(field)) {
				return res.status(400).json({ mensaje: 'Parámetro sort inválido. Columna no permitida' });
			}

			if (rawDir !== undefined) {
				const dir = String(rawDir).toLowerCase();
				if (!['asc', 'desc'].includes(dir)) {
					return res.status(400).json({ mensaje: 'Parámetro sort inválido. Dirección permitida: asc o desc' });
				}
			}
		}

		if (q !== undefined) {
			if (typeof q !== 'string') {
				return res.status(400).json({ mensaje: 'Parámetro q inválido' });
			}
			if (q.length > 120) {
				return res.status(400).json({ mensaje: 'Parámetro q demasiado largo' });
			}
		}

		if (dni !== undefined) {
			const dniStr = String(dni).trim();
			const dniRegex = /^[0-9]{7,10}$/;
			if (!dniRegex.test(dniStr)) {
				return res.status(400).json({ mensaje: 'Parámetro dni inválido. Debe contener entre 7 y 10 dígitos' });
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
