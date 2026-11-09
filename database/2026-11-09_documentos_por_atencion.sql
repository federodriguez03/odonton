BEGIN;

ALTER TABLE documentos_paciente
  ADD COLUMN IF NOT EXISTS historia_clinica_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'documentos_paciente_historia_clinica_fk'
      AND conrelid = 'documentos_paciente'::regclass
  ) THEN
    ALTER TABLE documentos_paciente
      ADD CONSTRAINT documentos_paciente_historia_clinica_fk
      FOREIGN KEY (historia_clinica_id)
      REFERENCES historias_clinicas(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documentos_paciente_historia_clinica
  ON documentos_paciente (historia_clinica_id, fecha_subida DESC);

COMMIT;
