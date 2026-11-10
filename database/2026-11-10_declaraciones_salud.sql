BEGIN;

CREATE TABLE IF NOT EXISTS declaraciones_salud (
  id BIGSERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  numero_version INTEGER NOT NULL,
  cuestionario_version VARCHAR(40) NOT NULL,
  respondido_por VARCHAR(10) NOT NULL CHECK (respondido_por IN ('paciente', 'tutor')),
  nombre_tutor VARCHAR(160),
  respuestas JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado VARCHAR(12) NOT NULL CHECK (estado IN ('incompleta', 'completa')),
  cargado_por_usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  reemplaza_declaracion_id BIGINT REFERENCES declaraciones_salud(id),
  completada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (paciente_id, numero_version),
  CHECK ((respondido_por = 'tutor' AND NULLIF(BTRIM(nombre_tutor), '') IS NOT NULL) OR (respondido_por = 'paciente' AND nombre_tutor IS NULL)),
  CHECK ((estado = 'completa' AND completada_at IS NOT NULL) OR estado = 'incompleta')
);

CREATE INDEX IF NOT EXISTS idx_declaraciones_salud_paciente_fecha
  ON declaraciones_salud (paciente_id, created_at DESC, id DESC);

COMMIT;
