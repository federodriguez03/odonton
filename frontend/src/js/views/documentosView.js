import { deleteDocumento, getDocumentos, uploadDocumento } from '../api.js';
import { renderAlert } from '../components/alerts.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const ui = {
  alertContainer: document.getElementById('alert-container'),
  form: document.getElementById('documentos-form'),
  pacienteId: document.getElementById('documentos-paciente-id'),
  descripcion: document.getElementById('documentos-descripcion'),
  archivo: document.getElementById('documentos-archivo'),
  tbody: document.getElementById('documentos-tbody'),
  refresh: document.getElementById('documentos-refresh'),
};

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-AR');
}

function renderRows(documentos = []) {
  if (!ui.tbody) return;

  if (!documentos.length) {
    ui.tbody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary">Sin documentos</td></tr>';
    return;
  }

  ui.tbody.innerHTML = documentos
    .map((doc) => {
      const downloadUrl = `${API_BASE_URL}/api/documentos/descargar/${doc.id}`;
      return `
        <tr>
          <td>${doc.nombre_archivo}</td>
          <td>${doc.tipo_archivo}</td>
          <td>${doc.descripcion || '-'}</td>
          <td>${formatDate(doc.fecha_subida)}</td>
          <td class="text-end">
            <div class="btn-group">
              <a class="btn btn-sm btn-outline-primary" href="${downloadUrl}" target="_blank" rel="noreferrer">Descargar</a>
              <button class="btn btn-sm btn-outline-danger" type="button" data-action="delete" data-id="${doc.id}">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function loadDocumentos() {
  const pacienteId = ui.pacienteId?.value?.trim();
  if (!pacienteId) {
    renderRows([]);
    return;
  }

  try {
    const data = await getDocumentos(pacienteId);
    renderRows(data.documentos || []);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function bindForm() {
  if (!ui.form) return;

  ui.form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const pacienteId = ui.pacienteId.value.trim();
    const descripcion = ui.descripcion.value.trim();
    const archivo = ui.archivo.files?.[0];

    if (!pacienteId) {
      renderAlert(ui.alertContainer, 'Ingrese el ID del paciente.', 'warning');
      return;
    }

    if (!archivo) {
      renderAlert(ui.alertContainer, 'Seleccione un archivo.', 'warning');
      return;
    }

    const formData = new FormData();
    formData.append('paciente_id', pacienteId);
    formData.append('descripcion', descripcion);
    formData.append('archivo', archivo);

    try {
      const response = await uploadDocumento(formData);
      renderAlert(ui.alertContainer, response.mensaje || 'Documento subido.', 'success');
      ui.descripcion.value = '';
      ui.archivo.value = '';
      await loadDocumentos();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

function bindRefresh() {
  ui.refresh?.addEventListener('click', async () => {
    await loadDocumentos();
  });

  ui.pacienteId?.addEventListener('change', async () => {
    await loadDocumentos();
  });
}

function bindDelete() {
  ui.tbody?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="delete"]');
    if (!button) return;

    const id = button.dataset.id;
    if (!id) return;

    try {
      await deleteDocumento(id);
      renderAlert(ui.alertContainer, 'Documento eliminado.', 'success');
      await loadDocumentos();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

export async function initDocumentosView() {
  if (!ui.form || !ui.tbody) return;
  bindForm();
  bindRefresh();
  bindDelete();
  await loadDocumentos();
}
