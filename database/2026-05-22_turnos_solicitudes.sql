ALTER TABLE turnos ALTER COLUMN fecha_hora_inicio DROP NOT NULL;
ALTER TABLE turnos ALTER COLUMN fecha_hora_fin DROP NOT NULL;
ALTER TABLE turnos ALTER COLUMN prestacion_id DROP NOT NULL;

ALTER TABLE turnos ADD COLUMN IF NOT EXISTS solicitud_preferencia TEXT;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS solicitud_confirmada_at TIMESTAMPTZ;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS solicitud_rechazada_at TIMESTAMPTZ;
ALTER TABLE turnos DROP CONSTRAINT IF EXISTS turnos_estado_check;

CREATE INDEX IF NOT EXISTS idx_turnos_solicitudes_pendientes
  ON turnos (created_at DESC)
  WHERE estado = 'solicitado';
