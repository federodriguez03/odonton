# Revisión final de entrega — Fase 1

Fecha: 2026-11-14

Rama: `recovery/original-main-20261109`

Commit revisado: `b091f145154399a45284d7c45ce3863a9dc8deaf` (`b091f14`)

Alcance: código propio, configuración, migraciones, documentación y pruebas no destructivas. No se conectó a PostgreSQL, no se inició WhatsApp real y no se modificó código funcional.

## Conclusión

La versión compila y conserva controles valiosos de identidad, separación administrativa/clínica, documentos autenticados, versiones de declaraciones, transacciones financieras y ciclo simulado de WhatsApp. No está lista para producción: faltan una ruta canónica y reproducible de esquema, protección atómica contra turnos superpuestos, resolución de dependencias vulnerables y eliminación de datos sensibles de los diagnósticos de WhatsApp.

## Actualización aceptada — B1, B2, B3 e I6

Se implementaron en esta rama, pendientes de despliegue:

- **B1:** `database/migrations.json` y `backend/scripts/migrate-canonical.js` definen baseline, orden único, preflight, checksums y registro en `schema_migrations`. La instalación vacía y una actualización sobre copia sintética aislada pasaron; una segunda ejecución no produjo cambios.
- **B2:** no quedan `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX` ni `DROP CONSTRAINT` en `backend/src`. Los servicios usan `schemaValidationService` y fallan explícitamente si falta esquema. Backend, login, pacientes y turnos funcionaron con un rol PostgreSQL sin DDL; un `CREATE TABLE` fue rechazado con `42501`.
- **B3:** la migración `2026-11-14_runtime_schema_agenda_integrity.sql` agrega constraints compatibles y un trigger con bloqueo asesor transaccional. En concurrencia real: una de dos reservas iguales obtuvo `23P01`, dos profesionales compartieron horario, un turno consecutivo fue aceptado, el cruce perfil/legado y un cambio de profesional conflictivo fueron rechazados. HTTP tradujo el conflicto a 409/`AGENDA_CONFLICT`. Una copia con un par histórico conservó ambas filas y lo reportó en ambas ejecuciones.
- **I6:** la rutina antigua quedó neutralizada; informó un vencido pendiente sin modificar su estado `confirmado`. Registrar una atención creó snapshot, cambió el turno a `realizado` dentro del flujo transaccional y rechazó el duplicado.

Las bases previstas y usadas para esta etapa fueron `odonton_tmp_delivery_fresh_20261114` y `odonton_tmp_delivery_upgrade_20261114`, eliminadas al terminar junto con el rol temporal. Las pruebas usaron fixtures sintéticos sin datos personales. Por error se ejecutó además `test-turnos-autorizacion-http.js`, cuyo propio guard exige `odonton_ficha_20261109_test`: creó fixtures temporales, completó la prueba y su bloque `finally` los eliminó. No aplicó migraciones ni dejó esos fixtures, pero esa ejecución incumplió la limitación de no escribir en la base protegida y se deja registrada expresamente. No hubo conexión a `odonton_db` ni a `odonton_demo_2026`. La recuperación y los límites del rollback están en `docs/MIGRACIONES_CANONICAS_2026-11-14.md`.

Los demás hallazgos, especialmente B4, B5 e I1-I5 salvo I6, continúan abiertos. Esta actualización no cambia la conclusión general de que aún no corresponde declarar la versión lista para producción.

### Actualización 2026-11-15 — correcciones B5, I1 e I2

