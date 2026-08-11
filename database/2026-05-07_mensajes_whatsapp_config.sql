-- Mensajes predeterminados configurables para WhatsApp.
CREATE TABLE IF NOT EXISTS configuracion_mensajes_automaticos (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(60) NOT NULL UNIQUE,
  contenido TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracion_mensajes_automaticos (tipo, contenido, activo)
VALUES
  ('principal_whatsapp', 'Hola {paciente}, somos {consultorio}. Te escribimos por tu atencion odontologica.', true),
  ('recordatorio_turno', 'Hola {paciente}, te recordamos tu turno odontologico:
Fecha: {fecha}
Hora: {hora}
Prestacion: {prestacion}

Responde:
1 para confirmar
2 para cancelar
3 para solicitar reprogramacion', true),
  ('confirmacion_turno', 'Tu turno fue confirmado. Te esperamos el {fecha} a las {hora}. Gracias!', true),
  ('cancelacion_turno', 'Tu turno fue cancelado. Gracias por avisarnos.', true),
  ('reprogramacion_turno', 'Recibimos tu solicitud de reprogramacion. El consultorio se comunicara con vos.', true)
ON CONFLICT (tipo) DO NOTHING;
