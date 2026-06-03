/**
 * IdleStateManager — power-state machine unit tests.
 *
 * Electron's `powerMonitor` is mocked as a real EventEmitter so the class's
 * `powerMonitor.on('suspend'|'resume'|...)` wiring works in the Node test env
 * and tests can drive transitions by emitting events. `removeAllListeners` is
 * inherited from EventEmitter, so `stop()` works against the same instance.
 *
 * The LOAD-BEARING case is the macOS deadlock regression (`deadlock — resume
 * fires mid-onSuspend await`): with the OLD `!== 'suspended'` guard, a resume
 * arriving while powerState is still `'suspending'` was dropped and the app
 * stayed paused forever. The fixed guard (`=== 'active' || === 'resuming'`)
 * must let that resume through.
 */

import { EventEmitter } from 'events';

// powerMonitor is a singleton EventEmitter shared across the test file.
const powerMonitorMock = new EventEmitter();
// EventEmitter's default maxListeners is 10; start()/stop() cycles can register
// many across the suite — raise the cap so we don't get spurious leak warnings.
powerMonitorMock.setMaxListeners(100);

jest.mock('electron', () => ({
  powerMonitor: powerMonitorMock,
}));

import { IdleStateManager } from '../../src/layers/l0-utilities/IdleStateManager';

