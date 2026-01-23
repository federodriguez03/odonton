/**
 * Lógica de gestión de pacientes
 */

let currentPatientId = null;
let allPatients = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Verificar autenticación
  if (!getToken()) {
    window.location.href = '/pages/login.html';
    return;
  }

  // Cargar pacientes
  await loadPatients();

  // Busqueda en tiempo real
  document.getElementById('searchInput').addEventListener('input', filterPatients);
});

/**
 * Carga la lista de pacientes
 */
async function loadPatients() {
  const response = await apiCall('/patients');
  if (response && response.patients) {
    allPatients = response.patients;
    displayPatients(allPatients);
  }
}

/**
 * Muestra los pacientes en la tabla
 */
function displayPatients(patients) {
  const tbody = document.getElementById('patientsTableBody');

  if (patients.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">
          <i class="bi bi-inbox"></i> No hay pacientes registrados
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = patients.map(patient => `
    <tr>
      <td>
        <strong>${patient.name}</strong>
      </td>
      <td>${patient.dni || '-'}</td>
      <td>${patient.phone || '-'}</td>
      <td><small>${patient.email || '-'}</small></td>
      <td><small>${formatDate(patient.created_at)}</small></td>
      <td>
        <div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn btn-outline-info" onclick="viewPatient(${patient.id})" title="Ver">
            <i class="bi bi-eye"></i>
          </button>
          <button type="button" class="btn btn-outline-primary" onclick="editPatient(${patient.id})" title="Editar">
            <i class="bi bi-pencil"></i>
          </button>
          <button type="button" class="btn btn-outline-danger" onclick="deletePatient(${patient.id})" title="Eliminar">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

/**
 * Filtra pacientes por búsqueda
 */
function filterPatients() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const filtered = allPatients.filter(patient =>
    patient.name.toLowerCase().includes(searchTerm) ||
    (patient.dni && patient.dni.includes(searchTerm)) ||
    (patient.email && patient.email.toLowerCase().includes(searchTerm))
  );
  displayPatients(filtered);
}

/**
 * Abre modal para ver detalles del paciente
 */
async function viewPatient(id) {
  currentPatientId = id;
  const patient = await apiCall(`/patients/${id}`);
  
  if (patient) {
    const content = document.getElementById('viewPatientContent');
    content.innerHTML = `
      <div class="row mb-3">
        <div class="col-md-6">
          <p><strong>Nombre:</strong> ${patient.patient.name}</p>
          <p><strong>DNI:</strong> ${patient.patient.dni}</p>
          <p><strong>Teléfono:</strong> ${patient.patient.phone || '-'}</p>
        </div>
        <div class="col-md-6">
          <p><strong>Email:</strong> ${patient.patient.email || '-'}</p>
          <p><strong>Fecha nacimiento:</strong> ${patient.patient.birthdate ? formatDate(patient.patient.birthdate) : '-'}</p>
          <p><strong>Registro:</strong> ${formatDate(patient.patient.created_at)}</p>
        </div>
      </div>
      <div class="mb-3">
        <p><strong>Dirección:</strong> ${patient.patient.address || '-'}</p>
      </div>
      <div>
        <p><strong>Observaciones:</strong></p>
        <p>${patient.patient.observations || '-'}</p>
      </div>
    `;
    
    new bootstrap.Modal(document.getElementById('viewPatientModal')).show();
  }
}

/**
 * Abre modal para editar paciente
 */
async function editPatient(id) {
  if (id) {
    currentPatientId = id;
    const patient = await apiCall(`/patients/${id}`);
    
    if (patient) {
      document.getElementById('patientName').value = patient.patient.name;
      document.getElementById('patientDni').value = patient.patient.dni;
      document.getElementById('patientEmail').value = patient.patient.email || '';
      document.getElementById('patientPhone').value = patient.patient.phone || '';
      document.getElementById('patientBirthdate').value = patient.patient.birthdate || '';
      document.getElementById('patientAddress').value = patient.patient.address || '';
      document.getElementById('patientObservations').value = patient.patient.observations || '';
      
      document.getElementById('modalTitle').textContent = 'Editar paciente';
      new bootstrap.Modal(document.getElementById('patientModal')).show();
      
      // Cerrar modal de vista
      bootstrap.Modal.getInstance(document.getElementById('viewPatientModal'))?.hide();
    }
  }
}

/**
 * Guarda un paciente nuevo o editado
 */
async function savePatient() {
  const form = document.getElementById('patientForm');
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);

  const method = currentPatientId ? 'PUT' : 'POST';
  const endpoint = currentPatientId ? `/patients/${currentPatientId}` : '/patients';

  const result = await apiCall(endpoint, method, data);

  if (result) {
    showAlert('success', currentPatientId ? 'Paciente actualizado' : 'Paciente creado exitosamente');
    bootstrap.Modal.getInstance(document.getElementById('patientModal')).hide();
    await loadPatients();
  }
}

/**
 * Elimina un paciente
 */
async function deletePatient(id) {
  if (confirm('¿Está seguro de que desea eliminar este paciente?')) {
    const result = await apiCall(`/patients/${id}`, 'DELETE');
    if (result) {
      showAlert('success', 'Paciente eliminado');
      await loadPatients();
    }
  }
}

/**
 * Resetea el formulario
 */
function resetPatientForm() {
  currentPatientId = null;
  document.getElementById('patientForm').reset();
  document.getElementById('modalTitle').textContent = 'Nuevo paciente';
  document.getElementById('patientDni').disabled = false;
}

// Exportar funciones globales
window.viewPatient = viewPatient;
window.editPatient = editPatient;
window.deletePatient = deletePatient;
window.savePatient = savePatient;
window.resetPatientForm = resetPatientForm;
