-- Permite prestaciones de catalogo pendientes de configurar sin inventar duracion.
ALTER TABLE prestaciones ALTER COLUMN duracion_minutos DROP NOT NULL;
ALTER TABLE prestaciones ADD COLUMN IF NOT EXISTS precio_inicial_referencia_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prestaciones_precio_inicial_referencia_fk') THEN
    ALTER TABLE prestaciones ADD CONSTRAINT prestaciones_precio_inicial_referencia_fk
      FOREIGN KEY (precio_inicial_referencia_id) REFERENCES arancel_referencias(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS prestaciones_duracion_pendiente_idx
  ON prestaciones (id) WHERE duracion_minutos IS NULL;
