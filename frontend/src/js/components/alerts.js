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

  container.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      <i class="bi ${icon} alert-icon" aria-hidden="true"></i>
      <span class="alert-message">${message}</span>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;

  const alertElement = container.querySelector('.alert');
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
