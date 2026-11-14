# Migraciones canónicas y recuperación

## Fuente y orden único

`database/migrations.json` es el manifiesto canónico. Una instalación vacía aplica primero `schema_actual.sql` como baseline y luego, exactamente en el orden declarado, todas las migraciones. Una instalación existente debe contener las tablas base `usuarios`, `pacientes`, `turnos` y `prestaciones`; el preflight se detiene si no están.

El ejecutor registra nombre, SHA-256 y fecha en `schema_migrations`. Repetirlo no vuelve a aplicar archivos y rechaza un archivo ya registrado cuyo contenido cambió.

```powershell
cd backend
$env:MIGRATION_TARGET_DATABASE = 'nombre_exacto'
$env:MIGRATION_CONFIRM_DATABASE = 'nombre_exacto'
$env:MIGRATION_OWNER_EMAIL = 'dueno-existente@dominio.local' # sólo si la base ya tiene usuarios
node scripts/migrate-canonical.js
```

La doble confirmación evita destinos accidentales. El ejecutor de esta etapa rechaza explícitamente `odonton_db`, `odonton_ficha_20261109_test` y `odonton_demo_2026`; para una publicación posterior debe revisarse esa protección dentro del procedimiento formal de despliegue, no quitarse informalmente.

Una base completamente vacía queda estructuralmente preparada, pero sin cuentas. El primer dueño debe provisionarse mediante un procedimiento controlado antes de iniciar la aplicación. Una base con usuarios exige identificar de forma explícita y unívoca la cuenta dueña.

## Agenda e históricos

Ocupan agenda únicamente `programado`, `confirmado` y `reprogramado`. El intervalo es `[inicio, fin)`: un turno puede comenzar exactamente al finalizar otro. La exclusión se serializa en PostgreSQL por identidad profesional resuelta:

- una fila nueva usa `profesional_perfil_id`;
- una fila legada usa `profesional_id` como usuario y sólo se cruza con un perfil mediante `profesionales.usuario_id` o `usuario_legacy_id`;
- nunca se equiparan IDs sólo porque tengan el mismo número.

Los solapamientos históricos no se modifican. Las restricciones de estado/intervalo se agregan `NOT VALID` para conservar filas antiguas, pero se exigen en nuevas escrituras. El trigger impide nuevas superposiciones y el ejecutor informa únicamente la cantidad de pares históricos, sin datos personales.

## Recuperación y rollback

Antes de actualizar una base real:

1. detener escrituras;
2. crear un backup completo verificable de base, uploads y sesión WhatsApp;
3. restaurarlo en una instancia aislada y ejecutar preflight/migraciones allí;
4. probar autenticación, agenda, atención y documentos con una cuenta no productiva;
5. recién entonces programar la ventana de producción.

No hay rollback automático. Volver al binario anterior no revierte columnas, constraints, triggers, datos ni relaciones profesionales. Si la migración falla antes de registrar un archivo, debe investigarse el estado transaccional del propio archivo; no se debe editar la fila de `schema_migrations` para forzar continuidad.

La recuperación soportada es restaurar de forma coordinada el backup completo tomado antes de la actualización. Los datos escritos después de ese backup se perderían; si deben conservarse, hace falta una migración inversa específica y ensayada, no un downgrade del código.

## Runtime sin DDL

La aplicación ya no crea ni altera tablas durante solicitudes. Los servicios verifican columnas requeridas y responden `SCHEMA_NOT_READY`/503 cuando el esquema no está preparado. El usuario runtime necesita conexión, uso de schema, DML sobre tablas, secuencias y ejecución de funciones; no necesita `CREATE`, `ALTER` ni `DROP`.
