# Preparación canónica de identidad y roles

La fuente preparada para futuras autorizaciones es `usuarios_roles_vigentes`: admite exactamente un rol por cuenta. `usuarios_roles` se conserva como antecedente residual y no debe consultarse para autorizar.

Roles canónicos: `dueno`, `odontologo` y `recepcion`. La asignación inicial del dueño se realiza indicando explícitamente su email al aplicar la migración y queda registrada en `identidad_roles_historial`.

`profesionales` conserva sus filas y relaciones. Los vínculos residuales quedan sin confirmar (`vinculo_confirmado_at IS NULL`) y no deben usarse para resolver agenda propia hasta una revisión manual. No se vinculan perfiles por coincidencia de IDs.

Verificación: debe existir una sola fila canónica para el dueño; las cuentas de prueba deben quedar sin rol canónico; todos los perfiles residuales deben seguir sin confirmación. Login, JWT, rutas y frontend todavía no consumen estas estructuras.
