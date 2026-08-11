-- Tabla odontograma (version por cara) solicitada para modulo interactivo
-- Fecha: 2026-03-09

CREATE TABLE IF NOT EXISTS odontograma (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  diente SMALLINT NOT NULL,
  cara VARCHAR(20) NOT NULL,
  estado VARCHAR(50) NOT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (paciente_id, diente, cara)
);
