-- 2026-05-11: palabras clave configurables para iniciar autogestion por WhatsApp
ALTER TABLE configuracion_consultorio
ADD COLUMN IF NOT EXISTS autogestion_keywords TEXT NOT NULL
DEFAULT 'turno, turnito, cita, consulta, odontologo, odontóloga, odontologia, odontología';
