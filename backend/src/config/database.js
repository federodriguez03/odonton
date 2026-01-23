/**
 * Configuración de conexión a PostgreSQL
 * Módulo centralizado para gestionar la conexión con la base de datos
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'odonton_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

// Manejo de errores de conexión
pool.on('error', (err) => {
  console.error('Error inesperado en el pool de conexiones:', err);
});

/**
 * Ejecuta una consulta SQL
 * @param {string} query - Consulta SQL
 * @param {array} values - Valores para la consulta parametrizada
 * @returns {Promise} Resultado de la consulta
 */
const query = (text, values) => {
  return pool.query(text, values);
};

/**
 * Obtiene un cliente individual del pool para transacciones
 * @returns {Promise} Cliente del pool
 */
const getClient = () => {
  return pool.connect();
};

module.exports = {
  query,
  getClient,
  pool,
};
