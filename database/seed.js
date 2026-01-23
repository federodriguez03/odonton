/**
 * Script de seeds - Datos iniciales de prueba
 * Ejecutar: npm run db:seed
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'odonton_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function seedDatabase() {
  try {
    console.log('\n🌱 Iniciando carga de datos de prueba...\n');

    // Usuario de prueba (odontólogo)
    const adminPassword = await bcrypt.hash('admin123', 10);
    await pool.query(
      'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
      ['admin@odonton.com', adminPassword, 'admin']
    );
    console.log('✓ Usuario admin creado');

    // Servicios (prestaciones dentales)
    const services = [
      { name: 'Consulta inicial', description: 'Evaluación y diagnóstico', duration: 30, price: 5000 },
      { name: 'Limpieza dental', description: 'Limpieza profesional', duration: 45, price: 3000 },
      { name: 'Extracción', description: 'Extracción dental simple', duration: 30, price: 8000 },
      { name: 'Empaste', description: 'Restauración con resina', duration: 40, price: 6000 },
      { name: 'Radiografía', description: 'Radiografía digital', duration: 10, price: 1500 },
      { name: 'Detartraje', description: 'Eliminación de sarro', duration: 60, price: 4000 },
    ];

    for (const service of services) {
      await pool.query(
        'INSERT INTO services (name, description, duration_minutes, price) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [service.name, service.description, service.duration, service.price]
      );
    }
    console.log('✓ Servicios creados');

    // Pacientes de prueba
    const patients = [
      { name: 'Juan García', dni: '12345678', email: 'juan@email.com', phone: '1122334455', birthdate: '1985-05-15' },
      { name: 'María López', dni: '87654321', email: 'maria@email.com', phone: '1156667788', birthdate: '1990-08-22' },
      { name: 'Carlos Martínez', dni: '11223344', email: 'carlos@email.com', phone: '1144445555', birthdate: '1978-11-10' },
    ];

    for (const patient of patients) {
      await pool.query(
        'INSERT INTO patients (name, dni, email, phone, birthdate) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (dni) DO NOTHING',
        [patient.name, patient.dni, patient.email, patient.phone, patient.birthdate]
      );
    }
    console.log('✓ Pacientes creados');

    console.log('\n✅ Datos de prueba cargados exitosamente\n');
    console.log('📝 Credenciales de prueba:');
    console.log('   Email: admin@odonton.com');
    console.log('   Contraseña: admin123\n');

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error al cargar datos:', err.message);
    console.error(err);
    await pool.end();
    process.exit(1);
  }
}

seedDatabase();
