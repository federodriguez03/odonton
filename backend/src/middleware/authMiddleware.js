const { verificarToken } = require('../utils/jwt');

function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ mensaje: 'Token inválido' });
    }

    const payload = verificarToken(token);

    req.user = {
      id: payload.userId,
      email: payload.email,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ mensaje: 'Token inválido' });
  }
}

module.exports = { verifyToken };
