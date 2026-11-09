import { createAdminIdentity, getAdminIdentities, updateAdminIdentity } from '../api.js';
import { renderAlert } from '../components/alerts.js';

let users = [];
const byId = (id) => document.getElementById(id);
const ui = {
  alert: byId('alert-container'), tbody: byId('admin-users-tbody'), form: byId('admin-user-form'),
  id: byId('admin-user-id'), name: byId('admin-user-name'), email: byId('admin-user-email'),
  password: byId('admin-user-password'), canCharge: byId('admin-user-can-charge'), active: byId('admin-user-active'),
  professionalName: byId('admin-professional-name'), professionalActive: byId('admin-professional-active'),
  newButton: byId('admin-user-new'), cancelButton: byId('admin-user-cancel'),
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const roleInputs = () => [...document.querySelectorAll('input[name="admin-role"]')];

function render() {
  ui.tbody.innerHTML = users.map((user) => `<tr><td>${user.id}</td><td><strong>${escapeHtml(user.nombre)}</strong><br><small>${escapeHtml(user.email)}</small></td><td>${user.roles.map(escapeHtml).join(', ')}</td><td>${user.profesional_perfil_id ? `#${user.profesional_perfil_id} · ${escapeHtml(user.profesional_nombre)}${user.profesional_activo ? '' : ' (inactivo)'}` : '-'}</td><td>${user.activo ? 'Activo' : 'Inactivo'}${user.puede_cobrar ? ' · puede cobrar' : ''}</td><td class="text-end"><button class="btn btn-sm btn-outline-primary" data-edit-user="${user.id}" type="button">Editar</button></td></tr>`).join('');
}
async function load() { const data = await getAdminIdentities(); users = data.usuarios || []; render(); }
function open(user = null) {
  ui.form.reset(); ui.id.value = user?.id || ''; ui.name.value = user?.nombre || ''; ui.email.value = user?.email || '';
  ui.active.checked = user?.activo !== false; ui.canCharge.checked = user?.puede_cobrar === true;
  ui.professionalName.value = user?.profesional_nombre || ''; ui.professionalActive.checked = user?.profesional_activo !== false;
  roleInputs().forEach((input) => { input.checked = Boolean(user?.roles?.includes(input.value)); });
  ui.form.classList.remove('d-none');
}
export async function initAdminUsersView() {
  ui.newButton.addEventListener('click', () => open());
  ui.cancelButton.addEventListener('click', () => ui.form.classList.add('d-none'));
  ui.tbody.addEventListener('click', (event) => { const button = event.target.closest('[data-edit-user]'); if (button) open(users.find((user) => String(user.id) === button.dataset.editUser)); });
  ui.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = { nombre: ui.name.value.trim(), email: ui.email.value.trim(), password: ui.password.value || undefined,
      roles: roleInputs().filter((input) => input.checked).map((input) => input.value), activo: ui.active.checked,
      puede_cobrar: ui.canCharge.checked, profesional_nombre: ui.professionalName.value.trim(), profesional_activo: ui.professionalActive.checked };
    try { if (ui.id.value) await updateAdminIdentity(ui.id.value, payload); else await createAdminIdentity(payload); ui.form.classList.add('d-none'); await load(); renderAlert(ui.alert, 'Identidad guardada.', 'success'); }
    catch (error) { renderAlert(ui.alert, error.message, 'danger'); }
  });
  await load();
}
