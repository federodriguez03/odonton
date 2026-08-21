const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveIncomingPhoneForStorage,
} = require('../src/services/whatsappClient.service');

function result(rows = []) {
  return { rows, rowCount: rows.length };
}

const state = {
  pacientes: [],
  solicitudes: [],
  nextPacienteId: 1,
  nextSolicitudId: 1,
  patientUpdates: 0,
};

const mockPool = {
  async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ').trim();

    if (/^(CREATE|ALTER)/.test(text) || text.startsWith('UPDATE turno_solicitudes SET')) {
      return result();
    }

    if (text.startsWith('SELECT id, nombre, apellido, dni, telefono FROM pacientes WHERE dni = $1')) {
      const paciente = state.pacientes.find((item) => item.dni === params[0]);
      return result(paciente ? [{ ...paciente }] : []);
    }

    if (text.startsWith('UPDATE pacientes SET telefono = $1')) {
      const paciente = state.pacientes.find((item) => Number(item.id) === Number(params[1]));
      if (!paciente || String(paciente.telefono || '').trim()) return result();
      paciente.telefono = params[0];
      state.patientUpdates += 1;
      return result([{ ...paciente }]);
    }

    if (text.startsWith('INSERT INTO turno_solicitudes')) {
      const solicitud = {
        id: state.nextSolicitudId++,
        tipo_solicitud: params[0],
        estado: 'pendiente',
        paciente_id: params[1],
        nombre_apellido: params[2],
        dni: params[3],
        telefono: params[4],
        motivo: params[5],
        preferencia_horaria: params[6],
        turno_id: params[7],
        observaciones: params[8],
      };
      state.solicitudes.push(solicitud);
      return result([{ ...solicitud }]);
    }

    throw new Error(`Consulta no contemplada: ${text}`);
  },
};

const dbPath = require.resolve('../src/config/db');
const pacientesServicePath = require.resolve('../src/services/pacientesService');
const auditoriaServicePath = require.resolve('../src/services/auditoriaService');

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool: mockPool },
};
require.cache[pacientesServicePath] = {
  id: pacientesServicePath,
  filename: pacientesServicePath,
  loaded: true,
  exports: {
    async crearPaciente(payload) {
      const paciente = { id: state.nextPacienteId++, ...payload };
      state.pacientes.push(paciente);
      return { ...paciente };
    },
  },
};
require.cache[auditoriaServicePath] = {
  id: auditoriaServicePath,
  filename: auditoriaServicePath,
  loaded: true,
  exports: { registrarAuditoria: async () => ({}) },
};

const {
  createPacienteMinimo,
} = require('../src/services/whatsappPaciente.service');
const {
  crearSolicitudTurnoPendiente,
} = require('../src/services/turnoSolicitudesService');
const {
  determinarTipoPaciente,
} = require('../src/domain/turnoActivityRules');

