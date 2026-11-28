import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, AlertCircleIcon, XIcon } from './CrmHrmsIcons';

export default function GlobalToast() {
  const [toast, setToast] = useState({
    open: false,
    type: 'success',
    title: '',
    message: '',
  });
  const timerRef = useRef(null);

  useEffect(() => {
    const onToast = (e) => {
      const detail = e?.detail || {};
      if (!detail.message) return;
      const normalizedType =
        detail.type === 'error' ? 'error' : detail.type === 'info' ? 'info' : 'success';
      const defaultTitle =
        normalizedType === 'error'
          ? 'Error'
          : normalizedType === 'info'
            ? 'Notice'
            : 'Success';

      setToast({
        open: true,
        type: normalizedType,
        title: detail.title || defaultTitle,
        message: detail.message,
      });

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setToast((prev) => ({ ...prev, open: false }));
      }, 3400);
    };

    window.addEventListener('zorvixe:toast', onToast);
    return () => {
      window.removeEventListener('zorvixe:toast', onToast);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      className={`toastx ${toast.type} ${toast.open ? 'show' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="toastx-icon">
        {toast.type === 'success' ? (
          <CheckIcon size={16} />
        ) : (
          <AlertCircleIcon size={16} />
        )}
      </div>
      <div className="toastx-body">
        <div className="toastx-title">{toast.title}</div>
        <div className="toastx-msg">{toast.message}</div>
      </div>
      <button
        type="button"
        className="toastx-close"
        onClick={() => setToast((prev) => ({ ...prev, open: false }))}
        aria-label="Close"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}
