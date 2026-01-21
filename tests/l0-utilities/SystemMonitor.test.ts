import { SystemMonitor, SystemState } from '../../src/layers/l0-utilities/SystemMonitor';

// Mock Electron's powerMonitor
jest.mock('electron', () => ({
  powerMonitor: {
    isOnBatteryPower: jest.fn(() => false),
  },
}));

describe('SystemMonitor', () => {
  let monitor: SystemMonitor;

  beforeEach(() => {
    monitor = new SystemMonitor();
  });

  afterEach(() => {
    monitor.stop();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const state = monitor.getState();

      expect(state).toHaveProperty('powerSource');
      expect(state).toHaveProperty('batteryLevel');
      expect(state).toHaveProperty('isCharging');
      expect(state).toHaveProperty('windowFocused');
      expect(state).toHaveProperty('isFullscreen');
      expect(state).toHaveProperty('canSync');
    });

    it('should start with unknown power source', () => {
      const state = monitor.getState();
      expect(state.powerSource).toBe('unknown');
    });

    it('should default to window focused', () => {
      const state = monitor.getState();
      expect(state.windowFocused).toBe(true);
    });

    it('should default to not fullscreen', () => {
      const state = monitor.getState();
      expect(state.isFullscreen).toBe(false);
    });
  });

  describe('Window State Updates', () => {
    it('should update window focus state', () => {
      monitor.setWindowFocused(false);
      const state = monitor.getState();
      expect(state.windowFocused).toBe(false);

      monitor.setWindowFocused(true);
      const updatedState = monitor.getState();
      expect(updatedState.windowFocused).toBe(true);
    });

    it('should update fullscreen state', () => {
      monitor.setFullscreen(true);
      const state = monitor.getState();
      expect(state.isFullscreen).toBe(true);

      monitor.setFullscreen(false);
      const updatedState = monitor.getState();
      expect(updatedState.isFullscreen).toBe(false);
    });

    it('should emit event when window focus changes', (done) => {
      monitor.on('state-change', (state: SystemState) => {
        expect(state.windowFocused).toBe(false);
        done();
      });

      monitor.setWindowFocused(false);
    });

    it('should emit event when fullscreen changes', (done) => {
      monitor.on('state-change', (state: SystemState) => {
        expect(state.isFullscreen).toBe(true);
        done();
      });

      monitor.setFullscreen(true);
    });

    it('should NOT emit event if state has not changed', () => {
      const spy = jest.fn();
      monitor.on('state-change', spy);

      // Set to same value twice
      monitor.setWindowFocused(true);
      monitor.setWindowFocused(true);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Start and Stop', () => {
    it('should start monitoring', () => {
      expect(() => monitor.start()).not.toThrow();
    });

    it('should stop monitoring', () => {
      monitor.start();
      expect(() => monitor.stop()).not.toThrow();
    });

    it('should not start multiple times', () => {
      monitor.start();
      monitor.start(); // Should be idempotent
      monitor.stop();
    });
  });

  describe('State Description', () => {
    it('should provide human-readable state description', () => {
      const description = monitor.getStateDescription();

      expect(description).toBeTruthy();
      expect(typeof description).toBe('string');
      expect(description).toContain('Power:');
    });

    it('should indicate when sync is allowed', () => {
      monitor.setWindowFocused(true);
      const state = monitor.getState();

      // On AC power with window focused, sync should be allowed
      expect(state.canSync).toBe(true);

      const description = monitor.getStateDescription();
      expect(description).toContain('Sync: ✓');
    });

    it('should show focused state in description', () => {
      monitor.setWindowFocused(true);
      let description = monitor.getStateDescription();
      expect(description).toContain('Focused');

      monitor.setWindowFocused(false);
      description = monitor.getStateDescription();
      expect(description).toContain('Unfocused');
    });

    it('should show fullscreen state in description', () => {
      monitor.setFullscreen(true);
      const description = monitor.getStateDescription();
      expect(description).toContain('Fullscreen');
    });
  });

  describe('Event Emissions', () => {
    it('should only emit events when state changes', () => {
      const eventSpy = jest.fn();
      monitor.on('state-change', eventSpy);

      // First change should emit
      monitor.setWindowFocused(false);
      expect(eventSpy).toHaveBeenCalledTimes(1);

      // Same value should not emit
      monitor.setWindowFocused(false);
      expect(eventSpy).toHaveBeenCalledTimes(1);

      // Different value should emit
      monitor.setWindowFocused(true);
      expect(eventSpy).toHaveBeenCalledTimes(2);
    });

    it('should emit complete state object on change', (done) => {
      monitor.on('state-change', (state: SystemState) => {
        expect(state).toHaveProperty('powerSource');
        expect(state).toHaveProperty('windowFocused');
        expect(state).toHaveProperty('isFullscreen');
        expect(state).toHaveProperty('canSync');
        done();
      });

      monitor.setWindowFocused(false);
    });
  });
});
