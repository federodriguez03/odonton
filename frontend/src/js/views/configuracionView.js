import QRCode from 'qrcode';
import {
  getConfiguracion,
  getWhatsappQr,
  getWhatsappStatus,
  initializeWhatsapp,
  logoutWhatsapp,
  resetWhatsapp,
  updateConfiguracion,
} from '../api.js';
import { renderAlert } from '../components/alerts.js';

const state = {
  horarios: [],
  mensajes: [],
};

const ui = {
  alertContainer: document.getElementById('alert-container'),
  nombreConsultorio: document.getElementById('config-nombre-consultorio'),
  whatsappNumero: document.getElementById('config-whatsapp-numero'),
  autogestionKeywords: document.getElementById('config-autogestion-keywords'),
  timezone: document.getElementById('config-timezone'),
  horariosTbody: document.getElementById('config-horarios-tbody'),
  mensajesWrap: document.getElementById('config-mensajes-wrap'),
  whatsappStatusBadge: document.getElementById('config-whatsapp-status-badge'),
  whatsappStatusText: document.getElementById('config-whatsapp-status-text'),
  whatsappInstructions: document.getElementById('config-whatsapp-instructions'),
  whatsappQrCanvas: document.getElementById('config-whatsapp-qr'),
  whatsappQrEmpty: document.getElementById('config-whatsapp-qr-empty'),
  whatsappRefreshBtn: document.getElementById('config-whatsapp-refresh-btn'),
  whatsappInitBtn: document.getElementById('config-whatsapp-init-btn'),
  whatsappResetBtn: document.getElementById('config-whatsapp-reset-btn'),
  whatsappLogoutBtn: document.getElementById('config-whatsapp-logout-btn'),
  saveBtn: document.getElementById('config-save-btn'),
};

const MESSAGE_LABELS = {
  principal_whatsapp: {
    title: 'Mensaje principal',
    help: 'Plantilla general disponible; actualmente no tiene un envio automatico asociado.',
    placeholders: ['{paciente}', '{consultorio}', '{whatsapp_consultorio}'],
  },
  recordatorio_turno: {
    title: 'Recordatorio de turno',
    help: 'Se envia antes de un turno programado o confirmado.',
    placeholders: ['{paciente}', '{fecha}', '{hora}', '{prestacion}', '{profesional}', '{turno_id}', '{consultorio}', '{whatsapp_consultorio}'],
  },
  confirmacion_turno: {
    title: 'Confirmacion',
    help: 'Confirma el turno desde el sistema o como respuesta a un recordatorio.',
    placeholders: ['{paciente}', '{fecha}', '{hora}', '{prestacion}', '{profesional}', '{turno_id}', '{consultorio}', '{whatsapp_consultorio}'],
  },
  cancelacion_turno: {
    title: 'Cancelacion confirmada',
    help: 'Informa una cancelacion definitiva realizada desde el sistema.',
    placeholders: ['{paciente}', '{fecha}', '{hora}', '{prestacion}', '{profesional}', '{turno_id}', '{consultorio}', '{whatsapp_consultorio}'],
  },
  reprogramacion_turno: {
    title: 'Reprogramacion confirmada',
    help: 'Informa la nueva fecha y hora definidas desde el sistema.',
    placeholders: ['{paciente}', '{fecha}', '{hora}', '{prestacion}', '{profesional}', '{turno_id}', '{consultorio}', '{whatsapp_consultorio}'],
  },
  rechazo_solicitud_turno: {
    title: 'Solicitud rechazada',
    help: 'Informa que el consultorio no pudo aceptar una solicitud de turno, reprogramacion o cancelacion.',
    placeholders: ['{paciente}', '{consultorio}', '{whatsapp_consultorio}'],
  },
};

const MESSAGE_ORDER = [
  'principal_whatsapp',
  'recordatorio_turno',
  'confirmacion_turno',
  'cancelacion_turno',
  'reprogramacion_turno',
  'rechazo_solicitud_turno',
];

function getMessageMeta(tipo) {
  return MESSAGE_LABELS[tipo] || {
    title: tipo.replaceAll('_', ' '),
    help: 'Mensaje automatico.',
    placeholders: [],
  };
}

function getUnsupportedPlaceholders(mensaje, placeholders) {
  const valid = new Set(placeholders);
  const found = String(mensaje.contenido || '').match(/\{\w+\}/g) || [];
  return [...new Set(found.filter((placeholder) => !valid.has(placeholder)))];
}

