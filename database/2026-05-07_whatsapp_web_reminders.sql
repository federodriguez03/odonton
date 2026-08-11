-- Recordatorios por WhatsApp Web (whatsapp-web.js).
CREATE TABLE IF NOT EXISTS whatsapp_reminders (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL,
  patient_id INTEGER,
  phone VARCHAR(30) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending_response',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP NULL,
  response_text TEXT NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_reminders_pending_phone
  ON whatsapp_reminders (phone, sent_at DESC)
  WHERE status = 'pending_response';

CREATE INDEX IF NOT EXISTS idx_whatsapp_reminders_appointment
  ON whatsapp_reminders (appointment_id);

ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_procesado_at TIMESTAMPTZ;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_enviado_at TIMESTAMPTZ;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_estado TEXT;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS recordatorio_error TEXT;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS respuesta_paciente TEXT;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS respuesta_paciente_at TIMESTAMPTZ;

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
