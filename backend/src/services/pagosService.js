const { pool } = require('../config/db');
const {
  centavosAImporteDecimal,
  normalizarFechaAdministrativa,
  normalizarImporteACentavos,
  normalizarMetodoPago,
  obtenerFechaAdministrativaActual,
  validarFechasAdministrativas,
  validarPagoNoExcedeSaldo,
} = require('../domain/pagosRules');
const {
  construirResumenCargo,
  normalizarId,
  obtenerCargoBase,
  obtenerTotalAbonadoCentavos,
} = require('./cargosService');

function crearError(codigo, mensaje) {
  const error = new Error(mensaje);
  error.code = codigo;
  return error;
}

function normalizarTextoOpcional(
  value,
  { campo = 'texto', codigo = 'TEXTO_INVALIDO' } = {},
) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw crearError(codigo, `${campo} debe ser texto`);
  }
  const texto = value.trim();
  return texto || null;
}

function normalizarPaginacion(page, limit) {
  const pageNumber = page === undefined || page === '' ? 1 : Number(page);
  const limitNumber = limit === undefined || limit === '' ? 20 : Number(limit);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    throw crearError('FILTRO_INVALIDO', 'page debe ser un entero mayor o igual que 1');
  }
  if (!Number.isSafeInteger(limitNumber) || limitNumber < 1 || limitNumber > 100) {
    throw crearError('FILTRO_INVALIDO', 'limit debe ser un entero entre 1 y 100');
  }
  return { page: pageNumber, limit: limitNumber, offset: (pageNumber - 1) * limitNumber };
}

function construirPagoSalida(pago) {
  return {
    ...pago,
    importe: centavosAImporteDecimal(normalizarImporteACentavos(pago.importe)),
  };
}

function seleccionarResumenCargo(cargo, totalAbonadoCentavos) {
  const resumen = construirResumenCargo(
    cargo,
    centavosAImporteDecimal(totalAbonadoCentavos),
  );
  return {
    importe_total: resumen.importe_total,
    total_abonado: resumen.total_abonado,
    saldo: resumen.saldo,
    estado_cobro: resumen.estado_cobro,
  };
}

