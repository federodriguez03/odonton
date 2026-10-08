# Odonton

## 1. Descripción general

Odonton es un sistema web de gestión interna para un consultorio odontológico. Centraliza pacientes, agenda, prestaciones, documentación clínica, odontograma, solicitudes y recordatorios por WhatsApp, cargos, pagos y reportes.

El alcance actual es administrativo y clínico interno. La constancia de pago no es fiscal y no existen integraciones con ARCA, CAE, factura electrónica, obras sociales ni plataformas de cobro. Google Calendar fue retirado: la agenda vigente es la agenda interna de Odonton.

### Tecnologías

- Frontend: HTML, CSS, Bootstrap, JavaScript modular y Vite.
- Backend: Node.js, Express y CommonJS.
- Base de datos: PostgreSQL mediante `pg` y pool de conexiones.
- Autenticación: JWT y contraseñas verificadas con bcrypt.
- Archivos: Multer y almacenamiento local protegido por endpoints autenticados.
- WhatsApp: `whatsapp-web.js`, Chromium/Puppeteer y sesión local por QR.

Aunque el frontend conserva paquetes de React entre sus dependencias, la interfaz activa está implementada con HTML y JavaScript sin React.

## 2. Arquitectura

El recorrido predominante es:

```text
Vista frontend
  → frontend/src/js/api.js
  → HTTP /api/*
  → Routes
  → Middlewares
  → Controllers
  → Services / Domain
  → PostgreSQL
```

Cuando corresponde, el service también utiliza WhatsApp o el filesystem. La auditoría HTTP se ejecuta como middleware y las notificaciones externas se intentan después de persistir las operaciones críticas.

### Responsabilidad de cada capa

- **Vistas:** presentan datos, capturan formularios y coordinan la interacción del usuario.
- **`api.js`:** centraliza URL base, JWT, JSON, FormData y tratamiento común de errores HTTP.
- **Routes:** definen endpoints y encadenan autenticación, autorización, validación y auditoría.
- **Middlewares:** validan sesión/permisos y datos de entrada sin implementar el proceso de negocio completo.
- **Controllers:** traducen HTTP a llamadas de servicio y construyen la respuesta.
- **Services:** contienen consultas, transacciones y coordinación de reglas del módulo.
- **Domain:** concentra reglas puras reutilizables, especialmente pagos y actividad de turnos.
- **PostgreSQL:** persiste información clínica, operativa, configuración, conversaciones y auditoría.
- **Jobs:** ejecutan mantenimiento del ciclo de turnos y recordatorios periódicos.

## 3. Estructura del proyecto

```text
odonton/
├── backend/
│   ├── scripts/              # Pruebas aisladas y una integración controlada
│   ├── src/
│   │   ├── config/           # Pool PostgreSQL
│   │   ├── controllers/      # Adaptación HTTP
│   │   ├── domain/           # Reglas puras
│   │   ├── jobs/             # Scheduler
│   │   ├── middleware*/      # Autenticación, autorización, validación y auditoría
│   │   ├── routes/           # Endpoints /api
│   │   ├── services/         # Negocio, SQL e integraciones
│   │   └── utils/            # JWT, teléfonos, plantillas y helpers HTTP
│   ├── uploads/documentos/   # Archivos locales no versionados
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/js/api.js         # Cliente HTTP
│   ├── src/js/main.js        # Inicio, sesión y navegación
│   ├── src/js/views/         # Vistas por módulo
│   ├── src/styles/ y src/css/
│   ├── index.html
│   ├── vite.config.js
│   ├── .env.example
│   └── package.json
├── database/
│   ├── schema_actual.sql     # Foto canónica del esquema vigente
│   ├── 2026-*.sql            # Migraciones históricas/controladas
│   └── sanear_solicitudes_historicas.sql
├── DOCUMENTACION_ODONTON.md
└── README.md
```

Las carpetas `middleware/` y `middlewares/` conviven por la evolución del proyecto; ambas tienen consumidores y no deben unificarse sin una fase específica de refactor.

## 4. Módulos implementados

### Autenticación

Login por email y contraseña, emisión de JWT, recuperación del usuario actual y protección de rutas. La interfaz conserva el token en `localStorage` y fuerza logout ante respuestas 401.

### Pacientes y ficha clínica

Alta, actualización, listado y búsqueda de pacientes. La ficha clínica es de lectura: muestra datos existentes, turnos y documentos sin crear evoluciones automáticamente.

### Odontograma

Registro por paciente, diente y cara. Gestiona estados dentales y metadatos generales como sarro, periodontal y observaciones. El modelo actual usa `odontograma` y `odontograma_meta`.

### Documentos

