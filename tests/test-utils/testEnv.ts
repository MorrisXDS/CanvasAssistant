/**
 * setupTestEnv — foundation for component-integration testing.
 *
 * Per ADR-0007 PR-T4: gives each test its own fresh Zustand store
 * (sidestepping the production module singleton) plus a Proxy-backed
 * `window.api` stub that auto-fills any IPC method with
 * `jest.fn().mockResolvedValue(undefined)`. Zero maintenance as the
 * 176-method IPC surface grows.
 *
 * Intended use (PR-T5+):
 *
 *   describe('Dashboard', () => {
 *     let env: TestEnv;
 *     beforeEach(() => { env = setupTestEnv(); });
 *     afterEach(() => { env.cleanup(); });
 *
 *     it('shows visible-course notifications', () => {
 *       env.api.getCourses.mockResolvedValue([…]);
 *       env.store.setState({ courses: […], notifications: […] });
 *       // … render component, assert DOM …
 *     });
 *   });
 *
 * This file is consumed only by tests. It imports `createStore` from
 * `store/store.ts` directly (not via the `store/index.ts` barrel) — the
 * factory is intentionally not part of the public store surface.
 */

import { createStore } from '../../src/layers/l5-presentation/store/store';

export interface TestEnv {
  /**
   * A fresh Zustand store instance, isolated from the production singleton.
   * Tests can call `env.store.getState()`, `env.store.setState({...})`, etc.
   */
  store: ReturnType<typeof createStore>;

  /**
   * Proxy-backed mock for `window.api`. Access any property; the first access
   * creates and caches a `jest.fn().mockResolvedValue(undefined)`. Configure
   * specific methods inline:
   *
   *   env.api.getCourses.mockResolvedValue([{ id: 1, … }]);
   *
   * Subsequent accesses return the same `jest.Mock` instance so call counts
   * and configured behaviours persist within a test.
   */
  api: Record<string, jest.Mock>;

  /**
   * Restore `window.api` to its pre-setup state. Call in `afterEach`.
   * Idempotent.
   */
  cleanup: () => void;
}

/**
 * Build a fresh test environment. Each call returns a new store + a new
 * `window.api` proxy. Tests that nest setups (rare) must call cleanup in
 * reverse-LIFO order to restore correctly.
 */
export function setupTestEnv(): TestEnv {
  const store = createStore();

  const apiState: Record<string, jest.Mock> = {};
  const api = new Proxy(apiState, {
    get(target, prop: string) {
      if (!(prop in target)) {
        target[prop] = jest.fn().mockResolvedValue(undefined);
      }
      return target[prop];
    },
  }) as Record<string, jest.Mock>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  const prevApi = win.api;
  win.api = api;

  const cleanup = () => {
    if (prevApi === undefined) {
      delete win.api;
    } else {
      win.api = prevApi;
    }
  };

  return { store, api, cleanup };
}
