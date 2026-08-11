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

async function obtenerDetalleTurnos({ fechaDesde, fechaHasta }) {
  const query = `
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
      pr.duracion_minutos AS prestacion_duracion_minutos,
      pr.precio_base AS prestacion_precio_base
    FROM turnos t
    LEFT JOIN pacientes p ON p.id = t.paciente_id
    LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
    WHERE t.fecha_hora_inicio >= $1 AND t.fecha_hora_inicio < $2
    ORDER BY t.fecha_hora_inicio ASC
  `;

  const { rows } = await pool.query(query, [fechaDesde, fechaHasta]);
  return rows;
}

async function obtenerResumenPorPrestacion({ fechaDesde, fechaHasta }) {
  const query = `
    SELECT
      pr.id AS prestacion_id,
      pr.nombre AS prestacion_nombre,
      COUNT(*)::int AS cantidad,
      COALESCE(SUM(pr.precio_base), 0) AS ingresos_estimados
    FROM turnos t
    JOIN prestaciones pr ON pr.id = t.prestacion_id
    WHERE t.fecha_hora_inicio >= $1
      AND t.fecha_hora_inicio < $2
      AND t.estado = 'realizado'
    GROUP BY pr.id, pr.nombre
    ORDER BY cantidad DESC, prestacion_nombre ASC
  `;

  const { rows } = await pool.query(query, [fechaDesde, fechaHasta]);
  return rows.map((row) => ({
    ...row,
    ingresos_estimados: Number(row.ingresos_estimados) || 0,
  }));
}

async function generarReporteAtencionFacturacion({ fechaDesde, fechaHasta, incluirDetalle = true }) {
  const rango = normalizarRangoFechas(fechaDesde, fechaHasta);

  const turnos = await obtenerDetalleTurnos({
    fechaDesde: rango.desde,
    fechaHasta: rango.hastaExclusiva,
  });

  const resumenPorPrestacion = await obtenerResumenPorPrestacion({
    fechaDesde: rango.desde,
    fechaHasta: rango.hastaExclusiva,
  });

  const resumen = turnos.reduce(
    (acc, t) => {
      acc.total_turnos += 1;
      if (t.estado === 'realizado') {
        acc.total_realizados += 1;
        const precio = Number(t.prestacion_precio_base);
        if (Number.isFinite(precio)) {
          acc.ingresos_estimados += precio;
        }
      }
      if (t.estado === 'cancelado') acc.total_cancelados += 1;
      if (t.estado === 'reprogramado') acc.total_reprogramados += 1;
      if (t.estado === 'confirmado') acc.total_confirmados += 1;
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
    por_prestacion: resumenPorPrestacion,
    ...(incluirDetalle ? { turnos } : {}),
  };
}

module.exports = {
  generarReporteAtencionFacturacion,
};
