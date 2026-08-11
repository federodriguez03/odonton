-- Migracion manual: odontograma (caso de uso 2.6)
-- Fecha: 2026-03-09

CREATE TABLE IF NOT EXISTS odontograma_piezas (
  id BIGSERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  pieza_numero SMALLINT NOT NULL,
  estado_pieza TEXT NOT NULL DEFAULT 'sana',
  caras JSONB NOT NULL DEFAULT '{}'::jsonb,
  observaciones TEXT,
  updated_by_usuario_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_odontograma_pieza UNIQUE (paciente_id, pieza_numero)
);

CREATE TABLE IF NOT EXISTS odontograma_cambios (
  id BIGSERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  pieza_numero SMALLINT NOT NULL,
  accion TEXT NOT NULL,
  estado_pieza TEXT NOT NULL,
  caras JSONB NOT NULL DEFAULT '{}'::jsonb,
  observaciones TEXT,
  usuario_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
