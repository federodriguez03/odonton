/**
 * Configuracion principal de Express.
 */
require('dotenv').config();

const path = require('path');
const express = require('express');
const { verificarConexion } = require('./config/db');
const { startReminderScheduler } = require('./jobs/reminderScheduler');
const { requireRuntimeSchema } = require('./services/schemaValidationService');
const { checkReadiness } = require('./services/readinessService');
const { configureTrustedProxy, createCorsMiddleware, createSecurityHeaders, positiveInteger } = require('./config/httpSecurity');

const app = express();

configureTrustedProxy(app);
app.use(createSecurityHeaders());
app.use(createCorsMiddleware());
const requestBodyLimit = process.env.JSON_BODY_LIMIT || '1mb';
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));

const authRoutes = require('./routes/authRoutes');
const turnosRoutes = require('./routes/turnosRoutes');
const pacientesRoutes = require('./routes/pacientesRoutes');
const prestacionesRoutes = require('./routes/prestacionesRoutes');
const odontogramaRoutes = require('./routes/odontogramaRoutes');
const tratamientosRoutes = require('./routes/tratamientosRoutes');
const protesisFijasRoutes = require('./routes/protesisFijasRoutes');
const protesisRemoviblesRoutes = require('./routes/protesisRemoviblesRoutes');
const documentosRoutes = require('./routes/documentosRoutes');
const reportesRoutes = require('./routes/reportesRoutes');
const estadisticasRoutes = require('./routes/estadisticasRoutes');
const cargosRoutes = require('./routes/cargosRoutes');
const pagosRoutes = require('./routes/pagosRoutes');
const configuracionRoutes = require('./routes/configuracionRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const { initializeWhatsAppClient } = require('./services/whatsappClient.service');

// =========================
// RUTAS API
// =========================

app.use('/api/turnos', turnosRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/prestaciones', prestacionesRoutes);
app.use('/api/odontograma', odontogramaRoutes);
app.use('/api/tratamientos', tratamientosRoutes);
app.use('/api/protesis-fijas', protesisFijasRoutes);
app.use('/api/protesis-removibles', protesisRemoviblesRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/estadisticas', estadisticasRoutes);
app.use('/api/cargos', cargosRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// =========================
// HEALTH CHECK
// =========================

app.get('/health', (req, res) => {
  res.status(200).json({
    estado: 'OK',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/live', (req, res) => {
  res.status(200).json({ estado: 'ALIVE', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (req, res) => {
  const ready = await checkReadiness({ timeoutMs: positiveInteger(process.env.READINESS_TIMEOUT_MS, 2000) });
  return res.status(ready ? 200 : 503).json({ estado: ready ? 'READY' : 'NOT_READY' });
});

// =========================
// FRONTEND DE PRODUCCION
// =========================

const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');

app.use('/uploads', (req, res) => {
  res.status(404).json({ mensaje: 'Recurso no disponible' });
});

app.use(express.static(frontendDistPath));

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    return next();
  }

  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// =========================
// MANEJO GLOBAL DE ERRORES
// =========================

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ mensaje: 'El cuerpo de la solicitud supera el tamaño permitido', codigo: 'PAYLOAD_TOO_LARGE' });
  }

  if (err?.code === 'CORS_ORIGIN_NOT_ALLOWED') {
    return res.status(403).json({ mensaje: 'Origen no permitido', codigo: err.code });
  }

  res.status(err.status || 500).json({
    mensaje: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// =========================
// INICIALIZACION
// =========================

async function inicializar() {
  try {
    console.log('\n[INICIO] Verificando conexion a base de datos...');
    const conexionOK = await verificarConexion();

    if (!conexionOK) {
      console.error('[FATAL] No se pudo conectar a la base de datos');
      process.exit(1);
    }
    await requireRuntimeSchema();

    const demoMode = String(process.env.ODONTON_DEMO_MODE || '').toLowerCase() === 'true';
    if (!demoMode && process.env.WHATSAPP_AUTO_START === 'true') {
      initializeWhatsAppClient();
    } else {
      console.log(
        demoMode
          ? '[DEMO] WhatsApp y bot desactivados para este proceso.'
          : '[WHATSAPP WEB] Inicio automatico desactivado. Inicia WhatsApp desde Configuracion.'
      );
    }

    if (demoMode) {
      console.log('[DEMO] Scheduler de recordatorios y tareas automaticas desactivado.');
    } else {
      startReminderScheduler();
    }

    console.log('[INICIO] Aplicacion lista para recibir solicitudes\n');
  } catch (err) {
    console.error('[FATAL] Error durante inicializacion:', err);
    process.exit(1);
  }
}

module.exports = {
  app,
  inicializar,
};
