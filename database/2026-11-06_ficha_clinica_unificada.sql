BEGIN;

ALTER TABLE historias_clinicas
  ADD COLUMN IF NOT EXISTS fecha_atencion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profesional_id INTEGER,
  ADD COLUMN IF NOT EXISTS motivo_consulta TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico TEXT,
  ADD COLUMN IF NOT EXISTS tratamientos_realizados TEXT,
  ADD COLUMN IF NOT EXISTS plan_indicaciones TEXT,
  ADD COLUMN IF NOT EXISTS observaciones TEXT,
  ADD COLUMN IF NOT EXISTS odontograma_snapshot JSONB;

ALTER TABLE historias_clinicas
  ADD CONSTRAINT historias_clinicas_profesional_fkey
  FOREIGN KEY (profesional_id) REFERENCES usuarios(id) ON DELETE RESTRICT;

ALTER TABLE documentos_paciente
  ADD COLUMN IF NOT EXISTS historia_clinica_id INTEGER;

ALTER TABLE documentos_paciente
  ADD CONSTRAINT documentos_paciente_historia_fkey
  FOREIGN KEY (historia_clinica_id) REFERENCES historias_clinicas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_historias_paciente_fecha
  ON historias_clinicas (paciente_id, fecha_atencion DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_historia
  ON documentos_paciente (historia_clinica_id);

CREATE TABLE IF NOT EXISTS odontograma_referencias (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  color VARCHAR(7) NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  heredada BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT odontograma_referencias_codigo_formato CHECK (codigo ~ '^[a-z0-9_]+$'),
  CONSTRAINT odontograma_referencias_color_formato CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS odontograma_referencias_nombre_unique
  ON odontograma_referencias (LOWER(nombre));

INSERT INTO odontograma_referencias (codigo, nombre, descripcion, color, heredada)
VALUES
  ('sano', 'Sano', 'Sin hallazgos registrados', '#FFFFFF', TRUE),
  ('existente', 'Prestación existente', 'Prestación ya realizada', '#FF4D4D', TRUE),
  ('requerido', 'Prestación requerida', 'Prestación pendiente', '#4D79FF', TRUE),
  ('corona', 'Corona', NULL, '#FFCC00', TRUE),
  ('protesis_fija', 'Prótesis fija', NULL, '#CBD5FF', TRUE),
  ('protesis_removible', 'Prótesis removible', NULL, '#9DD6C8', TRUE),
  ('ausente', 'Diente ausente (heredado)', 'Puede incluir antiguas cargas de extracción; no se reclasifica automáticamente.', '#4B5563', TRUE),
  ('extraccion_indicada', 'Extracción indicada', 'Pieza presente con indicación de extracción', '#7C3AED', FALSE)
ON CONFLICT (codigo) DO NOTHING;

COMMIT;

-- No sanea textos "null"/"undefined": pueden ser texto clínico legítimo.
-- Revisar casos individualmente antes de cualquier corrección de datos heredados.
