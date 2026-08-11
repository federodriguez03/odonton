-- Tratamientos
CREATE TABLE IF NOT EXISTS tratamientos (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  diente SMALLINT NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  observaciones TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tratamientos_paciente_fecha ON tratamientos(paciente_id, fecha DESC);

-- Protesis fijas
CREATE TABLE IF NOT EXISTS protesis_fijas (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  dientes SMALLINT[] NOT NULL,
  descripcion TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Protesis removibles
CREATE TABLE IF NOT EXISTS protesis_removibles (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  arcada VARCHAR(20) NOT NULL,
  descripcion TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
