const { pool } = require('../config/db');
const { verificarToken } = require('../utils/jwt');
const { obtenerIdentidadVigente } = require('../services/identidadService');
const { requireSchema } = require('../services/schemaValidationService');

let auditoriaInitDone = false;

async function asegurarTablaAuditoria() {
  if (auditoriaInitDone) return;

  await requireSchema('auditoria_middleware', [
    'auditoria.usuario_id', 'auditoria.accion', 'auditoria.recurso', 'auditoria.recurso_id',
    'auditoria.status_code', 'auditoria.metadata', 'auditoria.created_at',
  ]);

  auditoriaInitDone = true;
}

function autorizarOdontologo(req, res, next) {
  try {
    if (!req.user || req.user.rol !== 'dueno') {
      return res.status(403).json({ mensaje: 'Acceso temporalmente reservado al dueño', codigo: 'RUTA_RESERVADA_DUENO' });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

// La autenticacion solo resuelve la identidad canonica vigente. Cada ruta aplica
// luego su politica; las no adaptadas conservan autorizarOdontologo (solo dueno).
async function middlewareAutenticacion(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ mensaje: 'Usuario no autenticado' });
    const payload = verificarToken(token);
    req.user = await obtenerIdentidadVigente(payload.userId, undefined, { tokenVersion: payload.tokenVersion });
    if (req.user.debe_cambiar_password && req.originalUrl !== '/api/auth/cambiar-password') {
      return res.status(403).json({ mensaje: 'Debe cambiar la contraseña temporal antes de continuar', codigo: 'PASSWORD_CHANGE_REQUIRED' });
    }
    return next();
  } catch (err) {
    const status = err.status || 401;
    return res.status(status).json({ mensaje: err.code ? err.message : 'Usuario no autenticado', ...(err.code ? { codigo: err.code } : {}) });
  }
}

function validarEntradaCancelarTurno(req, res, next) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ mensaje: 'Id de turno requerido' });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

function asignarActorSistema(req, res, next) {
  try {
    if (!req.user) {
      req.user = {
        id: null,
        rol: 'sistema',
      };
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

function middlewareAuditoria(req, res, next) {
  try {
    res.on('finish', async () => {
      try {
        if (!req.user || !req.auditAction || res.statusCode < 200 || res.statusCode >= 300) {
          return;
        }

        await asegurarTablaAuditoria();

        await pool.query(
          `
            INSERT INTO auditoria (usuario_id, accion, recurso, recurso_id, status_code, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            req.user.id,
            req.auditAction,
            req.baseUrl || null,
            req.params?.id ? String(req.params.id) : null,
            res.statusCode,
            {
              method: req.method,
              path: req.originalUrl,
              ...(req.auditMeta || {}),
            },
          ],
        );
      } catch (auditErr) {
        const ahora = new Date().toISOString();
        console.warn(`[AUDITORIA FALLBACK] ${ahora} - ${req.auditAction || 'sin_accion'} - ${auditErr.message}`);
      }
    });

    return next();
  } catch (err) {
    return next(err);
  }
}

function validarAccesoYParametros(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ mensaje: 'Usuario no autenticado' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ mensaje: 'Id de turno requerido' });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  middlewareAutenticacion,
  autorizarOdontologo,
  validarEntradaCancelarTurno,
  asignarActorSistema,
  middlewareAuditoria,
  validarAccesoYParametros,
};
