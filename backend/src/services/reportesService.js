const { pool } = require('../config/db');

function crearError(codigo, mensaje) {
  const error = new Error(mensaje);
  error.code = codigo;
  return error;
}

function normalizarFecha(value, campo) {
  const text = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw crearError('RANGO_INVALIDO', `${campo} debe usar el formato YYYY-MM-DD`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw crearError('RANGO_INVALIDO', `${campo} no es una fecha válida`);
  }
  return text;
}

function normalizarRangoFechas(desde, hasta) {
  if (!desde || !hasta) {
    throw crearError('RANGO_REQUERIDO', 'fecha_desde y fecha_hasta son requeridas');
  }
  const fechaDesde = normalizarFecha(desde, 'fecha_desde');
  const fechaHasta = normalizarFecha(hasta, 'fecha_hasta');
  if (fechaDesde > fechaHasta) {
    throw crearError('RANGO_INVALIDO', 'La fecha_desde no puede ser posterior a la fecha_hasta');
  }
  return { desde: fechaDesde, hasta: fechaHasta };
}

async function obtenerResumenClinico({ desde, hasta }) {
  const { rows } = await pool.query(
    `
      SELECT
        COUNT(*)::INTEGER AS total_turnos,
        COUNT(*) FILTER (WHERE t.estado = 'realizado')::INTEGER AS total_realizados,
        COUNT(*) FILTER (WHERE t.estado = 'cancelado')::INTEGER AS total_cancelados,
        COUNT(*) FILTER (WHERE t.estado = 'reprogramado')::INTEGER AS total_reprogramados,
        COUNT(*) FILTER (WHERE t.estado = 'confirmado')::INTEGER AS total_confirmados
      FROM turnos t
      WHERE t.fecha_hora_inicio >= $1::date
        AND t.fecha_hora_inicio < ($2::date + INTERVAL '1 day')
    `,
    [desde, hasta],
  );
  return rows[0];
}

async function obtenerPrestacionesRealizadas({ desde, hasta }) {
  const { rows } = await pool.query(
    `
      SELECT
        pr.id AS prestacion_id,
        pr.nombre AS prestacion_nombre,
        COUNT(*)::INTEGER AS cantidad
      FROM turnos t
      JOIN prestaciones pr ON pr.id = t.prestacion_id
      WHERE t.fecha_hora_inicio >= $1::date
        AND t.fecha_hora_inicio < ($2::date + INTERVAL '1 day')
        AND t.estado = 'realizado'
      GROUP BY pr.id, pr.nombre
      ORDER BY cantidad DESC, prestacion_nombre ASC
    `,
    [desde, hasta],
  );
  return rows;
}

async function obtenerDetalleTurnos({ desde, hasta }) {
  const { rows } = await pool.query(
    `
      SELECT
        t.id,
        t.fecha_hora_inicio,
        t.fecha_hora_fin,
        t.estado,
        t.observaciones,
        t.origen,
        p.id AS paciente_id,
        p.nombre AS paciente_nombre,
        p.apellido AS paciente_apellido,
        p.dni AS paciente_dni,
        pr.id AS prestacion_id,
        pr.nombre AS prestacion_nombre,
        pr.duracion_minutos AS prestacion_duracion_minutos
      FROM turnos t
      LEFT JOIN pacientes p ON p.id = t.paciente_id
      LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
      WHERE t.fecha_hora_inicio >= $1::date
        AND t.fecha_hora_inicio < ($2::date + INTERVAL '1 day')
      ORDER BY t.fecha_hora_inicio ASC
    `,
    [desde, hasta],
  );
  return rows;
}

async function obtenerIngresosReales({ desde, hasta }) {
  const { rows } = await pool.query(
    `
      SELECT
        COALESCE(SUM(p.importe) FILTER (WHERE p.estado = 'activo'), 0)::NUMERIC(12,2) AS ingresos_reales,
        COALESCE(SUM(p.importe) FILTER (WHERE p.estado = 'activo' AND p.metodo_pago = 'efectivo'), 0)::NUMERIC(12,2) AS efectivo,
        COALESCE(SUM(p.importe) FILTER (WHERE p.estado = 'activo' AND p.metodo_pago = 'tarjeta'), 0)::NUMERIC(12,2) AS tarjeta,
        COALESCE(SUM(p.importe) FILTER (WHERE p.estado = 'activo' AND p.metodo_pago = 'transferencia'), 0)::NUMERIC(12,2) AS transferencia,
        COUNT(*) FILTER (WHERE p.estado = 'anulado')::INTEGER AS pagos_anulados
      FROM pagos p
      WHERE p.fecha_pago BETWEEN $1::date AND $2::date
    `,
    [desde, hasta],
  );
  const row = rows[0];
  return {
    ingresos_reales: row.ingresos_reales,
    por_metodo: {
      efectivo: row.efectivo,
      tarjeta: row.tarjeta,
      transferencia: row.transferencia,
    },
    pagos_anulados: row.pagos_anulados,
  };
}

