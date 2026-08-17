# Checklist manual — Recordatorio automático opcional por turno

Estas verificaciones no requieren esperar la ventana de 24 horas ni enviar un WhatsApp real.

## Preparación

- Iniciar backend y frontend normalmente.
- Iniciar sesión como odontólogo.
- Abrir el módulo Turnos.

## Alta con recordatorio habilitado

1. Abrir “Nuevo turno”.
2. Confirmar que “Enviar recordatorio automático por WhatsApp” aparece marcado por defecto.
3. Completar los datos y guardar.
4. Reabrir el turno desde Editar.
5. Confirmar que el checkbox continúa marcado.

## Alta con recordatorio deshabilitado

1. Abrir “Nuevo turno”.
2. Desmarcar el checkbox.
3. Completar los datos y guardar.
4. Reabrir el turno.
5. Confirmar que el checkbox continúa desmarcado.

## Edición

1. Abrir un turno con el checkbox marcado.
2. Desmarcarlo y guardar.
3. Reabrirlo y confirmar que continúa desmarcado.
4. Volver a marcarlo, guardar y comprobar nuevamente.

## Confirmación de solicitud WhatsApp

1. Abrir una solicitud de turno pendiente.
2. Confirmar que el checkbox aparece marcado por defecto.
3. Desmarcarlo antes de confirmar la solicitud.
4. Confirmar el turno.
5. Reabrirlo y comprobar que permanece desmarcado.
6. Verificar que la solicitud dejó de estar pendiente.

## Revisión visual

- Confirmar que ambos modales mantienen su distribución y botones visibles.
- Confirmar que no aparecen errores en la interfaz ni en la consola del backend.
- No utilizar el botón manual de WhatsApp durante esta prueba.

## Verificación controlada del scheduler

Ejecutar, con el backend detenido:

```powershell
node backend/scripts/test-recordatorio-por-turno.js
```

La salida esperada es:

```text
OK: recordatorio opcional por turno (10 escenarios, sin WhatsApp real)
```
