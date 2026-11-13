import { initPacientesView } from './views/pacientesView.js';
import { initTurnosView } from './views/turnosView.js';
import { initPrestacionesView } from './views/prestacionesView.js';
import { initPagosView } from './views/pagosView.js';
import { initReportesView } from './views/reportesView.js';
import { initConfiguracionView, startWhatsappStatusPolling, stopWhatsappStatusPolling } from './views/configuracionView.js';
import { initUsuariosView } from './views/usuariosView.js';
import { loadDashboard } from '../pages/dashboard.js';
import { changeOwnPassword, clearToken, getMe, getToken, login, setToken } from './api.js';
import { renderAlert } from './components/alerts.js';

const ui = {
  appShell: document.getElementById('app-shell'),
  loginScreen: document.getElementById('login-screen'),
  loadingScreen: document.getElementById('loading-screen'),
  loginForm: document.getElementById('login-form'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  rememberEmail: document.getElementById('remember-email'),
  loginError: document.getElementById('login-error'),
  passwordScreen: document.getElementById('password-change-screen'),
  passwordForm: document.getElementById('password-change-form'),
  userName: document.getElementById('user-name'),
  userEmail: document.getElementById('user-email'),
  logoutBtn: document.getElementById('logout-btn'),
  alertContainer: document.getElementById('alert-container'),
};

const REMEMBER_EMAIL_KEY = 'odonton_email';
const ACTIVE_SECTION_KEY = 'odonton_active_section';
const SECTION_MAP = {
  dashboard: 'section-dashboard',
  pacientes: 'section-pacientes',
  turnos: 'section-turnos',
  prestaciones: 'section-prestaciones',
  reportes: 'section-reportes',
  pagos: 'section-pagos',
  configuracion: 'section-configuracion',
};
let appInitialized = false;
let usuariosInitialized = false;
let currentUser = null;

function allowedSections(user) {
  const allowed = new Set();
  const permissions = user?.permisos || {};
  if (permissions.acceso_total) ['dashboard', 'prestaciones', 'configuracion'].forEach((section) => allowed.add(section));
  if (permissions.turnos) allowed.add('turnos');
  if (permissions.pacientes_administrativos) allowed.add('pacientes');
  if (permissions.finanzas_operativas) allowed.add('pagos');
  if (permissions.reportes_operativos) allowed.add('reportes');
  return allowed;
}

function configureNavigation(user) {
  const allowed = allowedSections(user);
  document.querySelectorAll('#main-tabs .nav-link').forEach((tab) => {
    tab.closest('li')?.classList.toggle('d-none', !allowed.has(tab.dataset.section));
  });
}

function setLoginMessage(message = '') {
  if (!ui.loginError) return;
  ui.loginError.replaceChildren();
  if (message) {
    const icon = document.createElement('i');
    icon.className = 'bi bi-exclamation-octagon-fill alert-icon';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'alert-message';
    text.textContent = message;
    ui.loginError.append(icon, text);
  }
  ui.loginError.classList.toggle('d-none', !message);
}

function getStoredSection() {
  try {
    return sessionStorage.getItem(ACTIVE_SECTION_KEY);
  } catch (_) {
    return null;
  }
}

function storeSection(section) {
  try {
    sessionStorage.setItem(ACTIVE_SECTION_KEY, section);
  } catch (_) {
    // La navegación sigue funcionando aunque el navegador bloquee sessionStorage.
  }
}

function clearStoredSection() {
  try {
    sessionStorage.removeItem(ACTIVE_SECTION_KEY);
  } catch (_) {
    // La limpieza de sesión no debe impedir el logout.
  }
}

function activateSection(requestedSection, { persist = true } = {}) {
  const tabs = Array.from(document.querySelectorAll('#main-tabs .nav-link'));
  const requestedTab = tabs.find((tab) => tab.dataset.section === requestedSection && !tab.closest('li')?.classList.contains('d-none'));
  const fallback = currentUser?.permisos?.acceso_total ? 'dashboard' : 'turnos';
  const section = requestedTab && SECTION_MAP[requestedSection] ? requestedSection : fallback;

  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.section === section));
  Object.entries(SECTION_MAP).forEach(([key, id]) => {
    const element = document.getElementById(id);
    if (element) element.classList.toggle('d-none', section !== key);
  });

  if (section === 'configuracion' && currentUser?.permisos?.configurar_consultorio) startWhatsappStatusPolling();
  else stopWhatsappStatusPolling();

  if (persist) storeSection(section);
  return section;
}

function bindTabs() {
  const tabs = Array.from(document.querySelectorAll('#main-tabs .nav-link'));

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activateSection(tab.dataset.section);
    });
  });
}

function showLoginScreen(message = '') {
  ui.passwordScreen?.classList.add('d-none');
  ui.loadingScreen?.classList.add('d-none');
  ui.loginScreen?.classList.remove('d-none');
  ui.appShell?.classList.add('d-none');
  if (ui.loginForm) ui.loginForm.reset();
  setLoginMessage(message);
}

function showPasswordScreen() {
  ui.loadingScreen?.classList.add('d-none'); ui.loginScreen?.classList.add('d-none'); ui.appShell?.classList.add('d-none'); ui.passwordScreen?.classList.remove('d-none');
}

function showLoadingScreen(message = 'Validando sesión...') {
  ui.loginScreen?.classList.add('d-none');
  ui.appShell?.classList.add('d-none');
  if (ui.loadingScreen) {
    const textEl = ui.loadingScreen.querySelector('p');
    if (textEl) textEl.textContent = message;
    ui.loadingScreen.classList.remove('d-none');
  }
}

