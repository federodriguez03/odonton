BEGIN;

ALTER TABLE historias_clinicas
  ADD COLUMN IF NOT EXISTS odontograma_snapshot JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT turno_id
    FROM historias_clinicas
    WHERE turno_id IS NOT NULL
    GROUP BY turno_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existen historias clinicas duplicadas para un mismo turno';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_historias_clinicas_turno
  ON historias_clinicas (turno_id)
  WHERE turno_id IS NOT NULL;

COMMIT;
