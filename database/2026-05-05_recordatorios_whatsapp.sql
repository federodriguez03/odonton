-- Recordatorios automaticos y respuestas por WhatsApp.
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_procesado_at TIMESTAMPTZ;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_enviado_at TIMESTAMPTZ;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_estado TEXT;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_error TEXT;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS respuesta_paciente TEXT;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS respuesta_paciente_at TIMESTAMPTZ;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS reprogramacion_token TEXT;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS reprogramacion_token_expira_at TIMESTAMPTZ;

UPDATE turnos
SET recordatorio_estado = 'pendiente'
WHERE recordatorio_estado IS NULL;

CREATE INDEX IF NOT EXISTS idx_turnos_recordatorios_pendientes
  ON turnos (fecha_hora_inicio)
  WHERE estado = 'programado'
    AND recordatorio_enviado_at IS NULL;

CREATE TABLE IF NOT EXISTS autogestion_tokens (
  id BIGSERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  telefono TEXT,
  tipo_flujo TEXT NOT NULL DEFAULT 'solicitar_turno',
  creado_por TEXT NOT NULL DEFAULT 'whatsapp',
  estado TEXT NOT NULL DEFAULT 'activo',
  usado_en_turno_id INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE autogestion_tokens ADD COLUMN IF NOT EXISTS turno_id INTEGER;
ALTER TABLE autogestion_tokens ADD COLUMN IF NOT EXISTS paciente_id INTEGER;
ALTER TABLE autogestion_tokens ADD COLUMN IF NOT EXISTS accion TEXT;
ALTER TABLE autogestion_tokens ADD COLUMN IF NOT EXISTS tipo_flujo TEXT NOT NULL DEFAULT 'solicitar_turno';

CREATE INDEX IF NOT EXISTS idx_autogestion_tokens_reprogramacion
  ON autogestion_tokens (token, expires_at)
  WHERE tipo_flujo = 'reprogramar_turno'
    AND estado = 'activo'
    AND used_at IS NULL;

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER,
  accion TEXT NOT NULL,
  recurso TEXT,
  recurso_id TEXT,
  status_code INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
