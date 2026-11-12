const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const TOKEN_KEY = 'odonton_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export const getUsuarios = () => request('/api/usuarios');
export const getPerfilesUsuarios = () => request('/api/usuarios/perfiles');
export const createUsuario = (payload) => request('/api/usuarios', { method: 'POST', body: JSON.stringify(payload) });
export const updateUsuario = (id, payload) => request(`/api/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const linkPerfilUsuario = (id, payload) => request(`/api/usuarios/${id}/perfil`, { method: 'POST', body: JSON.stringify(payload) });
export const resetUsuarioPassword = (id, passwordTemporal) => request(`/api/usuarios/${id}/restablecer-password`, { method: 'POST', body: JSON.stringify({ passwordTemporal }) });
export const changeOwnPassword = (payload) => request('/api/auth/cambiar-password', { method: 'POST', body: JSON.stringify(payload) });

async function request(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      window.dispatchEvent(new Event('auth:logout'));
    }
    const fallback = response.status === 401 ? 'La sesion no es valida o vencio'
      : response.status === 403 ? 'No tiene permiso para realizar esta operacion'
        : response.status >= 500 ? 'El servicio no esta disponible temporalmente' : `Error ${response.status}`;
    const error = new Error(data?.mensaje || fallback);
    error.code = data?.codigo;
    error.status = response.status;
    error.fields = data?.errores || null;
    throw error;
  }

  return data;
}

async function requestForm(path, formData, options = {}) {
  const token = getToken();
  // No se fija Content-Type: el navegador debe generar el boundary del FormData.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    body: formData,
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      window.dispatchEvent(new Event('auth:logout'));
    }
    const fallback = response.status === 401 ? 'La sesion no es valida o vencio'
      : response.status === 403 ? 'No tiene permiso para realizar esta operacion'
        : response.status >= 500 ? 'El servicio no esta disponible temporalmente' : `Error ${response.status}`;
    const error = new Error(data?.mensaje || fallback);
    error.code = data?.codigo;
    error.status = response.status;
    throw error;
  }

  return data;
}

export function getPacientes(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/pacientes${suffix}`);
}

export function getPacienteAdministrativo(id) {
  return request(`/api/pacientes/${id}`);
}