/** Flush microtasks so fire-and-forget async handlers settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('IdleStateManager', () => {
  let manager: IdleStateManager;

  afterEach(() => {
    // Ensure listeners are torn down even if a test failed before stop().
    manager?.stop();
    powerMonitorMock.removeAllListeners();
  });

  describe('normal suspend -> resume cycle', () => {
    it('runs onSuspend + onCheckpoint on suspend and onResume on resume, walking the state machine', async () => {
      const order: string[] = [];
      const onSuspend = jest.fn(async () => {
        order.push('suspend');
      });
      const onResume = jest.fn(async () => {
        order.push('resume');
      });
      const onCheckpoint = jest.fn(() => {
        order.push('checkpoint');
      });

      manager = new IdleStateManager({ onSuspend, onResume, onCheckpoint });
      manager.start();

      expect(manager.getState()).toBe('active');

      powerMonitorMock.emit('suspend');
      await flush();

      expect(onSuspend).toHaveBeenCalledTimes(1);
      expect(onCheckpoint).toHaveBeenCalledTimes(1);
      // onSuspend must run before the WAL checkpoint.
      expect(order).toEqual(['suspend', 'checkpoint']);
      expect(manager.getState()).toBe('suspended');
      expect(manager.isSuspended()).toBe(true);
      expect(manager.isActive()).toBe(false);

      powerMonitorMock.emit('resume');
      await flush();

      expect(onResume).toHaveBeenCalledTimes(1);
      expect(manager.getState()).toBe('active');
      expect(manager.isActive()).toBe(true);
      expect(manager.isSuspended()).toBe(false);
    });

    it('emits the suspending/suspended/resuming/resumed lifecycle events', async () => {
      const events: string[] = [];
      manager = new IdleStateManager({
        onSuspend: async () => {},
        onResume: async () => {},
        onCheckpoint: () => {},
      });
      for (const e of ['suspending', 'suspended', 'resuming', 'resumed']) {
        manager.on(e, () => events.push(e));
      }
      manager.start();

      powerMonitorMock.emit('suspend');
      await flush();
      powerMonitorMock.emit('resume');
      await flush();

      expect(events).toEqual(['suspending', 'suspended', 'resuming', 'resumed']);
    });
  });

  describe('deadlock regression — resume fires mid-onSuspend await', () => {
    it('still runs onResume when powerState is stuck at suspending', async () => {
      // onSuspend never resolves — simulates the macOS process freeze where the
      // OS halts the process mid-await before onSuspend (and thus the
      // powerState='suspended' assignment) completes.
      const onSuspend = jest.fn(() => new Promise<void>(() => {}));
      const onResume = jest.fn(async () => {});
      const onCheckpoint = jest.fn();

      manager = new IdleStateManager({ onSuspend, onResume, onCheckpoint });
      manager.start();

      powerMonitorMock.emit('suspend');
      await flush();

      // onSuspend is pending forever; state is stuck at 'suspending', NOT
      // 'suspended'. Checkpoint never ran because we never got past the await.
      expect(manager.getState()).toBe('suspending');
      expect(onCheckpoint).not.toHaveBeenCalled();

      // The OS wakes the machine. With the OLD guard (`!== 'suspended'`) this
      // resume would be dropped and the app would stay paused forever. The
      // fixed guard must let it through.
      powerMonitorMock.emit('resume');
      await flush();

      expect(onResume).toHaveBeenCalledTimes(1);
      expect(manager.getState()).toBe('active');
    });
  });

  describe('idempotency', () => {
    it('does not double-fire onSuspend on a double suspend', async () => {
      const onSuspend = jest.fn(async () => {});
      manager = new IdleStateManager({ onSuspend });
      manager.start();

      powerMonitorMock.emit('suspend');
      await flush();
      powerMonitorMock.emit('suspend');
      await flush();

      expect(onSuspend).toHaveBeenCalledTimes(1);
      expect(manager.getState()).toBe('suspended');
    });

    it('does not double-fire onResume on a double resume after a full cycle', async () => {
      const onResume = jest.fn(async () => {});
      manager = new IdleStateManager({ onSuspend: async () => {}, onResume });
      manager.start();

      powerMonitorMock.emit('suspend');
      await flush();
      powerMonitorMock.emit('resume');
      await flush();
      expect(onResume).toHaveBeenCalledTimes(1);

      // Resume again while already 'active' — guard must early-return.
      powerMonitorMock.emit('resume');
      await flush();
      expect(onResume).toHaveBeenCalledTimes(1);
      expect(manager.getState()).toBe('active');
    });
  });

  describe('callback failures still complete the transition', () => {
    it('reaches suspended even when onSuspend rejects, and a later resume works', async () => {
      const onSuspend = jest.fn(async () => {
        throw new Error('suspend boom');
      });
      const onResume = jest.fn(async () => {});
      const onCheckpoint = jest.fn();

      manager = new IdleStateManager({ onSuspend, onResume, onCheckpoint });
      manager.start();

      powerMonitorMock.emit('suspend');
      await flush();

      // catch path: state still moves to 'suspended'. Because the throw skips
      // the checkpoint, onCheckpoint never ran.
      expect(manager.getState()).toBe('suspended');
      expect(onCheckpoint).not.toHaveBeenCalled();

      powerMonitorMock.emit('resume');
      await flush();
      expect(onResume).toHaveBeenCalledTimes(1);
      expect(manager.getState()).toBe('active');
    });

    it('reaches active even when onResume rejects', async () => {
      const onResume = jest.fn(async () => {
        throw new Error('resume boom');
      });
      manager = new IdleStateManager({ onSuspend: async () => {}, onResume });
      manager.start();

      powerMonitorMock.emit('suspend');
      await flush();
      powerMonitorMock.emit('resume');
      await flush();

      expect(onResume).toHaveBeenCalledTimes(1);
      expect(manager.getState()).toBe('active');
    });
  });

  describe('start()/stop() lifecycle', () => {
    it('start() is idempotent — does not register duplicate suspend listeners', async () => {
      const onSuspend = jest.fn(async () => {});
      manager = new IdleStateManager({ onSuspend });
      manager.start();
      manager.start(); // second call should warn and no-op

      powerMonitorMock.emit('suspend');
      await flush();

      // If start() double-registered, the suspend listener would still only
      // fire one logical handleSuspend (powerState guard collapses it), so
      // assert on listener count too for a tighter check.
      expect(powerMonitorMock.listenerCount('suspend')).toBe(1);
      expect(onSuspend).toHaveBeenCalledTimes(1);
    });

    it('stop() removes all powerMonitor listeners and resets initialization', async () => {
      const onSuspend = jest.fn(async () => {});
      const onResume = jest.fn(async () => {});
      manager = new IdleStateManager({ onSuspend, onResume });
      manager.start();

      manager.stop();

      expect(powerMonitorMock.listenerCount('suspend')).toBe(0);
      expect(powerMonitorMock.listenerCount('resume')).toBe(0);
      expect(powerMonitorMock.listenerCount('lock-screen')).toBe(0);
      expect(powerMonitorMock.listenerCount('unlock-screen')).toBe(0);
      expect(powerMonitorMock.listenerCount('shutdown')).toBe(0);

      // Events after stop() do nothing.
      powerMonitorMock.emit('suspend');
      powerMonitorMock.emit('resume');
      await flush();
      expect(onSuspend).not.toHaveBeenCalled();
      expect(onResume).not.toHaveBeenCalled();

      // isInitialized reset -> start() works again.
      manager.start();
      expect(powerMonitorMock.listenerCount('suspend')).toBe(1);
    });
  });

  describe('lock-screen / shutdown events', () => {
    it('emits screen-locked / screen-unlocked on lock/unlock events', () => {
      manager = new IdleStateManager();
      manager.start();

      const locked = jest.fn();
      const unlocked = jest.fn();
      manager.on('screen-locked', locked);
      manager.on('screen-unlocked', unlocked);

      powerMonitorMock.emit('lock-screen');
      powerMonitorMock.emit('unlock-screen');

      expect(locked).toHaveBeenCalledTimes(1);
      expect(unlocked).toHaveBeenCalledTimes(1);
    });

    it('shutdown event runs the suspend path and emits shutdown', async () => {
      const onSuspend = jest.fn(async () => {});
      const onCheckpoint = jest.fn();
      manager = new IdleStateManager({ onSuspend, onCheckpoint });
      const shutdown = jest.fn();
      manager.on('shutdown', shutdown);
      manager.start();

      powerMonitorMock.emit('shutdown');
      await flush();

      expect(onSuspend).toHaveBeenCalledTimes(1);
      expect(onCheckpoint).toHaveBeenCalledTimes(1);
      expect(manager.getState()).toBe('suspended');
      expect(shutdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('state accessors', () => {
    it('isActive()/isSuspended() reflect each transition', async () => {
      manager = new IdleStateManager({
        onSuspend: async () => {},
        onResume: async () => {},
      });
      manager.start();

      expect(manager.isActive()).toBe(true);
      expect(manager.isSuspended()).toBe(false);

      powerMonitorMock.emit('suspend');
      await flush();
      expect(manager.isActive()).toBe(false);
      expect(manager.isSuspended()).toBe(true);

      powerMonitorMock.emit('resume');
      await flush();
      expect(manager.isActive()).toBe(true);
      expect(manager.isSuspended()).toBe(false);
    });
  });
});
