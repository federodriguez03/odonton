-- Limpieza de campos creados para la integracion eliminada con Google Calendar.
DROP INDEX IF EXISTS idx_turnos_google_event_id;
ALTER TABLE turnos DROP COLUMN IF EXISTS google_event_id;
ALTER TABLE turnos DROP COLUMN IF EXISTS sync_estado;
ALTER TABLE turnos DROP COLUMN IF EXISTS sync_error;