Subida, listado, descarga y eliminación de PDF/JPEG/PNG hasta 10 MB. Los metadatos se guardan en PostgreSQL y los archivos en almacenamiento local. No existe acceso público mediante `/uploads`; la descarga usa JWT.

### Prestaciones

Catálogo con nombre, duración, precio base de referencia y estado activo. La duración se utiliza al construir intervalos de agenda; el precio base no representa ingresos realizados.

### Turnos

Registro, edición, confirmación, reprogramación, cancelación, disponibilidad por profesional, solicitudes pendientes y finalización automática de turnos vencidos.

### Solicitudes por WhatsApp

El paciente puede solicitar un turno, cancelación o reprogramación. La solicitud queda pendiente y el odontólogo decide el resultado y, cuando corresponde, el día y horario definitivo.

### Recordatorios

Scheduler periódico con habilitación global y por turno. Envía recordatorios para turnos elegibles y procesa respuestas de confirmación o solicitudes de cambio.

### Configuración

Datos del consultorio, horarios generales, horarios por profesional, palabras clave, mensajes automáticos y administración de la conexión WhatsApp.

### Cargos y pagos

Un paciente posee cargos y cada cargo admite uno o varios pagos. Se soportan pagos parciales, saldo calculado, prevención de sobrepago, anulación lógica e historial.

### Constancia interna no fiscal

Reconstruye una constancia desde datos persistidos, indica si el pago está activo o anulado y permite imprimir o guardar como PDF desde el navegador. No es una factura fiscal.

### Dashboard y reportes

El dashboard resume actividad operativa. Los reportes separan indicadores clínicos de los financieros; los ingresos se calculan con pagos activos reales.

### Backend clínico complementario

Existen rutas y services para tratamientos y prótesis. Su backend es real, pero no deben presentarse como flujo principal de la interfaz final sin verificar antes la navegación disponible.

## 5. Reglas de negocio importantes

### Agenda

- Solo `programado`, `confirmado` y `reprogramado` ocupan horario.
- La superposición se evalúa por profesional y por intersección real de intervalos.
- Se respeta el horario específico del profesional; si no existe, se usa la configuración general.
- La duración puede derivarse de la prestación y no debe ser inferior al mínimo admitido por el service.
- Las transiciones de estado sensibles se realizan con operaciones específicas, no mediante edición arbitraria.

### Solicitudes y WhatsApp

- El bot comienza únicamente por un evento entrante permitido y una intención/comando reconocido.
- La identificación se realiza por DNI.
- Un paciente nuevo solo puede solicitar Primera Consulta.
- El paciente puede expresar motivo o preferencia, pero no reserva automáticamente un horario.
- Cancelación y reprogramación solicitadas quedan pendientes de revisión.
- Solo puede existir una gestión activa por paciente según las reglas de actividad vigentes.
- Turno y solicitud se actualizan en la misma transacción cuando deben mantenerse consistentes.
- Los avisos por WhatsApp posteriores a una operación persistida no revierten la transacción si falla el servicio externo.

### Recordatorios

- Requieren `REMINDERS_ENABLED=true` y `recordatorio_habilitado=true` en el turno.
- La ventana se configura en horas, con 24 horas como valor habitual.
- Un envío exitoso se registra para evitar duplicados.
- Un error externo queda registrado y puede reintentarse mientras el turno continúe elegible.
- Confirmar actualiza el turno; cancelar o reprogramar abre una solicitud supervisada.

### Cargos y pagos

- El modelo es Paciente → Cargo → Pago(s).
- Concepto e importe del cargo son snapshots históricos.
- Turno y prestación son referencias opcionales del cargo.
- Saldo y estado `PENDIENTE/PARCIAL/PAGADO` se calculan; no son columnas persistidas del cargo.
- El cargo se bloquea con `SELECT ... FOR UPDATE` durante altas/anulaciones que afectan el saldo.
- Un pago no puede superar el saldo pendiente.
- La anulación es lógica: conserva el pago y registra fecha, motivo y usuario.
- Solo los pagos activos integran ingresos y total abonado.

### Documentos

- Todas las operaciones requieren autenticación.
- El browser genera el boundary de FormData; el frontend no fija manualmente `multipart/form-data`.
- Si la validación o persistencia falla después de que Multer guardó el archivo, se elimina el archivo huérfano.

## 6. Base de datos

PostgreSQL es la fuente persistente del sistema. `database/schema_actual.sql` contiene la estructura vigente y debe usarse para consultar nombres, tipos y constraints actuales.

El esquema confirmado contiene 22 tablas y 197 columnas:

- 14 tablas funcionales relevantes;
- 7 tablas técnicas de configuración, auditoría y WhatsApp;
- 1 tabla histórica sin consumidor runtime confirmado: `archivos_clinicos`.

