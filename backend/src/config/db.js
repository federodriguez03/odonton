/**
 * Configuración de conexión a PostgreSQL usando pg Pool
 * - Gestiona el pool de conexiones de forma segura
 * - Usa variables de entorno para configuración
 * - Incluye logs de conexión y errores
 * - Manejo de errores en clientes de conexión
 * Listo para producción y desarrollo
 */

const { Pool } = require('pg');

// Crear pool con configuración de variables de entorno
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  // Configuración de pool
  min: parseInt(process.env.DB_POOL_MIN || 2, 10),
  max: parseInt(process.env.DB_POOL_MAX || 10, 10),
});

/**
 * Eventos del pool para monitoreo y logs
 */

// Log cuando hay una nueva conexión
pool.on('connect', () => {
  console.log('[DB] Nueva conexión establecida al pool');
});

// Log de errores inesperados en clientes del pool
pool.on('error', (err, client) => {
  console.error('[DB ERROR] Error inesperado en el pool:', {
    mensaje: err.message,
    codigo: err.code,
    cliente: client ? 'activo' : 'inactivo',
  });
});

// Log cuando se cierra una conexión
pool.on('remove', () => {
  console.log('[DB] Conexión removida del pool');
});

/**
 * Función para verificar que la base de datos responde
 * Ejecuta un query simple para validar la conexión
 */
async function verificarConexion() {
  try {
    const resultado = await pool.query('SELECT NOW()');
    const timestamp = resultado.rows[0].now;
    console.log('[DB] ✓ Conexión a PostgreSQL exitosa');
    console.log(`[DB] Servidor en: ${timestamp}`);
    return true;
  } catch (err) {
    console.error('[DB] ✗ Error al conectar a PostgreSQL:', {
      mensaje: err.message,
      codigo: err.code,
      detalles: err.detail || 'Sin detalles adicionales',
    });
    return false;
  }
}

module.exports = {
  pool,
  verificarConexion,
};