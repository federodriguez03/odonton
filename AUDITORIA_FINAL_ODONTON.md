# FASE 5A — Auditoría funcional final de Odonton

Fecha: 2026-09-01

## ESTADO GENERAL

Odonton compila, tiene el backend activo y conserva operativos sus dos núcleos congelados: Turnos/WhatsApp y Cargos/Pagos. La arquitectura predominante continúa siendo `vista → API → ruta → controller → service/dominio → PostgreSQL`, las rutas principales están montadas y las pruebas aisladas vigentes pasan.

El sistema **todavía no debe declararse en freeze global**. Se encontraron dos defectos concretos que afectan confidencialidad e integridad clínica:

1. los archivos subidos quedan publicados por una ruta estática sin autenticación;
2. consultar una ficha clínica inserta una fila nueva en `historias_clinicas` aunque la operación sea un GET.

No se modificó ningún archivo runtime ni PostgreSQL durante esta auditoría.

## MÓDULOS

| Módulo | Estado | Evidencia |
|---|---|---|
| Autenticación | Funcional | Login con bcrypt/JWT, restauración mediante `/api/auth/me`, `.env` privado y `JWT_SECRET` obligatorio. Ha sido utilizado por las validaciones manuales previas. |
| Dashboard | Funcional con ajuste pendiente | Se inicializa desde `main.js` y consume pacientes, turnos, tratamientos, estadísticas e ingresos reales. El gráfico “Últimos 6 meses” recibe solamente datos del mes actual. |
| Pacientes | Funcional con bloqueante en ficha | CRUD, búsqueda, ordenamiento y paginación están conectados. La ficha consulta turnos y documentos, pero su GET genera una escritura clínica no solicitada. |
| Turnos | Funcional y probado — CONGELADO | Alta, edición, reprogramación, cancelación, disponibilidad, agenda diaria/semanal, solicitudes y recordatorios. Cierre documentado en `CIERRE_TURNOS_WHATSAPP.md` y nueve suites vigentes. |
| WhatsApp | Funcional y probado — CONGELADO | Sesión, QR, recepción por eventos, autogestión, solicitudes y recordatorios. Controles administrativos protegidos por JWT y rol. |
| Prestaciones | Funcional, pendiente de checklist final específica | Vista inicializada con alta, edición, activación y desactivación; rutas y service conectados. No existe una suite aislada propia. |
| Ficha clínica dentro de Pacientes | Parcial | Muestra datos del paciente, antecedentes, historial de turnos y documentos. No presenta una evolución clínica editable y actualmente contamina `historias_clinicas` al consultarse. |
| Historia clínica (pestaña) | Incompleta y visible | La pestaña abre un placeholder que dice “Este módulo estará disponible próximamente”. No corresponde presentarla como módulo finalizado. |
| Odontograma | Funcional, validado en fases anteriores | Flujo activo único: `pacientesView → /api/odontograma → odontogramaService → odontograma/odontograma_meta`. El modelo duplicado anterior fue retirado. |
| Tratamientos y prótesis | Backend funcional; frontend oculto/desconectado | Existen tablas, routes, controllers y services. Los modales HTML permanecen, pero `pacientesView.js` no define sus elementos en `ui`, no importa funciones API de alta y no ofrece botones actuales para abrirlos. |
| Documentos clínicos | Funcional con bloqueante de seguridad | Subida, listado, descarga y eliminación autenticados están conectados; hay límite de 10 MB, MIME permitido, nombres físicos aleatorios y limpieza ante error. La ruta estática `/uploads` permite eludir el endpoint autenticado. |
| Cargos/Pagos | Funcional y probado — CONGELADO | Cargos históricos, pagos parciales/totales, saldo y estado calculados, sobrepago bloqueado, anulación, historial y constancia. Cierre en `CIERRE_PAGOS_COBROS.md`. |
| Reportes | Funcional y probado | Pantalla inicializada con resumen financiero real y reporte clínico separado. Nueve pruebas específicas y checklist manual aprobada. |
| Configuración | Funcional con documentación desactualizada | Datos del consultorio, horarios, mensajes y controles WhatsApp están conectados. `.env.example` no coincide por completo con las variables runtime. |
| Estadísticas | Oculta deliberadamente | `estadisticasService` alimenta el Dashboard. `estadisticasView.js` y su sección HTML permanecen, pero no hay pestaña y no se inicializa para evitar una pantalla duplicada. |
| Auditoría | Funcional transversal | Middleware y service registran operaciones correctas; no posee pantalla propia. |

