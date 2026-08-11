const {
  initializeWhatsAppClient,
  getWhatsAppClient,
  getStatus,
  getLastQr,
  destroyWhatsAppClient,
  logoutWhatsAppClient,
  restartWhatsAppClient,
  sendWhatsAppMessage,
} = require('./whatsappClient.service');

module.exports = {
  initializeWhatsApp: initializeWhatsAppClient,
  getWhatsAppStatus: getStatus,
  getCurrentQr: getLastQr,
  getWhatsAppClient,
  isWhatsAppReady: () => Boolean(getStatus().isReady),
  disconnectWhatsApp: destroyWhatsAppClient,
  logoutWhatsApp: logoutWhatsAppClient,
  restartWhatsApp: restartWhatsAppClient,
  sendMessage: sendWhatsAppMessage,
};