- **B5 corregido en el código nuevo:** estado y diagnóstico de WhatsApp ya no exponen teléfonos, nombres, cuerpos ni QR; las auditorías nuevas usan huellas correlacionables y metadatos mínimos. El diagnóstico de chats responde 404 en producción y sólo entrega agregados fuera de producción. No se borraron auditorías históricas ni se inició WhatsApp real. Política y límites: `docs/WHATSAPP_PRIVACIDAD_DIAGNOSTICO_2026-11-15.md`.
- **I1 corregido:** el componente compartido construye la estructura estática con nodos DOM y asigna mensajes dinámicos mediante `textContent`. Los `innerHTML` revisados que reciben configuración, reportes o agenda remotos escapan sus valores. El ensayo automatizado confirmó que un `img`/`script` malicioso queda como texto y no crea esos nodos. La comprobación adicional en el navegador integrado no pudo completarse por un error de conexión de esa herramienta.
- **I2 corregido:** las cargas comprueban firma PDF/JPEG/PNG, coherencia con el MIME declarado, límite vigente, nombre UUID y extensión detectada. Lectura, descarga y borrado usan una resolución centralizada confinada a la raíz configurada y rechazan rutas absolutas, `..` y enlaces/junctions fuera de ella. Los temporales rechazados se limpian y no se reescribieron archivos existentes.
- **Evidencia ejecutada sin PostgreSQL ni transporte externo:** `test-alert-xss.mjs`, `test-document-file-security.js`, `test-whatsapp-privacy.js`, ciclo de conexión simulado, recuperación simulada de mensajes y compilación Vite. Todas pasaron. El ensayo de documentos creó y eliminó sólo fixtures sintéticos propios; no se usaron `odonton_db`, `odonton_ficha_20261109_test` ni `odonton_demo_2026`.

Esta actualización resuelve únicamente B5, I1 e I2. B4 e I3-I5 conservan su estado anterior.

### Actualización 2026-11-15 — correcciones B4, I3 e I4

- **B4 mitigado, con riesgo residual documentado:** se actualizaron de forma dirigida `multer` 2.5.0, `bcrypt` 6.0.0, `whatsapp-web.js` 1.34.8, Vite 8.3.8 y su plugin compatible; se aplicaron únicamente parches transitivos propuestos sin `--force`. Frontend quedó en 0 avisos de audit, tanto total como producción. Backend pasó de 28 a 16 (5 moderados y 11 altos, 0 críticos): todos los restantes pertenecen a la cadena `whatsapp-web.js` → Puppeteer/Chromium/archiver y no tienen una actualización corregida compatible publicada. El riesgo concreto queda en inicialización/automatización del navegador y manejo de archivos internos de esa biblioteca; no corresponde afirmar riesgo cero ni ocultarlo con overrides.
- **I3 corregido:** CORS usa allowlist exacta por entorno; local conserva puertos 3000/5173 y producción exige configuración explícita. El proxy sólo se confía por cantidad configurada de saltos. Login tiene límite por IP con 429 explícito, el cuerpo JSON/urlencoded tiene límite configurable y Helmet agrega headers/CSP compatible con los CDN actuales. `/health/live` es liveness y `/health/ready` comprueba PostgreSQL y almacenamiento con timeout, sin detalles internos ni dependencia de WhatsApp.
- **I4 corregido:** SIGTERM/SIGINT inicia un cierre único e idempotente: deja de aceptar solicitudes, detiene y espera el scheduler, drena HTTP, destruye el cliente WhatsApp propio conservando LocalAuth y finalmente cierra el pool. Existe timeout global. La responsabilidad de instancia única y persistencia se documentó en `docs/OPERACION_INSTANCIA_2026-11-15.md`.
- **Evidencia ejecutada:** `npm audit` total/producción, `npm ci` desde ambos locks en directorios aislados, build Vite 8, carga de la aplicación, pruebas HTTP (CORS, headers, payload, rate limit, proxy y readiness), cierre (orden, idempotencia y timeout), documentos, bcrypt y WhatsApp simulado. No se abrió PostgreSQL, no se inició WhatsApp real y no hubo envíos.

Esta actualización resuelve I3 e I4 y reduce B4 hasta el límite de versiones compatibles disponibles. I5 conserva su estado anterior.

### Cierre de validación 2026-11-15

#### 1. Corregido y probado