async function registrarPago({
  cargo_id,
  importe,
  metodo_pago,
  fecha_pago = null,
  observaciones = null,
}) {
  const cargoId = normalizarId(cargo_id, 'cargo_id');
  const importePagoCentavos = normalizarImporteACentavos(importe, { campo: 'importe' });
  const metodoPago = normalizarMetodoPago(metodo_pago);
  const observacionesNormalizadas = normalizarTextoOpcional(observaciones, {
    campo: 'observaciones',
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // La fila del cargo serializa todas las altas y anulaciones que afectan su saldo.
    const cargo = await obtenerCargoBase(client, cargoId, { forUpdate: true });
    if (!cargo) throw crearError('CARGO_NO_ENCONTRADO', 'Cargo no encontrado');

    const fechaPago = fecha_pago === undefined || fecha_pago === null
      ? obtenerFechaAdministrativaActual()
      : fecha_pago;
    const { fechaPago: fechaPagoNormalizada } = validarFechasAdministrativas({
      fechaCargo: cargo.fecha_cargo,
      fechaPago,
    });

    const importeTotalCentavos = normalizarImporteACentavos(cargo.importe_total, {
      campo: 'importe_total',
    });
    const totalAbonadoCentavos = await obtenerTotalAbonadoCentavos(client, cargo.id);
    const saldoCentavos = importeTotalCentavos - totalAbonadoCentavos;
    if (saldoCentavos < 0) {
      throw crearError('SOBREPAGO', 'El cargo posee pagos activos superiores a su importe');
    }
    validarPagoNoExcedeSaldo({ importePagoCentavos, saldoCentavos });

    const { rows } = await client.query(
      `
        INSERT INTO pagos (
          cargo_id,
          importe,
          metodo_pago,
          fecha_pago,
          observaciones,
          estado
        )
        VALUES ($1, $2, $3, $4, $5, 'activo')
        RETURNING
          id,
          cargo_id,
          importe,
          metodo_pago,
          fecha_pago::text AS fecha_pago,
          observaciones,
          estado,
          fecha_anulacion,
          motivo_anulacion,
          anulado_por_usuario_id,
          created_at,
          updated_at
      `,
      [
        cargo.id,
        centavosAImporteDecimal(importePagoCentavos),
        metodoPago,
        fechaPagoNormalizada,
        observacionesNormalizadas,
      ],
    );

    const totalActualizadoCentavos = await obtenerTotalAbonadoCentavos(client, cargo.id);
    const resumenCargo = seleccionarResumenCargo(cargo, totalActualizadoCentavos);

    await client.query('COMMIT');
    return {
      pago: construirPagoSalida(rows[0]),
      resumen_cargo: resumenCargo,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function anularPago(pagoIdValue, { motivo, usuarioId }) {
  const pagoId = normalizarId(pagoIdValue, 'pago_id');
  const usuarioIdNormalizado = normalizarId(usuarioId, 'usuario_id');
  const motivoNormalizado = normalizarTextoOpcional(motivo, {
    campo: 'motivo',
    codigo: 'MOTIVO_ANULACION_INVALIDO',
  });
  if (!motivoNormalizado) {
    throw crearError('MOTIVO_ANULACION_INVALIDO', 'motivo requerido');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const referenciaRes = await client.query(
      'SELECT id, cargo_id FROM pagos WHERE id = $1',
      [pagoId],
    );
    const referencia = referenciaRes.rows[0] || null;
    if (!referencia) throw crearError('PAGO_NO_ENCONTRADO', 'Pago no encontrado');

    // Todas las operaciones toman primero el cargo y luego el pago para evitar deadlocks.
    const cargo = await obtenerCargoBase(client, referencia.cargo_id, { forUpdate: true });
    if (!cargo) throw crearError('CARGO_NO_ENCONTRADO', 'Cargo no encontrado');

    const pagoRes = await client.query(
      `
        SELECT
          id,
          cargo_id,
          importe,
          metodo_pago,
          fecha_pago::text AS fecha_pago,
          observaciones,
          estado,
          fecha_anulacion,
          motivo_anulacion,
          anulado_por_usuario_id,
          created_at,
          updated_at
        FROM pagos
        WHERE id = $1
          AND cargo_id = $2
        FOR UPDATE
      `,
      [pagoId, cargo.id],
    );
    const pago = pagoRes.rows[0] || null;
    if (!pago) throw crearError('PAGO_NO_ENCONTRADO', 'Pago no encontrado');
    if (pago.estado === 'anulado') {
      throw crearError('PAGO_YA_ANULADO', 'El pago ya fue anulado');
    }

    const { rows } = await client.query(
      `
        UPDATE pagos
        SET estado = 'anulado',
            fecha_anulacion = NOW(),
            motivo_anulacion = $1,
            anulado_por_usuario_id = $2,
            updated_at = NOW()
        WHERE id = $3
          AND estado = 'activo'
        RETURNING
          id,
          cargo_id,
          importe,
          metodo_pago,
          fecha_pago::text AS fecha_pago,
          observaciones,
          estado,
          fecha_anulacion,
          motivo_anulacion,
          anulado_por_usuario_id,
          created_at,
          updated_at
      `,
      [motivoNormalizado, usuarioIdNormalizado, pago.id],
    );
    if (!rows.length) throw crearError('PAGO_YA_ANULADO', 'El pago ya fue anulado');

    const totalActualizadoCentavos = await obtenerTotalAbonadoCentavos(client, cargo.id);
    const resumenCargo = seleccionarResumenCargo(cargo, totalActualizadoCentavos);

    await client.query('COMMIT');
    return {
      pago: construirPagoSalida(rows[0]),
      resumen_cargo: resumenCargo,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listarPagos({
  paciente_id = null,
  cargo_id = null,
  estado = null,
  desde = null,
  hasta = null,
  page = 1,
  limit = 20,
} = {}) {
  const pacienteId = normalizarId(paciente_id, 'paciente_id', { opcional: true });
  const cargoId = normalizarId(cargo_id, 'cargo_id', { opcional: true });
  const estadoNormalizado = estado ? String(estado).trim().toLowerCase() : null;
  if (estadoNormalizado && !['activo', 'anulado'].includes(estadoNormalizado)) {
    throw crearError('FILTRO_INVALIDO', 'estado invalido');
  }
  const fechaDesde = desde ? normalizarFechaAdministrativa(desde, { campo: 'desde' }) : null;
  const fechaHasta = hasta ? normalizarFechaAdministrativa(hasta, { campo: 'hasta' }) : null;
  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
    throw crearError('FILTRO_INVALIDO', 'desde no puede ser posterior a hasta');
  }
  const paginacion = normalizarPaginacion(page, limit);

  const where = [];
  const values = [];
  if (pacienteId !== null) {
    values.push(pacienteId);
    where.push(`c.paciente_id = $${values.length}`);
  }
  if (cargoId !== null) {
    values.push(cargoId);
    where.push(`p.cargo_id = $${values.length}`);
  }
  if (estadoNormalizado) {
    values.push(estadoNormalizado);
    where.push(`p.estado = $${values.length}`);
  }
  if (fechaDesde) {
    values.push(fechaDesde);
    where.push(`p.fecha_pago >= $${values.length}`);
  }
  if (fechaHasta) {
    values.push(fechaHasta);
    where.push(`p.fecha_pago <= $${values.length}`);
  }

  const dataValues = [...values, paginacion.limit, paginacion.offset];
  const limitParam = `$${values.length + 1}`;
  const offsetParam = `$${values.length + 2}`;
  const fromWhereSql = `
    FROM pagos p
    JOIN cargos c ON c.id = p.cargo_id
    JOIN pacientes pa ON pa.id = c.paciente_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
  `;

  const [totalResult, dataResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::INTEGER AS total ${fromWhereSql}`,
      values,
    ),
    pool.query(
      `
      SELECT
        p.id,
        p.cargo_id,
        p.importe,
        p.metodo_pago,
        p.fecha_pago::text AS fecha_pago,
        p.observaciones,
        p.estado,
        p.fecha_anulacion,
        p.motivo_anulacion,
        p.anulado_por_usuario_id,
        p.created_at,
        p.updated_at,
        c.paciente_id,
        c.concepto,
        pa.nombre AS paciente_nombre,
        pa.apellido AS paciente_apellido,
        pa.dni AS paciente_dni
      ${fromWhereSql}
      ORDER BY p.fecha_pago DESC, p.id DESC
      LIMIT ${limitParam}
      OFFSET ${offsetParam}
      `,
      dataValues,
    ),
  ]);

  const total = Number(totalResult.rows[0]?.total || 0);
  const pagos = dataResult.rows.map(construirPagoSalida);

  return {
    pagos,
    paginacion: {
      page: paginacion.page,
      limit: paginacion.limit,
      total,
      total_pages: total ? Math.ceil(total / paginacion.limit) : 0,
    },
  };
}

module.exports = {
  anularPago,
  listarPagos,
  registrarPago,
};
