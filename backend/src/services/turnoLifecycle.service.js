const { pool } = require('../config/db');
const { registrarAuditoria } = require('./auditoriaService');

async function marcarTurnosVencidosComoRealizados({ limit = 50 } = {}) {
  const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 50;

  const { rows } = await pool.query(
    `
      UPDATE turnos
      SET estado = 'realizado',
          updated_at = NOW()
      WHERE id IN (
        SELECT id
        FROM turnos
        WHERE estado IN ('programado', 'confirmado', 'reprogramado')
          AND fecha_hora_fin <= NOW()
        ORDER BY fecha_hora_fin ASC
        LIMIT $1
      )
      RETURNING id
    `,
    [max],
  );

  for (const row of rows) {
    await registrarAuditoria({
      accion: 'APPOINTMENT_MARKED_COMPLETED_AUTOMATICALLY',
      recurso: 'turnos',
      recursoId: row.id,
      statusCode: 200,
      metadata: { source: 'turnoLifecycle.service' },
    });
  }

  return {
    processed: rows.length,
    appointment_ids: rows.map((row) => row.id),
  };
}

module.exports = {
  marcarTurnosVencidosComoRealizados,
};
