BEGIN;

ALTER TABLE turnos ADD COLUMN IF NOT EXISTS profesional_perfil_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'turnos'::regclass
      AND conname = 'turnos_profesional_perfil_id_fkey'
  ) THEN
    ALTER TABLE turnos
      ADD CONSTRAINT turnos_profesional_perfil_id_fkey
      FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_turnos_profesional_perfil_inicio
  ON turnos (profesional_perfil_id, fecha_hora_inicio);

COMMIT;