## FRONTEND

### Navegación real

Las pestañas accesibles son:

- Dashboard;
- Pacientes;
- Turnos;
- Prestaciones;
- Historia clínica;
- Cargos y pagos;
- Reportes;
- Configuración.

`main.js` inicializa Pacientes, Turnos, Prestaciones, Pagos, Reportes y Configuración. Dashboard se carga luego de autenticar. Todas las secciones funcionales visibles, salvo Historia clínica, tienen una vista inicializada.

### Hallazgos

- **Historia clínica visible pero incompleta:** `frontend/index.html:577-584` muestra un placeholder de “próximamente”. La ficha clínica real está dentro de Pacientes, por lo que la navegación presenta dos conceptos distintos para el mismo alcance.
- **Rango incorrecto en Dashboard:** `frontend/index.html:180` promete seis meses, pero `frontend/src/pages/dashboard.js:165-170` solicita estadísticas desde el inicio hasta el fin del mes actual. Los cinco meses anteriores se muestran en cero aunque existan datos.
- **Tratamientos/prótesis desconectados:** `pacientesView.js:876-928` contiene listeners opcionales para elementos nunca incorporados al objeto `ui` y llama helpers `createTratamiento`, `createProtesisFija` y `createProtesisRemovible` que no existen en `api.js`. Actualmente no hay botones de paciente que disparen esas acciones.
- **Formularios ocultos:** `tratamiento-form` y `protesis-form` existen en HTML, pero no tienen un flujo frontend ejecutable. No son botones visibles rotos porque tampoco existe una entrada actual que abra esos modales.
- **Sección Estadísticas deliberadamente oculta:** posee formulario HTML y vista, pero no pestaña ni inicialización. Su service sí sigue activo como soporte del Dashboard.
- **Helpers API sin consumidor:** `getPagos` y `disconnectWhatsapp` se exportan, pero no tienen consumidores en `frontend/src`. Sus endpoints backend existen.
- **Riesgo de HTML no escapado:** `pacientesView.js` inserta campos de pacientes, ficha y documentos mediante `innerHTML` sin un helper de escape uniforme. En el alcance interno no bloquea el flujo, pero debe evitarse antes de aceptar entradas menos controladas.
- No se encontraron IDs HTML duplicados ni endpoints consumidos por las vistas activas que carezcan de ruta backend.

## BACKEND

### Estructura y conexiones

- Todas las routes bajo `backend/src/routes` están montadas en `app.js`.
- No se encontraron routes sin controller ni controllers sin route.
- Los controllers de dominio delegan en services; no se encontraron consultas PostgreSQL directas dentro de controllers.
- Los módulos centrales conservan autenticación, autorización de odontólogo y auditoría. Login y `/health` son las excepciones públicas deliberadas.

### Hallazgos

- **Escritura en una lectura clínica:** `pacientesService.obtenerFichaClinica`, llamada por `GET /api/pacientes/:id/ficha-clinica`, ejecuta un `INSERT INTO historias_clinicas` en `pacientesService.js:330-335`. Cada apertura o cambio de página de la ficha agrega “Consulta de ficha clínica”.
- **Endpoints de desarrollo/prueba activos:** `whatsapp.routes.js` mantiene `/debug/chats`, `/send-test`, `/process-reminders` y `/simulate-reply`, además de aliases `/connect`/`/initialize` y `/restart`/`/reset`. Todos están protegidos, pero no tienen consumidor frontend salvo los aliases de conexión/reinicio usados por Configuración.
- **Endpoint de mantenimiento sin consumidor:** `PUT /api/prestaciones/normalizar-datos` puede reasignar turnos y archivar prestaciones duplicadas. Está protegido y transaccional, pero no forma parte de la interfaz normal.
- **DDL runtime:** continúa en Auditoría, Configuración, Pacientes, Prestaciones, Documentos, Odontograma, Tratamientos, Prótesis y módulos congelados de Turnos/WhatsApp. Coincide en general con estructuras ya existentes. Por instrucción expresa no se considera bloqueante por sí solo.
- **Errores:** el middleware global solo expone stack en `NODE_ENV=development`, lo cual es correcto para desarrollo. Varios controllers devuelven `error.message` directamente y pueden filtrar detalles PostgreSQL si ocurre un error inesperado.
- **Startup:** existe un proceso Node escuchando en el puerto 3000 y `GET /health` respondió HTTP 200 con estado `OK`. No se inició otra instancia porque la configuración local tiene autoarranque WhatsApp y recordatorios habilitados.

