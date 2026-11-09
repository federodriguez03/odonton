BEGIN;

CREATE TABLE IF NOT EXISTS odontograma_referencias (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(80) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  color VARCHAR(7) NOT NULL,
  alcance VARCHAR(10) NOT NULL DEFAULT 'cara' CHECK (alcance IN ('cara', 'pieza')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT odontograma_referencias_color_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

ALTER TABLE odontograma_referencias ADD COLUMN IF NOT EXISTS alcance VARCHAR(10) NOT NULL DEFAULT 'cara';
ALTER TABLE odontograma_referencias ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE odontograma_referencias ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE odontograma_referencias ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'odontograma_referencias_alcance_check' AND conrelid = 'odontograma_referencias'::regclass) THEN
    ALTER TABLE odontograma_referencias ADD CONSTRAINT odontograma_referencias_alcance_check CHECK (alcance IN ('cara', 'pieza'));
  END IF;
END $$;

UPDATE odontograma_referencias
SET alcance = 'pieza'
WHERE codigo IN ('protesis_fija', 'protesis_removible', 'ausente');

CREATE UNIQUE INDEX IF NOT EXISTS uq_odontograma_referencias_nombre
  ON odontograma_referencias (LOWER(nombre));

INSERT INTO odontograma_referencias (codigo, nombre, color, alcance, activo) VALUES
  ('sano', 'Sano', '#ffffff', 'cara', TRUE),
  ('existente', 'Prestación existente', '#ff4d4d', 'cara', TRUE),
  ('requerido', 'Prestación requerida', '#4d79ff', 'cara', TRUE),
  ('corona', 'Corona', '#ffcc00', 'cara', TRUE),
  ('protesis_fija', 'Prótesis fija', '#cbd5ff', 'pieza', TRUE),
  ('protesis_removible', 'Prótesis removible', '#9dd6c8', 'pieza', TRUE),
  ('ausente', 'Ausente / a extraer (histórico)', '#4b5563', 'pieza', FALSE),
  ('pieza_ausente', 'Pieza ausente', '#4b5563', 'pieza', TRUE),
  ('extraccion_indicada', 'Extracción indicada', '#f97316', 'pieza', TRUE)
ON CONFLICT (codigo) DO NOTHING;

UPDATE odontograma_referencias
SET nombre = 'Ausente / a extraer (histórico)', activo = FALSE, alcance = 'pieza', updated_at = NOW()
WHERE codigo = 'ausente';

COMMIT;
