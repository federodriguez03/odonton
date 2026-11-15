const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { resolveDocumentPath, toStoredDocumentPath } = require('./documentPaths');

const TYPES = [
  { mime: 'application/pdf', extension: '.pdf', matches: (header) => header.subarray(0, 5).toString('ascii') === '%PDF-' },
  { mime: 'image/jpeg', extension: '.jpg', matches: (header) => header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff },
  { mime: 'image/png', extension: '.png', matches: (header) => header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
];

async function validateAndNormalizeUploadedFile(file) {
  if (!file?.path) throw new Error('Archivo requerido');
  const temporaryStoredPath = toStoredDocumentPath(file.path);
  const safeTemporaryPath = await resolveDocumentPath(temporaryStoredPath);
  const handle = await fs.open(safeTemporaryPath, 'r');
  let header;
  try {
    header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    header = header.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  const detected = TYPES.find((type) => type.matches(header));
  if (!detected) throw new Error('El contenido del archivo no es un PDF, JPG o PNG valido');
  if (file.mimetype !== detected.mime) throw new Error('El tipo declarado no coincide con el contenido real del archivo');

  const finalPath = path.join(path.dirname(safeTemporaryPath), `${crypto.randomUUID()}${detected.extension}`);
  await fs.rename(safeTemporaryPath, finalPath);
  file.path = finalPath;
  file.filename = path.basename(finalPath);
  file.mimetype = detected.mime;
  return file;
}

module.exports = { validateAndNormalizeUploadedFile, TYPES };
