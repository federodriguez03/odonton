-- Prestaciones reservadas por turno. La fila de orden 1 mantiene sincronizado
-- turnos.prestacion_id para compatibilidad con consumidores existentes.
CREATE TABLE IF NOT EXISTS public.turno_prestaciones (
  id BIGSERIAL PRIMARY KEY,
  turno_id INTEGER NOT NULL REFERENCES public.turnos(id) ON DELETE CASCADE,
  prestacion_id INTEGER NOT NULL REFERENCES public.prestaciones(id) ON DELETE RESTRICT,
  orden INTEGER NOT NULL CHECK (orden > 0),
  nombre_snapshot VARCHAR(100) NOT NULL,
  duracion_minutos_snapshot INTEGER NOT NULL CHECK (duracion_minutos_snapshot > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (turno_id, orden),
  UNIQUE (turno_id, prestacion_id)
);

CREATE INDEX IF NOT EXISTS idx_turno_prestaciones_prestacion
  ON public.turno_prestaciones (prestacion_id);

-- Copia aditiva: usa el nombre y la duración disponibles al ejecutar esta migración.
-- No modifica horarios ni pretende reconstruir valores históricos del catálogo.
INSERT INTO public.turno_prestaciones
  (turno_id, prestacion_id, orden, nombre_snapshot, duracion_minutos_snapshot)
SELECT t.id, p.id, 1, p.nombre, p.duracion_minutos
FROM public.turnos t
JOIN public.prestaciones p ON p.id = t.prestacion_id
WHERE p.duracion_minutos > 0
ON CONFLICT (turno_id, prestacion_id) DO NOTHING;

COMMENT ON COLUMN public.turnos.prestacion_id IS
  'Compatibilidad: debe coincidir con prestacion_id de turno_prestaciones donde orden=1.';

