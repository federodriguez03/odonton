/**
 * Archivo principal del servidor Express
 * Punto de entrada de la aplicación
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Importar rutas
const appointmentRoutes = require('./routes/appointments');
const patientRoutes = require('./routes/patients');
const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');

// Inicializar aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de seguridad y parseo
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5500',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../../frontend')));

// Registro de peticiones HTTP (desarrollo)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// ========== RUTAS API ==========

// Autenticación
app.use('/api/auth', authRoutes);

// Gestión de turnos
app.use('/api/appointments', appointmentRoutes);

// Gestión de pacientes
app.use('/api/patients', patientRoutes);

// Reportes
app.use('/api/reports', reportRoutes);

// ========== MANEJO DE ERRORES ==========

// Ruta 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path,
  });
});

// Middleware de error global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Error interno del servidor' 
    : err.message;

  res.status(statusCode).json({
    error: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// ========== INICIAR SERVIDOR ==========

app.listen(PORT, () => {
  console.log(`✅ Servidor Odonton ejecutándose en puerto ${PORT}`);
  console.log(`🌐 Frontend: ${process.env.FRONTEND_URL}`);
  console.log(`🗄️  Base de datos: ${process.env.DB_NAME} en ${process.env.DB_HOST}`);
});

module.exports = app;