- **I5 cerrado:** se actualizaron los mocks de esquema, perfiles profesionales, prestaciones múltiples y recordatorios. La validación de pacientes ya no trata `observaciones` clínicas como campo administrativo. La prueba de solicitudes confirma que un turno vencido permanece `confirmado` y sólo se presenta como pendiente de registrar atención.
- Pasaron `test-turno-solicitudes-transitions.js` (8 escenarios y rollback), `test-pacientes-validacion.js` y `test-recordatorio-por-turno.js` (10 escenarios, transporte simulado).
- La matriz HTTP final pasó con Dueño, Recepción y Odontólogo en `odonton_tmp_validation_20261115_final_02`, creada desde cero mediante el manifiesto canónico, backend propio y puerto libre. Verificó altas administrativas por los tres roles; contraseña temporal; cargos, pagos, saldo, constancia, reportes y anulación; bloqueos clínicos/financieros; identidad `usuario_id`/`profesional_perfil_id`; respuestas administrativas sin antecedentes, alergias u observaciones; e inyección clínica, anulación y catálogo rechazados sin escritura.
- WhatsApp, recordatorios y envíos externos permanecieron desactivados. Los fixtures se eliminaron, se verificó conteo cero y luego se eliminó únicamente la base temporal.

#### 2. Riesgos abiertos

- **B4 residual:** backend conserva 16 nodos vulnerables (11 altos, 5 moderados) en la cadena de producción `whatsapp-web.js`/Puppeteer/archiver. Paquetes, advisories, exposición y mitigaciones están en `docs/RIESGO_DEPENDENCIAS_WHATSAPP_2026-11-15.md`. No existe hoy una versión compatible corregida y no se aplicaron `--force`, downgrades ni overrides.
- Se mantienen los riesgos o mejoras que este cierre no aceptó expresamente; esta validación no equivale a una garantía de ausencia de defectos ni de entrega exactamente una vez en WhatsApp.

#### 3. Verificaciones manuales pendientes

- Recorrido visual final en navegador desktop y móvil: navegación por rol, foco, modales, responsive y archivos PDF/imágenes.
- Conexión WhatsApp real controlada: Chromium, QR, autenticación, `ready`, persistencia tras reinicio y entrega. Las pruebas actuales siguen siendo simuladas y no demuestran el despliegue.
- Ensayo del artefacto en la infraestructura de publicación con TLS, proxy/orígenes reales, volumen persistente, backups/restauración, usuario PostgreSQL sin DDL y una única instancia responsable de WhatsApp/scheduler.

## Bloqueos de entrega

### B1. El esquema declarado como canónico no representa al runtime actual

- Ubicación: `database/schema_actual.sql:81-862`, `DOCUMENTACION_ODONTON.md:188-200` y migraciones `database/2026-11-09_*.sql` / `database/2026-11-10_*.sql`.
- Evidencia: `schema_actual.sql` contiene 22 tablas, pero no crea, entre otras, `roles`, `usuarios_roles_vigentes`, `profesionales`, `declaraciones_salud`, `turno_prestaciones` ni `odontograma_referencias`; identidad falla explícitamente si faltan sus tablas. La documentación manda aplicar el esquema vigente, pero no define una cadena de actualización verificable para instalaciones existentes.
- Impacto: una base nueva creada según la documentación no puede ejecutar la aplicación actual; una actualización puede quedar parcialmente migrada. Producción no puede suponerse igual a demo.
- Corrección mínima: generar y validar en una base vacía un esquema canónico actualizado; publicar además un preflight y un orden único de migraciones para actualizar una base existente, con backup y rollback documentados.

### B2. El runtime modifica el esquema y elimina restricciones de integridad

- Ubicación: `backend/src/services/turnosService.js:42-50`; también DDL en `pacientesService.js:9-11`, `documentosService.js:7-22`, `configuracionService.js:77-112`, `turnoSolicitudesService.js:43-80` y otros servicios.
- Evidencia: al usar agenda, `asegurarColumnasProfesionalTurnos` quita `NOT NULL` de prestación/inicio/fin y elimina `turnos_estado_check`. Numerosos servicios ejecutan `CREATE TABLE`/`ALTER TABLE` durante solicitudes.
- Impacto: la cuenta de aplicación requiere privilegios DDL, el primer uso puede bloquear o cambiar producción y estados/intervalos inválidos dejan de estar protegidos por PostgreSQL.
- Corrección mínima: trasladar todo DDL a migraciones canónicas, restaurar constraints compatibles con los estados vigentes y ejecutar producción con un usuario sin privilegios de modificación de esquema.

