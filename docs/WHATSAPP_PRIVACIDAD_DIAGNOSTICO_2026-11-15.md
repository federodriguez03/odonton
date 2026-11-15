# Privacidad de diagnósticos WhatsApp

## Información conservada

- Las tablas operativas mantienen los teléfonos, solicitudes, recordatorios y respuestas que el flujo necesita para funcionar. Esta corrección no elimina ni altera auditorías históricas.
- Las auditorías nuevas de autogestión y recordatorios guardan identificadores funcionales, resultado, tiempos y una huella no reversible del teléfono. No copian el cuerpo del mensaje ni el número completo.
- El estado público de conexión conserva estado, tiempos, presencia de QR, errores sanitizados y metadatos mínimos del último evento (`tipo`, origen del evento, propio/ajeno y fecha). No devuelve teléfono, nombre de WhatsApp, cuerpo ni QR.
- El QR vigente sólo se obtiene mediante la ruta autenticada específica para el dueño. No se incluye en logs ni respuestas generales de estado.

## Diagnóstico de chats

La consulta de chats recientes queda deshabilitada en producción. En entornos locales autorizados devuelve únicamente conteos y tiempos agregados; no devuelve identificadores, nombres, teléfonos ni cuerpos. El modo de diagnóstico mantiene bloqueados los envíos externos según los controles existentes.

Las huellas usan `WHATSAPP_DIAGNOSTIC_HASH_SALT` cuando está definida, luego `JWT_SECRET`; si ninguna existe se usa una sal aleatoria limitada al proceso. No deben configurarse secretos en archivos versionados.

## Límites

Los datos operativos necesarios continúan en la base con su política de acceso y retención existente. Definir plazos de retención y depuración de auditorías históricas requiere una decisión administrativa separada; no se borraron registros en esta etapa.
