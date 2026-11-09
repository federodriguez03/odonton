const { verificarToken } = require('../utils/jwt');
const { exigirCuentaActiva, obtenerIdentidadPorId } = require('../services/identityService');

function responderNoAutenticado(res) {
  return res.status(401).json({ codigo: 'NO_AUTENTICADO', mensaje: 'Usuario no autenticado' });
}

async function authenticateIdentity(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) return responderNoAutenticado(res);

    let payload;
    try {
      payload = verificarToken(token);
    } catch {
      return responderNoAutenticado(res);
    }

    const userId = payload.userId || payload.sub;
    const identidad = exigirCuentaActiva(await obtenerIdentidadPorId(userId));
    req.authToken = payload;
    req.user = identidad;
    return next();
  } catch (error) {
    if (error.code === 'CUENTA_NO_DISPONIBLE') return responderNoAutenticado(res);
    if (error.code === 'IDENTIDAD_NO_CONFIGURADA') {
      return res.status(503).json({ codigo: error.code, mensaje: error.message });
    }
    return next(error);
  }
}

module.exports = { authenticateIdentity };
