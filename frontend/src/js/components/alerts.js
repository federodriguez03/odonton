export function renderAlert(container, message, type = 'success') {
  if (!container) return;

  const previousTimer = alertTimers.get(container);
  if (previousTimer) window.clearTimeout(previousTimer);

  const alertElement = document.createElement('div');
  alertElement.className = `alert alert-${type} alert-dismissible fade show`;
  alertElement.setAttribute('role', type === 'danger' ? 'alert' : 'status');
  alertElement.append(document.createTextNode(String(message || '')));

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn-close';
  closeButton.dataset.bsDismiss = 'alert';
  closeButton.setAttribute('aria-label', 'Cerrar');
  alertElement.appendChild(closeButton);
  container.replaceChildren(alertElement);
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
  if (type === 'danger') return 9000;
  if (type === 'warning') return 7000;
  return 4500;
}
