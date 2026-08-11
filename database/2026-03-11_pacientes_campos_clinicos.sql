-- 2026-03-11: agregar campos clinicos a pacientes
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS alergias TEXT;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS condiciones TEXT;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estado_tratamiento TEXT;
