const { verificarToken } = require('../utils/jwt');
const { obtenerIdentidadVigente } = require('../services/identidadService');

async function verifyToken(req,res,next) {
  try {
    const [scheme,token]=(req.headers.authorization || '').split(' ');
    if(scheme!=='Bearer'||!token) return res.status(401).json({mensaje:'Token inválido'});
    const payload=verificarToken(token);
    req.user=await obtenerIdentidadVigente(payload.userId,undefined,{tokenVersion:payload.tokenVersion});
    return next();
  } catch(error) {
    const status=error.status || 401;
    return res.status(status).json({mensaje:error.code ? error.message : 'Token inválido',...(error.code ? {codigo:error.code} : {})});
  }
}

module.exports={verifyToken};
