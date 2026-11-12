const OPERATIVOS=new Set(['dueno','recepcion']);
function autorizarFinanzasOperativas(req,res,next){if(!req.user||!OPERATIVOS.has(req.user.rol))return res.status(403).json({mensaje:'No tiene permiso para acceder a operaciones financieras',codigo:'FINANZAS_DENEGADAS'});return next()}
function autorizarReportesOperativos(req,res,next){if(!req.user||!OPERATIVOS.has(req.user.rol))return res.status(403).json({mensaje:'No tiene permiso para acceder a reportes operativos',codigo:'REPORTES_DENEGADOS'});return next()}
function autorizarAnulacionesFinancieras(req,res,next){if(req.user?.rol!=='dueno')return res.status(403).json({mensaje:'Solo el dueño puede anular operaciones financieras',codigo:'ANULACION_FINANCIERA_DENEGADA'});return next()}
module.exports={autorizarFinanzasOperativas,autorizarReportesOperativos,autorizarAnulacionesFinancieras};
