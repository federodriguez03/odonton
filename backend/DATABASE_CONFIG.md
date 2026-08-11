# Configuración de Base de Datos - Odontón

## Descripción

Configuración profesional de conexión a PostgreSQL usando `pg` Pool para el sistema de gestión de turnos odontológicos.

## Arquitectura

```
backend/
├── .env                  # Variables de entorno (NO subir a git)
├── .env.example          # Template de variables (referencia)
├── src/
│   ├── config/
│   │   └── db.js        # Pool de conexión (exporta pool y verificarConexion)
│   ├── app.js           # Aplicación Express
│   └── server.js        # Punto de entrada del servidor
├── test-db.js           # Script de test de conexión
└── package.json
```

## Variables de Entorno

Crear un archivo `.env` en la raíz del proyecto backend:

```env
# Configuración de PostgreSQL
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=tu_password
DB_NAME=odonton_db
DB_PORT=5432

# Pool de conexiones
DB_POOL_MIN=2
DB_POOL_MAX=10

# Ambiente
NODE_ENV=development
```

### Descripción de variables:
- `DB_HOST`: Host del servidor PostgreSQL
- `DB_USER`: Usuario de PostgreSQL
- `DB_PASSWORD`: Contraseña del usuario
- `DB_NAME`: Nombre de la base de datos
- `DB_PORT`: Puerto de PostgreSQL (por defecto 5432)
- `DB_POOL_MIN`: Mínimo de conexiones en el pool
- `DB_POOL_MAX`: Máximo de conexiones en el pool
- `NODE_ENV`: Ambiente (development/production)

## Instalación

### 1. Instalar dependencias

```bash
cd backend
npm install pg dotenv
```

### 2. Crear archivo .env

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 3. Verificar conexión

```bash
node test-db.js
```

Salida esperada:
```
========================================
TEST DE CONEXIÓN A POSTGRESQL
========================================

Configuración:
  Host: localhost
  Port: 5432
  Database: odonton_db
  User: postgres
  Pool Min: 2
  Pool Max: 10

[TEST 1] Verificando conexión básica...
[DB] ✓ Conexión a PostgreSQL exitosa
[DB] Servidor en: 2026-02-03 14:30:25.123+00
✓ Conexión básica OK

[TEST 2] Ejecutando SELECT NOW()...
✓ Timestamp del servidor: 2026-02-03 14:30:25.123456+00

[TEST 3] Listando tablas...
✓ Tablas encontradas (5):
   - pacientes
   - prestaciones
   - turnos
   - usuarios
   - auditorias

[TEST 4] Estado del pool:
  Conexiones totales: 2
  Conexiones disponibles: 2
  Conexiones en uso: 0

========================================
✓ TODOS LOS TESTS PASARON EXITOSAMENTE
========================================
```

## Uso en la Aplicación

### En Services o Repositories

```javascript
// src/services/turnosService.js
const { pool } = require('../config/db');

async function crearTurno(datos) {
  const query = `
    INSERT INTO turnos (paciente_id, prestacion_id, ...)
    VALUES ($1, $2, ...)
    RETURNING *;
  `;
  
  const { rows } = await pool.query(query, [datos.pacienteId, ...]);
  return rows[0];
}

module.exports = { crearTurno };
```

### En app.js

```javascript
require('dotenv').config();
const { app, inicializar } = require('./app');

async function start() {
  await inicializar(); // Verifica conexión a BD
  const server = app.listen(3000, () => {
    console.log('✓ Servidor iniciado en puerto 3000');
  });
}

start();
```

## Iniciar Servidor

```bash
npm start
# o
node src/server.js
```

Salida esperada:
```
[INICIO] Verificando conexión a base de datos...
[DB] Nueva conexión establecida al pool
[DB] ✓ Conexión a PostgreSQL exitosa
[DB] Servidor en: 2026-02-03 14:30:25.123456+00
[INICIO] ✓ Aplicación lista para recibir solicitudes

[SERVIDOR] Escuchando en puerto 3000
[SERVIDOR] URL: http://localhost:3000
[SERVIDOR] Health check: http://localhost:3000/health
```

## Features Implementados

✅ **Pool de conexiones**: Gestión eficiente de conexiones  
✅ **Variables de entorno**: Configuración flexible con dotenv  
✅ **Logs detallados**: Información clara de conexión y errores  
✅ **Manejo de errores**: Captura y logs de errores de conexión  
✅ **Health check**: Endpoint para verificar estado del servidor  
✅ **Graceful shutdown**: Cierre limpio del servidor  
✅ **Test de conexión**: Script para verificar BD antes de iniciar  
✅ **Listo para producción**: Configuración profesional y segura  

## Monitoreo

### Ver estado del pool en runtime

```javascript
// En cualquier ruta o middleware
app.get('/api/db-status', (req, res) => {
  const { pool } = require('./config/db');
  res.json({
    totalConnections: pool.totalCount,
    availableConnections: pool.idleCount,
    usedConnections: pool.totalCount - pool.idleCount,
  });
});
```

### Logs en consola

```
[DB] Nueva conexión establecida al pool
[DB] ✓ Conexión a PostgreSQL exitosa
[DB] Servidor en: 2026-02-03 14:30:25.123456+00
[DB] Conexión removida del pool
```

## Troubleshooting

### Error: "connect ECONNREFUSED 127.0.0.1:5432"
- PostgreSQL no está corriendo
- Solución: `sudo service postgresql start` (Linux/Mac) o iniciar desde Services (Windows)

### Error: "password authentication failed"
- Contraseña incorrecta en .env
- Solución: Verificar credenciales en `.env`

### Error: "database does not exist"
- BD no creada
- Solución: `createdb odonton_db`

### Pool agotado (máximo conexiones)
- Demasiadas conexiones abiertas sin cerrar
- Solución: Aumentar `DB_POOL_MAX` o revisar queries largas

## .gitignore

Agregar a `.gitignore`:
```
.env
.env.local
node_modules/
```

## Seguridad

⚠️ **IMPORTANTE**: Nunca subir el archivo `.env` a repositorio  
- Usar `.env.example` como referencia  
- Usar secretos en variables de entorno en producción  
- No hardcodear credenciales  

## Referencias

- [pg - PostgreSQL client](https://node-postgres.com/)
- [dotenv - Environment variables](https://github.com/motdotla/dotenv)
- [PostgreSQL Pool documentation](https://node-postgres.com/api/pool)