function renderHorarios() {
  if (!ui.horariosTbody) return;

  ui.horariosTbody.innerHTML = state.horarios
    .map(
      (horario) => `
        <tr>
          <td>${horario.dia_label}</td>
          <td>
            <div class="form-check form-switch mb-0">
              <input
                class="form-check-input"
                type="checkbox"
                data-role="horario-activo"
                data-dia="${horario.dia_semana}"
                ${horario.activo ? 'checked' : ''}
              />
            </div>
          </td>
          <td>
            <input
              class="form-control"
              type="time"
              data-role="horario-desde"
              data-dia="${horario.dia_semana}"
              value="${horario.hora_desde || ''}"
              ${horario.activo ? '' : 'disabled'}
            />
          </td>
          <td>
            <input
              class="form-control"
              type="time"
              data-role="horario-hasta"
              data-dia="${horario.dia_semana}"
              value="${horario.hora_hasta || ''}"
              ${horario.activo ? '' : 'disabled'}
            />
          </td>
        </tr>
      `,
    )
    .join('');
}

function renderMensajes() {
  if (!ui.mensajesWrap) return;

  ui.mensajesWrap.innerHTML = state.mensajes
    .slice()
    .sort((a, b) => {
      const ai = MESSAGE_ORDER.indexOf(a.tipo);
      const bi = MESSAGE_ORDER.indexOf(b.tipo);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(
      (mensaje) => {
        const meta = getMessageMeta(mensaje.tipo);
        const unsupportedPlaceholders = getUnsupportedPlaceholders(mensaje, meta.placeholders);
        return `
        <div class="col-lg-6">
          <div class="config-message-card">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <div>
                <h3 class="h6 mb-0">${meta.title}</h3>
                <small class="text-secondary">${meta.help}</small>
              </div>
              <div class="text-end">
                <span class="badge ${mensaje.activo ? 'bg-success' : 'bg-secondary'} mb-1">
                  ${mensaje.activo ? 'Activo' : 'Desactivado'}
                </span>
                <div class="form-check form-switch d-flex justify-content-end mb-0">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    data-role="mensaje-activo"
                    data-tipo="${mensaje.tipo}"
                    aria-label="Activar o desactivar ${meta.title}"
                    ${mensaje.activo ? 'checked' : ''}
                  />
                </div>
              </div>
            </div>
            <p class="small ${mensaje.activo ? 'text-success' : 'text-secondary'} mb-2">
              ${mensaje.activo ? 'Se utilizara cuando corresponda este evento.' : 'No se enviara ningun mensaje para este evento.'}
            </p>
            <textarea
              class="form-control"
              rows="5"
              data-role="mensaje-contenido"
              data-tipo="${mensaje.tipo}"
            >${mensaje.contenido || ''}</textarea>
            <div class="d-flex flex-wrap gap-1 mt-2">
              ${meta.placeholders.map((item) => `<button class="btn btn-sm btn-light border" type="button" data-role="insert-placeholder" data-tipo="${mensaje.tipo}" data-placeholder="${item}">${item}</button>`).join('')}
            </div>
            ${unsupportedPlaceholders.length > 0
              ? `<p class="small text-danger mb-0 mt-2">Variables no vigentes: ${unsupportedPlaceholders.join(', ')}. Retiralas antes de usar este mensaje.</p>`
              : ''}
          </div>
        </div>
      `;
      },
    )
    .join('');
}

function hydrateForm(data) {
  ui.nombreConsultorio.value = data.consultorio?.nombre_consultorio || '';
  ui.whatsappNumero.value = data.consultorio?.whatsapp_numero || '';
  ui.autogestionKeywords.value = data.consultorio?.autogestion_keywords || '';
  ui.timezone.value = data.consultorio?.timezone || '';
  state.horarios = data.horarios || [];
  state.mensajes = data.mensajes || [];
  renderHorarios();
  renderMensajes();
}

function bindHorarios() {
  ui.horariosTbody?.addEventListener('input', (event) => {
    const target = event.target;
    const dia = Number(target.dataset.dia);
    const horario = state.horarios.find((item) => item.dia_semana === dia);
    if (!horario) return;

    if (target.dataset.role === 'horario-desde') horario.hora_desde = target.value;
    if (target.dataset.role === 'horario-hasta') horario.hora_hasta = target.value;
  });

  ui.horariosTbody?.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.role !== 'horario-activo') return;

    const dia = Number(target.dataset.dia);
    const horario = state.horarios.find((item) => item.dia_semana === dia);
    if (!horario) return;

    horario.activo = target.checked;
    renderHorarios();
  });
}

