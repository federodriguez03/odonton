-- Disponibilidad de turnos por profesional.
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS profesional_id INTEGER;

UPDATE turnos
SET profesional_id = (
  SELECT id
  FROM usuarios
  WHERE COALESCE(activo, true) = true
  ORDER BY id ASC
  LIMIT 1
)
WHERE profesional_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM usuarios
    WHERE COALESCE(activo, true) = true
  );

CREATE INDEX IF NOT EXISTS idx_turnos_profesional_inicio
  ON turnos(profesional_id, fecha_hora_inicio);

CREATE TABLE IF NOT EXISTS profesionales_horarios_atencion (
  id SERIAL PRIMARY KEY,
  profesional_id INTEGER NOT NULL,
  dia_semana INTEGER NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT false,
  hora_desde TIME,
  hora_hasta TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profesional_id, dia_semana)
);
