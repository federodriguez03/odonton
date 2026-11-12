-- Etapa 1 del catalogo de prestaciones: datos de catalogo, modalidad y auditoria.
-- precio_base se conserva como unica fuente del precio operativo del consultorio.

ALTER TABLE prestaciones ADD COLUMN IF NOT EXISTS codigo TEXT;
ALTER TABLE prestaciones ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE prestaciones ADD COLUMN IF NOT EXISTS precio_modalidad VARCHAR(20);

UPDATE prestaciones
SET precio_modalidad = 'fijo'
WHERE precio_modalidad IS NULL AND precio_base > 0;

UPDATE prestaciones
SET precio_modalidad = 'sin_definir'
WHERE precio_modalidad IS NULL AND precio_base IS NULL;

-- Los precios cero preexistentes quedan NULL deliberadamente: requieren revision humana.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prestaciones_precio_modalidad_check') THEN
    ALTER TABLE prestaciones ADD CONSTRAINT prestaciones_precio_modalidad_check
      CHECK (precio_modalidad IS NULL OR precio_modalidad IN ('fijo', 'a_convenir', 'sin_definir'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prestaciones_precio_consistencia_check') THEN
    ALTER TABLE prestaciones ADD CONSTRAINT prestaciones_precio_consistencia_check
      CHECK (
        precio_modalidad IS NULL
        OR (precio_modalidad = 'fijo' AND precio_base > 0)
        OR (precio_modalidad IN ('a_convenir', 'sin_definir') AND precio_base IS NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS prestaciones_codigo_unico_idx
  ON prestaciones (LOWER(BTRIM(codigo)))
  WHERE codigo IS NOT NULL AND BTRIM(codigo) <> '';

CREATE TABLE IF NOT EXISTS prestaciones_historial (
  id BIGSERIAL PRIMARY KEY,
  prestacion_id INTEGER NOT NULL REFERENCES prestaciones(id) ON DELETE RESTRICT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
  accion VARCHAR(30) NOT NULL,
  valores_anteriores JSONB,
  valores_nuevos JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prestaciones_historial_prestacion_fecha_idx
  ON prestaciones_historial (prestacion_id, created_at DESC);
