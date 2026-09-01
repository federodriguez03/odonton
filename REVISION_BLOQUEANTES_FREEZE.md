# Revisión de bloqueantes para freeze global

Fecha: 2026-09-01

## BLOQUEANTE 1: documentos clínicos expuestos por `/uploads`

**Causa:** `backend/src/app.js` montaba `uploads` como contenido estático de Express. Esto permitía solicitar una ruta bajo `/uploads/...` sin pasar por el middleware JWT ni por el endpoint autorizado de documentos.

**Corrección:** se retiró exclusivamente ese montaje estático. La interfaz activa ya descarga con `GET /api/documentos/descargar/:id`, que mantiene autenticación, auditoría, validación de existencia y la descarga normal.

**Prueba:** `backend/scripts/test-documentos-seguridad.js` inicia un servidor HTTP efímero con dependencias simuladas y confirma:

- `/uploads/documentos/.gitkeep` devuelve 404;
- `GET /api/documentos/descargar/1` sin JWT devuelve 401;
- la misma descarga con JWT de prueba devuelve 200 y contenido.

Checklist manual pendiente:

- subir un documento;
- listar documentos en la ficha;
- descargar con sesión autenticada;
- eliminar un documento;
- intentar una URL directa bajo `/uploads/...` y comprobar que no sea accesible.

## BLOQUEANTE 2: la lectura de ficha clínica creaba historias

**Causa:** `pacientesService.obtenerFichaClinica` ejecutaba `INSERT INTO historias_clinicas` después de consultar los datos. Por lo tanto, cada `GET /api/pacientes/:id/ficha-clinica` agregaba un registro artificial de consulta.

**Corrección:** se retiró únicamente ese `INSERT` y su variable auxiliar. El GET conserva la obtención de paciente, turnos, última visita, próximo turno e historias clínicas existentes, pero ahora es una lectura pura.

**Prueba:** `backend/scripts/test-ficha-clinica-lectura.js` realiza dos GET autenticados consecutivos contra un servidor HTTP efímero con base simulada y confirma:

- ambas respuestas contienen los datos funcionales esperados;
- ambas respuestas son iguales;
- la cantidad de `historias_clinicas` permanece sin cambios;
- no se ejecuta `INSERT INTO historias_clinicas`.

Checklist manual pendiente:

- abrir una ficha clínica;
- cambiar de pantalla y volver;
- refrescar la ficha varias veces;
- comprobar que la información se visualice correctamente;
- comprobar que no se creen historias clínicas nuevas.

## ARCHIVOS MODIFICADOS

- `backend/src/app.js`
- `backend/src/services/pacientesService.js`

## ARCHIVOS CREADOS

- `backend/scripts/test-documentos-seguridad.js`
- `backend/scripts/test-ficha-clinica-lectura.js`
- `REVISION_BLOQUEANTES_FREEZE.md`

## PRUEBAS

- Nuevas pruebas de documentos y ficha clínica: aprobadas.
- 14 suites aisladas vigentes: aprobadas, incluidas Turnos/WhatsApp, Cargos/Pagos y Reportes.
- No se ejecutó la prueba de integración que crea datos en PostgreSQL.
- No se envió WhatsApp real.

## NODE CHECK

Correcto: 83 archivos JavaScript verificados.

## BUILD

Correcto: `npm run build` de frontend completado (90 módulos).

## DIFF CHECK

Correcto: sin errores de espacios pendientes.

BASE MODIFICADA: NO
MIGRACIONES: NINGUNA
TURNOS/WHATSAPP MODIFICADO: NO
CARGOS/PAGOS MODIFICADO: NO
COMMIT: NO

## BLOQUEANTES RESTANTES

- Ninguno de los dos bloqueantes auditados permanece abierto. Resta ejecutar la checklist manual final indicada arriba.

## ODONTON LISTO PARA CHECKLIST FINAL DE FREEZE

SÍ
