/**
 * CSS-module stub for jsdom component tests. Returns each class name verbatim
 * (e.g. `styles.revealHighlight` → "revealHighlight"). `__esModule` is false so
 * ts-jest's interop wraps this as the default export rather than reading
 * `.default` off the proxy.
 */
module.exports = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === '__esModule') return false;
      return typeof prop === 'string' ? prop : '';
    },
  }
);