function bindMensajes() {
  ui.mensajesWrap?.addEventListener('input', (event) => {
    const target = event.target;
    const tipo = target.dataset.tipo;
    const mensaje = state.mensajes.find((item) => item.tipo === tipo);
    if (!mensaje) return;

    if (target.dataset.role === 'mensaje-contenido') mensaje.contenido = target.value;
  });

  ui.mensajesWrap?.addEventListener('change', (event) => {
    const target = event.target;
    const tipo = target.dataset.tipo;
    const mensaje = state.mensajes.find((item) => item.tipo === tipo);
    if (!mensaje) return;

    if (target.dataset.role === 'mensaje-activo') {
      mensaje.activo = target.checked;
      renderMensajes();
    }
  });

  ui.mensajesWrap?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-role="insert-placeholder"]');
    if (!target) return;

    const tipo = target.dataset.tipo;
    const placeholder = target.dataset.placeholder;
    const textarea = ui.mensajesWrap.querySelector(`textarea[data-tipo="${tipo}"]`);
    const mensaje = state.mensajes.find((item) => item.tipo === tipo);
    if (!textarea || !mensaje || !placeholder) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = `${value.slice(0, start)}${placeholder}${value.slice(end)}`;
    textarea.focus();
    textarea.selectionStart = start + placeholder.length;
    textarea.selectionEnd = start + placeholder.length;
    mensaje.contenido = textarea.value;
  });
}

