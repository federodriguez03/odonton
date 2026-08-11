import { initPacientesView } from './views/pacientesView.js';
import { initTurnosView } from './views/turnosView.js';
import { initPrestacionesView } from './views/prestacionesView.js';
import { initReportesView } from './views/reportesView.js';
import { initEstadisticasView } from './views/estadisticasView.js';
import { initPagosView } from './views/pagosView.js';
import { initConfiguracionView } from './views/configuracionView.js';
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
let appInitialized = false;

function bindTabs() {
  const tabs = Array.from(document.querySelectorAll('#main-tabs .nav-link'));
  const sectionMap = {
    dashboard: 'section-dashboard',
    pacientes: 'section-pacientes',
    turnos: 'section-turnos',
    prestaciones: 'section-prestaciones',
    reportes: 'section-reportes',
    estadisticas: 'section-estadisticas',
    historia: 'section-historia',
    pagos: 'section-pagos',
    configuracion: 'section-configuracion',
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');

      const section = tab.dataset.section;
      Object.entries(sectionMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('d-none', section !== key);
      });
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

async function initAppOnce() {
  if (appInitialized) return;
  bindTabs();
  await initPacientesView();
  await initTurnosView();
  await initPrestacionesView();
  await initReportesView();
  await initEstadisticasView();
  await initPagosView();
  await initConfiguracionView();
  appInitialized = true;
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
    showApp(result.user);
    await initAppOnce();
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
    showApp(data.user);
    await initAppOnce();
  } catch (error) {
    clearToken();
    showLoginScreen('Sesión expirada. Volvé a iniciar sesión.');
  }
}

function bindAuthEvents() {
  ui.loginForm?.addEventListener('submit', handleLoginSubmit);
  ui.logoutBtn?.addEventListener('click', () => {
    clearToken();
    showLoginScreen('Sesión cerrada.');
  });
  window.addEventListener('auth:logout', () => {
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
