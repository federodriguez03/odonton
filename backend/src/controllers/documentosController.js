const fsPromises = require('fs/promises');
const documentosService = require('../services/documentosService');
const documentPaths = require('../utils/documentPaths');

async function subirDocumento(req, res) {
  // Multer ya guardó el archivo; cualquier rechazo posterior debe evitar un upload huérfano.
  try {
    const { paciente_id, historia_clinica_id, descripcion } = req.body || {};
    const file = req.file;

    if (!paciente_id) {
      if (file) {
        await fsPromises.unlink(file.path).catch(() => {});
      }
      return res.status(400).json({ mensaje: 'paciente_id es requerido' });
    }

    if (!file) {
      return res.status(400).json({ mensaje: 'Archivo requerido' });
    }

    const rutaRelativa = documentPaths.toStoredDocumentPath(file.path);

    const documento = await documentosService.crearDocumento({
      paciente_id,
      historia_clinica_id: historia_clinica_id || null,
      nombre_archivo: file.originalname,
      ruta_archivo: rutaRelativa,
      tipo_archivo: file.mimetype,
      descripcion: descripcion || null,
    });

    return res.status(201).json({
      mensaje: 'Documento subido correctamente',
      documento,
    });
  } catch (error) {
    if (req.file) {
      await fsPromises.unlink(req.file.path).catch(() => {});
    }
    return res.status(400).json({ mensaje: error.message || 'Error al subir documento' });
  }
}

async function listarDocumentos(req, res) {
  try {
    const { paciente_id, historia_clinica_id } = req.query || {};
    if (!paciente_id) {
      return res.status(400).json({ mensaje: 'paciente_id es requerido' });
    }

    const documentos = await documentosService.listarDocumentosPorPaciente(paciente_id, historia_clinica_id || null);
    return res.status(200).json({
      paciente_id: Number(paciente_id),
      total: documentos.length,
      documentos,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al listar documentos' });
  }
}

async function descargarDocumento(req, res) {
  try {
    const { id } = req.params;
    const documento = await documentosService.obtenerDocumentoPorId(id);

    if (!documento) {
      return res.status(404).json({ mensaje: 'Documento no encontrado' });
    }

    let archivoPath;
    try {
      archivoPath = await documentPaths.resolveDocumentPath(documento.ruta_archivo);
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).json({ mensaje: 'Archivo no encontrado en el servidor' });
      throw error;
    }

    return res.download(archivoPath, documento.nombre_archivo);
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al descargar documento' });
  }
}

async function eliminarDocumento(req, res) {
  try {
    const { id } = req.params;
    const existente = await documentosService.obtenerDocumentoPorId(id);

    if (!existente) {
      return res.status(404).json({ mensaje: 'Documento no encontrado' });
    }

    const archivoPath = await documentPaths.resolveDocumentPath(existente.ruta_archivo);
    const documento = await documentosService.eliminarDocumentoPorId(id);
    if (!documento) return res.status(404).json({ mensaje: 'Documento no encontrado' });
    await fsPromises.unlink(archivoPath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });

    return res.status(200).json({ mensaje: 'Documento eliminado correctamente' });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al eliminar documento' });
  }
}

module.exports = {
  subirDocumento,
  listarDocumentos,
  descargarDocumento,
  eliminarDocumento,
  UPLOADS_BASE_DIR: documentPaths.UPLOADS_BASE_DIR,
};