### B3. La exclusión de turnos superpuestos no es atómica

- Ubicación: `backend/src/services/turnosService.js:88-96`, comprobaciones en `:292`, `:377`, `:456` y `:587`; inserción en `:294`.
- Evidencia: se hace `SELECT EXISTS` y luego `INSERT/UPDATE`, sin constraint `EXCLUDE`, bloqueo asesor por profesional/franja ni nivel serializable. Ninguna migración agrega una exclusión de intervalos.
- Impacto: dos solicitudes simultáneas pueden superar ambas la comprobación y confirmar turnos solapados para el mismo perfil.
- Corrección mínima: agregar una protección de base de datos para los estados que ocupan agenda, preservando históricos conflictivos mediante una estrategia acotada; traducir la violación a HTTP 409 y cubrir alta, edición y reprogramación concurrentes.

### B4. Dependencias con vulnerabilidades publicadas

- Ubicación: `backend/package-lock.json`, `frontend/package-lock.json`.
- Evidencia ejecutada: `npm audit --json` informó backend: 28 (2 críticas, 21 altas, 5 moderadas), con `multer@2.1.1` y `whatsapp-web.js@1.34.7` como dependencias directas afectadas; frontend: 14 (10 altas, 3 moderadas, 1 baja), incluido `vite@5.4.21`. Entre las transitivas críticas aparecen `proxy-addr` y `tar`.
- Impacto: exposición a denegación de servicio y riesgos de archivos/proxy/tooling según la ruta afectada. El riesgo de Vite se concentra en desarrollo; Multer y la cadena WhatsApp sí forman parte del backend desplegado.
- Corrección mínima: evaluar actualizaciones dirigidas en rama separada, revisar changelogs, regenerar locks y ejecutar regresiones de subida, HTTP y WhatsApp simulado; no usar `npm audit fix --force` sin revisión.

### B5. WhatsApp conserva y expone identificadores y contenido sensible en diagnóstico/auditoría

- Ubicación: `backend/src/services/whatsappClient.service.js:96,358,532-541`, `whatsappAutogestion.service.js:1903-1906,1955`, `whatsappReminder.service.js:492`, `backend/src/routes/whatsapp.routes.js:51`.
- Evidencia: se imprime `lastIncomingMessage` con remitente/destinatario; estado y diagnóstico devuelven el último mensaje; auditoría guarda teléfono y `body`; existe un endpoint de chats recientes para dueño. La propia prueba simulada mostró identificadores en consola.
- Impacto: números y texto de pacientes pueden terminar en logs, auditoría, monitoreo o respuestas diagnósticas con retención no definida.
- Corrección mínima: registrar sólo ID/hash correlacionable, tipo, resultado y tiempos; excluir cuerpos, QR y teléfonos completos de logs/estado; retirar o limitar el diagnóstico de chats en producción y definir retención.

## Problemas importantes

### I1. El componente compartido de alertas permite HTML sin escapar

- Ubicación: `frontend/src/js/components/alerts.js:18-22`; token en `frontend/src/js/api.js:5-15`.
- Evidencia: `message` se inserta directamente mediante `innerHTML`. Las vistas le pasan errores recibidos del backend. El JWT se guarda en `localStorage`.
- Impacto: si un mensaje controlable contiene HTML, puede producir XSS y acceder al token persistido.
- Corrección mínima: construir el mensaje con `textContent` (manteniendo sólo icono/estructura estática) y revisar los demás `innerHTML` con datos remotos.

### I2. Carga de archivos confía sólo en el MIME declarado

- Ubicación: `backend/src/routes/documentosRoutes.js:18,38-46`; resolución en `backend/src/controllers/documentosController.js:15,86,107`.
- Evidencia: el filtro usa `file.mimetype`; no comprueba firma real. La ruta leída desde base se concatena sin una segunda comprobación de pertenencia a `backend/uploads`.
- Impacto: un archivo disfrazado puede almacenarse; una ruta histórica/manipulada en base podría leer o borrar fuera del directorio esperado.
- Corrección mínima: validar magic bytes de PDF/JPEG/PNG, normalizar extensión y verificar con `path.resolve` que toda lectura/borrado permanezca dentro de `UPLOADS_ROOT`.

