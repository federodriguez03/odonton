# Operación de instancia

## HTTP y salud

- `CORS_ALLOWED_ORIGINS` contiene los orígenes exactos separados por coma. En desarrollo, si no se define, se permiten únicamente localhost/127.0.0.1 en puertos 3000 y 5173; en producción no hay orígenes cruzados implícitos.
- `TRUST_PROXY_HOPS` debe indicar la cantidad exacta de proxies administrados delante de Node. Su valor predeterminado es `0`; no se confía en `X-Forwarded-For` enviado directamente por clientes.
- `/health/live` sólo confirma que el proceso HTTP vive. `/health/ready` comprueba PostgreSQL y acceso de lectura/escritura a la raíz persistente de uploads con timeout. WhatsApp no forma parte de readiness porque es opcional.

## Responsabilidad única y persistencia

Debe existir una sola instancia responsable del scheduler de recordatorios y de la sesión WhatsApp. Escalar el frontend/API requiere separar esos trabajos o incorporar coordinación distribuida antes de habilitar más de una instancia. El lock local evita que dos procesos usen la misma sesión, pero no reemplaza coordinación entre volúmenes o hosts distintos.

El despliegue debe persistir `backend/uploads` y la ruta configurada por `WHATSAPP_AUTH_DATA_PATH`. Un reinicio conserva LocalAuth; el cierre coordinado sólo destruye el cliente propio y libera su lock, sin desvincular ni borrar la sesión.

SIGTERM/SIGINT dejan de aceptar conexiones, detienen el scheduler y esperan solicitudes en curso; luego destruyen el cliente WhatsApp propio y cierran PostgreSQL. `SHUTDOWN_TIMEOUT_MS` limita el proceso completo y fuerza únicamente el cierre de conexiones HTTP propias si se supera.
