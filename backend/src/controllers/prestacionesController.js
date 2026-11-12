const prestacionesService = require('../services/prestacionesService');
const arancelesImportService = require('../services/arancelesImportService');

async function listarPrestaciones(req, res) {
  try {
    const limitado = req.user?.rol !== 'dueno';
    const incluirInactivas = !limitado && String(req.query?.all || req.query?.incluir_inactivas || '').toLowerCase() === 'true';
    const result = await prestacionesService.listarPrestaciones({ incluirInactivas, estado: limitado ? 'activas' : (req.query?.estado || null) });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      mensaje: error.message || 'Error al listar prestaciones',
    });
  }
}

async function crearPrestacion(req, res) {
  try {
    const prestacion = await prestacionesService.crearPrestacion(req.body || {}, req.user?.id);
    return res.status(201).json({ mensaje: 'Prestacion creada', prestacion });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al crear prestacion' });
  }
}

async function actualizarPrestacion(req, res) {
  try {
    const { id } = req.params;
    const prestacion = await prestacionesService.actualizarPrestacion(id, req.body || {}, req.user?.id);
    return res.status(200).json({ mensaje: 'Prestacion actualizada', prestacion });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al actualizar prestacion' });
  }
}

async function activarPrestacion(req, res) {
  try {
    const { id } = req.params;
    const prestacion = await prestacionesService.setActivoPrestacion(id, true, req.user?.id);
    return res.status(200).json({ mensaje: 'Prestacion activada', prestacion });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al activar prestacion' });
  }
}

async function desactivarPrestacion(req, res) {
  try {
    const { id } = req.params;
    const prestacion = await prestacionesService.setActivoPrestacion(id, false, req.user?.id);
    return res.status(200).json({ mensaje: 'Prestacion desactivada', prestacion });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al desactivar prestacion' });
  }
}

async function normalizarPrestaciones(req, res) {
  try {
    const resultado = await prestacionesService.normalizarPrestacionesDuplicadas();
    return res.status(200).json({
      mensaje: 'Prestaciones duplicadas normalizadas',
      resultado,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al normalizar prestaciones' });
  }
}

async function vistaPreviaAranceles(req, res) {
  try {
    const resultado = await arancelesImportService.previewImport({ file: req.file, input: req.body || {} });
    return res.status(200).json(resultado);
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al revisar CSV', errores: error.details || null });
  }
}

async function confirmarAranceles(req, res) {
  try {
    let mappings=[];
    try { mappings=JSON.parse(req.body?.correspondencias || '[]'); } catch { return res.status(400).json({ mensaje:'Correspondencias invalidas' }); }
    const resultado = await arancelesImportService.confirmImport({ file:req.file,input:req.body || {},mappings,userId:req.user?.id });
    return res.status(200).json({ mensaje: resultado.reutilizada ? 'Archivo ya importado; no se duplicaron registros' : 'Aranceles importados', resultado });
  } catch (error) {
    return res.status(400).json({ mensaje:error.message || 'Error al importar CSV',errores:error.details || null });
  }
}

async function vistaPreviaCargaCatalogo(req,res) {
  try { return res.status(200).json(await arancelesImportService.bulkCatalogPreview({versionId:req.query?.version_id || null})); }
  catch(error){ return res.status(400).json({mensaje:error.message || 'Error al preparar carga del catalogo'}); }
}

async function confirmarCargaCatalogo(req,res) {
  try { const resultado=await arancelesImportService.confirmBulkCatalog({versionId:req.body?.version_id,resolutions:req.body?.resoluciones,userId:req.user?.id}); return res.status(200).json({mensaje:'Carga masiva procesada',resultado}); }
  catch(error){ return res.status(400).json({mensaje:error.message || 'Error al cargar el catalogo'}); }
}

async function configurarDuracionMasiva(req,res) {
  try { const resultado=await prestacionesService.configurarDuracionYActivar(req.body?.ids,req.body?.duracion_minutos,req.user?.id); return res.status(200).json({mensaje:'Prestaciones configuradas y activadas',resultado}); }
  catch(error){ return res.status(400).json({mensaje:error.message || 'Error al configurar prestaciones'}); }
}

module.exports = {
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
};
