BEGIN;
CREATE TABLE IF NOT EXISTS historias_clinicas_revisiones (
  id BIGSERIAL PRIMARY KEY,
  historia_clinica_id INTEGER NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
  actor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  corregido_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  antes JSONB NOT NULL,
  despues JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_historia_revisiones
  ON historias_clinicas_revisiones(historia_clinica_id, corregido_at DESC, id DESC);
COMMIT;
-- Se registran correcciones futuras. No se inventan versiones anteriores.
-- Si el registro de revisión falla, se revierte también la modificación clínica.
