-- 2026-05-11: sesiones conversacionales para autogestion de turnos por WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  step VARCHAR(80) NOT NULL,
  paciente_id INTEGER,
  prestacion_id INTEGER,
  profesional_id INTEGER,
  turno_id INTEGER,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_phone_status
  ON whatsapp_conversations(phone, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_expires
  ON whatsapp_conversations(expires_at);
