# Checkpoint de identidad, agenda y permisos operativos

- Rama: `recovery/original-main-20261109`.
- Base de trabajo autorizada: `odonton_ficha_20261109_test`.
- No se hizo push, merge ni despliegue.
- `backend/.cache/` queda fuera de Git.

## Separacion del trabajo pendiente

Al iniciar la etapa de permisos operativos ya existian cambios locales sin commit en identidad canonica, gestion de usuarios, catalogo/aranceles, autorizacion de pacientes y agenda por perfil profesional. Esos cambios se conservaron y se agruparon por dependencia funcional.

La etapa posterior agrego o completo permisos financieros, reporte operativo reducido, navegacion por permisos efectivos, ficha administrativa para Recepcion, uso explicito de `profesional_perfil_id`, cambio de clave propio y limpieza de sesion.

Algunos archivos compartidos (`identidadService.js`, `turnosController.js`, `main.js`, `api.js`, `index.html`, `pacientesView.js` y `turnosView.js`) contienen trabajo de ambas etapas. Separar sus lineas por procedencia hubiera sido inseguro; se conservaron completos en el commit funcional correspondiente.

## Verificaciones ya realizadas

- Compilacion del frontend aprobada.
- Matriz HTTP de Dueño, Recepcion y Odontologo aprobada para finanzas, reportes, accesos clinicos directos, contraseña temporal y trazabilidad de anulacion.
- Pruebas HTTP de agenda propia, perfiles profesionales independientes e inactivos aprobadas.
- `test-pacientes-autorizacion-http.js` actualizado y aprobado: mantiene rechazos clinicos para Recepcion, verifica respuestas administrativas sin filtraciones, ausencia de escrituras rechazadas y consulta operativa —no administracion— del catalogo.
- `test-auth-identidad-http.js` actualizado y aprobado: inicia y cierra backends propios en puertos libres, reconoce cambios de rol con el mismo token y falla explicitamente ante un esquema de identidad ausente.
- No se enviaron mensajes reales de WhatsApp.

No se repitieron estas pruebas durante la creacion del checkpoint porque no hubo cambios funcionales posteriores.

## Pendientes conocidos

- Revision visual manual de la navegacion por rol. La automatizacion del navegador integrado no estuvo disponible.
- Confirmar en una etapa de migracion controlada cuales scripts SQL corresponden aplicar fuera de la base aislada. No aplicar automaticamente sobre `odonton_db`.
