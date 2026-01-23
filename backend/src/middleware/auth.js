/**
 * Middleware de autenticación JWT
 * Verifica tokens y controla acceso por roles
 */

const jwt = require('jsonwebtoken');

/**
 * Verifica que el usuario esté autenticado
 */
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

/**
 * Verifica que el usuario sea admin (odontólogo)
 */
const verifyAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
  }
  next();
};

/**
 * Verifica token temporal para autogestión de pacientes
 */
const verifyTempToken = (req, res, next) => {
  const token = req.query.token || req.body.token;

  if (!token) {
    return res.status(401).json({ error: 'Token temporal no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'temp') {
      return res.status(403).json({ error: 'Tipo de token inválido' });
    }
    req.tempAccess = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token temporal expirado o inválido' });
  }
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyTempToken,
};