function showApp(user) {
  currentUser = user;
  configureNavigation(user);
  document.getElementById('configuracion-tab')?.closest('li')?.classList.toggle('d-none', !user?.permisos?.configurar_consultorio);
  document.getElementById('config-usuarios-card')?.classList.toggle('d-none', !user?.permisos?.administrar_usuarios);
  if (ui.userName) {
    ui.userName.textContent = user?.nombre ? `Hola, ${user.nombre}` : 'Usuario';
  }
  if (ui.userEmail) {
    ui.userEmail.textContent = user?.email || '';
  }
  ui.loadingScreen?.classList.add('d-none');
  ui.loginScreen?.classList.add('d-none');
  ui.appShell?.classList.remove('d-none');
}

async function initAppOnce(user) {
  if (appInitialized) return;
  currentUser = user;
  configureNavigation(user);
  bindTabs();
  const initialize = async (label, callback) => {
    try { await callback(); }
    catch (error) { renderAlert(ui.alertContainer, `${label}: ${error.message || 'servicio no disponible'}`, error.status === 403 ? 'warning' : 'danger'); }
  };
  if (user?.permisos?.turnos) await initialize('Turnos', () => initTurnosView({ agendaPropia: !user?.permisos?.agenda_general, profesionalPerfilId: user?.profesional_perfil_id }));
  if (user?.permisos?.pacientes_administrativos) await initialize('Pacientes', () => initPacientesView({ clinicalEnabled: user?.permisos?.pacientes_clinicos === true }));
  if (user?.permisos?.administrar_catalogo) await initialize('Catalogo', initPrestacionesView);
  if (user?.permisos?.finanzas_operativas) await initialize('Cargos y pagos', () => initPagosView({ allowAnnul: user?.permisos?.anulaciones_financieras === true }));
  if (user?.permisos?.reportes_operativos) await initialize('Reportes', () => initReportesView({ operational: !user?.permisos?.acceso_total }));
  if (user?.permisos?.configurar_consultorio) await initialize('Configuracion', initConfiguracionView);
  activateSection(getStoredSection() || (user?.permisos?.acceso_total ? 'dashboard' : 'turnos'), { persist: false });
  appInitialized = true;
}

async function initUsuariosForOwner(user) {
  if (!user?.permisos?.administrar_usuarios || usuariosInitialized) return;
  await initUsuariosView();
  usuariosInitialized = true;
}

async function initAuthenticatedApp(user) {
  await initAppOnce(user);
  if (user?.permisos?.acceso_total) try {
    await loadDashboard();
  } catch (_) {
    console.warn('[DASHBOARD] No se pudo completar la carga de indicadores.');
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!ui.loginEmail || !ui.loginPassword) return;

  const email = ui.loginEmail.value.trim();
  const password = ui.loginPassword.value;
  const submitBtn = ui.loginForm?.querySelector('button[type="submit"]');

  if (!email || !password) {
    setLoginMessage('Email y contraseña son requeridos');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Ingresando...';
    }
    const result = await login({ email, password });
    setToken(result.token);
    if (result.user?.debe_cambiar_password) { showPasswordScreen(); return; }
    showLoadingScreen('Preparando aplicación...');
    await initAuthenticatedApp(result.user);
    await initUsuariosForOwner(result.user);
    showApp(result.user);
    if (ui.loginError) ui.loginError.classList.add('d-none');
    renderAlert(ui.alertContainer, 'Sesión iniciada correctamente.', 'success');

    if (ui.rememberEmail?.checked) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  } catch (error) {
    showLoginScreen(error.message || 'No se pudo preparar la aplicación');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Ingresar';
    }
  }
}

async function restoreSession() {
  const token = getToken();
  if (!token) {
    showLoginScreen();
    return;
  }

  try {
    showLoadingScreen();
    const data = await getMe();
    if (data.user?.debe_cambiar_password) { showPasswordScreen(); return; }
    await initAuthenticatedApp(data.user);
    await initUsuariosForOwner(data.user);
    showApp(data.user);
  } catch (error) {
    clearToken();
    showLoginScreen('Sesión expirada. Volvé a iniciar sesión.');
  }
}

function bindAuthEvents() {
  ui.loginForm?.addEventListener('submit', handleLoginSubmit);
  ui.logoutBtn?.addEventListener('click', () => {
    stopWhatsappStatusPolling();
    clearToken();
    clearStoredSection();
    window.location.reload();
    showLoginScreen('Sesión cerrada.');
  });
  document.getElementById('password-change-logout')?.addEventListener('click',()=>{clearToken();clearStoredSection();window.location.reload()});
  ui.passwordForm?.addEventListener('submit',async(event)=>{event.preventDefault();const error=document.getElementById('password-change-error');try{const result=await changeOwnPassword({passwordActual:document.getElementById('password-current').value,passwordNueva:document.getElementById('password-new').value});setToken(result.token);ui.passwordScreen?.classList.add('d-none');showLoadingScreen('Preparando aplicación...');await initAuthenticatedApp(result.user);await initUsuariosForOwner(result.user);showApp(result.user);ui.passwordForm.reset()}catch(e){if(error){error.textContent=e.message;error.classList.remove('d-none')}}});
  window.addEventListener('auth:logout', () => {
    stopWhatsappStatusPolling();
    clearStoredSection();
    window.location.reload();
  });
}

async function start() {
  bindAuthEvents();
  const rememberedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
  if (rememberedEmail && ui.loginEmail) {
    ui.loginEmail.value = rememberedEmail;
    if (ui.rememberEmail) ui.rememberEmail.checked = true;
  }
  await restoreSession();
}

start();
