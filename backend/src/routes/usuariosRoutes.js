const router=require('express').Router();const c=require('../controllers/usuariosController');const {middlewareAutenticacion,autorizarOdontologo,middlewareAuditoria}=require('../middlewares/turnosMiddleware');
router.use(middlewareAutenticacion,autorizarOdontologo);
router.get('/',c.listar);router.get('/perfiles',c.perfiles);
router.post('/',middlewareAuditoria,(req,res,next)=>{req.auditAction='crear_usuario';next()},c.crear);
router.put('/:id',middlewareAuditoria,(req,res,next)=>{req.auditAction='editar_usuario';next()},c.editar);
router.post('/:id/perfil',middlewareAuditoria,(req,res,next)=>{req.auditAction='vincular_perfil_profesional';next()},c.vincularPerfil);
router.post('/:id/restablecer-password',middlewareAuditoria,(req,res,next)=>{req.auditAction='restablecer_password_usuario';next()},c.resetPassword);
module.exports=router;
