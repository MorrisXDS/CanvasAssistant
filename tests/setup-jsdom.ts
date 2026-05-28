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
