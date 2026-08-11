/**
 * Script de test para verificar conexión a PostgreSQL
 * Ejecutar: node test-db.js
 */

require('dotenv').config();

const { pool, verificarConexion } = require('./src/config/db');

async function testConexion() {
  console.log('\n========================================');
  console.log('TEST DE CONEXIÓN A POSTGRESQL');
  console.log('========================================\n');

  console.log('Configuración:');
  console.log(`  Host: ${process.env.DB_HOST}`);
  console.log(`  Port: ${process.env.DB_PORT}`);
  console.log(`  Database: ${process.env.DB_NAME}`);
  console.log(`  User: ${process.env.DB_USER}`);
  console.log(`  Pool Min: ${process.env.DB_POOL_MIN || 2}`);
  console.log(`  Pool Max: ${process.env.DB_POOL_MAX || 10}`);
  console.log();

  try {
    // Test 1: Verificar conexión básica
    console.log('[TEST 1] Verificando conexión básica...');
    const ok = await verificarConexion();
    if (!ok) {
      console.error('❌ Falló la conexión básica');
      process.exit(1);
    }
    console.log('✓ Conexión básica OK\n');

    // Test 2: Ejecutar query simple
    console.log('[TEST 2] Ejecutando SELECT NOW()...');
    const resultNow = await pool.query('SELECT NOW()');
    console.log(`✓ Timestamp del servidor: ${resultNow.rows[0].now}\n`);

    // Test 3: Contar tablas
    console.log('[TEST 3] Listando tablas en la base de datos...');
    const resultTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    if (resultTables.rows.length === 0) {
      console.log('⚠️  No se encontraron tablas en la base de datos');
    } else {
      console.log(`✓ Tablas encontradas (${resultTables.rows.length}):`);
      resultTables.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    }
    console.log();

    // Test 4: Información del pool
    console.log('[TEST 4] Estado del pool:');
    console.log(`  Conexiones totales: ${pool.totalCount}`);
    console.log(`  Conexiones disponibles: ${pool.idleCount}`);
    console.log(`  Conexiones en uso: ${pool.totalCount - pool.idleCount}`);
    console.log();

    console.log('========================================');
    console.log('✓ TODOS LOS TESTS PASARON EXITOSAMENTE');
    console.log('========================================\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    if (err.code) {
      console.error(`Código de error: ${err.code}`);
    }
    console.log();
    process.exit(1);
  } finally {
    // Cerrar pool
    await pool.end();
  }
}

testConexion();
