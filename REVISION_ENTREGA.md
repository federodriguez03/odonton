# Revision de entrega - Odonton

Fecha de revision: 2026-05-28

## Estado general

El proyecto cuenta con backend, frontend, base de datos PostgreSQL e integracion activa de WhatsApp desde el backend. La revision se realizo con criterio conservador: limpieza, seguridad basica y documentacion, sin agregar funcionalidades nuevas ni reescribir arquitectura.

## Tecnologias reales detectadas

- Backend: Node.js, Express, CommonJS, JWT, Multer.
- Frontend: Vite, JavaScript, HTML/CSS, dependencias React presentes.
- Base de datos: PostgreSQL mediante `pg`.
- WhatsApp: `whatsapp-web.js` en `backend/src/services/whatsappClient.service.js`.

## Modulos detectados

- Pacientes
- Turnos
- Prestaciones
- Odontograma
- Tratamientos
- Documentos
- Pagos
- Reportes / estadisticas
- Configuracion
- WhatsApp

## Funcionalidades dentro del alcance

- Login y autenticacion por JWT.
- Gestion de pacientes y ficha clinica.
- Gestion de turnos con agenda interna diaria/semanal.
- Gestion de prestaciones.
- Odontograma y tratamientos/protesis.
- Carga y consulta de documentos de pacientes.
- Registro de pagos.
- Reportes y estadisticas.
- Configuracion del consultorio y mensajes.
- Envio y recepcion de mensajes por WhatsApp Web desde backend.
- Recordatorios y autogestion basica vinculada a WhatsApp.

## Fuera de alcance

- Google Calendar.
- Facturacion electronica oficial.
- Portal completo de pacientes.
- Inventario.
- Obras sociales.
- Roles avanzados si no estan implementados en el flujo actual.

## Riesgos tecnicos detectados

- Existen carpetas locales que no deben entregarse ni versionarse: `node_modules/`, `frontend/dist/`, `backend/.wwebjs_auth/`, `backend/.wwebjs_cache/`.
- Existen archivos `.env` locales en `backend/` e `integrador-whatsapp/`; no se modificaron, pero deben permanecer fuera del repositorio.
- Hay un documento real en `backend/uploads/documentos/`; se conserva la carpeta con `.gitkeep`, pero los documentos reales deben quedar ignorados.
- `integrador-whatsapp/` existe como legado/obsoleto. No debe usarse como integracion principal.
- `git status` requiere indicar `safe.directory` por ownership distinto en Windows; al consultarlo con configuracion temporal se observan muchos cambios previos/no relacionados.
- Algunas migraciones agregan columnas/tablas con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; no se tocaron para evitar cambios destructivos.

## Correcciones aplicadas

- `.gitignore` raiz actualizado para ignorar dependencias, builds, `.env`, sesiones/cache de WhatsApp, logs y documentos reales subidos.
- `frontend/.env.example` creado con variables ficticias/no sensibles.
- `backend/src/config/env.js` sanitizado para no contener contrasenas reales.
- Rutas de WhatsApp protegidas con autenticacion y autorizacion de odontologo.
- Rutas de desarrollo/prueba de WhatsApp marcadas con comentarios de advertencia.
- Documentacion del integrador legacy de WhatsApp actualizada.
- README principal creado con instrucciones de instalacion, entorno, base de datos y alcance.
- Menciones de calendario externo como funcionalidad activa neutralizadas en documentacion de casos de uso.

## Verificaciones realizadas

- `npm run build` en `frontend/`: correcto.
- Revision de sintaxis JS con `node --check`: correcta.
- Busqueda de secretos conocidos y menciones activas a MySQL/phpMyAdmin/Google Calendar: sin hallazgos activos, salvo la migracion historica que elimina campos de Google Calendar.

## Recomendaciones para la entrega

- Verificar que `backend/.env` local tenga `JWT_SECRET` fuerte y credenciales correctas de PostgreSQL.
- Antes de comprimir o subir el proyecto, excluir `node_modules/`, `dist/`, `.env`, `.wwebjs_auth/`, `.wwebjs_cache/` y documentos reales.
- Probar login, pacientes, turnos, odontograma, pagos, reportes y configuracion desde el navegador.
- Probar WhatsApp solo con numeros autorizados y una sesion local valida.
- Mantener Google Calendar como descartado del alcance actual.

## Checklist final para defensa

- [x] Proyecto revisado sin reescritura de arquitectura.
- [x] PostgreSQL confirmado como base de datos.
- [x] WhatsApp activo confirmado en backend con `whatsapp-web.js`.
- [x] `integrador-whatsapp/` documentado como legado.
- [x] `.gitignore` actualizado.
- [x] `.env.example` de backend revisado y frontend creado.
- [x] Credencial hardcodeada encontrada y reemplazada por valor ficticio.
- [x] Google Calendar no figura como funcionalidad activa.
- [x] Documentacion de entrega agregada.
- [ ] Ejecutar pruebas funcionales completas en el ambiente local de defensa.
- [ ] Revisar con Git si algun archivo sensible ya estaba trackeado antes de esta limpieza.
