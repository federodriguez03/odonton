const { pool } = require('../config/db');

function normalizarRangoFechas(desde, hasta) {
  if (!desde || !hasta) {
    throw new Error('fecha_desde y fecha_hasta son requeridas');
  }

  const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim());
  const desdeRaw = String(desde).trim();
  const hastaRaw = String(hasta).trim();

  const desdeDate = new Date(isDateOnly(desdeRaw) ? `${desdeRaw}T00:00:00` : desdeRaw);
  const hastaDate = new Date(isDateOnly(hastaRaw) ? `${hastaRaw}T00:00:00` : hastaRaw);

  if (Number.isNaN(desdeDate.getTime()) || Number.isNaN(hastaDate.getTime())) {
    throw new Error('Rango de fechas invalido');
  }

  if (desdeDate > hastaDate) {
    throw new Error('La fecha_desde no puede ser posterior a la fecha_hasta');
  }

  const hastaExclusiva = new Date(hastaDate);
  if (isDateOnly(hastaRaw)) {
    hastaExclusiva.setDate(hastaExclusiva.getDate() + 1);
  }

  return {
    desde: desdeDate.toISOString(),
    hasta: hastaDate.toISOString(),
    hastaExclusiva: hastaExclusiva.toISOString(),
  };
}

async function estadisticasTurnosPorDia({ fechaDesde, fechaHasta }) {
  const query = `
    SELECT
      date_trunc('day', t.fecha_hora_inicio)::date AS dia,
      COUNT(*)::int AS total_turnos,
      COUNT(*) FILTER (WHERE t.estado = 'realizado')::int AS total_realizados,
      COUNT(*) FILTER (WHERE t.estado = 'cancelado')::int AS total_cancelados,
      COUNT(*) FILTER (WHERE t.estado = 'reprogramado')::int AS total_reprogramados,
      COUNT(*) FILTER (WHERE t.estado = 'confirmado')::int AS total_confirmados,
      COALESCE(SUM(pr.precio_base) FILTER (WHERE t.estado = 'realizado'), 0) AS ingresos_estimados
    FROM turnos t
    LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
    WHERE t.fecha_hora_inicio >= $1 AND t.fecha_hora_inicio < $2
    GROUP BY dia
    ORDER BY dia ASC
  `;

  const { rows } = await pool.query(query, [fechaDesde, fechaHasta]);
  return rows.map((row) => ({
    ...row,
    ingresos_estimados: Number(row.ingresos_estimados) || 0,
  }));
}

async function estadisticasTopPrestaciones({ fechaDesde, fechaHasta, limit = 10 }) {
  const query = `
    SELECT
      pr.id AS prestacion_id,
      pr.nombre AS prestacion_nombre,
      COUNT(*)::int AS cantidad,
      COALESCE(SUM(pr.precio_base) FILTER (WHERE t.estado = 'realizado'), 0) AS ingresos_estimados
    FROM turnos t
    JOIN prestaciones pr ON pr.id = t.prestacion_id
    WHERE t.fecha_hora_inicio >= $1 AND t.fecha_hora_inicio < $2
    GROUP BY pr.id, pr.nombre
    ORDER BY cantidad DESC, prestacion_nombre ASC
    LIMIT $3
  `;

  const { rows } = await pool.query(query, [fechaDesde, fechaHasta, limit]);
  return rows.map((row) => ({
    ...row,
    ingresos_estimados: Number(row.ingresos_estimados) || 0,
  }));
}

async function estadisticasPacientesNuevos({ fechaDesde, fechaHasta }) {
  const query = `
    SELECT
      date_trunc('day', p.created_at)::date AS dia,
      COUNT(*)::int AS nuevos_pacientes
    FROM pacientes p
    WHERE p.created_at >= $1 AND p.created_at < $2
    GROUP BY dia
    ORDER BY dia ASC
  `;

  const { rows } = await pool.query(query, [fechaDesde, fechaHasta]);
  return rows;
}

async function generarEstadisticas({ fechaDesde, fechaHasta }) {
  const rango = normalizarRangoFechas(fechaDesde, fechaHasta);

  const [porDia, topPrestaciones, pacientesNuevos] = await Promise.all([
    estadisticasTurnosPorDia({ fechaDesde: rango.desde, fechaHasta: rango.hastaExclusiva }),
    estadisticasTopPrestaciones({ fechaDesde: rango.desde, fechaHasta: rango.hastaExclusiva }),
    estadisticasPacientesNuevos({ fechaDesde: rango.desde, fechaHasta: rango.hastaExclusiva }),
  ]);

  const resumen = porDia.reduce(
    (acc, row) => {
      acc.total_turnos += row.total_turnos;
      acc.total_realizados += row.total_realizados;
      acc.total_cancelados += row.total_cancelados;
      acc.total_reprogramados += row.total_reprogramados;
      acc.total_confirmados += row.total_confirmados;
      acc.ingresos_estimados += row.ingresos_estimados;
      return acc;
    },
    {
      total_turnos: 0,
      total_realizados: 0,
      total_cancelados: 0,
      total_reprogramados: 0,
      total_confirmados: 0,
      ingresos_estimados: 0,
    },
  );

  return {
    rango: {
      desde: rango.desde,
      hasta: rango.hasta,
    },
    resumen,
    turnos_por_dia: porDia,
    top_prestaciones: topPrestaciones,
    pacientes_nuevos_por_dia: pacientesNuevos,
  };
}

module.exports = {
  generarEstadisticas,
};
