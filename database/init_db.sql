-- Script de instalación inicial de Odonton
-- Ejecutar esto en PostgreSQL para crear la base de datos

-- Crear base de datos
CREATE DATABASE odonton_db 
  WITH 
    ENCODING = 'UTF8' 
    LC_COLLATE = 'en_US.UTF-8' 
    LC_CTYPE = 'en_US.UTF-8';

-- Conectar a la base de datos
\c odonton_db;

-- Crear tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de pacientes
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

-- Crear tabla de servicios
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INT DEFAULT 30,
  price DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de turnos
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

-- Crear tabla de tratamientos
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

-- Crear tabla de pagos
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

-- Crear tabla de odontogramas
CREATE TABLE IF NOT EXISTS odontograms (
  id SERIAL PRIMARY KEY,
  patient_id INT UNIQUE NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de consentimientos
CREATE TABLE IF NOT EXISTS consents (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consent_type VARCHAR(100) NOT NULL,
  accepted BOOLEAN DEFAULT FALSE,
  date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de mensajes
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

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_patients_dni ON patients(dni);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatments_patient ON treatments(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_patient ON messages(patient_id);

-- Insertar usuario admin
INSERT INTO users (email, password, role) 
VALUES ('admin@odonton.com', '$2a$10$5Q2UGP/jKUvN5b8k7N5i6.0eHvXxGXSBEMX0K9GvEGCQdZRoH6GJe', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Insertar servicios
INSERT INTO services (name, description, duration_minutes, price) VALUES
('Consulta inicial', 'Evaluación y diagnóstico', 30, 5000),
('Limpieza dental', 'Limpieza profesional', 45, 3000),
('Extracción', 'Extracción dental simple', 30, 8000),
('Empaste', 'Restauración con resina', 40, 6000),
('Radiografía', 'Radiografía digital', 10, 1500),
('Detartraje', 'Eliminación de sarro', 60, 4000)
ON CONFLICT DO NOTHING;

-- Insertar pacientes de prueba
INSERT INTO patients (name, dni, email, phone, birthdate) VALUES
('Juan García', '12345678', 'juan@email.com', '1122334455', '1985-05-15'),
('María López', '87654321', 'maria@email.com', '1156667788', '1990-08-22'),
('Carlos Martínez', '11223344', 'carlos@email.com', '1144445555', '1978-11-10')
ON CONFLICT (dni) DO NOTHING;

-- Confirmar cambios
COMMIT;

-- Mensaje de éxito
\echo '✅ Base de datos Odonton creada exitosamente'
\echo 'Tablas creadas: 9'
\echo 'Usuario admin: admin@odonton.com'
\echo 'Contraseña: admin123'