## BASE DE DATOS

La comparación estática entre consultas runtime y `database/schema_actual.sql` confirmó:

- todas las tablas referenciadas por runtime existen;
- los nombres extra encontrados (`cargos_con_saldo`, `cargos_con_totales`, `turno_actualizado`) corresponden a CTEs, no a tablas faltantes;
- el esquema definitivo de Cargos/Pagos está presente;
- el modelo activo de odontograma es `odontograma` + `odontograma_meta`;
- las tablas legacy de tokens y el odontograma duplicado ya no aparecen.

Restos sin consumidor claro:

- `archivos_clinicos`: no tiene referencias en `backend/src` ni `frontend/src`; el flujo vigente usa `documentos_paciente`;
- `turnos.reprogramacion_token` y `turnos.reprogramacion_token_expira_at`: columnas del flujo por enlace retirado, sin consumidor runtime;
- `prestaciones.activa`: columna anterior; runtime utiliza `prestaciones.activo`;
- columnas históricas `entidad`, `entidad_id`, `descripcion` y `fecha` de `auditoria` conviven con el contrato actual.

No se ejecutaron SELECT contra datos clínicos ni cambios de esquema durante 5A.

## SEGURIDAD

### Correcto

- `backend/.env` existe localmente, está ignorado y no está versionado.
- `.env`, sesiones WhatsApp, cache y uploads reales están cubiertos por `.gitignore`.
- no se encontraron secretos hardcodeados en runtime;
- `JWT_SECRET` es obligatorio y no posee fallback fijo;
- contraseñas se verifican con bcrypt;
- las rutas administrativas de configuración, Turnos, WhatsApp, Pagos y Reportes están protegidas;
- QR y estado de sesión WhatsApp requieren autenticación;
- upload limita tamaño y tipos y elimina el archivo físico si falla la validación/persistencia posterior;
- stack HTTP solo se devuelve en desarrollo.

### Problemas

- **Exposición pública de documentos:** `backend/src/app.js:51` monta `app.use('/uploads', express.static(...))`. Los documentos almacenados en `backend/uploads/documentos` pueden descargarse sin JWT mediante la ruta estática, evitando `/api/documentos/descargar/:id`.
- **Mensajes internos de error:** controllers de Pacientes, Documentos, Configuración, Tratamientos, Prótesis y WhatsApp devuelven mensajes originales de excepciones. Es un riesgo de divulgación de detalles SQL, aunque no se observó exposición automática de stack en producción.
- **CORS abierto:** `cors()` acepta cualquier origen. Es aceptable para desarrollo local, pero debería limitarse si la demo se publica en red.
- **JWT en localStorage + HTML sin escape uniforme:** aumenta el impacto potencial de una inyección frontend. En el entorno interno actual queda como endurecimiento importante.

## LEGACY

### Sin runtime activo

- Google Calendar: sin SDK, cliente, variables o sincronización activa; solo migración/documentación histórica.
- MySQL/phpMyAdmin: sin referencias runtime.
- autogestión por token/link: sin tablas, services ni routes activas.
- Pagos legacy: sin `asegurarTablaPagos`, columnas antiguas ni endpoints anteriores.
- `ingresos_estimados`: ausente de runtime financiero.

### Restos actuales

- `/api/whatsapp/simulate-reply` permanece como simulador inerte y protegido.
- `backend/.env.example` conserva variables retiradas de tokens/URLs de autogestión.
- `frontend/.env.example` conserva `VITE_WHATSAPP_MOCK_BASE_URL`, no usado por runtime.
- La variable documentada `REMINDERS_BATCH_SIZE` no es leída; runtime usa `WHATSAPP_REMINDER_BATCH_SIZE`. Además hay seis variables runtime no documentadas, principalmente polling/debug y compatibilidad.
- `MODULOS.md` todavía describe autogestión por token, archivos inexistentes, una Historia clínica completa y “Facturación y pagos”; contradice el alcance actual.
- `AVANCE_CASOS_DE_USO.md` y `REPORTES_EJEMPLO.json` conservan ejemplos con `ingresos_estimados`.
- `README.md` afirma que `integrador-whatsapp/` existe como legado, aunque esa carpeta ya fue retirada.
- Migraciones e informes históricos conservan menciones legacy válidas como trazabilidad y no son consumidores.

