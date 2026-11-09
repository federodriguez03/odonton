const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = 'clave-local-exclusiva-para-prueba';
process.env.NODE_ENV = 'test';

function result(rows = []) {
  return { rows, rowCount: rows.length };
}

function compactSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

function createMockPool() {
  const historias = [{
    id: 7,
    paciente_id: 1,
    turno_id: 15,
    descripcion: 'Control existente',
    created_at: '2026-08-01T12:00:00.000Z',
  }];
  const queries = [];

  return {
    historias,
    queries,
    async query(sql) {
      const text = compactSql(sql);
      const lower = text.toLowerCase();
      queries.push(text);

      if (lower.startsWith('alter table pacientes')) return result();

      if (lower === 'select * from pacientes where id = $1') {
        return result([{
          id: 1,
          nombre: 'Paciente',
          apellido: 'Prueba',
          dni: '00000000',
          nacionalidad: null,
          domicilio: null,
          telefono: null,
          email: null,
          fecha_nacimiento: null,
          observaciones: null,
          alergias: null,
          condiciones: null,
          estado_tratamiento: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }]);
      }

      if (lower.startsWith('select count(*)::int as total from turnos t')) {
        return result([{ total: 1 }]);
      }

      if (lower.includes("t.estado = 'realizado'")) {
        return result([{ id: 15, fecha_hora_inicio: '2026-08-01T12:00:00.000Z', estado: 'realizado', prestacion: 'Control' }]);
      }

      if (lower.includes("t.estado = 'programado'") && lower.includes('fecha_hora_inicio > now()')) {
        return result([{ id: 16, fecha_hora_inicio: '2026-09-10T12:00:00.000Z', estado: 'programado', prestacion: 'Consulta' }]);
      }

      if (lower.includes('from turnos t') && lower.includes('limit $2 offset $3')) {
        return result([{
          id: 15,
          fecha_hora_inicio: '2026-08-01T12:00:00.000Z',
          fecha_hora_fin: '2026-08-01T12:30:00.000Z',
          estado: 'realizado',
          origen: 'manual',
          observaciones: null,
          prestacion_id: 2,
          prestacion_nombre: 'Control',
          prestacion_duracion_minutos: 30,
          prestacion_precio_base: '100.00',
        }]);
      }

      if (lower.includes('from historias_clinicas h') && lower.startsWith('select')) {
        return result(historias.map((historia) => ({ ...historia })));
      }

      if (lower.startsWith('insert into historias_clinicas')) {
        historias.push({ id: historias.length + 1, paciente_id: 1 });
        return result([historias[historias.length - 1]]);
      }

      return result();
    },
  };
}

function requestJson(server, pathname, token) {
  const address = server.address();

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: pathname,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const mockPool = createMockPool();
  const dbPath = require.resolve('../src/config/db');

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      pool: mockPool,
      verificarConexion: async () => true,
    },
  };

  const { app } = require('../src/app');
  const { generarToken } = require('../src/utils/jwt');
  const server = http.createServer(app);
  const historiasAntes = mockPool.historias.length;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const token = generarToken({ userId: 1, email: 'prueba@odonton.local', rol: 'odontologo' });
    const primera = await requestJson(server, '/api/pacientes/1/ficha-clinica', token);
    const segunda = await requestJson(server, '/api/pacientes/1/ficha-clinica', token);

    assert.equal(primera.statusCode, 200);
    assert.equal(segunda.statusCode, 200);
    assert.equal(primera.data.paciente.id, 1, 'La ficha debe conservar los datos del paciente');
    assert.equal(primera.data.historialTurnos.total, 1, 'La ficha debe conservar el historial de turnos');
    assert.deepEqual(segunda.data, primera.data, 'Dos lecturas consecutivas deben devolver los mismos datos funcionales');
    assert.equal(mockPool.historias.length, historiasAntes, 'El GET no debe crear historias clinicas');
    assert.equal(
      mockPool.queries.filter((query) => /^INSERT INTO historias_clinicas/i.test(query)).length,
      0,
      'No debe ejecutarse INSERT INTO historias_clinicas',
    );

    console.log('OK - la ficha conserva paciente, turnos e historias existentes');
    console.log('OK - dos GET consecutivos no crean historias clinicas');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
