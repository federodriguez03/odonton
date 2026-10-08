# Odonton

Sistema web de gestión interna para un consultorio odontológico. Incluye pacientes, ficha clínica, odontograma, documentos, prestaciones, turnos y solicitudes por WhatsApp, recordatorios, configuración, cargos, pagos, dashboard y reportes.

La agenda es interna. La constancia de pago no es fiscal y Google Calendar no forma parte del sistema actual.

## Requisitos

- Node.js 18 o superior y npm.
- PostgreSQL.
- Navegador moderno.
- Chromium disponible para `whatsapp-web.js`.

## Instalación básica

```powershell
cd backend
npm install
Copy-Item .env.example .env

cd ..\frontend
npm install
Copy-Item .env.example .env.local
```

Complete `backend/.env` con credenciales locales y un `JWT_SECRET` privado. No versione `.env`, sesiones de WhatsApp, documentos clínicos ni backups.

## Ejecución

Backend:

```powershell
cd backend
npm run dev
```

Frontend:

```powershell
cd frontend
npm run dev
```

Por defecto, el backend utiliza `http://localhost:3000` y Vite `http://localhost:5173`.

## Documentación

La guía vigente de arquitectura, módulos, reglas, configuración, pruebas, ejecución y preparación para producción se encuentra en [DOCUMENTACION_ODONTON.md](DOCUMENTACION_ODONTON.md).

La estructura exacta de PostgreSQL se documenta en [AUDITORIA_ESTRUCTURA_DATOS_FINAL.md](AUDITORIA_ESTRUCTURA_DATOS_FINAL.md).
