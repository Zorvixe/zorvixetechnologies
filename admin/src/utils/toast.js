/**
 * Global toast notification helper powered by the platform-wide GlobalToast listener.
 */
export function showToast(message, type = 'success', title = '') {
  if (typeof window === 'undefined' || !message) return;
  window.dispatchEvent(
    new CustomEvent('zorvixe:toast', {
      detail: {
        message: String(message),
        type,
        title,
      },
    })
  );
}
