import {
  activarPrestacion,
  createPrestacion,
  desactivarPrestacion,
  getPrestaciones,
  updatePrestacion,
} from '../api.js';
import { renderAlert } from '../components/alerts.js';

const state = {
  prestaciones: [],
  showInactivas: false,
  mode: 'create',
  editId: null,
};

const ui = {
  alertContainer: document.getElementById('alert-container'),
  tbody: document.getElementById('prestaciones-tbody'),
  toggleInactivas: document.getElementById('prestaciones-toggle-inactivas'),
  openCreateButton: document.getElementById('open-prestacion-modal'),
  form: document.getElementById('prestacion-form'),
  modalTitle: document.getElementById('prestacion-modal-label'),
  submitButton: document.getElementById('prestacion-submit-btn'),
  inputNombre: document.getElementById('prestacion-nombre'),
  inputDuracion: document.getElementById('prestacion-duracion'),
  inputPrecio: document.getElementById('prestacion-precio'),
  inputActiva: document.getElementById('prestacion-activa'),
};

const modal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('prestacion-modal'));

function formatPrecio(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `$ ${num.toFixed(2)}`;
}

function renderRows(prestaciones) {
  if (!prestaciones.length) {
    ui.tbody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary">Sin prestaciones</td></tr>';
    return;
  }

  ui.tbody.innerHTML = prestaciones
    .map((p) => {
      const estado = p.activo ? 'Activa' : 'Inactiva';
      const badge = p.activo ? 'bg-success' : 'bg-secondary';
      return `
        <tr>
          <td>${p.nombre}</td>
          <td>${p.duracion_minutos} min</td>
          <td>${formatPrecio(p.precio_base)}</td>
          <td><span class="badge ${badge}">${estado}</span></td>
          <td class="text-end">
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-secondary" type="button" data-action="edit" data-id="${p.id}">
                Editar
              </button>
              ${
                p.activo
                  ? `<button class="btn btn-sm btn-outline-danger" type="button" data-action="deactivate" data-id="${p.id}">Desactivar</button>`
                  : `<button class="btn btn-sm btn-outline-success" type="button" data-action="activate" data-id="${p.id}">Activar</button>`
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function openCreateModal() {
  state.mode = 'create';
  state.editId = null;
  ui.modalTitle.textContent = 'Nueva prestacion';
  ui.submitButton.textContent = 'Guardar';
  ui.form.reset();
  if (ui.inputActiva) ui.inputActiva.checked = true;
  modal?.show();
}

function openEditModal(prestacion) {
  state.mode = 'edit';
  state.editId = prestacion.id;
  ui.modalTitle.textContent = 'Editar prestacion';
  ui.submitButton.textContent = 'Guardar cambios';
  ui.inputNombre.value = prestacion.nombre || '';
  ui.inputDuracion.value = prestacion.duracion_minutos || '';
  ui.inputPrecio.value = prestacion.precio_base ?? '';
  if (ui.inputActiva) ui.inputActiva.checked = Boolean(prestacion.activo);
  modal?.show();
}

async function loadPrestaciones() {
  try {
    const data = await getPrestaciones({ all: state.showInactivas ? 'true' : 'false' });
    state.prestaciones = data.prestaciones || [];
    renderRows(state.prestaciones);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function bindTableActions() {
  ui.tbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    const prestacion = state.prestaciones.find((p) => String(p.id) === String(id));

    try {
      if (action === 'edit' && prestacion) {
        openEditModal(prestacion);
        return;
      }

      if (action === 'deactivate') {
        await desactivarPrestacion(id);
        renderAlert(ui.alertContainer, 'Prestacion desactivada', 'success');
        await loadPrestaciones();
        return;
      }

      if (action === 'activate') {
        await activarPrestacion(id);
        renderAlert(ui.alertContainer, 'Prestacion activada', 'success');
        await loadPrestaciones();
        return;
      }
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

function bindForm() {
  ui.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      nombre: ui.inputNombre.value.trim(),
      duracion_minutos: Number(ui.inputDuracion.value),
      precio_base: Number(ui.inputPrecio.value),
      activo: ui.inputActiva?.checked ?? true,
    };

    try {
      if (state.mode === 'edit' && state.editId) {
        await updatePrestacion(state.editId, payload);
        renderAlert(ui.alertContainer, 'Prestacion actualizada', 'success');
      } else {
        await createPrestacion(payload);
        renderAlert(ui.alertContainer, 'Prestacion creada', 'success');
      }
      modal?.hide();
      await loadPrestaciones();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

function bindToggle() {
  ui.toggleInactivas?.addEventListener('change', async () => {
    state.showInactivas = ui.toggleInactivas.checked;
    await loadPrestaciones();
  });
}

function bindOpenCreate() {
  ui.openCreateButton?.addEventListener('click', openCreateModal);
}

export async function initPrestacionesView() {
  bindOpenCreate();
  bindForm();
  bindTableActions();
  bindToggle();
  await loadPrestaciones();
}
