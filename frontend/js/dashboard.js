/**
 * Lógica del dashboard
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Verificar autenticación
  if (!getToken()) {
    window.location.href = '/pages/login.html';
    return;
  }

  // Cargar datos del usuario
  await loadUserData();

  // Cargar estadísticas (simuladas por ahora)
  loadDashboardStats();
});

/**
 * Carga datos del usuario autenticado
 */
async function loadUserData() {
  const user = await apiCall('/auth/me');
  if (user) {
    document.getElementById('userEmail').textContent = user.user.email;
    document.getElementById('dashboardUserEmail').textContent = user.user.email.split('@')[0];
  }
}

/**
 * Carga estadísticas del dashboard
 */
async function loadDashboardStats() {
  try {
    // Cargar pacientes
    const patientsResponse = await apiCall('/patients');
    if (patientsResponse) {
      document.getElementById('patientCount').textContent = patientsResponse.patients?.length || 0;
    }

    // Simulación de otros stats (se implementarán con endpoints reales)
    document.getElementById('appointmentTodayCount').textContent = '3';
    document.getElementById('monthRevenue').textContent = '$45,000';
    document.getElementById('treatmentCount').textContent = '12';

  } catch (err) {
    console.error('Error cargando estadísticas:', err);
  }
}

/**
 * Navega a gestión de pacientes
 */
function goToPatients(e) {
  e.preventDefault();
  window.location.href = '/pages/patients.html';
}

/**
 * Muestra notificación de feature en desarrollo
 */
function comingSoon(e) {
  e.preventDefault();
  showAlert('info', '⏳ Esta funcionalidad estará disponible próximamente');
}

// Exportar funciones globales
window.goToPatients = goToPatients;
window.comingSoon = comingSoon;