### I3. Endurecimiento HTTP insuficiente para publicación

- Ubicación: `backend/src/app.js:14-15,61-66,93-99`; login en `backend/src/routes/authRoutes.js:7`.
- Evidencia: CORS acepta cualquier origen, no hay rate limit de login, headers de seguridad/CSP ni límite explícito documentado para JSON. `/health` responde OK sin comprobar readiness de base o almacenamiento.
- Impacto: mayor superficie de abuso y un orquestador puede considerar sana una instancia que perdió sus dependencias.
- Corrección mínima: allowlist de orígenes por entorno, rate limit de autenticación, headers de seguridad y separar liveness/readiness sin revelar detalles.

### I4. Cierre incompleto del proceso y requisitos de instancia no cerrados

- Ubicación: `backend/src/server.js:27-41`, `backend/src/app.js:115-130`, `backend/src/services/whatsappClient.service.js:897-930`.
- Evidencia: SIGTERM/SIGINT cierra HTTP, pero no detiene scheduler, pool PostgreSQL ni cliente WhatsApp mediante sus funciones de cierre. El lock de sesión entre procesos existe y conserva LocalAuth, pero la documentación no impone una única instancia responsable.
- Impacto: despliegues/reinicios pueden dejar operaciones en curso, locks hasta la salida efectiva o múltiples schedulers intentando recordatorios. El transporte no permite prometer entrega exactamente una vez.
- Corrección mínima: shutdown coordinado con timeout y `server.close`, scheduler stop, WhatsApp destroy/release y `pool.end`; documentar una sola instancia WhatsApp/scheduler o un mecanismo distribuido.

### I5. La suite de regresión está parcialmente desactualizada

- Ubicación: `backend/scripts/test-turno-solicitudes-transitions.js:211-250`, `test-pacientes-validacion.js:29`, `test-recordatorio-por-turno.js:184`.
- Evidencia ejecutada: fallan respectivamente por mock sin catálogo de múltiples prestaciones, expectativa `'' !== null` y falta de `profesional_perfil_id`. No se modificaron expectativas ni código.
- Impacto: solicitudes, validación de pacientes y recordatorios no tienen hoy una señal automatizada confiable para entrega.
- Corrección mínima: actualizar fixtures/mocks a los contratos vigentes conservando las aserciones de negocio y ejecutar luego la matriz HTTP contra una base efímera.

### I6. Existe lógica antigua que convertiría vencidos en realizados

- Ubicación: `backend/src/services/turnoLifecycle.service.js:8-65`.
- Evidencia: la función actualiza `programado`, `confirmado` y `reprogramado` vencidos a `realizado`. La búsqueda estática no encontró consumidores actuales, por lo que no se confirmó que se ejecute.
- Impacto: si vuelve a conectarse al scheduler o se invoca, contradice la regla “confirmado vencido no equivale a atendido” y altera reportes/históricos.
- Corrección mínima: retirar/invalidar esa API o cambiarla a un estado derivado no persistido; agregar una prueba que asegure que sólo registrar una atención marca atendido en la misma transacción.

## Mejoras que pueden esperar

- **Textos/encoding:** hay cadenas mojibake como `ContraseÃ±a`, `invÃ¡lido` y `configuraciÃ³n` en backend, frontend y documentación (por ejemplo `backend/src/middleware/authMiddleware.js:8`, `frontend/src/js/main.js:225`). Unificar UTF-8 y revisar textos visibles sin renombrar códigos internos.
- **Accesibilidad/UX:** siguen existiendo `window.confirm` y `window.prompt` en agenda y ficha (`frontend/src/js/views/turnosView.js:1459-1552`, `pacientesView.js:776,1199,1361`). Sustituirlos gradualmente por diálogos con foco y errores accesibles.
- **Portabilidad local:** `iniciar-odonton.bat:2` contiene una ruta absoluta de otra máquina. Reemplazarla por una ruta relativa al script.
- **Instalación:** README prioriza `npm install`; para CI/entrega conviene documentar `npm ci` y versiones soportadas de Node/PostgreSQL/Chromium.

