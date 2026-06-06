/**
 * Jest setup for jsdom (React component tests)
 */

import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfills for jsdom — react-router-dom (and other modern libs) use
// TextEncoder/TextDecoder, which jsdom doesn't provide by default.
// Added in ADR-0007 PR-T5 when the Dashboard integration test surfaced
// the missing globals.
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  // The util.TextDecoder type is compatible enough at runtime; cast for TS.
  globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}

// jsdom doesn't implement ResizeObserver. Components that observe content size
// (e.g. Accordion.Content re-measures so async-grown content isn't clipped) need
// it to exist. A no-op mock is enough for jsdom (layout sizes are 0 here anyway);
// real resize behavior is exercised in the running app.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// ----------------------------------------------------------------------------
// Fail tests on React "not wrapped in act(...)" warnings.
//
// These warnings mean a component's state updated outside `act()` — a sign the
// test didn't flush an async effect (or reset a store while mounted). They
// don't fail the test by default, so they pile up as console noise and hide
// real "the test isn't observing what the user sees" problems. We make them
// hard failures so component tests stay disciplined: flush effects with
// `await act(async () => {})` / `await waitFor(...)`, or wrap store resets in
// `act()`. (See docs/FOLLOWUPS.md "React act(...) warnings".)
//
// TARGETED: only this specific warning fails — every other `console.error`
// passes through (some tests intentionally exercise error-logging paths). We
// flag in the patched console.error and throw in an afterEach (throwing inside
// console.error itself would fire mid-render and tangle with React's error
// handling).
// ----------------------------------------------------------------------------
let actWarning: string | null = null;
const realConsoleError = console.error.bind(console);

beforeEach(() => {
  actWarning = null;
});

console.error = (...args: unknown[]): void => {
  const first = args[0];
  const msg = typeof first === 'string' ? first : String(first ?? '');
  if (msg.includes('not wrapped in act(')) {
    actWarning ??= msg;
  }
  realConsoleError(...args);
};

afterEach(() => {
  if (actWarning) {
    const captured = actWarning;
    actWarning = null;
    throw new Error(
      'A React state update was not wrapped in act(...). Flush async effects ' +
        '(`await act(async () => {})` / `await waitFor(...)`) or wrap store ' +
        'resets in `act()`.\n\nOriginal warning:\n' +
        captured.split('\n')[0]
    );
  }
});
