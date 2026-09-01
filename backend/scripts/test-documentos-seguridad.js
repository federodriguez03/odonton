const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = 'clave-local-exclusiva-para-prueba';
process.env.NODE_ENV = 'test';

function request(server, pathname, headers = {}) {
  const address = server.address();

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: pathname,
      method: 'GET',
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const dbPath = require.resolve('../src/config/db');
  const documentosServicePath = require.resolve('../src/services/documentosService');

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      pool: { query: async () => ({ rows: [], rowCount: 0 }) },
      verificarConexion: async () => true,
    },
  };

  require.cache[documentosServicePath] = {
    id: documentosServicePath,
    filename: documentosServicePath,
    loaded: true,
    exports: {
      crearDocumento: async () => null,
      listarDocumentosPorPaciente: async () => [],
      obtenerDocumentoPorId: async () => ({
        id: 1,
        paciente_id: 1,
        nombre_archivo: 'documento-prueba.json',
        ruta_archivo: 'package.json',
        tipo_archivo: 'application/json',
      }),
      eliminarDocumentoPorId: async () => null,
    },
  };

  const { app } = require('../src/app');
  const { generarToken } = require('../src/utils/jwt');
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const accesoPublico = await request(server, '/uploads/documentos/.gitkeep');
    assert.equal(accesoPublico.statusCode, 404, 'La ruta publica /uploads no debe servir archivos');

    const sinToken = await request(server, '/api/documentos/descargar/1');
    assert.equal(sinToken.statusCode, 401, 'La descarga por API debe exigir autenticacion');

    const token = generarToken({ userId: 1, email: 'prueba@odonton.local', rol: 'odontologo' });
    const autenticada = await request(server, '/api/documentos/descargar/1', {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(autenticada.statusCode, 200, 'La descarga autenticada debe continuar funcionando');
    assert.ok(autenticada.body.length > 0, 'La descarga autenticada debe devolver el archivo');
    assert.match(
      autenticada.headers['content-disposition'] || '',
      /documento-prueba\.json/,
      'La descarga debe conservar el nombre del documento',
    );

    console.log('OK - /uploads no entrega archivos publicamente');
    console.log('OK - la descarga por API rechaza solicitudes sin JWT');
    console.log('OK - la descarga autenticada continua funcionando');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
