const { pool } = require('../config/db');

let pacientesClinicosInitDone = false;

async function asegurarColumnasClinicasPacientes() {
	if (pacientesClinicosInitDone) return;

	await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS alergias TEXT`);
	await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS condiciones TEXT`);
	await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estado_tratamiento TEXT`);

	pacientesClinicosInitDone = true;
}

function normalizarTelefonoPaciente(telefono) {
	if (telefono === undefined) return undefined;
	if (telefono === null) return null;

	const raw = String(telefono).trim();
	if (!raw) return null;
	if (raw.endsWith('@lid')) return null;

	const digits = raw.replace('@c.us', '').replace(/\D/g, '');
	return digits || raw;
}

/**
 * Crear un nuevo paciente
 */
async function crearPaciente({
	nombre,
	apellido,
	dni,
	nacionalidad = null,
	domicilio = null,
	telefono = null,
	email = null,
	fecha_nacimiento = null,
	observaciones = null,
	alergias = null,
	condiciones = null,
	estado_tratamiento = null,
}) {
	await asegurarColumnasClinicasPacientes();
	const telefonoNormalizado = normalizarTelefonoPaciente(telefono);

	// Verificar unicidad de DNI
	const existing = await pool.query('SELECT id FROM pacientes WHERE dni = $1', [dni]);
	if (existing.rowCount > 0) {
		throw new Error('El DNI ya está registrado');
	}

	const query = `
		INSERT INTO pacientes (
			nombre, apellido, dni, nacionalidad, domicilio, telefono, email, fecha_nacimiento, observaciones, alergias, condiciones, estado_tratamiento, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
		RETURNING *;
	`;

	const values = [
		nombre,
		apellido,
		dni,
		nacionalidad,
		domicilio,
		telefonoNormalizado,
		email,
		fecha_nacimiento,
		observaciones,
		alergias,
		condiciones,
		estado_tratamiento,
	];

	const { rows } = await pool.query(query, values);
	return rows[0];
}

/**
 * Actualizar paciente existente
 */
async function actualizarPaciente(id, fields) {
	await asegurarColumnasClinicasPacientes();
	if (Object.prototype.hasOwnProperty.call(fields, 'telefono')) {
		fields.telefono = normalizarTelefonoPaciente(fields.telefono);
	}

	const existingResult = await pool.query('SELECT * FROM pacientes WHERE id = $1', [id]);
	if (existingResult.rowCount === 0) {
		throw new Error('El paciente no existe');
	}

	const existing = existingResult.rows[0];

	// Si cambió el DNI, verificar unicidad
	if (fields.dni && fields.dni !== existing.dni) {
		const dup = await pool.query('SELECT id FROM pacientes WHERE dni = $1', [fields.dni]);
		if (dup.rowCount > 0) {
			throw new Error('El DNI ya está registrado por otro paciente');
		}
	}

	// Construir SET dinámico
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

	const sets = [];
	const values = [];
	let idx = 1;
	for (const key of allowed) {
		if (Object.prototype.hasOwnProperty.call(fields, key)) {
			sets.push(`${key} = $${idx}`);
			values.push(fields[key]);
			idx++;
		}
	}

	if (sets.length === 0) {
		throw new Error('No hay campos para actualizar');
	}

	// Añadir updated_at
	sets.push('updated_at = NOW()');

	const query = `UPDATE pacientes SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *;`;
	values.push(id);

	const { rows } = await pool.query(query, values);
	return rows[0];
}

/**
 * Listar pacientes con paginación, búsqueda y ordenamiento
 */
async function listarPacientes({ page = 1, limit = 20, q = null, dni = null, sort = null }) {
	await asegurarColumnasClinicasPacientes();

	// Normalizar y límites
	page = parseInt(page, 10) || 1;
	limit = parseInt(limit, 10) || 20;
	if (page < 1) page = 1;
	if (limit < 1) limit = 1;
	if (limit > 100) limit = 100;

	const where = [];
	const values = [];
	let idx = 1;

	if (q) {
		where.push(`(nombre ILIKE $${idx} OR apellido ILIKE $${idx})`);
		values.push(`%${q}%`);
		idx++;
	}

	if (dni) {
		where.push(`dni = $${idx}`);
		values.push(dni);
		idx++;
	}

	const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

	// Contar total
	const countQuery = `SELECT COUNT(*)::int AS total FROM pacientes ${whereClause}`;
	const countRes = await pool.query(countQuery, values);
	const total = countRes.rows[0].total;

	// Ordenamiento seguro
	const allowedSortFields = ['apellido', 'nombre', 'dni', 'created_at', 'updated_at'];
	let orderBy = 'apellido ASC, nombre ASC';
	if (sort) {
		const parts = String(sort).split(':');
		const field = parts[0];
		const dir = (parts[1] || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
		if (allowedSortFields.includes(field)) {
			orderBy = `${field} ${dir}`;
		}
	}

	const offset = (page - 1) * limit;

	const dataQuery = `
		SELECT id, nombre, apellido, dni, nacionalidad, domicilio, telefono, email, fecha_nacimiento, observaciones, created_at, updated_at
		FROM pacientes
		${whereClause}
		ORDER BY ${orderBy}
		LIMIT $${idx} OFFSET $${idx + 1}
	`;

	values.push(limit, offset);

	const dataRes = await pool.query(dataQuery, values);

	return {
		total,
		page,
		limit,
		pacientes: dataRes.rows,
	};
}

/**
 * Obtener detalle de un paciente por id
 */
async function obtenerPaciente(id) {
	await asegurarColumnasClinicasPacientes();

	const { rows } = await pool.query('SELECT * FROM pacientes WHERE id = $1', [id]);
	if (rows.length === 0) return null;
	return rows[0];
}

/**
 * Obtener ficha clínica de un paciente
 */
async function obtenerFichaClinica(pacienteId, { page = 1, limit = 10, estado_turno = null, sort = 'fecha:desc' } = {}) {
	// Validaciones y límites
	page = parseInt(page, 10) || 1;
	limit = parseInt(limit, 10) || 10;
	if (page < 1) page = 1;
	if (limit < 1) limit = 1;
	if (limit > 50) limit = 50;

	// Obtener paciente
	const paciente = await obtenerPaciente(pacienteId);
	if (!paciente) return null;

	// Calcular edad si existe fecha_nacimiento
	let edad = null;
	if (paciente.fecha_nacimiento) {
		const hoy = new Date();
		const fn = new Date(paciente.fecha_nacimiento);
		let years = hoy.getFullYear() - fn.getFullYear();
		const m = hoy.getMonth() - fn.getMonth();
		if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) years--;
		edad = years;
	}

	// Historial de turnos: filtros
	const where = ['t.paciente_id = $1'];
	const values = [pacienteId];
	let idx = 2;

	if (estado_turno) {
		where.push(`t.estado = $${idx}`);
		values.push(estado_turno);
		idx++;
	}

	const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

	// Contar total turnos
	const countQuery = `SELECT COUNT(*)::int AS total FROM turnos t ${whereClause}`;
	const countRes = await pool.query(countQuery, values);
	const total = countRes.rows[0].total;

	// Ordenamiento
	let orderBy = 't.fecha_hora_inicio DESC';
	if (sort) {
		const parts = String(sort).split(':');
		const dir = (parts[1] || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
		if (parts[0] === 'fecha') orderBy = `t.fecha_hora_inicio ${dir}`;
	}

	const offset = (page - 1) * limit;

	const dataQuery = `
		SELECT
			t.id,
			t.fecha_hora_inicio,
			t.fecha_hora_fin,
			t.estado,
			t.origen,
			t.observaciones,
			p.id AS prestacion_id,
			p.nombre AS prestacion_nombre,
			p.duracion_minutos AS prestacion_duracion_minutos,
			p.precio_base AS prestacion_precio_base
		FROM turnos t
		LEFT JOIN prestaciones p ON p.id = t.prestacion_id
		${whereClause}
		ORDER BY ${orderBy}
		LIMIT $${idx} OFFSET $${idx + 1}
	`;

	values.push(limit, offset);
	const dataRes = await pool.query(dataQuery, values);

	// Última visita realizada
	const ultimaRes = await pool.query(
		`SELECT t.id, t.fecha_hora_inicio, t.estado, p.nombre AS prestacion
		 FROM turnos t LEFT JOIN prestaciones p ON p.id = t.prestacion_id
		 WHERE t.paciente_id = $1 AND t.estado = 'realizado'
		 ORDER BY t.fecha_hora_inicio DESC LIMIT 1`,
		[pacienteId]
	);
	const ultimaVisita = ultimaRes.rows[0] || null;

	// Próximo turno programado (fecha futura)
	const proximoRes = await pool.query(
		`SELECT t.id, t.fecha_hora_inicio, t.estado, p.nombre AS prestacion
		 FROM turnos t LEFT JOIN prestaciones p ON p.id = t.prestacion_id
		 WHERE t.paciente_id = $1 AND t.estado = 'programado' AND t.fecha_hora_inicio > NOW()
		 ORDER BY t.fecha_hora_inicio ASC LIMIT 1`,
		[pacienteId]
	);
	const proximoTurno = proximoRes.rows[0] || null;

    // Traer historial clínico (historias_clinicas para este paciente)
    const historiasRes = await pool.query(
        `SELECT
           hc.id,
           hc.paciente_id,
           hc.turno_id,
           hc.descripcion,
           hc.created_at,
           hc.odontograma_snapshot,
           t.fecha_hora_inicio AS fecha_atencion,
           t.profesional_id,
           u.nombre AS profesional_nombre,
           t.prestacion_id,
           p.nombre AS prestacion_nombre
         FROM historias_clinicas hc
         LEFT JOIN turnos t ON t.id = hc.turno_id AND t.paciente_id = hc.paciente_id
         LEFT JOIN usuarios u ON u.id = t.profesional_id
         LEFT JOIN prestaciones p ON p.id = t.prestacion_id
         WHERE hc.paciente_id = $1
         ORDER BY hc.created_at DESC LIMIT 50`,
        [pacienteId]
    );

    const turnosAtencionRes = await pool.query(
      `SELECT
         t.id,
         t.fecha_hora_inicio,
         t.profesional_id,
         u.nombre AS profesional_nombre,
         t.prestacion_id,
         p.nombre AS prestacion_nombre
       FROM turnos t
       LEFT JOIN usuarios u ON u.id = t.profesional_id
       LEFT JOIN prestaciones p ON p.id = t.prestacion_id
       WHERE t.paciente_id = $1
         AND t.estado = 'realizado'
         AND u.id IS NOT NULL
         AND p.id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM historias_clinicas hc WHERE hc.turno_id = t.id)
       ORDER BY t.fecha_hora_inicio DESC`,
      [pacienteId]
    );

    return {
        paciente: {
            id: paciente.id,
            nombre: paciente.nombre,
            apellido: paciente.apellido,
            dni: paciente.dni,
            nacionalidad: paciente.nacionalidad,
            domicilio: paciente.domicilio,
            telefono: paciente.telefono,
            email: paciente.email,
            fecha_nacimiento: paciente.fecha_nacimiento,
            edad,
            observaciones: paciente.observaciones,
            alergias: paciente.alergias,
            condiciones: paciente.condiciones,
            estado_tratamiento: paciente.estado_tratamiento,
            created_at: paciente.created_at,
            updated_at: paciente.updated_at,
        },
        ultimaVisita,
        proximoTurno,
        historialTurnos: {
            total,
            page,
            limit,
            turnos: dataRes.rows.map((r) => ({
                id: r.id,
                fecha_hora_inicio: r.fecha_hora_inicio,
                fecha_hora_fin: r.fecha_hora_fin,
                estado: r.estado,
                origen: r.origen,
                observaciones: r.observaciones,
                prestacion: {
                    id: r.prestacion_id,
                    nombre: r.prestacion_nombre,
                    duracion_minutos: r.prestacion_duracion_minutos,
                    precio_base: r.prestacion_precio_base,
                }
            })),
        },
        historiasClinicas: historiasRes.rows,
        turnosDisponiblesAtencion: turnosAtencionRes.rows
    };
}

const SNAPSHOT_COLORES = {
  sano: '#ffffff',
  existente: '#ff4d4d',
  requerido: '#4d79ff',
  corona: '#ffcc00',
  protesis_fija: '#cbd5ff',
  protesis_removible: '#9dd6c8',
  ausente: '#4b5563',
};

async function registrarAtencion({ pacienteId, turnoId, observaciones }) {
  const pid = Number.parseInt(pacienteId, 10);
  const tid = Number.parseInt(turnoId, 10);
  const descripcion = String(observaciones || '').trim();
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('paciente_id invalido');
  if (!Number.isInteger(tid) || tid <= 0) throw new Error('turno_id invalido');
  if (!descripcion) throw new Error('Las observaciones de la atencion son obligatorias');

  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const turnoRes = await client.query(
      `SELECT t.id, t.paciente_id, t.estado, t.fecha_hora_inicio,
              t.profesional_id, u.nombre AS profesional_nombre,
              t.prestacion_id, p.nombre AS prestacion_nombre
       FROM turnos t
       LEFT JOIN usuarios u ON u.id = t.profesional_id
       LEFT JOIN prestaciones p ON p.id = t.prestacion_id
       WHERE t.id = $1 AND t.paciente_id = $2
       FOR UPDATE OF t`,
      [tid, pid]
    );
    if (!turnoRes.rowCount) throw new Error('El turno no pertenece al paciente');
    if (turnoRes.rows[0].estado !== 'realizado') throw new Error('Solo se puede registrar una atencion para un turno realizado');
    if (!turnoRes.rows[0].profesional_id || !turnoRes.rows[0].prestacion_id) {
      throw new Error('El turno no tiene profesional y prestacion validos');
    }

    const [odontogramaRes, metaRes, tratamientosRes, fijasRes, removiblesRes] = await Promise.all([
      client.query('SELECT id, diente, cara, estado, fecha FROM odontograma WHERE paciente_id = $1 ORDER BY diente, cara', [pid]),
      client.query('SELECT sarro, periodontal, observaciones, updated_at FROM odontograma_meta WHERE paciente_id = $1', [pid]),
      client.query('SELECT id, diente, tipo, observaciones, fecha FROM tratamientos WHERE paciente_id = $1 ORDER BY id', [pid]),
      client.query('SELECT id, tipo, dientes, descripcion, fecha FROM protesis_fijas WHERE paciente_id = $1 ORDER BY id', [pid]),
      client.query('SELECT id, tipo, arcada, descripcion, fecha FROM protesis_removibles WHERE paciente_id = $1 ORDER BY id', [pid]),
    ]);
    const snapshot = {
      version: 1,
      capturado_at: new Date().toISOString(),
      colores: SNAPSHOT_COLORES,
      registros: odontogramaRes.rows.map((row) => ({
        odontograma_id: row.id,
        diente: row.diente,
        cara: row.cara,
        estado: row.estado,
        color: SNAPSHOT_COLORES[row.estado] || SNAPSHOT_COLORES.sano,
        fecha: row.fecha,
      })),
      meta: metaRes.rows[0] || { sarro: false, periodontal: false, observaciones: null },
      referencias: {
        tratamientos: tratamientosRes.rows,
        protesis_fijas: fijasRes.rows,
        protesis_removibles: removiblesRes.rows,
      },
    };

    const { rows } = await client.query(
      `INSERT INTO historias_clinicas (paciente_id, turno_id, descripcion, odontograma_snapshot)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, paciente_id, turno_id, descripcion, odontograma_snapshot, created_at`,
      [pid, tid, descripcion, JSON.stringify(snapshot)]
    );
    await client.query('COMMIT');
    return { ...rows[0], fecha_atencion: turnoRes.rows[0].fecha_hora_inicio };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new Error('Ya existe una atencion registrada para este turno');
    throw error;
  } finally {
    client.release();
  }
}

// Exportar todas las funciones
module.exports = {
	crearPaciente,
	actualizarPaciente,
	listarPacientes,
	obtenerPaciente,
	obtenerFichaClinica,
	registrarAtencion,
};