async function obtenerEstadoCargos({ desde, hasta }) {
  const { rows } = await pool.query(
    `
      WITH cargos_con_saldo AS (
        SELECT
          c.id,
          c.importe_total,
          c.importe_total - COALESCE(
            SUM(p.importe) FILTER (WHERE p.estado = 'activo'),
            0
          ) AS saldo
        FROM cargos c
        LEFT JOIN pagos p ON p.cargo_id = c.id
        WHERE c.fecha_cargo BETWEEN $1::date AND $2::date
        GROUP BY c.id, c.importe_total
      )
      SELECT
        COALESCE(SUM(saldo) FILTER (WHERE saldo > 0), 0)::NUMERIC(12,2) AS total_adeudado,
        COUNT(*) FILTER (WHERE saldo = importe_total)::INTEGER AS pendientes,
        COUNT(*) FILTER (WHERE saldo > 0 AND saldo < importe_total)::INTEGER AS parciales,
        COUNT(*) FILTER (WHERE saldo = 0)::INTEGER AS pagados
      FROM cargos_con_saldo
    `,
    [desde, hasta],
  );
  return rows[0];
}

/**
 * Separa el período financiero por fecha de pago y el estado de cargos por fecha de cargo.
 */
async function generarReporteClinicoFinanciero({ fechaDesde, fechaHasta, incluirDetalle = true }) {
  const rango = normalizarRangoFechas(fechaDesde, fechaHasta);
  const [resumenClinico, porPrestacion, ingresos, cargos, turnos] = await Promise.all([
    obtenerResumenClinico(rango),
    obtenerPrestacionesRealizadas(rango),
    obtenerIngresosReales(rango),
    obtenerEstadoCargos(rango),
    incluirDetalle ? obtenerDetalleTurnos(rango) : Promise.resolve(null),
  ]);

  return {
    rango: {
      ...rango,
      ingresos_por: 'fecha_pago',
      cargos_por: 'fecha_cargo',
      inclusivo: true,
    },
    financiero: {
      ingresos_reales: ingresos.ingresos_reales,
      total_adeudado: cargos.total_adeudado,
      cargos_pendientes: cargos.pendientes,
      cargos_parciales: cargos.parciales,
      cargos_pagados: cargos.pagados,
      ingresos_por_metodo: ingresos.por_metodo,
      pagos_anulados: ingresos.pagos_anulados,
    },
    clinico: {
      resumen: resumenClinico,
      prestaciones_realizadas: porPrestacion,
      ...(incluirDetalle ? { turnos } : {}),
    },
  };
}

async function generarReporteOperativo({ fechaDesde, fechaHasta, incluirDetalle = true }) {
  const rango=normalizarRangoFechas(fechaDesde,fechaHasta);
  const [agenda,ingresos,cargos,turnos]=await Promise.all([
    obtenerResumenClinico(rango),obtenerIngresosReales(rango),obtenerEstadoCargos(rango),incluirDetalle?obtenerDetalleTurnos(rango):Promise.resolve(null),
  ]);
  return {rango:{...rango,ingresos_por:'fecha_pago',cargos_por:'fecha_cargo',inclusivo:true},financiero:{ingresos_reales:ingresos.ingresos_reales,total_adeudado:cargos.total_adeudado,cargos_pendientes:cargos.pendientes,cargos_parciales:cargos.parciales,cargos_pagados:cargos.pagados,ingresos_por_metodo:ingresos.por_metodo,pagos_anulados:ingresos.pagos_anulados},agenda:{resumen:agenda,...(turnos?{turnos:turnos.map(({observaciones,...turno})=>turno)}:{})}};
}

module.exports = {
  generarReporteClinicoFinanciero,
  normalizarRangoFechas,
  generarReporteOperativo,
};
