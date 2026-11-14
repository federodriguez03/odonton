const { pool } = require('../config/db');
const { requireSchema } = require('./schemaValidationService');

let auditoriaReady = false;

async function asegurarTablaAuditoria() {
  if (auditoriaReady) return;

  await requireSchema('auditoria', [
    'auditoria.usuario_id', 'auditoria.accion', 'auditoria.recurso', 'auditoria.recurso_id',
    'auditoria.status_code', 'auditoria.metadata', 'auditoria.created_at',
  ]);

  auditoriaReady = true;
}

async function registrarAuditoria({
  usuarioId = null,
  accion,
  recurso = null,
  recursoId = null,
  statusCode = null,
  metadata = {},
} = {}) {
  if (!accion) return null;

  await asegurarTablaAuditoria();
  const { rows } = await pool.query(
    `
      INSERT INTO auditoria (usuario_id, accion, recurso, recurso_id, status_code, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `,
    [usuarioId, accion, recurso, recursoId ? String(recursoId) : null, statusCode, metadata || {}],
  );

  return rows[0];
}

module.exports = {
  asegurarTablaAuditoria,
  registrarAuditoria,
};
