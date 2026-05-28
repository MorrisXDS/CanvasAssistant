/**
 * setupTestEnv — foundation for component-integration testing.
 *
 * Per ADR-0007 PR-T4: gives each test its own fresh Zustand store
 * (sidestepping the production module singleton) plus a Proxy-backed
 * `window.api` stub that auto-fills any IPC method with
 * `jest.fn().mockResolvedValue(undefined)`. Zero maintenance as the
 * 176-method IPC surface grows.
 *
 * Two distinct use patterns — pick the right one for your test:
 *
 * 1. **Slice-level tests (PR-T3 pattern)** — testing store actions
 *    in isolation. Use `env.store` directly:
 *
 *      const env = setupTestEnv();
 *      env.api.getCourses.mockResolvedValue([…]);
 *      await myAction(env.store.setState, env.store.getState);
 *      expect(env.store.getState().courses).toEqual([…]);
 *
 * 2. **Component-integration tests (PR-T5 pattern)** — mounting a real
 *    React component. Components import the production `useStore`
 *    singleton, NOT this fresh `env.store`. They cannot read from
 *    `env.store`. Use the singleton directly via `useStore.setState`:
 *
 *      import { useStore } from '@/layers/l5-presentation/store';
 *
 *      beforeEach(() => { env = setupTestEnv(); });
 *      afterEach(() => {
 *        useStore.setState({ courses: [], notifications: [] }); // reset keys you touched
 *        env.cleanup();
 *      });
 *
 *      it('renders…', () => {
 *        env.api.getCourses.mockResolvedValue([…]);
 *        useStore.setState({ courses: […], notifications: […] });
 *        render(<MyComponent />); // reads from singleton via useStore()
 *      });
 *
 *    In pattern 2, `env.store` goes unused — it's a separate Zustand
 *    instance that the component never reads from. The valuable part of
 *    setupTestEnv() for component tests is `env.api`.
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
