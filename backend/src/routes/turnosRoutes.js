const express = require('express');
const router = express.Router();

const {
  listarTurnos,
  registrarTurno,
  editarTurno,
  reprogramarTurno,
  cancelarTurno,
  confirmarSolicitudTurno,
  rechazarSolicitudTurno,
  listarSolicitudesPendientes,
  procesarRecordatorios,
  enviarRecordatorioManual,
  listarProfesionales,
  consultarDisponibilidad,
  obtenerTurno,
} = require('../controllers/turnosController');

const {
  middlewareAutenticacion,
  validarEntradaCancelarTurno,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { autorizarAgenda } = require('../middleware/authorizationMiddleware');

/**
 * Listar turnos (GET /api/turnos)
 */
router.get(
  '/',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_listado_turnos';
    next();
  },
  listarTurnos
);

router.get(
  '/solicitudes',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'listar_solicitudes_turno';
    next();
  },
  listarSolicitudesPendientes
);

router.get(
  '/profesionales',
  middlewareAutenticacion,
  autorizarAgenda,
  listarProfesionales
);

router.get(
  '/disponibilidad',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  consultarDisponibilidad
);

router.get('/:id', middlewareAutenticacion, autorizarAgenda, middlewareAuditoria, obtenerTurno);

/**
 * Registrar nuevo turno (Caso de uso 3.1)
 */
router.post(
  '/',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'registrar_turno';
    next();
  },
  registrarTurno
);

/**
 * Procesar recordatorios automaticos (Caso de uso 3.6)
 */
router.post(
  '/:id/recordatorios/whatsapp',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'recordatorio_manual_enviado';
    next();
  },
  enviarRecordatorioManual
);

router.post(
  '/recordatorios/procesar',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'procesar_recordatorios_automaticos';
    next();
  },
  procesarRecordatorios
);

/**
 * Editar turno existente (Caso de uso 3.2)
 */
router.put(
  '/:id',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'editar_turno';
    next();
  },
  editarTurno
);

/**
 * Reprogramar turno (Caso de uso 3.8)
 */
router.put(
  '/:id/confirmar-solicitud',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'confirmar_solicitud_turno';
    next();
  },
  confirmarSolicitudTurno
);

router.put(
  '/:id/rechazar-solicitud',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'rechazar_solicitud_turno';
    next();
  },
  rechazarSolicitudTurno
);

router.put(
  '/:id/reprogramar',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'reprogramar_turno';
    next();
  },
  reprogramarTurno
);

/**
 * Cancelar turno (Caso de uso 3.3)
 */
router.put(
  '/:id/cancelar',
  middlewareAutenticacion,
  autorizarAgenda,
  validarEntradaCancelarTurno,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'cancelar_turno';
    next();
  },
  cancelarTurno
);

module.exports = router;