async function loadConfiguracion() {
  try {
    const data = await getConfiguracion();
    hydrateForm(data);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function renderWhatsappStatus(status) {
  if (!ui.whatsappStatusBadge || !ui.whatsappStatusText) return;

  const currentStatus = status?.status || (status?.ready ? 'READY' : status?.has_qr ? 'QR_READY' : status?.initializing ? 'INITIALIZING' : 'DISCONNECTED');
  const badgeMap = {
    READY: ['bg-success', 'Conectado'],
    QR_READY: ['bg-warning text-dark', 'Esperando QR'],
    INITIALIZING: ['bg-info text-dark', 'Conectando'],
    AUTHENTICATED: ['bg-info text-dark', 'Completando conexión'],
    FAILED: ['bg-danger', 'Error'],
    DISCONNECTING: ['bg-secondary', 'Desconectando'],
    DISCONNECTED: ['bg-secondary', 'Desconectado'],
  };
  const [badgeClass, badgeText] = badgeMap[currentStatus] || badgeMap.DISCONNECTED;

  ui.whatsappStatusBadge.className = `badge ${badgeClass}`;
  ui.whatsappStatusBadge.textContent = badgeText;

  const statusMessages = {
    READY: 'WhatsApp está conectado y listo para enviar y recibir mensajes.',
    QR_READY: 'Escaneá el código QR para vincular el WhatsApp del consultorio.',
    INITIALIZING: 'Estamos iniciando WhatsApp. El código QR puede demorar unos segundos.',
    AUTHENTICATED: 'El QR fue aceptado. Estamos completando la conexión.',
    FAILED: 'No se pudo conectar WhatsApp. Podés reintentar la conexión.',
    DISCONNECTING: 'Estamos cerrando la conexión de WhatsApp.',
    DISCONNECTED: 'WhatsApp no está conectado actualmente.',
  };
  const details = [statusMessages[currentStatus] || statusMessages.DISCONNECTED];
  if (currentStatus === 'READY' && status?.connectedNumber) {
    details.push(`Número vinculado: ${status.connectedNumber}`);
  }
  if (currentStatus === 'QR_READY' && status?.qrGeneratedAt) {
    const qrDate = new Date(status.qrGeneratedAt);
    if (Date.now() - qrDate.getTime() > 60000) details.push('Este QR puede haber vencido');
  }
  if (currentStatus === 'FAILED' && (status?.lastError || status?.last_error)) {
    details.push(`Detalle: ${status.lastError || status.last_error}`);
  }
  ui.whatsappStatusText.textContent = details.join(' ');

  const showConnect = ['DISCONNECTED', 'FAILED'].includes(currentStatus);
  const showNewQr = currentStatus === 'QR_READY';
  const showLogout = currentStatus === 'READY';
  ui.whatsappInitBtn?.classList.toggle('d-none', !showConnect);
  ui.whatsappResetBtn?.classList.toggle('d-none', !showNewQr);
  ui.whatsappLogoutBtn?.classList.toggle('d-none', !showLogout);
  if (ui.whatsappInitBtn) {
    ui.whatsappInitBtn.innerHTML = currentStatus === 'FAILED'
      ? '<i class="bi bi-arrow-repeat me-1"></i>Reintentar conexión'
      : '<i class="bi bi-whatsapp me-1"></i>Conectar WhatsApp';
  }

  if (ui.whatsappInstructions) {
    ui.whatsappInstructions.textContent = currentStatus === 'QR_READY'
      ? 'En tu teléfono: WhatsApp > Dispositivos vinculados > Vincular dispositivo.'
      : currentStatus === 'READY'
        ? 'La vinculación está activa. Solo necesitás desvincularla si vas a cambiar de teléfono o cuenta.'
        : 'El botón principal se adapta al estado actual de la conexión.';
  }

  if (ui.whatsappQrEmpty) {
    ui.whatsappQrEmpty.textContent = currentStatus === 'READY'
      ? 'WhatsApp conectado'
      : currentStatus === 'INITIALIZING' || currentStatus === 'AUTHENTICATED'
        ? 'Preparando conexión...'
        : 'Sin código QR pendiente';
  }
}

async function loadWhatsappQr() {
  if (!ui.whatsappQrCanvas || !ui.whatsappQrEmpty) return;

  try {
    const data = await getWhatsappQr();
    if (!data.qr) throw new Error('QR no disponible');
    await QRCode.toCanvas(ui.whatsappQrCanvas, data.qr, {
      width: 240,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
    ui.whatsappQrCanvas.classList.remove('d-none');
    ui.whatsappQrEmpty.classList.add('d-none');
  } catch (_) {
    ui.whatsappQrCanvas.classList.add('d-none');
    ui.whatsappQrEmpty.classList.remove('d-none');
  }
}

async function refreshWhatsappPanel() {
  try {
    const status = await getWhatsappStatus();
    renderWhatsappStatus(status);
    if ((status?.status || '') === 'QR_READY' || status?.hasQr || status?.has_qr) {
      await loadWhatsappQr();
    } else {
      ui.whatsappQrCanvas?.classList.add('d-none');
      ui.whatsappQrEmpty?.classList.remove('d-none');
    }
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function bindWhatsappPanel() {
  ui.whatsappRefreshBtn?.addEventListener('click', refreshWhatsappPanel);

  ui.whatsappInitBtn?.addEventListener('click', async () => {
    try {
      ui.whatsappInitBtn.disabled = true;
      await initializeWhatsapp();
      renderWhatsappStatus({ status: 'INITIALIZING' });
      window.setTimeout(refreshWhatsappPanel, 2500);
      renderAlert(ui.alertContainer, 'Conectando WhatsApp. El QR aparecerá en unos segundos si hace falta vincularlo.', 'info');
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    } finally {
      ui.whatsappInitBtn.disabled = false;
    }
  });

  ui.whatsappResetBtn?.addEventListener('click', async () => {
    try {
      ui.whatsappResetBtn.disabled = true;
      await resetWhatsapp();
      renderWhatsappStatus({ status: 'INITIALIZING' });
      window.setTimeout(refreshWhatsappPanel, 3000);
      renderAlert(ui.alertContainer, 'Generando un código QR nuevo.', 'info');
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    } finally {
      ui.whatsappResetBtn.disabled = false;
    }
  });

  ui.whatsappLogoutBtn?.addEventListener('click', async () => {
    const confirmed = window.confirm('Esto desvincula la sesión local de WhatsApp Web. Después vas a necesitar escanear un QR nuevo. ¿Continuar?');
    if (!confirmed) return;

    try {
      ui.whatsappLogoutBtn.disabled = true;
      await logoutWhatsapp();
      await refreshWhatsappPanel();
      renderAlert(ui.alertContainer, 'WhatsApp desvinculado. Podés conectarlo nuevamente cuando lo necesites.', 'info');
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    } finally {
      ui.whatsappLogoutBtn.disabled = false;
    }
  });
}

function bindSave() {
  ui.saveBtn?.addEventListener('click', async () => {
    try {
      ui.saveBtn.disabled = true;
      ui.saveBtn.textContent = 'Guardando...';

      const payload = {
        consultorio: {
          nombre_consultorio: ui.nombreConsultorio.value.trim(),
          whatsapp_numero: ui.whatsappNumero.value.trim(),
          autogestion_keywords: ui.autogestionKeywords.value.trim(),
          timezone: ui.timezone.value.trim(),
        },
        horarios: state.horarios.map((item) => ({
          dia_semana: item.dia_semana,
          activo: Boolean(item.activo),
          hora_desde: item.hora_desde,
          hora_hasta: item.hora_hasta,
        })),
        mensajes: state.mensajes.map((item) => ({
          tipo: item.tipo,
          contenido: item.contenido,
          activo: Boolean(item.activo),
        })),
      };

      const result = await updateConfiguracion(payload);
      hydrateForm(result);
      renderAlert(ui.alertContainer, result.mensaje || 'Configuracion guardada', 'success');
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    } finally {
      ui.saveBtn.disabled = false;
      ui.saveBtn.innerHTML = '<i class="bi bi-save me-1"></i>Guardar configuracion';
    }
  });
}

export async function initConfiguracionView() {
  bindHorarios();
  bindMensajes();
  bindWhatsappPanel();
  bindSave();
  await loadConfiguracion();
  await refreshWhatsappPanel();
}
