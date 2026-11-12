const authService = require('../services/authService');

async function login(req,res) {
  try {
    const {email,password}=req.body || {};
    if(!email||!password) return res.status(400).json({mensaje:'Email y password son requeridos'});
    return res.status(200).json(await authService.login({email,password}));
  } catch(error) {
    const status=error.status || 500;
    const mensaje=error.code ? error.message : (status===401 ? 'Credenciales inválidas' : (error.message || 'Error al iniciar sesión'));
    return res.status(status).json({mensaje,...(error.code ? {codigo:error.code} : {})});
  }
}

async function me(req,res) {
  if(!req.user?.id) return res.status(401).json({mensaje:'No autorizado'});
  return res.status(200).json({user:req.user});
}

async function cambiarPassword(req,res){
  try{const r=await require('../services/usuariosService').cambiarPasswordPropia(req.user.id,req.body?.passwordActual,req.body?.passwordNueva);const identity=await require('../services/identidadService').obtenerIdentidadVigente(req.user.id);const token=require('../utils/jwt').generarToken({userId:req.user.id,tokenVersion:r.token_version});return res.json({mensaje:'Contraseña actualizada',token,user:identity})}catch(e){return res.status(e.status||400).json({mensaje:e.message||'No se pudo cambiar la contraseña'})}
}

module.exports={login,me,cambiarPassword};
