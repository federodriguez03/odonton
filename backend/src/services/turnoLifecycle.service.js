const { pool } = require('../config/db');

// Compatibilidad temporal: los vencidos se presentan como pendientes de registrar
// atencion, pero nunca se convierten automaticamente en realizados.
async function marcarTurnosVencidosComoRealizados({ limit = 50 } = {}) {
  const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 50;
  const { rows } = await pool.query(`SELECT id FROM turnos
    WHERE estado IN ('programado','confirmado','reprogramado') AND fecha_hora_fin <= NOW()
    ORDER BY fecha_hora_fin ASC LIMIT $1`, [max]);
  return {
    processed: 0,
    pending_registration: rows.length,
    appointment_ids: [],
  };
}

module.exports = { marcarTurnosVencidosComoRealizados };
