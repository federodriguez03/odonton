CREATE TABLE IF NOT EXISTS turno_solicitudes (
  id BIGSERIAL PRIMARY KEY,
  tipo_solicitud VARCHAR(40) NOT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'pendiente',
  paciente_id INTEGER NULL,
  nombre_apellido TEXT NULL,
  dni VARCHAR(20) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  motivo TEXT NULL,
  preferencia_horaria TEXT NULL,
  turno_id INTEGER NULL,
  observaciones TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS tipo_solicitud VARCHAR(40);
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS estado VARCHAR(30) DEFAULT 'pendiente';
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS paciente_id INTEGER NULL;
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS nombre_apellido TEXT NULL;
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS dni VARCHAR(20);
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS telefono VARCHAR(30);
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS motivo TEXT NULL;
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS preferencia_horaria TEXT NULL;
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS turno_id INTEGER NULL;
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS observaciones TEXT NULL;
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE turno_solicitudes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE turno_solicitudes ALTER COLUMN estado SET DEFAULT 'pendiente';
UPDATE turno_solicitudes SET estado = 'pendiente' WHERE estado IS NULL;
UPDATE turno_solicitudes SET created_at = NOW() WHERE created_at IS NULL;
UPDATE turno_solicitudes SET updated_at = NOW() WHERE updated_at IS NULL;
ALTER TABLE turno_solicitudes ALTER COLUMN estado SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_turno_solicitudes_estado
  ON turno_solicitudes(estado);

CREATE INDEX IF NOT EXISTS idx_turno_solicitudes_paciente
  ON turno_solicitudes(paciente_id);

CREATE INDEX IF NOT EXISTS idx_turno_solicitudes_turno
  ON turno_solicitudes(turno_id);
