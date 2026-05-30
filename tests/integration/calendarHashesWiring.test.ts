/**
 * Wiring coverage for the ADR-0007 relocation of recomputeCalendarHashes:
 * exercises the barrel re-exports (l2-daemon + l2-daemon/calendar) and the
 * `calendarHandlers` import line. electron is mocked so the handler module
 * (which pulls in `ipcMain`) loads in the node test env.
 */

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn(), on: jest.fn() },
}));

import { recomputeCalendarHashes as fromL2Barrel } from '../../src/layers/l2-daemon';
import { recomputeCalendarHashes as fromCalendarBarrel } from '../../src/layers/l2-daemon/calendar';
import { registerCalendarHandlers } from '../../src/lifecycle/ipc-handlers/calendarHandlers';

describe('recomputeCalendarHashes wiring (ADR-0007 relocation)', () => {
  test('is re-exported from both l2-daemon barrels', () => {
    expect(typeof fromL2Barrel).toBe('function');
    expect(typeof fromCalendarBarrel).toBe('function');
    expect(fromL2Barrel).toBe(fromCalendarBarrel);
  });

  test('the calendar handler facade loads and exposes its registrar', () => {
    expect(typeof registerCalendarHandlers).toBe('function');
  });
});
