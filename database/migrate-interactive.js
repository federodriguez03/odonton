/**
 * Script interactivo de migración - Crear tablas en PostgreSQL
 * Permite ingresar credenciales manualmente
 */

const { Pool } = require('pg');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

const createTablesSQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  dni VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  birthdate DATE,
  address TEXT,
  observations TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INT DEFAULT 30,
  price DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  service_id INT REFERENCES services(id),
  date DATE NOT NULL,
  time TIME NOT NULL,
  status VARCHAR(50) DEFAULT 'confirmado',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, time)
);

CREATE TABLE IF NOT EXISTS treatments (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id INT REFERENCES appointments(id),
  description TEXT NOT NULL,
  tooth_number INT,
  treatment_type VARCHAR(100),
  cost DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'realizado',
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_type VARCHAR(50),
  description TEXT,
  date DATE NOT NULL,
  receipt_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS odontograms (
  id SERIAL PRIMARY KEY,
  patient_id INT UNIQUE NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consents (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consent_type VARCHAR(100) NOT NULL,
  accepted BOOLEAN DEFAULT FALSE,
  date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id INT REFERENCES appointments(id),
  type VARCHAR(50),
  content TEXT,
  sent_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_dni ON patients(dni);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatments_patient ON treatments(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_patient ON messages(patient_id);
`;

async function runMigrations() {
  try {
    console.log('\n====================================');
    console.log('  🗄️  CREACIÓN DE BASE DE DATOS');
    console.log('====================================\n');

    // Obtener credenciales
    const host = await question('Host PostgreSQL (por defecto: localhost): ');
    const port = await question('Puerto PostgreSQL (por defecto: 5432): ');
    const user = await question('Usuario PostgreSQL (por defecto: postgres): ');
    const password = await question('Contraseña PostgreSQL: ');
    const dbName = await question('Nombre de la base de datos (por defecto: odonton_db): ');

    rl.close();

    const config = {
      host: host || 'localhost',
      port: parseInt(port) || 5432,
      database: 'postgres',
      user: user || 'postgres',
      password: password || 'postgres',
    };

    const dbNameFinal = dbName || 'odonton_db';

    console.log('\n🔄 Conectando a PostgreSQL...');

    // Conectar a base de datos de sistema para crear la nueva BD
    const adminPool = new Pool(config);

    try {
      await adminPool.query(`CREATE DATABASE ${dbNameFinal}`);
      console.log(`✅ Base de datos "${dbNameFinal}" creada`);
    } catch (err) {
      if (err.code === '42P04') {
        console.log(`ℹ️  Base de datos "${dbNameFinal}" ya existe`);
      } else {
        throw err;
      }
    }

    await adminPool.end();

    // Conectar a la nueva base de datos
    console.log('🔄 Creando tablas...\n');
    
    config.database = dbNameFinal;
    const dbPool = new Pool(config);

    const statements = createTablesSQL.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await dbPool.query(statement);
      }
    }

    console.log('✅ Todas las tablas creadas correctamente\n');
    console.log('📊 Tablas creadas:');
    console.log('   ✓ users');
    console.log('   ✓ patients');
    console.log('   ✓ services');
    console.log('   ✓ appointments');
    console.log('   ✓ treatments');
    console.log('   ✓ payments');
    console.log('   ✓ odontograms');
    console.log('   ✓ consents');
    console.log('   ✓ messages');
    console.log('\n✅ ¡Base de datos creada exitosamente!\n');

    await dbPool.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error en migraciones:', err.message);
    console.error(err);
    process.exit(1);
  }
}

runMigrations();
