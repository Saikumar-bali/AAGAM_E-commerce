/* Entry point: boots the real App with an error boundary so failures are visible. */
import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '@app/App';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error('[aagam-preview] render error', error);
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        'div',
        { style: { padding: 24, fontFamily: 'monospace', color: '#B91C1C', background: '#FEF2F2', minHeight: '100vh' } },
        React.createElement('h2', null, 'App failed to render'),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap' } }, String(this.state.error?.stack || this.state.error)),
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
createRoot(container).render(
  React.createElement(ErrorBoundary, null, React.createElement(App, null)),
);

window.__AAGAM_PREVIEW_READY__ = true;
