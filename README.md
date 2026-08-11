# Odonton

Sistema web de gestion odontologica para administracion de pacientes, turnos, prestaciones, odontograma, tratamientos, documentos, pagos, reportes, configuracion y comunicacion por WhatsApp Web.

## Tecnologias

- Backend: Node.js, Express, CommonJS.
- Frontend: Vite, JavaScript, React como dependencia del proyecto y vistas HTML/JS.
- Base de datos: PostgreSQL mediante `pg`.
- WhatsApp: `whatsapp-web.js` integrado en el backend.

Google Calendar fue descartado del alcance actual. La agenda activa es la agenda interna del sistema.

## Instalacion

Instalar dependencias del backend:

```bash
cd backend
npm install
```

Instalar dependencias del frontend:

```bash
cd frontend
npm install
```

## Variables de entorno

Backend:

```bash
cd backend
copy .env.example .env
```

Editar `backend/.env` con credenciales locales de PostgreSQL y valores propios para `JWT_SECRET`.

Frontend:

```bash
cd frontend
copy .env.example .env.local
```

En desarrollo puede dejarse `VITE_API_BASE_URL` vacio para usar el proxy de Vite.

No subir ni compartir `.env`, `.env.local`, sesiones de WhatsApp ni credenciales reales.

## Base de datos

Crear una base PostgreSQL, por ejemplo `odonton_db`, y aplicar los scripts SQL de `database/` segun corresponda al ambiente.

El backend usa las variables `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `DB_PORT`.

Para probar la conexion:

```bash
cd backend
npm run test:db
```

## Ejecucion

Backend:

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

Por defecto, el backend escucha en `http://localhost:3000` y el frontend en `http://localhost:5173`.

## WhatsApp

La integracion activa esta en el backend con `whatsapp-web.js`. Las sesiones locales quedan en `.wwebjs_auth/` y la cache en `.wwebjs_cache/`; ambas carpetas deben mantenerse fuera del repositorio.

La carpeta `integrador-whatsapp/` es legado/obsoleta y no se integra al flujo principal.

## Archivos que no deben versionarse

- `node_modules/`
- `dist/` y `build/`
- `.env` y `.env.local`
- `.wwebjs_auth/` y `.wwebjs_cache/`
- documentos reales en `uploads/documentos/` o `backend/uploads/documentos/`
- logs y caches temporales
