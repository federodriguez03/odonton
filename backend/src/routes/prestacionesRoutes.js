const express = require('express');
const multer = require('multer');
const router = express.Router();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

const {
  listarPrestaciones,
  crearPrestacion,
  actualizarPrestacion,
  activarPrestacion,
  desactivarPrestacion,
  normalizarPrestaciones,
  vistaPreviaAranceles,
  confirmarAranceles,
  vistaPreviaCargaCatalogo,
  confirmarCargaCatalogo,
  configurarDuracionMasiva,
} = require('../controllers/prestacionesController');
const {
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { autorizarAgenda } = require('../middlewares/turnosAutorizacion');

router.get(
  '/',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_listado_prestaciones';
    next();
  },
  listarPrestaciones,
);

router.post(
  '/',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'crear_prestacion';
    next();
  },
  crearPrestacion,
);

router.put(
  '/normalizar-datos',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'normalizar_prestaciones';
    next();
  },
  normalizarPrestaciones,
);

router.post('/aranceles/vista-previa', middlewareAutenticacion, autorizarOdontologo, csvUpload.single('archivo'), vistaPreviaAranceles);
router.post('/aranceles/confirmar', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, csvUpload.single('archivo'), (req,res,next)=>{ req.auditAction='importar_aranceles'; next(); }, confirmarAranceles);
router.get('/aranceles/carga-catalogo/vista-previa',middlewareAutenticacion,autorizarOdontologo,vistaPreviaCargaCatalogo);
router.post('/aranceles/carga-catalogo/confirmar',middlewareAutenticacion,autorizarOdontologo,middlewareAuditoria,(req,res,next)=>{req.auditAction='cargar_catalogo_desde_arancel';next();},confirmarCargaCatalogo);
router.put('/configurar-duracion',middlewareAutenticacion,autorizarOdontologo,middlewareAuditoria,(req,res,next)=>{req.auditAction='configurar_duracion_prestaciones';next();},configurarDuracionMasiva);

router.put(
  '/:id',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'editar_prestacion';
    next();
  },
  actualizarPrestacion,
);

router.put(
  '/:id/activar',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'activar_prestacion';
    next();
  },
  activarPrestacion,
);

router.put(
  '/:id/desactivar',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'desactivar_prestacion';
    next();
  },
  desactivarPrestacion,
);

module.exports = router;
