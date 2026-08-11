const express = require('express');
const router = express.Router();
const { crear, listar } = require('../controllers/protesisRemoviblesController');
const { middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria } = require('../middlewares/turnosMiddleware');

router.post('/', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, (req,res,next)=>{req.auditAction='crear_protesis_removible';next();}, crear);
router.get('/', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, (req,res,next)=>{req.auditAction='listar_protesis_removibles';next();}, listar);

module.exports = router;
