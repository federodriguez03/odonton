/**
 * JavaScript principal del frontend
 * Funcionalidad general y utilidades
 */

// Configuración de la API
const API_BASE_URL = 'http://localhost:3000/api';

// Almacenamiento de token
const getToken = () => localStorage.getItem('token');
const setToken = (token) => localStorage.setItem('token', token);
const removeToken = () => localStorage.removeItem('token');

/**
 * Realiza una petición a la API
 */
async function apiCall(endpoint, method = 'GET', data = null, requireAuth = true) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (requireAuth) {
    const token = getToken();
    if (!token) {
      window.location.href = '/pages/login.html';
      return null;
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
  };

  if (data) {
    config.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (!response.ok) {
      if (response.status === 401) {
        removeToken();
        window.location.href = '/pages/login.html';
        return null;
      }
      const error = await response.json();
      throw new Error(error.error || 'Error en la solicitud');
    }

    return await response.json();
  } catch (err) {
    console.error('Error en apiCall:', err);
    showAlert('error', err.message);
    return null;
  }
}

/**
 * Muestra una alerta
 */
function showAlert(type, message) {
  const alertClass = `alert-${type === 'error' ? 'danger' : type}`;
  const alertHTML = `
    <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
  
  const alertContainer = document.getElementById('alertContainer') || document.body;
  alertContainer.insertAdjacentHTML('beforeend', alertHTML);
}

/**
 * Formatea una fecha
 */
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Listener para mantener sesión actualizada
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
});

/**
 * Actualiza la interfaz según el estado de autenticación
 */
async function updateAuthUI() {
  const token = getToken();
  const loginBtn = document.getElementById('loginBtn');

  if (token) {
    const user = await apiCall('/auth/me');
    if (user) {
      if (loginBtn) {
        loginBtn.innerHTML = `<i class="bi bi-box-arrow-right"></i> ${user.user.email}`;
        loginBtn.href = '#';
        loginBtn.onclick = () => logout();
      }
    }
  }
}

/**
 * Cierra sesión
 */
async function logout() {
  await apiCall('/auth/logout', 'POST');
  removeToken();
  window.location.href = '/';
}

// Exportar para uso global
window.apiCall = apiCall;
window.showAlert = showAlert;
window.formatDate = formatDate;
window.logout = logout;
