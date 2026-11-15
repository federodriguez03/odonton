export function renderAlert(container, message, type = 'success') {
  if (!container) return;

  const previousTimer = alertTimers.get(container);
  if (previousTimer) window.clearTimeout(previousTimer);

  const icons = {
    success: 'bi-check-circle-fill',
    danger: 'bi-exclamation-octagon-fill',
    warning: 'bi-exclamation-triangle-fill',
    info: 'bi-info-circle-fill',
  };
  const icon = icons[type] || icons.info;

  const persistent = type === 'danger';
  container.setAttribute('aria-live', persistent ? 'assertive' : 'polite');
  container.setAttribute('aria-atomic', 'true');
  const alertElement = document.createElement('div');
  alertElement.className = `alert alert-${type} alert-dismissible fade show`;
  alertElement.setAttribute('role', persistent ? 'alert' : 'status');

  const iconElement = document.createElement('i');
  iconElement.className = `bi ${icon} alert-icon`;
  iconElement.setAttribute('aria-hidden', 'true');

  const messageElement = document.createElement('span');
  messageElement.className = 'alert-message';
  messageElement.textContent = String(message ?? '');

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn-close';
  closeButton.setAttribute('data-bs-dismiss', 'alert');
  closeButton.setAttribute('aria-label', 'Cerrar mensaje');

  alertElement.append(iconElement, messageElement, closeButton);
  container.replaceChildren(alertElement);
  if (persistent) return;

  const timer = window.setTimeout(() => {
    if (alertElement?.isConnected) {
      const bootstrapAlert = window.bootstrap?.Alert?.getOrCreateInstance(alertElement);
      if (bootstrapAlert) bootstrapAlert.close();
      else alertElement.remove();
    }
    alertTimers.delete(container);
  }, getAlertDuration(type));

  alertTimers.set(container, timer);
  alertElement?.addEventListener('closed.bs.alert', () => {
    window.clearTimeout(timer);
    alertTimers.delete(container);
  }, { once: true });
}

const alertTimers = new WeakMap();

function getAlertDuration(type) {
  if (type === 'warning') return 7000;
  return 4500;
}
