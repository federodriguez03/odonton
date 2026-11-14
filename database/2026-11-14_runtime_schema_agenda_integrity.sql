BEGIN;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puede_cobrar BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Estados que ocupan agenda: programado, confirmado y reprogramado.
-- Las restricciones NOT VALID preservan filas historicas incompatibles y se
-- aplican a toda alta o modificacion futura sin reescribir datos existentes.
ALTER TABLE turnos DROP CONSTRAINT IF EXISTS turnos_estado_check;
ALTER TABLE turnos DROP CONSTRAINT IF EXISTS turnos_estado_vigente_check;
ALTER TABLE turnos ADD CONSTRAINT turnos_estado_vigente_check CHECK (
  estado IN (
    'programado', 'confirmado', 'reprogramado', 'realizado', 'cancelado',
    'solicitado', 'reprogramacion_solicitada', 'cancelacion_solicitada', 'rechazado'
  )
) NOT VALID;

ALTER TABLE turnos DROP CONSTRAINT IF EXISTS turnos_intervalo_vigente_check;
ALTER TABLE turnos ADD CONSTRAINT turnos_intervalo_vigente_check CHECK (
  (fecha_hora_inicio IS NULL AND fecha_hora_fin IS NULL)
  OR (fecha_hora_inicio IS NOT NULL AND fecha_hora_fin IS NOT NULL AND fecha_hora_fin > fecha_hora_inicio)
) NOT VALID;

CREATE OR REPLACE FUNCTION odonton_agenda_profesional_key(
  perfil_id INTEGER,
  legacy_usuario_id INTEGER
) RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN perfil_id IS NOT NULL THEN 'perfil:' || perfil_id::text
    WHEN legacy_usuario_id IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM profesionales p
      WHERE p.usuario_id = legacy_usuario_id OR p.usuario_legacy_id = legacy_usuario_id
    ) THEN 'perfil:' || (
      SELECT p.id::text FROM profesionales p
      WHERE p.usuario_id = legacy_usuario_id OR p.usuario_legacy_id = legacy_usuario_id
      ORDER BY (p.usuario_id = legacy_usuario_id) DESC, p.id
      LIMIT 1
    )
    ELSE 'legacy_usuario:' || legacy_usuario_id::text
  END
$$;

CREATE OR REPLACE FUNCTION odonton_prevenir_solapamiento_turnos()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profesional_key TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.profesional_perfil_id IS NOT DISTINCT FROM NEW.profesional_perfil_id
    AND OLD.profesional_id IS NOT DISTINCT FROM NEW.profesional_id
    AND OLD.fecha_hora_inicio IS NOT DISTINCT FROM NEW.fecha_hora_inicio
    AND OLD.fecha_hora_fin IS NOT DISTINCT FROM NEW.fecha_hora_fin
    AND OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
    RETURN NEW;
  END IF;

  IF NEW.estado NOT IN ('programado', 'confirmado', 'reprogramado') THEN
    RETURN NEW;
  END IF;

  IF NEW.fecha_hora_inicio IS NULL OR NEW.fecha_hora_fin IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Los turnos que ocupan agenda requieren inicio y fin';
  END IF;

  profesional_key := odonton_agenda_profesional_key(NEW.profesional_perfil_id, NEW.profesional_id);
  IF profesional_key IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Los turnos que ocupan agenda requieren un profesional';
  END IF;

  -- Serializa todas las escrituras de agenda para la identidad profesional
  -- resuelta, incluso al cruzar filas nuevas por perfil con legado por usuario.
  PERFORM pg_advisory_xact_lock(hashtextextended('odonton_agenda:' || profesional_key, 0));

  IF EXISTS (
    SELECT 1
    FROM turnos t
    WHERE t.id IS DISTINCT FROM NEW.id
      AND t.estado IN ('programado', 'confirmado', 'reprogramado')
      AND t.fecha_hora_inicio < NEW.fecha_hora_fin
      AND t.fecha_hora_fin > NEW.fecha_hora_inicio
      AND odonton_agenda_profesional_key(t.profesional_perfil_id, t.profesional_id) = profesional_key
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      MESSAGE = 'El horario seleccionado ya no esta disponible',
      DETAIL = 'Conflicto de agenda para el profesional indicado';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS turnos_prevenir_solapamiento ON turnos;
CREATE TRIGGER turnos_prevenir_solapamiento
BEFORE INSERT OR UPDATE OF profesional_perfil_id, profesional_id, fecha_hora_inicio, fecha_hora_fin, estado
ON turnos
FOR EACH ROW
EXECUTE FUNCTION odonton_prevenir_solapamiento_turnos();

COMMIT;