El detalle completo está en `AUDITORIA_ESTRUCTURA_DATOS_FINAL.md`. No se replica aquí para evitar mantener dos diccionarios.

Las migraciones `2026-*.sql` documentan cambios controlados, pero no deben ejecutarse indiscriminadamente sobre una base existente. Para trasladar una instalación con datos, la opción segura es restaurar un backup completo validado. Para una instalación vacía debe aplicarse el esquema vigente y provisionarse un usuario de acceso mediante un procedimiento controlado.

Algunos services aún contienen DDL defensivo `CREATE TABLE/ALTER TABLE IF NOT EXISTS`. Es una deuda técnica conocida: no autoriza a reemplazar migraciones ni a ejecutar esos fragmentos manualmente.

## 7. Seguridad

- JWT protege las rutas privadas; `JWT_SECRET` es obligatorio para firmar/verificar tokens.
- bcrypt compara las contraseñas con `password_hash`.
- `.env` y sus variantes privadas están ignorados por Git.
- `.env.example` contiene solo valores de ejemplo.
- Las sesiones/cache locales de WhatsApp están ignoradas.
- Los documentos reales y backups de PostgreSQL no deben versionarse.
- Los documentos clínicos se descargan mediante un endpoint autenticado.
- PostgreSQL no debe publicarse directamente en Internet; debe quedar en red privada/local y protegido por firewall.
- La auditoría registra acciones HTTP donde las rutas incluyen su middleware.
- El stack de errores solo se incorpora a respuestas cuando `NODE_ENV=development`.

Actualmente Express usa `cors()` sin una lista de orígenes. Es conveniente restringirla antes de un despliegue público, pero no se cambió para evitar alterar el comportamiento funcional.

## 8. WhatsApp

La integración activa está en `whatsappClient.service.js` y utiliza `whatsapp-web.js`.

1. El usuario inicia la conexión desde Configuración o mediante `WHATSAPP_AUTO_START=true`.
2. Si no existe una sesión válida, el backend expone el QR para vincular WhatsApp Web.
3. La sesión queda en `.wwebjs_auth/` y la caché en `.wwebjs_cache/`.
4. Los eventos entrantes reales alimentan la máquina de estados persistida en `whatsapp_conversations`.
5. `whatsappAutogestion.service.js` procesa solicitudes supervisadas.
6. `whatsappReminder.service.js` envía recordatorios y procesa respuestas.
7. El polling opcional es diagnóstico; no debe reinyectar mensajes en el bot.

El proceso Node y su Chromium deben permanecer activos para conservar la conexión y ejecutar recordatorios. Al migrar de computadora puede vincularse nuevamente por QR; copiar sesiones locales solo debe hacerse mediante un canal privado y seguro.

## 9. Pruebas

El repositorio contiene 16 scripts `backend/scripts/test-*.js`:

- reglas de actividad del paciente;
- dominio y service de Cargos/Pagos;
- dashboard/UX;
- seguridad de documentos;
- lectura pura de ficha clínica;
- recordatorio por turno;
- reportes financieros;
- transiciones de solicitudes;
- renderizado y normalización WhatsApp;
- teléfono del paciente;
- rechazo, apertura de solicitudes e inicio de sesión del bot;
- una integración HTTP/DB controlada de Cargos/Pagos.

Las 15 pruebas aisladas pueden ejecutarse sin enviar WhatsApp real. `test-cargos-pagos-integration.js` requiere backend y PostgreSQL y crea datos temporales; debe reservarse para una prueba controlada con backup y revisión de su teardown.

`backend/test-db.js` valida conectividad mediante consultas y `npm run test:db`. Las checklists manuales finales abarcan turnos, documentos, ficha clínica, WhatsApp y pagos.

## 10. Ejecución local

### Requisitos

- Node.js 18 o superior y npm.
- PostgreSQL.
- Navegador moderno.
- Entorno capaz de ejecutar Chromium para WhatsApp Web.

### Instalar dependencias

```powershell
cd backend
npm install

cd ..\frontend
npm install
```

### Configurar variables

```powershell
cd backend
Copy-Item .env.example .env

cd ..\frontend
Copy-Item .env.example .env.local
```

Completar `backend/.env` con valores privados. En desarrollo `VITE_API_BASE_URL` puede quedar vacío porque Vite redirige `/api` y `/health` a `http://localhost:3000`.

