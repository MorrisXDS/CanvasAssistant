/**
 * @jest-environment jsdom
 */

/**
 * setupTestEnv smoke test (ADR-0007 PR-T4 slice 2).
 *
 * Locks the three contracts PR-T5 / PR-T6 / future component tests will rely on:
 *  - factory isolation (each setupTestEnv() = fresh store, no cross-test leak)
 *  - Proxy-backed auto-stubs (any window.api method is `jest.fn().mockResolvedValue(undefined)`)
 *  - cleanup restores the prior `window.api` value
 *
 * Lives under `tests/l5-presentation/` because that's where the Jest config's
 * project matcher picks it up. The thing being tested is a test utility but
 * the test itself uses standard Jest patterns.
 */

import { setupTestEnv } from '../test-utils/testEnv';

describe('setupTestEnv', () => {
  describe('factory isolation', () => {
    it('two calls return two distinct stores (no shared state)', () => {
      const a = setupTestEnv();
      const b = setupTestEnv();

      // Same store factory shape — same type — but different identity.
      expect(a.store).not.toBe(b.store);

      // Mutating one doesn't leak into the other.
      a.store.setState({ lastError: 'only in A' });
      expect(a.store.getState().lastError).toBe('only in A');
      expect(b.store.getState().lastError).toBeNull();

      b.cleanup();
      a.cleanup();
    });

    it('the fresh store starts with the production initial state', () => {
      const env = setupTestEnv();

      const state = env.store.getState();
      expect(state.courses).toEqual([]);
      expect(state.tasks).toEqual([]);
      expect(state.notifications).toEqual([]);
      expect(state.isInitialized).toBe(false);

      env.cleanup();
    });
  });

  describe('window.api proxy', () => {
    it('auto-stubs any accessed method with jest.fn().mockResolvedValue(undefined)', async () => {
      const env = setupTestEnv();

      // Method name we definitely didn't pre-configure. The proxy should
      // mint a jest.fn() on first access.
      const fn = env.api.someBrandNewMethodName;
      expect(jest.isMockFunction(fn)).toBe(true);

      // Default behaviour: resolves to undefined.
      await expect(fn()).resolves.toBeUndefined();

      // Subsequent accesses return the SAME mock instance — call counts
      // and configured behaviours persist.
      expect(env.api.someBrandNewMethodName).toBe(fn);
      expect(fn).toHaveBeenCalledTimes(1);

      env.cleanup();
    });

    it('lets tests override individual methods via mockResolvedValue', async () => {
      const env = setupTestEnv();

      env.api.getCourses.mockResolvedValue([
        { id: 1, name: 'CS 101' },
        { id: 2, name: 'MATH 201' },
      ]);

      // window.api is the proxy; getCourses returns what the test configured.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (window as any).api.getCourses();
      expect(result).toEqual([
        { id: 1, name: 'CS 101' },
        { id: 2, name: 'MATH 201' },
      ]);

      env.cleanup();
    });
  });

  describe('cleanup', () => {
    it('restores window.api to undefined when no prior value existed', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((window as any).api).toBeUndefined();

      const env = setupTestEnv();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((window as any).api).toBeDefined();

      env.cleanup();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((window as any).api).toBeUndefined();
    });

    it('restores window.api to the prior value if one existed', () => {
      const sentinel = { thisIsThePriorApi: true };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).api = sentinel;

      const env = setupTestEnv();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((window as any).api).not.toBe(sentinel); // setupTestEnv replaced it

      env.cleanup();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((window as any).api).toBe(sentinel); // cleanup restored it

      // Final cleanup so other tests start fresh.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).api;
    });
  });
});
