# Punto de continuidad — agenda y disponibilidad

## Estado Git

- Rama: `feature/pacientes-ficha-clinica-demo-2026`.
- Commit completo anterior al trabajo de agenda: `82b68a3` (`feat(auth): proteger pacientes y datos clinicos`).
- Este documento acompaña un checkpoint WIP: la etapa de agenda no está terminada ni habilitada para despliegue.

## Avance guardado, todavía incompleto

- Se relevó que agenda, disponibilidad y horarios todavía usan `usuarios.id` como profesional.
- Se detectaron las escrituras directas desde HTTP y desde autogestión WhatsApp.
- Se agregó un preflight de perfiles y solapamientos para la base aislada.
- Se preparó, pero **no se aplicó**, la migración aditiva
  `2026-11-09_agenda_perfiles_concurrencia.sql`.
- La migración preparada conserva las relaciones históricas y agrega un trigger con
  bloqueo transaccional por perfil. Usa intervalos semiabiertos: un turno puede comenzar
  exactamente cuando termina el anterior.
- Se inició una política central de agenda: recepción opera en alcance general y
  odontólogo en alcance propio; administrador solo no accede.
- Se comenzaron a adaptar rutas y `turnosService` a `profesional_perfil_id` y a separar
  usuario actor de profesional responsable.

## Incompleto y no validado

- Los controladores todavía no pasan `req.agendaAccess` a todos los servicios.
- Faltan terminar detalle, listado, disponibilidad, solicitudes, recordatorios y
  respuestas sin observaciones potencialmente clínicas.
- Faltan adaptar las llamadas imprescindibles de WhatsApp al contexto de sistema.
- Faltan revisar y completar las consultas de nombres históricos y selectores de perfiles.
- Faltan pruebas HTTP, concurrencia, edición/reprogramación y regresiones WhatsApp.
- El código de agenda de este checkpoint no debe ejecutarse ni desplegarse hasta cerrar
  esos puntos y aplicar la migración en la base aislada.

## Preflight realizado

Destino verificado: PostgreSQL local `::1`, base `odonton_ficha_20261109_test`.

Resultado previo a preparar la restricción:

- Turnos legacy sin perfil: `0`.
- Turnos con perfil: `267`.
- Horarios legacy sin perfil: `0`.
- Pares de turnos históricos solapados: `5`.
- Restricciones de exclusión existentes: ninguna.

Los cinco solapamientos no fueron cancelados, modificados ni reasignados. El trigger
preparado evita que un cambio entre estados bloqueantes, sin alterar intervalo o perfil,
obligue a corregir históricos para poder migrar.

## Migraciones por base

### `odonton_ficha_20261109_test`

Aplicadas y verificadas en etapas anteriores:

- `2026-11-09_historia_clinica_revisiones.sql`.
- `2026-11-09_identidad_roles_profesionales.sql`.
- `2026-11-09_autorizacion_clinica_actores.sql`.

No aplicada:

- `2026-11-09_agenda_perfiles_concurrencia.sql`.

### `odonton_db`

No se aplicó ninguna migración durante estas etapas.

### Producción

No se aplicó ninguna migración ni se realizó despliegue.

## Pruebas realizadas antes de este checkpoint

- Preflight de conexión y solapamientos: sólo lectura, aprobado sobre la base aislada.
- En la etapa anterior pasaron autorización clínica HTTP, identidad, correspondencias,
  transacciones clínicas y catálogo de odontograma.
- Para el cambio parcial de agenda todavía no se ejecutaron pruebas funcionales ni de
  concurrencia.

## Próximo paso

Retomar desde este checkpoint, terminar primero la adaptación de `turnosService`,
controladores y llamadas WhatsApp. Ejecutar revisión de sintaxis y diff. Después volver a
verificar `current_database()`, aplicar la migración de agenda únicamente en
`odonton_ficha_20261109_test` y recién entonces ejecutar la matriz HTTP y las pruebas de
concurrencia. No avanzar a merge o despliegue.
