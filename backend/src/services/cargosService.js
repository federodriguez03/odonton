const { pool } = require('../config/db');
const {
  calcularEstadoCobro,
  centavosAImporteDecimal,
  crearSnapshotCargo,
  normalizarFechaAdministrativa,
  normalizarImporteACentavos,
  normalizarImporteNoNegativoACentavos,
  obtenerFechaAdministrativaActual,
  validarDatosPrincipalesCargoEditables,
  validarFechaNoFutura,
} = require('../domain/pagosRules');

function crearError(codigo, mensaje) {
  const error = new Error(mensaje);
  error.code = codigo;
  return error;
}

function normalizarId(value, campo, { opcional = false } = {}) {
  if (opcional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw crearError('ID_INVALIDO', `${campo} debe ser un entero positivo`);
  }

  const texto = typeof value === 'string' ? value.trim() : String(value);
  if (!/^\d+$/.test(texto)) {
    throw crearError('ID_INVALIDO', `${campo} debe ser un entero positivo`);
  }

  const id = Number(texto);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw crearError('ID_INVALIDO', `${campo} debe ser un entero positivo`);
  }
  return id;
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

function construirResumenCargo(cargo, totalAbonadoValue = '0') {
  const importeTotalCentavos = normalizarImporteACentavos(cargo.importe_total, {
    campo: 'importe_total',
  });
  const totalAbonadoCentavos = normalizarImporteNoNegativoACentavos(
    totalAbonadoValue ?? '0',
    { campo: 'total_abonado' },
  );
  const estadoCobro = calcularEstadoCobro({ importeTotalCentavos, totalAbonadoCentavos });
  const saldoCentavos = importeTotalCentavos - totalAbonadoCentavos;

  return {
    ...cargo,
    importe_total: centavosAImporteDecimal(importeTotalCentavos),
    total_abonado: centavosAImporteDecimal(totalAbonadoCentavos),
    saldo: centavosAImporteDecimal(saldoCentavos),
    estado_cobro: estadoCobro,
  };
}

function construirPagoSalida(pago) {
  return {
    ...pago,
    importe: centavosAImporteDecimal(normalizarImporteACentavos(pago.importe)),
  };
}

async function obtenerCargoBase(
  queryable,
  cargoId,
  { forUpdate = false, forShare = false } = {},
) {
  const id = normalizarId(cargoId, 'cargo_id');
  const bloqueo = forUpdate ? 'FOR UPDATE' : (forShare ? 'FOR SHARE' : '');
  const { rows } = await queryable.query(
    `
      SELECT
        id,
        paciente_id,
        turno_id,
        prestacion_id,
        concepto,
        importe_total,
        fecha_cargo::text AS fecha_cargo,
        observaciones,
        created_at,
        updated_at
      FROM cargos
      WHERE id = $1
      ${bloqueo}
    `,
    [id],
  );
  return rows[0] || null;
}

async function obtenerTotalAbonadoCentavos(queryable, cargoId) {
  const id = normalizarId(cargoId, 'cargo_id');
  const { rows } = await queryable.query(
    `
      SELECT COALESCE(SUM(importe), 0)::NUMERIC(12,2) AS total_abonado
      FROM pagos
      WHERE cargo_id = $1
        AND estado = 'activo'
    `,
    [id],
  );
  return normalizarImporteNoNegativoACentavos(rows[0]?.total_abonado ?? '0', {
    campo: 'total_abonado',
  });
}

async function obtenerResumenCargoDesdeBase(queryable, cargo) {
  const totalAbonadoCentavos = await obtenerTotalAbonadoCentavos(queryable, cargo.id);
  return construirResumenCargo(cargo, centavosAImporteDecimal(totalAbonadoCentavos));
}

