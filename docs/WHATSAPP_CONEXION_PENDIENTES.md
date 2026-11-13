# Conexión WhatsApp y pendientes fuera de alcance

La conexión usa una única instancia por sesión, timeout de inicio, reconexión limitada y exclusión entre procesos. Conectar y reintentar conservan `LocalAuth`; sólo la desvinculación confirmada elimina la sesión.

## Diagnóstico local sin envíos

Con `WHATSAPP_DIAGNOSTIC_MODE=true` se habilitan únicamente estado, QR, conexión, reintento y desconexión conservando `LocalAuth`. El cliente no registra el procesador de mensajes ni inicia polling; además, el transporte rechaza cualquier envío aunque otra ruta intente invocarlo. La desvinculación permanece bloqueada en este modo para no eliminar la sesión durante el diagnóstico.

Este modo no prueba el despliegue ni habilita bot, solicitudes, recordatorios o notificaciones.

## Pendientes

- Unificar para Recepción los permisos de listar, confirmar y rechazar solicitudes.
- Incorporar idempotencia transaccional para recordatorios ante procesos simultáneos.
- Reducir la exposición de contenido en diagnósticos y auditorías de mensajes.
- Validar en el despliegue que exista almacenamiento persistente y una sola instancia responsable de WhatsApp.

Estas tareas no deben resolverse concediendo permisos generales ni modificando automáticamente turnos o solicitudes.