Variables críticas del backend:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`;
- `JWT_SECRET`;
- `NODE_ENV` y `PORT`.

Variables operativas principales:

- pool: `DB_POOL_MIN`, `DB_POOL_MAX`;
- WhatsApp: `WHATSAPP_AUTO_START`, `WHATSAPP_SESSION_NAME`, `WHATSAPP_SESSION_TIMEOUT_MINUTES`, `WHATSAPP_CLEAN_STALE_BROWSER`;
- seguridad/diagnóstico: `WHATSAPP_SAFE_MODE`, `WHATSAPP_ALLOWED_NUMBERS`, `WHATSAPP_POLLING_ENABLED`, `WHATSAPP_POLL_INTERVAL_SECONDS`, `WHATSAPP_DEBUG`;
- teléfonos: `DEFAULT_COUNTRY_CODE`, `DEFAULT_MOBILE_PREFIX`;
- recordatorios: `REMINDERS_ENABLED`, `REMINDER_WINDOW_HOURS`, `WHATSAPP_REMINDER_INTERVAL_MINUTES`, `WHATSAPP_REMINDER_BATCH_SIZE`.

### Iniciar backend

```powershell
cd backend
npm run dev
```

Para ejecución sin recarga automática:

```powershell
npm start
```

Backend por defecto: `http://localhost:3000`. Health check: `GET /health`.

### Iniciar frontend

```powershell
cd frontend
npm run dev
```

Frontend por defecto: `http://localhost:5173`.

### Compilar frontend

```powershell
cd frontend
npm run build
```

### Ejecutar pruebas aisladas

Desde `backend`, ejecutar los scripts requeridos con:

```powershell
node scripts/test-pagos-domain.js
node scripts/test-cargos-pagos-service.js
node scripts/test-reportes-financieros.js
node scripts/test-documentos-seguridad.js
node scripts/test-ficha-clinica-lectura.js
```

Las pruebas de Turnos/WhatsApp se ejecutan del mismo modo con sus archivos `test-*.js`. Ninguna prueba debe iniciarse contra WhatsApp real.

## 11. Preparación para producción

VS Code no es necesario. El sistema requiere procesos y servicios, no el editor:

1. instalar Node.js y PostgreSQL en la computadora destino;
2. copiar el código sin `node_modules`, `dist`, secretos, uploads reales ni sesiones privadas;
3. instalar dependencias con `npm install` o `npm ci`;
4. restaurar un backup privado validado o preparar una base vacía desde el esquema vigente;
5. crear `.env`/`.env.local` locales;
6. compilar el frontend con `npm run build`;
7. servir `frontend/dist` mediante un servidor web;
8. ejecutar `backend/src/server.js` con `npm start` y un gestor de procesos/servicio del sistema;
9. configurar URL de API, firewall, HTTPS, backups periódicos y persistencia de uploads;
10. vincular WhatsApp por QR y asegurar que Node/Chromium permanezcan activos.

El repositorio no incluye actualmente configuración de PM2, servicio Windows, reverse proxy, TLS ni pipeline de despliegue. Deben definirse según el entorno destino.

## 12. Limitaciones y mejoras futuras

- Modularizar progresivamente las vistas frontend más extensas sin cambiar sus contratos.
- Retirar DDL defensivo del runtime una vez que exista un bootstrap de base único y probado.
- Revisar constraints duplicados y relaciones lógicas sin FK en una migración futura independiente.
- Restringir CORS para un despliegue público.
- Incorporar un procedimiento seguro de alta inicial de usuario.
- Añadir automatización de backup/restore y despliegue.
- Evaluar una API oficial de WhatsApp si se necesita operación remota con mayor estabilidad.
- Migrar almacenamiento de documentos a un volumen gestionado si se despliega en más de una instancia.
- Incorporar E2E automatizadas del navegador como mejora, sin que sea requisito para el alcance académico actual.

## Referencias técnicas conservadas

- `AUDITORIA_ESTRUCTURA_DATOS_FINAL.md`: inventario completo del esquema.
- `AUDITORIA_TESIS_VS_SISTEMA_FINAL.md` y `PLAN_CORRECCION_TESIS_FINAL.md`: coherencia académica.
- `CIERRE_TURNOS_WHATSAPP.md`: evidencia de freeze del módulo.
- `CIERRE_PAGOS_COBROS.md`: evidencia de freeze de Cargos/Pagos.
- `CONTRATOS_PAGOS.md` y `DISENO_MODELO_PAGOS.md`: contratos y decisiones detalladas del módulo.
- `REVISION_MIGRACION_CARGOS_PAGOS.md`: trazabilidad de la migración estructural.
- `database/REVISION_ODONTOGRAMA_DUPLICADO.md` y `database/REVISION_TOKENS_LEGACY.md`: retiros legacy controlados.
- `SANEAMIENTO_SOLICITUDES_EJECUCION.md`: evidencia del saneamiento histórico ejecutado.
