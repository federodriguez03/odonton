const express = require('express');
const {
  getWhatsAppStatus,
  getWhatsAppQr,
  initializeWhatsApp,
  resetWhatsApp,
  logoutWhatsApp,
  disconnectWhatsApp,
  sendTestMessage,
  sendReminder,
  processReminders,
  simulateReply,
  debugRecentChats,
} = require('../controllers/whatsapp.controller');
const {
  middlewareAutenticacion,
  autorizarOdontologo,
} = require('../middlewares/turnosMiddleware');

const router = express.Router();

router.use((req, res, next) => {
  if (String(process.env.ODONTON_DEMO_MODE || '').toLowerCase() === 'true') {
    return res.status(503).json({
      mensaje: 'WhatsApp y los envios externos estan desactivados en la base demo.',
      codigo: 'DEMO_EXTERNAL_SENDS_DISABLED',
    });
  }
  return next();
});

router.use(middlewareAutenticacion, autorizarOdontologo);

router.get('/status', getWhatsAppStatus);
router.get('/qr', getWhatsAppQr);
// Ruta de desarrollo/prueba. No exponer en produccion sin autenticacion.
router.get('/debug/chats', debugRecentChats);
router.post('/initialize', initializeWhatsApp);
router.post('/connect', initializeWhatsApp);
router.post('/reset', resetWhatsApp);
router.post('/restart', resetWhatsApp);
router.post('/logout', logoutWhatsApp);
router.post('/disconnect', disconnectWhatsApp);
// Ruta de desarrollo/prueba. No exponer en produccion sin autenticacion.
router.post('/send-test', sendTestMessage);
router.post('/send-reminder/:appointmentId', sendReminder);
router.post('/process-reminders', processReminders);
// Ruta de desarrollo/prueba. No exponer en produccion sin autenticacion.
router.post('/simulate-reply', simulateReply);

module.exports = router;
