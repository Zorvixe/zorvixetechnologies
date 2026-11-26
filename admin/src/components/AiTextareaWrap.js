import React, { useRef, useState } from 'react';
import { apiAiAssistField } from '../api';
import { SparklesIcon } from './CrmHrmsIcons';
import './AiAssistantDrawer.css';

/**
 * Collects sanitized non-sensitive sibling form values around an input container
 * so Zorvi AI can draft/improve descriptions using the surrounding title/subject/company.
 */
export function extractNearbyFormContext(el, extraContext = {}) {
  const ctx = { ...(extraContext || {}) };
  try {
    const scope = el?.closest('form, .modal-content, .jira-modal-dialog, .crm-modal, .rc-modal-box') || el?.parentElement?.parentElement;
    if (!scope) return ctx;

    const headerEl = scope.querySelector('.modal-title, .modal-header h3, .modal-header h4, .jira-modal-header h3, h3, h4');
    if (headerEl?.textContent?.trim() && !ctx.modalTitle) {
      ctx.modalTitle = headerEl.textContent.trim().slice(0, 100);
    }

    const inputs = scope.querySelectorAll('input[type="text"], input[type="date"], input[type="number"], input[type="email"], select');
    let idx = 0;
    inputs.forEach((inp) => {
      if (idx >= 8 || inp.type === 'password' || inp.type === 'hidden') return;
      const val = String(inp.value || '').trim();
      if (!val) return;
      const group = inp.closest('.form-group, .jira-form-group, .crm-form-group, .rc-form-group, .col-md-6, .col-12, .mb-3, div');
      const labelText = group?.querySelector('label')?.textContent?.replace('*', '').trim() || inp.name || inp.placeholder || `field_${idx}`;
      const key = labelText.slice(0, 32).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${idx}`;
      if (!ctx[key]) {
        ctx[key] = val.slice(0, 160);
        idx++;
      }
    });
  } catch {}
  return ctx;
}

export function ZorviAiInlineButton({ loading, disabled, onClick, title = 'Draft or enhance with ZORVI AI' }) {
  return (
    <button
      type="button"
      className="zx-ai-inline-assist-btn"
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={title}
    >
      <SparklesIcon size={24} />
      {loading && <span className="zx-ai-spinner" />}
    </button>
  );
}

export default function AiTextareaWrap({
  children,
  value = '',
  onAiApply,
  fieldLabel = 'Notes / Description',
  aiContext = {},
  disabled = false,
  className = '',
  style = {},
}) {
  const wrapRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAssist = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading || disabled || typeof onAiApply !== 'function') return;

    setLoading(true);
    setError('');
    try {
      const ctx = extractNearbyFormContext(wrapRef.current, aiContext);
      const res = await apiAiAssistField({
        fieldLabel,
        currentText: String(value || ''),
        pagePath: typeof window !== 'undefined' ? window.location.pathname : '/',
        context: ctx,
      });
      if (res?.text) {
        onAiApply(res.text);
      }
    } catch (err) {
      setError(err?.message || 'Unable to generate ZORVI draft right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={wrapRef} className={className} style={style}>
      <div className="zx-ai-textarea-wrap">
        {children}
        {!disabled && (
          <div className="zx-ai-textarea-corner">
            <ZorviAiInlineButton
              loading={loading}
              disabled={disabled}
              onClick={handleAssist}
            />
          </div>
        )}
      </div>
      {error && <div className="zx-ai-field-err">{error}</div>}
    </div>
  );
}