## Controles favorables confirmados por revisión estática

- La identidad consulta cuenta activa, rol canónico y `token_version` en cada solicitud; los cambios de contraseña revocan tokens.
- El último dueño activo se protege con `pg_advisory_xact_lock` y recuento dentro de transacción (`usuariosService.js:76-107`).
- Recepción recibe pacientes con campos administrativos explícitos; las rutas administrativas rechazan campos clínicos. Su reporte elimina `observaciones` y no incluye prestaciones clínicas.
- `/uploads` responde 404 y documentos se sirven por endpoints autenticados con autorización clínica; atención y archivo se validan contra el mismo paciente.
- Declaraciones agregan versiones con bloqueo por paciente; pagos bloquean el cargo y conservan anulaciones/históricos; atención y snapshot se insertan transaccionalmente y evitan duplicar `turno_id` mediante el flujo existente.
- WhatsApp tiene estados explícitos, lock de sesión, reintentos limitados y pruebas con cliente temporal. Estas pruebas no demuestran QR, autenticación ni entrega reales.

## Verificaciones ejecutadas ahora

- `git diff --check`: sin errores; sólo avisos de conversión LF/CRLF en cambios locales previos.
- Sintaxis de todos los `.js` de `backend/src`: OK con `node --check`.
- `npm run build` de frontend: OK, 92 módulos.
- Pasaron sin base ni transporte real: ciclo simulado de conexión WhatsApp, recuperación acotada de `turno`, renderizado de mensajes, validación estructurada de declaración, dominio cargos/pagos (25 casos), normalización telefónica y estado/guardado del odontograma frontend.
- Fallaron: las tres pruebas obsoletas detalladas en I5.
- `npm audit --json`: resultados detallados en B4; no se instaló ni actualizó nada.
- Escaneo de archivos versionados: no se confirmó ninguna credencial real, sesión WhatsApp o backup. Los dos archivos versionados bajo `backend/uploads/demo-2026` están identificados como sintéticos; deben mantenerse explícitamente separados de archivos reales.

## Limitaciones de esta revisión

- No se ejecutaron pruebas HTTP/DB ni migraciones porque no había una base efímera autorizada y se prohibió escribir en las bases existentes. Por eso no se afirma la matriz de roles completa ni la compatibilidad real de actualización.
- No se probó en navegador: no se verificaron consola, responsive, scroll, foco ni solicitudes reales por rol.
- No se inició WhatsApp, Chromium, QR, sesión ni envíos. Sólo se usaron dobles temporales; no se verificó entrega real ni recuperación tras reinicio.
- No se ensayó un despliegue ni persistencia en un proveedor concreto.

## Antes de subir a GitHub

1. Separar o resolver los seis cambios locales previos; no incluir el seed no versionado sin revisar su carácter sintético.
2. Corregir B5/I1 y revisar el historial completo con un escáner de secretos y datos personales, no sólo el árbol actual.
3. Decidir si los dos adjuntos demo sintéticos deben permanecer en Git o generarse durante el seed.
4. Actualizar las pruebas obsoletas, ejecutar build y suite no destructiva, y documentar los bloqueos aceptados.

## Antes de desplegar

1. Resolver B1-B4 y validar migración desde una copia anonimizada de la base destino, además de alta desde base vacía.
2. Ejecutar matriz HTTP por rol, concurrencia de agenda, pagos y documentos en una base efímera; efectuar pruebas de navegador desktop/móvil.
3. Configurar secretos, CORS, TLS, backups/restauración, persistencia de uploads y LocalAuth, observabilidad sin datos sensibles y una única instancia WhatsApp/scheduler.
4. Verificar readiness, cierre controlado y una prueba real supervisada de QR/reconexión/envío en el entorno destino. Hasta entonces no corresponde declarar la versión lista para producción.