## PRUEBAS

Resultados de 5A:

- `node --check`: **81 archivos JavaScript correctos**;
- pruebas aisladas: **12 archivos correctos**;
- dominio Cargos/Pagos: **25 escenarios correctos**;
- services Cargos/Pagos: **20 escenarios correctos**;
- Reportes financieros: **9 escenarios correctos**;
- nueve suites Turnos/WhatsApp: **correctas**;
- frontend build: **correcto, 90 módulos transformados**;
- backend existente: **`GET /health` HTTP 200 / OK**;
- integración con PostgreSQL real: **no repetida**;
- mensajes WhatsApp reales: **ninguno enviado por esta auditoría**.

No existe cobertura aislada equivalente para Pacientes, Ficha clínica, Documentos, Prestaciones, Odontograma, Tratamientos, Prótesis y Configuración. La ausencia de E2E completa no se clasifica como bloqueante, pero esos módulos requieren checklist manual final después de resolver los bloqueantes.

## 🔴 BLOQUEANTES

1. **Documentos clínicos accesibles sin autenticación.** La ruta estática `/uploads` expone el mismo directorio protegido por el controller de documentos. Debe eliminarse ese bypass o protegerse antes de una entrega/demo con datos reales.
2. **GET de ficha clínica modifica datos.** `obtenerFichaClinica` inserta una historia en cada lectura. Debe dejar de escribir o mover esa intención a una operación explícita antes del freeze.

## 🟠 IMPORTANTES

1. Resolver la pestaña visible de Historia clínica: conectarla al alcance real de la ficha de Pacientes o retirarla visualmente de la demo.
2. Corregir el rango/etiqueta del gráfico de atenciones del Dashboard para que datos y texto describan el mismo período.
3. Definir el alcance final de Tratamientos/Prótesis: conectar el frontend incompleto o retirar modales y afirmaciones de funcionalidad activa.
4. Alinear `.env.example`: retirar variables de links/tokens/mock, corregir `REMINDERS_BATCH_SIZE` y documentar únicamente variables runtime relevantes.
5. Actualizar `MODULOS.md`, `AVANCE_CASOS_DE_USO.md`, `REPORTES_EJEMPLO.json` y la mención del integrador en README antes de usarlos para tesis o defensa.
6. Revisar endpoints de prueba/mantenimiento activos y conservar solo los que deban formar parte de la entrega.
7. Escapar de forma uniforme valores insertados con `innerHTML`, especialmente Pacientes, ficha y documentos.
8. Evitar devolver detalles inesperados de PostgreSQL en respuestas HTTP de producción.

## 🟢 BACKLOG

1. Retirar DDL runtime gradualmente mediante migraciones versionadas, sin tocar módulos congelados durante el cierre.
2. Analizar con datos y backup si pueden retirarse `archivos_clinicos` y las columnas legacy identificadas.
3. Limitar CORS si el sistema deja de ejecutarse exclusivamente en localhost.
4. Agregar pruebas aisladas o smoke tests para los módulos clínicos no cubiertos.
5. Retirar helpers frontend sin consumidor (`getPagos`, `disconnectWhatsapp`) cuando se haga una limpieza posterior controlada.
6. Decidir si la vista clínica oculta de Estadísticas se elimina o se documenta como soporte interno.

## RECOMENDACIÓN

Mantener congelados Turnos/WhatsApp y Cargos/Pagos. Antes del freeze global, realizar una corrección mínima y revisable de los dos bloqueantes, seguida por pruebas de Documentos/Ficha clínica y una checklist manual de los módulos no congelados.

Para llegar a **SÍ** deben resolverse únicamente:

1. impedir acceso no autenticado a documentos subidos;
2. impedir que `GET /api/pacientes/:id/ficha-clinica` inserte registros.

Los elementos naranjas pueden abordarse después como saneamiento de entrega y documentación, sin reabrir las reglas congeladas.

**ODONTON APTO PARA FREEZE GLOBAL: NO**

**CÓDIGO MODIFICADO: NO**

**BASE MODIFICADA: NO**

**MIGRACIONES: NINGUNA**

**COMMIT: NO**
