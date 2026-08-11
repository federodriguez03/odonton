# Integrador WhatsApp obsoleto

Este integrador externo es legado y ya no forma parte del flujo principal de Odonton.

Odonton ahora envia y recibe mensajes desde el backend con `whatsapp-web.js`.
Inicia el backend, escanea el QR desde el modulo de Configuracion y usa las rutas internas protegidas:

- `GET /api/whatsapp/status`
- `POST /api/whatsapp/send-test`
- `POST /api/whatsapp/send-reminder/:appointmentId`

No versionar `.env`, `node_modules/`, sesiones locales ni caches de WhatsApp de esta carpeta.
