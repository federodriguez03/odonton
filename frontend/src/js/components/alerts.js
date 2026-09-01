export function renderAlert(container, message, type = 'success') {
  if (!container) return;

  const previousTimer = alertTimers.get(container);
  if (previousTimer) window.clearTimeout(previousTimer);

  container.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
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
