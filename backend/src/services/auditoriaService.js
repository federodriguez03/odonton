const { pool } = require('../config/db');

let auditoriaReady = false;

async function asegurarTablaAuditoria() {
  if (auditoriaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id BIGSERIAL PRIMARY KEY,
      usuario_id INTEGER,
      accion TEXT NOT NULL,
      recurso TEXT,
      recurso_id TEXT,
      status_code INTEGER,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS usuario_id INTEGER`);
  await pool.query(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS accion TEXT`);
  await pool.query(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS recurso TEXT`);
  await pool.query(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS recurso_id TEXT`);
  await pool.query(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS status_code INTEGER`);
  await pool.query(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS metadata JSONB`);
  await pool.query(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);

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
