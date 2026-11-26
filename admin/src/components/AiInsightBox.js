import React from 'react';
import { SparklesIcon, AlertCircleIcon, RefreshIcon } from './CrmHrmsIcons';
import './AiAssistantDrawer.css';

/**
 * Shared AI Insight Card for module-level grounded AI outputs.
 * Always presents advisory framing, loading, error, and uncertainty clearly.
 */
export default function AiInsightBox({
  title = 'ZORVI Insights',
  subtitle = 'ZORVI Advisory • Grounded in authorized records • Human review required',
  loading = false,
  error = '',
  uncertainty = '',
  providerMeta = null,
  onRefresh = null,
  refreshLabel = 'Refresh',
  onClose = null,
  children,
}) {
  return (
    <div className="zx-ai-box" role="region" aria-label={title}>
      <div className="zx-ai-box-header">
        <div className="zx-ai-box-title-wrap">
          <span className="zx-ai-badge-icon">
            <SparklesIcon size={28} />
          </span>
          <div>
            <div className="zx-ai-box-title">{title}</div>
            <div className="zx-ai-box-sub">{subtitle}</div>
          </div>
        </div>
        <div className="zx-ai-box-actions">
          {providerMeta?.activeMode && (
            <span className="zx-ai-mode-pill" title={providerMeta.notice || ''}>
              {providerMeta.provider === 'deterministic_fallback' ? 'Analytical Engine' : providerMeta.provider}
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              className="zx-ai-btn-sm"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshIcon size={12} />
              <span>{loading ? 'Analyzing...' : refreshLabel}</span>
            </button>
          )}
          {onClose && (
            <button type="button" className="zx-ai-close-btn" onClick={onClose} aria-label="Close AI panel">
              ×
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="zx-ai-state-loading">
          <span className="zx-ai-spinner" />
          <span>Analyzing authorized records safely...</span>
        </div>
      )}

      {!loading && error && (
        <div className="zx-ai-state-error" role="alert">
          <AlertCircleIcon size={15} />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && children && (
        <div className="zx-ai-box-body">{children}</div>
      )}

      {!loading && !error && uncertainty && (
        <div className="zx-ai-uncertainty">
          <strong>Uncertainty & Scope:</strong> {uncertainty}
        </div>
      )}
    </div>
  );
}
