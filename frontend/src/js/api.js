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
    throw new Error(data?.mensaje || `Error ${response.status}`);
  }

  return data;
}

async function requestForm(path, formData, options = {}) {
  const token = getToken();
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
    throw new Error(data?.mensaje || `Error ${response.status}`);
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

export function getOdontograma(id) {
  return request(`/api/pacientes/${id}/odontograma`);
}

export function updateOdontogramaPieza(id, piezaNumero, payload) {
  return request(`/api/pacientes/${id}/odontograma/piezas/${piezaNumero}`, {
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

// Tratamientos / prótesis se integrarán en odontograma, se quitan helpers separados

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

export function procesarRecordatoriosTurnos() {
  return request('/api/turnos/recordatorios/procesar', {
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

export function getReporteAtencionFacturacion(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/reportes/atencion-facturacion${suffix}`);
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

export function createPago(payload) {
  return request('/api/pagos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePago(id, payload) {
  return request(`/api/pagos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getResumenPagosPaciente(pacienteId) {
  return request(`/api/pagos/resumen/${pacienteId}`);
}

export function getDocumentos(pacienteId) {
  return request(`/api/documentos?paciente_id=${pacienteId}`);
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
