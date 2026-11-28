import React from 'react';
import { AlertTriangleIcon, RefreshIcon, HomeIcon } from './CrmHrmsIcons';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error, info) {
    console.error('Application view error caught by boundary:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="zx-error-boundary" role="alert">
        <div className="zx-error-boundary-card">
          <div className="zx-error-boundary-icon">
            <AlertTriangleIcon size={22} />
          </div>
          <h2>Something went wrong loading this view</h2>
          <p>{this.state.errorMessage}</p>
          <div className="zx-error-boundary-actions">
            <button type="button" className="btn btn-primary" onClick={this.handleReset}>
              <RefreshIcon size={14} />
              <span>Try Again</span>
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                this.handleReset();
                if (typeof this.props.onGoHome === 'function') {
                  this.props.onGoHome();
                } else {
                  window.location.href = '/stats';
                }
              }}
            >
              <HomeIcon size={14} />
              <span>Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
