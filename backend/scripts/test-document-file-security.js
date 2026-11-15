const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

process.env.DOCUMENTOS_UPLOAD_SUBDIR = path.join('uploads', `security-test-${process.pid}`);

const paths = require('../src/utils/documentPaths');
const { validateAndNormalizeUploadedFile } = require('../src/utils/documentFileValidation');

async function writeUpload(name, bytes, mimetype) {
  const root = await paths.ensureUploadsBaseDir();
  const filePath = path.join(root, name);
  await fs.writeFile(filePath, bytes);
  return { path: filePath, filename: name, originalname: name, mimetype };
}

async function run() {
  const outsideRoot = path.join(paths.UPLOADS_ROOT, `security-outside-${process.pid}`);
  try {
    const valid = [
      ['sample-pdf.upload', Buffer.from('%PDF-1.7\nsynthetic'), 'application/pdf', '.pdf'],
      ['sample-jpeg.upload', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), 'image/jpeg', '.jpg'],
      ['sample-png.upload', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), 'image/png', '.png'],
    ];
    for (const [name, bytes, mime, extension] of valid) {
      const file = await writeUpload(name, bytes, mime);
      await validateAndNormalizeUploadedFile(file);
      assert.equal(path.extname(file.path), extension);
      assert.equal(file.mimetype, mime);
      assert.equal(await paths.resolveDocumentPath(paths.toStoredDocumentPath(file.path)), file.path);
    }

    const disguised = await writeUpload('disguised.upload', Buffer.from('<script>alert(1)</script>'), 'application/pdf');
    await assert.rejects(() => validateAndNormalizeUploadedFile(disguised), /contenido del archivo/i);
    await fs.unlink(disguised.path);

    const mismatch = await writeUpload('mismatch.upload', Buffer.from('%PDF-1.7\nsynthetic'), 'image/png');
    await assert.rejects(() => validateAndNormalizeUploadedFile(mismatch), /no coincide/i);
    await fs.unlink(mismatch.path);

    await assert.rejects(() => paths.resolveDocumentPath('../package.json'), /fuera|invalida/i);
    await assert.rejects(() => paths.resolveDocumentPath(path.resolve(__filename)), /invalida/i);

    await fs.mkdir(outsideRoot, { recursive: true });
    const outsideFile = path.join(outsideRoot, 'outside.pdf');
    await fs.writeFile(outsideFile, '%PDF-1.7\nsynthetic');
    const linkPath = path.join(paths.UPLOADS_BASE_DIR, 'outside-link.pdf');
    try {
      await fs.symlink(outsideFile, linkPath, 'file');
      await assert.rejects(
        () => paths.resolveDocumentPath(paths.toStoredDocumentPath(linkPath)),
        /enlace simbolico/i
      );
    } catch (error) {
      if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
      const junctionPath = path.join(paths.UPLOADS_BASE_DIR, 'outside-junction');
      try {
        await fs.symlink(outsideRoot, junctionPath, 'junction');
        await assert.rejects(
          () => paths.resolveDocumentPath(paths.toStoredDocumentPath(path.join(junctionPath, 'outside.pdf'))),
          /enlace simbolico/i
        );
      } catch (junctionError) {
        if (!['EPERM', 'EACCES'].includes(junctionError.code)) throw junctionError;
        console.log('SKIP enlace simbolico: el sistema no permite crear el fixture');
      }
    }

    console.log('OK documentos: firmas, MIME, nombres y confinamiento de rutas');
  } finally {
    await fs.rm(paths.UPLOADS_BASE_DIR, { recursive: true, force: true });
    await fs.rm(outsideRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
