const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const documentosService = require('../services/documentosService');

const UPLOADS_BASE_DIR = path.join(__dirname, '..', '..', 'uploads', 'documentos');

function resolveDocumentoPath(rutaArchivo) {
  return path.join(__dirname, '..', '..', rutaArchivo);
}

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

    const rutaRelativa = path.join('uploads', 'documentos', file.filename);

    const documento = await documentosService.crearDocumento({
      paciente_id,
      historia_clinica_id,
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
    const { paciente_id } = req.query || {};
    if (!paciente_id) {
      return res.status(400).json({ mensaje: 'paciente_id es requerido' });
    }

    const documentos = await documentosService.listarDocumentosPorPaciente(paciente_id);
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

    const archivoPath = resolveDocumentoPath(documento.ruta_archivo);

    if (!fs.existsSync(archivoPath)) {
      return res.status(404).json({ mensaje: 'Archivo no encontrado en el servidor' });
    }

    return res.download(archivoPath, documento.nombre_archivo);
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al descargar documento' });
  }
}

async function eliminarDocumento(req, res) {
  try {
    const { id } = req.params;
    const documento = await documentosService.eliminarDocumentoPorId(id);

    if (!documento) {
      return res.status(404).json({ mensaje: 'Documento no encontrado' });
    }

    const archivoPath = resolveDocumentoPath(documento.ruta_archivo);
    await fsPromises.unlink(archivoPath).catch(() => {});

    return res.status(200).json({ mensaje: 'Documento eliminado correctamente' });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al eliminar documento' });
  }
}

async function asociarDocumento(req, res) {
  try {
    const documento = await documentosService.asociarDocumentoAConsulta(req.params.id, req.body?.historia_clinica_id || null);
    return res.json({ mensaje: 'Asociación del documento actualizada', documento });
  } catch (error) {
    return res.status(error.message.includes('no encontrado') ? 404 : 400).json({ mensaje: error.message });
  }
}

module.exports = {
  subirDocumento,
  listarDocumentos,
  descargarDocumento,
  eliminarDocumento,
  asociarDocumento,
  UPLOADS_BASE_DIR,
};
