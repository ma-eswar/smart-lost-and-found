import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('SafeRecover ErrorBoundary captured an uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="main-content" style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center' }}>
          <div className="form-card" style={{ padding: '2.5rem 2rem', border: '1px solid #fed7aa', background: '#fffaf5' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ffedd5', color: '#c2410c', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto', fontSize: '1.75rem' }}>
              <i className="bi bi-exclamation-triangle"></i>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#9a3412', marginBottom: '0.5rem' }}>
              Something went wrong
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '1.5rem' }}>
              An unexpected error occurred while rendering this page. Your data is safe.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={this.handleReset}
              >
                <i className="bi bi-house-door"></i> Return to Home
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => window.location.reload()}
              >
                <i className="bi bi-arrow-clockwise"></i> Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