async function listarPagosDelCargo(cargoId, queryable = pool) {
  const id = normalizarId(cargoId, 'cargo_id');
  const { rows } = await queryable.query(
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
      WHERE cargo_id = $1
      ORDER BY fecha_pago DESC, id DESC
    `,
    [id],
  );
  return rows.map(construirPagoSalida);
}

async function crearCargo({
  paciente_id,
  turno_id = null,
  prestacion_id = null,
  concepto = null,
  importe_total,
  fecha_cargo = null,
  observaciones = null,
}) {
  const pacienteId = normalizarId(paciente_id, 'paciente_id');
  const turnoId = normalizarId(turno_id, 'turno_id', { opcional: true });
  const prestacionSolicitadaId = normalizarId(prestacion_id, 'prestacion_id', { opcional: true });
  const importeTotalCentavos = normalizarImporteACentavos(importe_total, {
    campo: 'importe_total',
  });
  const fechaCargo = validarFechaNoFutura(
    fecha_cargo === undefined || fecha_cargo === null
      ? obtenerFechaAdministrativaActual()
      : fecha_cargo,
    { campo: 'fecha_cargo' },
  );
  const conceptoNormalizado = normalizarTextoOpcional(concepto, {
    campo: 'concepto',
    codigo: 'CONCEPTO_INVALIDO',
  });
  const observacionesNormalizadas = normalizarTextoOpcional(observaciones, {
    campo: 'observaciones',
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pacienteRes = await client.query(
      'SELECT id FROM pacientes WHERE id = $1 FOR SHARE',
      [pacienteId],
    );
    if (!pacienteRes.rowCount) {
      throw crearError('PACIENTE_NO_ENCONTRADO', 'Paciente no encontrado');
    }

    let turno = null;
    if (turnoId !== null) {
      const turnoRes = await client.query(
        `
          SELECT id, paciente_id, prestacion_id
          FROM turnos
          WHERE id = $1
          FOR SHARE
        `,
        [turnoId],
      );
      turno = turnoRes.rows[0] || null;
      if (!turno) throw crearError('TURNO_NO_ENCONTRADO', 'Turno no encontrado');
      if (Number(turno.paciente_id) !== pacienteId) {
        throw crearError(
          'TURNO_PACIENTE_INCOMPATIBLE',
          'El turno no pertenece al paciente indicado',
        );
      }
    }

    const prestacionId = prestacionSolicitadaId ?? (
      turno?.prestacion_id === null || turno?.prestacion_id === undefined
        ? null
        : Number(turno.prestacion_id)
    );

    let prestacion = null;
    if (prestacionId !== null) {
      const prestacionRes = await client.query(
        `
          SELECT id, nombre
          FROM prestaciones
          WHERE id = $1
          FOR SHARE
        `,
        [prestacionId],
      );
      prestacion = prestacionRes.rows[0] || null;
      if (!prestacion) {
        throw crearError('PRESTACION_NO_ENCONTRADA', 'Prestación no encontrada');
      }
    }

    if (
      turno?.prestacion_id !== null
      && turno?.prestacion_id !== undefined
      && prestacionSolicitadaId !== null
      && Number(turno.prestacion_id) !== prestacionSolicitadaId
    ) {
      throw crearError(
        'PRESTACION_TURNO_INCOMPATIBLE',
        'La prestación indicada no coincide con la del turno',
      );
    }

    // Conserva concepto e importe como valores históricos aunque cambie la prestación.
    const snapshot = crearSnapshotCargo({
      concepto: conceptoNormalizado || prestacion?.nombre,
      importeTotal: centavosAImporteDecimal(importeTotalCentavos),
    });

    const { rows } = await client.query(
      `
        INSERT INTO cargos (
          paciente_id,
          turno_id,
          prestacion_id,
          concepto,
          importe_total,
          fecha_cargo,
          observaciones
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id,
          paciente_id,
          turno_id,
          prestacion_id,
          concepto,
          importe_total,
          fecha_cargo::text AS fecha_cargo,
          observaciones,
          created_at,
          updated_at
      `,
      [
        pacienteId,
        turnoId,
        prestacionId,
        snapshot.concepto,
        centavosAImporteDecimal(snapshot.importeTotalCentavos),
        fechaCargo,
        observacionesNormalizadas,
      ],
    );

    const cargo = await obtenerResumenCargoDesdeBase(client, rows[0]);
    await client.query('COMMIT');
    return cargo;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listarCargos({
  paciente_id = null,
  estado_cobro = null,
  desde = null,
  hasta = null,
  page = 1,
  limit = 20,
} = {}) {
  const pacienteId = normalizarId(paciente_id, 'paciente_id', { opcional: true });
  const estadoCobro = estado_cobro ? String(estado_cobro).trim().toUpperCase() : null;
  if (estadoCobro && !['PENDIENTE', 'PARCIAL', 'PAGADO'].includes(estadoCobro)) {
    throw crearError('FILTRO_INVALIDO', 'estado_cobro invalido');
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
  if (fechaDesde) {
    values.push(fechaDesde);
    where.push(`c.fecha_cargo >= $${values.length}`);
  }
  if (fechaHasta) {
    values.push(fechaHasta);
    where.push(`c.fecha_cargo <= $${values.length}`);
  }

  let estadoWhere = '';
  if (estadoCobro === 'PENDIENTE') estadoWhere = 'WHERE total_abonado = 0';
  if (estadoCobro === 'PARCIAL') estadoWhere = 'WHERE total_abonado > 0 AND total_abonado < importe_total';
  if (estadoCobro === 'PAGADO') estadoWhere = 'WHERE total_abonado = importe_total';

  const cargosConTotalesSql = `
    WITH cargos_con_totales AS (
        SELECT
          c.id,
          c.paciente_id,
          c.turno_id,
          c.prestacion_id,
          c.concepto,
          c.importe_total,
          c.fecha_cargo::text AS fecha_cargo,
          c.observaciones,
          c.created_at,
          c.updated_at,
          pa.nombre AS paciente_nombre,
          pa.apellido AS paciente_apellido,
          pa.dni AS paciente_dni,
          COALESCE((
            SELECT SUM(p.importe)
            FROM pagos p
            WHERE p.cargo_id = c.id
              AND p.estado = 'activo'
          ), 0)::NUMERIC(12,2) AS total_abonado
        FROM cargos c
        JOIN pacientes pa ON pa.id = c.paciente_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      )
  `;

  const dataValues = [...values, paginacion.limit, paginacion.offset];
  const limitParam = `$${values.length + 1}`;
  const offsetParam = `$${values.length + 2}`;
  const [totalResult, dataResult] = await Promise.all([
    pool.query(
      `
        ${cargosConTotalesSql}
        SELECT COUNT(*)::INTEGER AS total
        FROM cargos_con_totales
        ${estadoWhere}
      `,
      values,
    ),
    pool.query(
      `
        ${cargosConTotalesSql}
      SELECT *
      FROM cargos_con_totales
      ${estadoWhere}
      ORDER BY fecha_cargo DESC, id DESC
      LIMIT ${limitParam}
      OFFSET ${offsetParam}
      `,
      dataValues,
    ),
  ]);

  const total = Number(totalResult.rows[0]?.total || 0);
  const cargos = dataResult.rows.map((row) => {
    const { total_abonado, ...cargo } = row;
    return construirResumenCargo(cargo, total_abonado);
  });

  return {
    cargos,
    paginacion: {
      page: paginacion.page,
      limit: paginacion.limit,
      total,
      total_pages: total ? Math.ceil(total / paginacion.limit) : 0,
    },
  };
}

async function obtenerCargo(cargoId) {
  const id = normalizarId(cargoId, 'cargo_id');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // El lock compartido mantiene alineados el resumen y el historial de esta respuesta.
    const cargoBase = await obtenerCargoBase(client, id, { forShare: true });
    if (!cargoBase) throw crearError('CARGO_NO_ENCONTRADO', 'Cargo no encontrado');

    const cargo = await obtenerResumenCargoDesdeBase(client, cargoBase);
    const pagos = await listarPagosDelCargo(cargo.id, client);
    await client.query('COMMIT');
    return { cargo, pagos };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function contarPagosHistoricosCargo(cargoId, queryable = pool) {
  const id = normalizarId(cargoId, 'cargo_id');
  const { rows } = await queryable.query(
    'SELECT COUNT(*)::INTEGER AS cantidad FROM pagos WHERE cargo_id = $1',
    [id],
  );
  return Number(rows[0]?.cantidad || 0);
}

async function verificarCargoEditable(cargoId, queryable = pool) {
  const cargo = await obtenerCargoBase(queryable, cargoId);
  if (!cargo) throw crearError('CARGO_NO_ENCONTRADO', 'Cargo no encontrado');

  // Un futuro editor debe invocar esta regla después de bloquear el cargo en su transacción.
  const cantidadPagosHistoricos = await contarPagosHistoricosCargo(cargo.id, queryable);
  validarDatosPrincipalesCargoEditables({ cantidadPagosHistoricos });
  return cargo;
}

module.exports = {
  construirResumenCargo,
  contarPagosHistoricosCargo,
  crearCargo,
  listarCargos,
  listarPagosDelCargo,
  normalizarId,
  obtenerCargo,
  obtenerCargoBase,
  obtenerResumenCargoDesdeBase,
  obtenerTotalAbonadoCentavos,
  verificarCargoEditable,
};