async function run() {
  const numero = '5493515555555';
  const numeroPaciente = '3515555555';

  const directo = await resolveIncomingPhoneForStorage(
    { from: numero },
    numero,
    null,
  );
  assert.equal(directo, numero, 'A. Debe aceptar un remitente telefonico valido');

  const desdeCus = await resolveIncomingPhoneForStorage(
    { from: `${numero}@c.us` },
    `${numero}@c.us`,
    null,
  );
  assert.equal(desdeCus, numero, 'B. Debe retirar @c.us antes de persistir');
  assert.equal(desdeCus.includes('@'), false);

  const lid = '123456789012345@lid';
  const sinResolucion = await resolveIncomingPhoneForStorage(
    {
      from: lid,
      async getContact() {
        return { id: { server: 'lid', user: '123456789012345', _serialized: lid } };
      },
    },
    lid,
    { getContactLidAndPhone: async () => [{ lid, pn: undefined }] },
  );
  assert.equal(sinResolucion, null, 'C. Un LID no resoluble no debe convertirse en telefono');

  const lidResuelto = await resolveIncomingPhoneForStorage(
    { from: lid, getContact: async () => null },
    lid,
    { getContactLidAndPhone: async () => [{ lid, pn: `${numero}@c.us` }] },
  );
  assert.equal(lidResuelto, numero, 'C. Debe usar el PN confiable asociado al LID');

  const pacienteDesdeNumero = await createPacienteMinimo({
    nombre: 'Paciente',
    apellido: 'Desde Numero',
    dni: '30111221',
    phone: numero,
    conversationId: 9,
  });
  assert.equal(pacienteDesdeNumero.telefono, numeroPaciente, 'A. El paciente nuevo debe guardar el remitente valido');

  const pacienteNuevo = await createPacienteMinimo({
    nombre: 'Paciente',
    apellido: 'Nuevo',
    dni: '30111222',
    phone: `${numero}@c.us`,
    conversationId: 10,
  });
  assert.equal(pacienteNuevo.telefono, numeroPaciente, 'B. El paciente nuevo debe respetar el formato nacional de la BD');
  assert.equal(pacienteNuevo.telefono.includes('@'), false);

  const pacienteSinNumero = await createPacienteMinimo({
    nombre: 'Paciente',
    apellido: 'Sin Numero',
    dni: '30222333',
    phone: lid,
    storagePhone: null,
    conversationId: 11,
  });
  assert.equal(pacienteSinNumero.telefono, null, 'C. No debe guardar el LID como telefono');

  state.pacientes.push({
    id: state.nextPacienteId++,
    nombre: 'Paciente',
    apellido: 'Con Telefono',
    dni: '30333444',
    telefono: '5493514444444',
  });
  const updatesAntes = state.patientUpdates;
  const existenteConTelefono = await createPacienteMinimo({
    nombre: 'Nombre Ignorado',
    apellido: 'Apellido Ignorado',
    dni: '30333444',
    phone: `${numero}@c.us`,
  });
  assert.equal(existenteConTelefono.telefono, '5493514444444', 'D. No debe sobrescribir un telefono existente');
  assert.equal(state.patientUpdates, updatesAntes);

  state.pacientes.push({
    id: state.nextPacienteId++,
    nombre: 'Paciente',
    apellido: 'Completable',
    dni: '30444555',
    telefono: null,
  });
  const existenteSinTelefono = await createPacienteMinimo({
    nombre: 'Nombre Ignorado',
    apellido: 'Apellido Ignorado',
    dni: '30444555',
    phone: lid,
    storagePhone: numero,
  });
  assert.equal(existenteSinTelefono.telefono, numeroPaciente, 'E. Debe completar un telefono vacio con un numero confiable');

  const identificacion = determinarTipoPaciente(null);
  const solicitud = await crearSolicitudTurnoPendiente({
    tipoSolicitud: identificacion.tipoSolicitud,
    pacienteId: pacienteNuevo.id,
    nombreApellido: `${pacienteNuevo.nombre} ${pacienteNuevo.apellido}`,
    dni: pacienteNuevo.dni,
    telefono: pacienteNuevo.telefono,
    motivo: 'Control',
    preferenciaHoraria: 'Por la tarde',
    turnoId: 100,
  });
  assert.equal(solicitud.tipo_solicitud, 'primera_consulta', 'F. La solicitud debe conservar primera_consulta');
  assert.equal(solicitud.estado, 'pendiente', 'F. La solicitud debe crearse normalmente');
  assert.equal(solicitud.paciente_id, pacienteNuevo.id);

  const clientSource = fs.readFileSync(
    path.join(__dirname, '../src/services/whatsappClient.service.js'),
    'utf8',
  );
  const autogestionSource = fs.readFileSync(
    path.join(__dirname, '../src/services/whatsappAutogestion.service.js'),
    'utf8',
  );
  assert.equal(clientSource.includes('processAutogestionMessage(chatId, text, { storagePhone })'), true);
  assert.equal(autogestionSource.includes('storagePhone: data.telefono_resuelto || null'), true);

  console.log('OK: telefono de pacientes creados desde WhatsApp (casos A-F, sin WhatsApp real)');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