export function createPaciente(payload) {
  return request('/api/pacientes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePaciente(id, payload) {
  return request(`/api/pacientes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getFichaClinica(id, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/pacientes/${id}/ficha-clinica${suffix}`);
}

export function getDeclaracionSalud(pacienteId) {
  return request(`/api/pacientes/${pacienteId}/declaracion-salud`);
}

export function saveDeclaracionSalud(pacienteId, payload) {
  return request(`/api/pacientes/${pacienteId}/declaracion-salud`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createAtencion(pacienteId, payload) {
  return request(`/api/pacientes/${pacienteId}/atenciones`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAtencion(pacienteId, atencionId, payload) {
  return request(`/api/pacientes/${pacienteId}/atenciones/${atencionId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getOdontogramaPaciente(pacienteId) {
  return request(`/api/odontograma/${pacienteId}`);
}

export function postOdontograma(payload) {
  return request('/api/odontograma', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getOdontogramaReferencias(pacienteId = null) {
  const query = pacienteId ? `?paciente_id=${pacienteId}` : '';
  return request(`/api/odontograma/referencias${query}`);
}

export function getProtesisFijas(pacienteId) {
  const query = new URLSearchParams({ pacienteId });
  return request(`/api/protesis-fijas?${query.toString()}`);
}

export function getProtesisRemovibles(pacienteId) {
  const query = new URLSearchParams({ pacienteId });
  return request(`/api/protesis-removibles?${query.toString()}`);
}

export function getTratamientos(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/tratamientos${suffix}`);
}

export function getTurnos(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/turnos${suffix}`);
}

export function getProfesionalesTurnos() {
  return request('/api/turnos/profesionales');
}

export function getDisponibilidadTurnos(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/turnos/disponibilidad${suffix}`);
}

export function createTurno(payload) {
  return request('/api/turnos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateTurno(id, payload) {
  return request(`/api/turnos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function reprogramarTurno(id, payload) {
  return request(`/api/turnos/${id}/reprogramar`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function confirmarSolicitudTurno(id, payload) {
  return request(`/api/turnos/${id}/confirmar-solicitud`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function rechazarSolicitudTurno(id, payload = {}) {
  return request(`/api/turnos/${id}/rechazar-solicitud`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function cancelarTurno(id, payload = {}) {
  return request(`/api/turnos/${id}/cancelar`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function enviarRecordatorioWhatsappTurno(id) {
  return request(`/api/turnos/${id}/recordatorios/whatsapp`, {
    method: 'POST',
  });
}

export function getPrestaciones(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/prestaciones${suffix}`);
}

export function createPrestacion(payload) {
  return request('/api/prestaciones', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePrestacion(id, payload) {
  return request(`/api/prestaciones/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function activarPrestacion(id) {
  return request(`/api/prestaciones/${id}/activar`, { method: 'PUT' });
}

export function desactivarPrestacion(id) {
  return request(`/api/prestaciones/${id}/desactivar`, { method: 'PUT' });
}

export function previewArancelesCsv(formData) {
  return requestForm('/api/prestaciones/aranceles/vista-previa', formData);
}

export function confirmArancelesCsv(formData) {
  return requestForm('/api/prestaciones/aranceles/confirmar', formData);
}

export function previewCargaCatalogo(versionId = '') {
  const suffix = versionId ? `?version_id=${encodeURIComponent(versionId)}` : '';
  return request(`/api/prestaciones/aranceles/carga-catalogo/vista-previa${suffix}`);
}

export function confirmCargaCatalogo(payload) {
  return request('/api/prestaciones/aranceles/carga-catalogo/confirmar', { method: 'POST', body: JSON.stringify(payload) });
}

export function configurarDuracionPrestaciones(payload) {
  return request('/api/prestaciones/configurar-duracion', { method: 'PUT', body: JSON.stringify(payload) });
}

export function getResumenClinicoFinanciero(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/reportes/resumen${suffix}`);
}

export function getEstadisticas(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/estadisticas${suffix}`);
}

export function getCargos(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/cargos${suffix}`);
}

export function getCargoById(id) {
  return request(`/api/cargos/${id}`);
}

export function createCargo(payload) {
  return request('/api/cargos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getPagos(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/pagos${suffix}`);
}

export function getConstanciaPago(id) {
  return request(`/api/pagos/${id}/constancia`);
}

export function createPago(payload) {
  return request('/api/pagos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function anularPago(id, payload) {
  return request(`/api/pagos/${id}/anular`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getDocumentos(pacienteId, historiaClinicaId = null) {
  const historiaQuery = historiaClinicaId ? `&historia_clinica_id=${historiaClinicaId}` : '';
  return request(`/api/documentos?paciente_id=${pacienteId}${historiaQuery}`);
}

export function uploadDocumento(formData) {
  return requestForm('/api/documentos/subir', formData);
}

function getDownloadFilename(response, fallback) {
  const disposition = response.headers.get('Content-Disposition') || '';
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  const rawFilename = encodedMatch?.[1] || plainMatch?.[1];

  if (!rawFilename) return fallback;

  try {
    return decodeURIComponent(rawFilename);
  } catch (_) {
    return rawFilename;
  }
}

export async function downloadDocumento(id) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/api/documentos/descargar/${id}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearToken();
      window.dispatchEvent(new Event('auth:logout'));
    }
    throw new Error(data?.mensaje || `Error ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = getDownloadFilename(response, `documento-${id}`);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export async function getDocumentoPreview(id) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/api/documentos/descargar/${id}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearToken();
      window.dispatchEvent(new Event('auth:logout'));
    }
    throw new Error(data?.mensaje || `Error ${response.status}`);
  }

  return {
    blob: await response.blob(),
    nombre: getDownloadFilename(response, `documento-${id}`),
  };
}

export function deleteDocumento(id) {
  return request(`/api/documentos/${id}`, { method: 'DELETE' });
}

export function login(payload) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getMe() {
  return request('/api/auth/me');
}

export function getConfiguracion() {
  return request('/api/configuracion');
}

export function updateConfiguracion(payload) {
  return request('/api/configuracion', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getConfiguracionOdontogramaReferencias() {
  return request('/api/configuracion/odontograma-referencias');
}

export function createConfiguracionOdontogramaReferencia(payload) {
  return request('/api/configuracion/odontograma-referencias', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateConfiguracionOdontogramaReferencia(id, payload) {
  return request(`/api/configuracion/odontograma-referencias/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function getWhatsappStatus() {
  return request('/api/whatsapp/status');
}

export function getWhatsappQr() {
  return request('/api/whatsapp/qr');
}

export function initializeWhatsapp() {
  return request('/api/whatsapp/connect', { method: 'POST' });
}

export function resetWhatsapp() {
  return request('/api/whatsapp/restart', { method: 'POST' });
}

export function disconnectWhatsapp() {
  return request('/api/whatsapp/disconnect', { method: 'POST' });
}

export function logoutWhatsapp() {
  return request('/api/whatsapp/logout', { method: 'POST' });
}
