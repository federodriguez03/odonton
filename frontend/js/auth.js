/**
 * Funcionalidad de autenticación
 */

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // Redirigir si ya está autenticado
  if (localStorage.getItem('token')) {
    window.location.href = '/pages/dashboard.html';
  }
});

/**
 * Maneja el envío del formulario de login
 */
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const result = await apiCall('/auth/login', 'POST', { email, password }, false);

  if (result && result.token) {
    // Guardar token
    setToken(result.token);

    // Mostrar mensaje de éxito
    showAlert('success', '¡Bienvenido! Redirigiendo...');

    // Redirigir después de 1.5 segundos
    setTimeout(() => {
      window.location.href = '/pages/dashboard.html';
    }, 1500);
  }
}

// Exportar función
window.handleLogin = handleLogin;
