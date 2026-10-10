/* Web shim for react-native-webview.
 *
 * On the web the "native" map/preview surfaces are Leaflet pages injected into a
 * WebView. We render a real iframe pointed at the same HTML and implement the
 * `injectJavaScript` / `postMessage` surface the app expects, so live map updates
 * and document previews behave in the browser.
 */
import React from 'react';

export class WebView extends React.Component {
  constructor(props) {
    super(props);
    this.iframeRef = React.createRef();
    this.state = { html: props.source?.html || null, uri: props.source?.uri || null };
  }

  injectJavaScript = (script) => {
    const iframe = this.iframeRef.current;
    if (!iframe) return;
    try {
      // eslint-disable-next-line no-underscore-dangle
      const win = iframe.contentWindow;
      if (win) win.eval(script);
    } catch (error) {
      // ignore cross-document errors; the map still renders
    }
  };

  postMessage = (data) => {
    const iframe = this.iframeRef.current;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(data, '*');
    }
  };

  reload = () => undefined;

  stopLoading = () => undefined;

  goBack = () => undefined;

  goForward = () => undefined;

  render() {
    const { style, onMessage, onLoadEnd, scrollEnabled, ...rest } = this.props;
    const source = this.state.html
      ? { srcDoc: this.state.html }
      : { src: this.state.uri };
    return React.createElement('iframe', {
      ref: this.iframeRef,
      style: { border: 'none', width: '100%', height: '100%', ...(style || {}) },
      title: 'aagam-webview',
      onLoad: () => {
        if (onLoadEnd) onLoadEnd({ nativeEvent: {} });
      },
      ...source,
    });
  }
}

export default { WebView };
