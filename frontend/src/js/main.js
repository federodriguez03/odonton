import { initPacientesView } from './views/pacientesView.js';
import { initTurnosView, setTurnosIdentity } from './views/turnosView.js';
import { initPrestacionesView } from './views/prestacionesView.js';
import { initPagosView } from './views/pagosView.js';
import { initReportesView } from './views/reportesView.js';
import { initConfiguracionView } from './views/configuracionView.js';
import { initAdminUsersView } from './views/adminUsersView.js';
import { clearToken, getMe, getToken, login, setToken } from './api.js';
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
  userName: document.getElementById('user-name'),
  userEmail: document.getElementById('user-email'),
  logoutBtn: document.getElementById('logout-btn'),
  alertContainer: document.getElementById('alert-container'),
};

const REMEMBER_EMAIL_KEY = 'odonton_email';
const ACTIVE_SECTION_KEY = 'odonton_active_section';
const SECTION_MAP = {
  dashboard: 'section-dashboard',
  usuarios: 'section-usuarios',
  pacientes: 'section-pacientes',
  turnos: 'section-turnos',
  prestaciones: 'section-prestaciones',
  reportes: 'section-reportes',
  historia: 'section-historia',
  pagos: 'section-pagos',
  configuracion: 'section-configuracion',
};
let appInitialized = false;

const SECTION_PERMISSION = {
  dashboard: () => false,
  usuarios: (p) => p.identidades_admin,
  pacientes: (p) => p.pacientes_administrativos,
  turnos: (p) => Boolean(p.agenda),
  prestaciones: (p) => p.prestaciones_admin,
  historia: () => false,
  pagos: (p) => p.finanzas_consulta,
  reportes: (p) => p.reportes,
  configuracion: (p) => p.configuracion_admin,
};

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
  const requestedTab = tabs.find((tab) => tab.dataset.section === requestedSection);
  const available = tabs.filter((tab) => !tab.closest('li')?.classList.contains('d-none'));
  const section = requestedTab && !requestedTab.closest('li')?.classList.contains('d-none') && SECTION_MAP[requestedSection]
    ? requestedSection
    : (available.find((tab) => tab.dataset.section === 'turnos')?.dataset.section || available[0]?.dataset.section);
  if (!section) return null;

  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.section === section));
  Object.entries(SECTION_MAP).forEach(([key, id]) => {
    const element = document.getElementById(id);
    if (element) element.classList.toggle('d-none', section !== key);
  });

  if (persist) storeSection(section);
  return section;
}

function configureNavigation(user) {
  const permissions = user?.permisos || {};
  document.querySelectorAll('#main-tabs .nav-link').forEach((tab) => {
    const allowed = SECTION_PERMISSION[tab.dataset.section]?.(permissions) === true;
    tab.closest('li')?.classList.toggle('d-none', !allowed);
  });
  return activateSection(getStoredSection(), { persist: false });
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
  ui.loadingScreen?.classList.add('d-none');
  ui.loginScreen?.classList.remove('d-none');
  ui.appShell?.classList.add('d-none');
  if (ui.loginForm) ui.loginForm.reset();
  if (ui.loginError) {
    ui.loginError.textContent = message || '';
    ui.loginError.classList.toggle('d-none', !message);
  }
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
  setTurnosIdentity(user);
  if (appInitialized) return;
  bindTabs();
  configureNavigation(user);
  const permissions = user?.permisos || {};
  if (permissions.pacientes_administrativos) await initPacientesView(user);
  if (permissions.agenda) await initTurnosView(user);
  if (permissions.prestaciones_admin) await initPrestacionesView();
  if (permissions.finanzas_consulta) await initPagosView(user);
  if (permissions.reportes) await initReportesView();
  if (permissions.configuracion_admin) await initConfiguracionView();
  if (permissions.identidades_admin) await initAdminUsersView();
  appInitialized = true;
}

async function initAuthenticatedApp(user) {
  await initAppOnce(user);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!ui.loginEmail || !ui.loginPassword) return;

  const email = ui.loginEmail.value.trim();
  const password = ui.loginPassword.value;
  const submitBtn = ui.loginForm?.querySelector('button[type="submit"]');

  if (!email || !password) {
    if (ui.loginError) {
      ui.loginError.textContent = 'Email y contraseña son requeridos';
      ui.loginError.classList.remove('d-none');
    }
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Ingresando...';
    }
    const result = await login({ email, password });
    setToken(result.token);
    showLoadingScreen('Preparando aplicación...');
    await initAuthenticatedApp(result.user);
    showApp(result.user);
    if (ui.loginError) ui.loginError.classList.add('d-none');
    renderAlert(ui.alertContainer, 'Sesión iniciada correctamente.', 'success');

    if (ui.rememberEmail?.checked) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  } catch (error) {
    if (ui.loginError) {
      ui.loginError.textContent = error.message || 'No se pudo iniciar sesión';
      ui.loginError.classList.remove('d-none');
    }
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
    await initAuthenticatedApp(data.user);
    showApp(data.user);
  } catch (error) {
    clearToken();
    showLoginScreen('Sesión expirada. Volvé a iniciar sesión.');
  }
}

function bindAuthEvents() {
  ui.loginForm?.addEventListener('submit', handleLoginSubmit);
  ui.logoutBtn?.addEventListener('click', () => {
    clearToken();
    clearStoredSection();
    window.location.reload();
  });
  window.addEventListener('auth:logout', () => {
    clearStoredSection();
    showLoginScreen('Sesión expirada. Volvé a iniciar sesión.');
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
