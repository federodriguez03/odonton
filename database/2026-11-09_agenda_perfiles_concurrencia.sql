BEGIN;

ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS profesional_perfil_id INTEGER,
  ADD COLUMN IF NOT EXISTS creado_por_usuario_id INTEGER,
  ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id INTEGER;

ALTER TABLE profesionales_horarios_atencion
  ADD COLUMN IF NOT EXISTS profesional_perfil_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='turnos_creado_por_usuario_fkey') THEN
    ALTER TABLE turnos ADD CONSTRAINT turnos_creado_por_usuario_fkey
      FOREIGN KEY (creado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='turnos_actualizado_por_usuario_fkey') THEN
    ALTER TABLE turnos ADD CONSTRAINT turnos_actualizado_por_usuario_fkey
      FOREIGN KEY (actualizado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profesionales_horarios_perfil_dia_unique
  ON profesionales_horarios_atencion(profesional_perfil_id,dia_semana)
  WHERE profesional_perfil_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_turnos_perfil_intervalo_activo
  ON turnos(profesional_perfil_id,fecha_hora_inicio,fecha_hora_fin)
  WHERE estado IN ('programado','reprogramado','confirmado');

CREATE OR REPLACE FUNCTION impedir_solapamiento_agenda()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.profesional_perfil_id IS NULL
     OR NEW.fecha_hora_inicio IS NULL OR NEW.fecha_hora_fin IS NULL
     OR NEW.estado NOT IN ('programado','reprogramado','confirmado') THEN
    RETURN NEW;
  END IF;

  IF NEW.fecha_hora_fin <= NEW.fecha_hora_inicio THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='La hora de fin debe ser posterior a la hora de inicio';
  END IF;

  -- Un cambio entre estados que ya ocupaban el mismo intervalo no vuelve a validar
  -- solapamientos históricos preexistentes.
  IF TG_OP='UPDATE'
     AND OLD.estado IN ('programado','reprogramado','confirmado')
     AND OLD.profesional_perfil_id IS NOT DISTINCT FROM NEW.profesional_perfil_id
     AND OLD.fecha_hora_inicio IS NOT DISTINCT FROM NEW.fecha_hora_inicio
     AND OLD.fecha_hora_fin IS NOT DISTINCT FROM NEW.fecha_hora_fin THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(20261109, NEW.profesional_perfil_id);
  IF EXISTS (
    SELECT 1 FROM turnos t
    WHERE t.id <> COALESCE(NEW.id,0)
      AND t.profesional_perfil_id=NEW.profesional_perfil_id
      AND t.estado IN ('programado','reprogramado','confirmado')
      AND t.fecha_hora_inicio < NEW.fecha_hora_fin
      AND t.fecha_hora_fin > NEW.fecha_hora_inicio
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23P01', MESSAGE='El horario seleccionado ya está ocupado para este profesional';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_turnos_impedir_solapamiento ON turnos;
CREATE TRIGGER trg_turnos_impedir_solapamiento
BEFORE INSERT OR UPDATE OF profesional_perfil_id,fecha_hora_inicio,fecha_hora_fin,estado ON turnos
FOR EACH ROW EXECUTE FUNCTION impedir_solapamiento_agenda();

COMMIT;

-- No se actualizan profesional_id, profesional_perfil_id ni intervalos históricos.
-- Los solapamientos preexistentes permanecen visibles para revisión manual.
