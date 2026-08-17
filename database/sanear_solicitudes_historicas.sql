-- Saneamiento controlado de solicitudes historicas inconsistentes.
--
-- Alcance:
--   * Solo modifica turno_solicitudes que continuen en estado 'pendiente'.
--   * No elimina solicitudes ni modifica turnos.
--   * No resuelve combinaciones ambiguas ni solicitudes activas coherentes.
--
-- Precondiciones para su ejecucion real:
--   1. Backend Odonton detenido.
--   2. Backup completo y reciente de odonton_db validado.
--   3. Revision previa de la fotografia actual de datos.

BEGIN;

-- Solicitudes que ya fueron atendidas o cuyo turno termino cancelado/realizado.
UPDATE turno_solicitudes AS ts
SET
  estado = 'resuelta',
  updated_at = NOW()
FROM turnos AS t
WHERE ts.turno_id = t.id
  AND ts.estado = 'pendiente'
  AND (
    t.estado IN ('cancelado', 'realizado')
    OR (
      ts.tipo_solicitud IN ('nuevo_turno', 'primera_consulta')
      AND t.estado IN ('programado', 'confirmado', 'reprogramado')
    )
    OR (
      ts.tipo_solicitud = 'reprogramacion'
      AND t.estado IN ('reprogramado', 'confirmado')
    )
  );

-- Solicitudes cuyo turno asociado fue rechazado.
UPDATE turno_solicitudes AS ts
SET
  estado = 'rechazada',
  updated_at = NOW()
FROM turnos AS t
WHERE ts.turno_id = t.id
  AND ts.estado = 'pendiente'
  AND t.estado = 'rechazado';

-- Control de inconsistencias inequívocas: todos los conteos deben ser cero.
SELECT
  COUNT(*) FILTER (WHERE t.estado = 'cancelado') AS pendiente_cancelado,
  COUNT(*) FILTER (WHERE t.estado = 'realizado') AS pendiente_realizado,
  COUNT(*) FILTER (WHERE t.estado = 'rechazado') AS pendiente_rechazado,
  COUNT(*) FILTER (
    WHERE ts.tipo_solicitud IN ('nuevo_turno', 'primera_consulta')
      AND t.estado IN ('programado', 'confirmado', 'reprogramado')
  ) AS nuevo_primera_pendiente_aceptado,
  COUNT(*) FILTER (
    WHERE ts.tipo_solicitud = 'reprogramacion'
      AND t.estado IN ('reprogramado', 'confirmado')
  ) AS reprogramacion_pendiente_atendida
FROM turno_solicitudes AS ts
LEFT JOIN turnos AS t ON t.id = ts.turno_id
WHERE ts.estado = 'pendiente';

-- Fotografia agregada de las solicitudes que permaneceran pendientes.
-- Permite revisar combinaciones no contempladas sin exponer datos personales.
SELECT
  ts.tipo_solicitud,
  CASE
    WHEN ts.turno_id IS NULL THEN '(sin_turno)'
    ELSE COALESCE(t.estado, '(turno_inexistente)')
  END AS estado_turno,
  COUNT(*) AS cantidad
FROM turno_solicitudes AS ts
LEFT JOIN turnos AS t ON t.id = ts.turno_id
WHERE ts.estado = 'pendiente'
GROUP BY
  ts.tipo_solicitud,
  CASE
    WHEN ts.turno_id IS NULL THEN '(sin_turno)'
    ELSE COALESCE(t.estado, '(turno_inexistente)')
  END
ORDER BY ts.tipo_solicitud, estado_turno;

COMMIT;
