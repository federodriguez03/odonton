-- 2026-03-11: documentos de paciente
CREATE TABLE IF NOT EXISTS documentos_paciente (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  nombre_archivo TEXT NOT NULL,
  ruta_archivo TEXT NOT NULL,
  tipo_archivo VARCHAR(100) NOT NULL,
  descripcion TEXT,
  fecha_subida TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_paciente_paciente_id ON documentos_paciente (paciente_id);
CREATE INDEX IF NOT EXISTS idx_documentos_paciente_fecha ON documentos_paciente (fecha_subida DESC);
