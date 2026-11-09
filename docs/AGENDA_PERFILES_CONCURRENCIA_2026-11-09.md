# Agenda por perfil profesional y concurrencia

## Migración

Aplicar `2026-11-09_agenda_perfiles_concurrencia.sql` después de las migraciones de
identidad. Es aditiva: conserva `profesional_id` como referencia legacy y utiliza
`profesional_perfil_id` para nuevas operaciones.

La migración fue aplicada y revalidada únicamente en
`odonton_ficha_20261109_test`. No fue aplicada en `odonton_db` ni en producción.

## Solapamientos históricos

El preflight encontró cinco pares. Todos son turnos `programado`, con intervalos
idénticos de 45 minutos y perfil técnico ID 1, que está inactivo y marcado como
compatibilidad pendiente. Los pares técnicos son:

- 46 / 193 — 2026-11-10 13:00–13:45 UTC.
- 62 / 209 — 2026-11-14 17:00–17:45 UTC.
- 78 / 225 — 2026-11-18 15:00–15:45 UTC.
- 95 / 242 — 2026-11-22 13:00–13:45 UTC.
- 111 / 258 — 2026-11-26 17:00–17:45 UTC.

No se modificó, canceló ni reasignó ninguna fila. El trigger conserva un turno
histórico cuando sólo cambia entre estados que ya ocupan agenda y mantiene exactamente
el mismo perfil e intervalo. Cualquier alta o cambio de perfil/intervalo toma un bloqueo
transaccional por perfil y se contrasta con todos los turnos, incluidos los históricos.

Los rangos son semiabiertos (`inicio < fin_existente` y `fin > inicio_existente`): un
turno puede comenzar exactamente al terminar el anterior.

## Autorización

- Recepción: agenda general y selección de cualquier perfil activo y habilitado.
- Odontólogo: sólo su perfil y sus turnos.
- Recepción + odontólogo: suma permisos y obtiene alcance general.
- Administrador solo: sin acceso operativo.
- Perfiles inactivos: visibles únicamente en relaciones históricas; no seleccionables.

Las respuestas de agenda no incluyen `observaciones`, `solicitud_preferencia`, errores
de recordatorio ni texto de respuesta del paciente. Las nuevas escrituras separan
`creado_por_usuario_id` / `actualizado_por_usuario_id` de
`profesional_perfil_id`.

## WhatsApp

Las solicitudes continúan sin ocupar agenda. Cancelar o reprogramar desde WhatsApp
abre una solicitud pendiente; no modifica directamente el turno. Las únicas llamadas
imprescindibles de disponibilidad, alta confirmada y reprogramación usan un contexto de
sistema explícito y resuelven el perfil habilitado antes de escribir.

## Pendiente

- Migrar la configuración editable de horarios profesionales a una API específica por
  perfil; en esta etapa se conserva el fallback de horario global.
- Adaptar el frontend para tratar todos los selectores como IDs de perfil.
- Revisar por separado permisos de modificación del catálogo de prestaciones.
- No se incorporaron llegada, ausencias, importación de precios ni cambios generales del bot.
