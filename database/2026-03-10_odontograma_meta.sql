-- Meta de odontograma (sarro y periodontal)
-- Fecha: 2026-03-10

CREATE TABLE IF NOT EXISTS odontograma_meta (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE CASCADE,
  sarro BOOLEAN NOT NULL DEFAULT FALSE,
  periodontal BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
