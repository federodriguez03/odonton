const authService = require('../services/authService');

async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ mensaje: 'Email y password son requeridos' });
    }

    const result = await authService.login({ email, password });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    const mensaje = status === 401 ? 'Credenciales inválidas' : (error.message || 'Error al iniciar sesión');
    return res.status(status).json({ ...(error.code ? { codigo: error.code } : {}), mensaje });
  }
}

async function me(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ mensaje: 'No autorizado' });
    }
    return res.status(200).json({ user: req.user });
  } catch (error) {
    return res.status(500).json({ mensaje: error.message || 'Error al obtener usuario autenticado' });
  }
}

module.exports = {
  login,
  me,
};
