/**
 * shouldSuppressNotification — pure predicate, all combinations.
 *
 * v1 policy (ADR-0016): suppress ONLY when quietWhenUnplugged is on AND the
 * machine is on battery. No platform reads here — state is injected, so this is
 * fully portable (dev=Windows, CI=Linux).
 */

import { shouldSuppressNotification } from '../../../src/lifecycle/notifications/shouldSuppressNotification';

describe('shouldSuppressNotification', () => {
  const cases: Array<{
    quietWhenUnplugged: boolean;
    onBatteryPower: boolean;
    expected: boolean;
  }> = [
    { quietWhenUnplugged: true, onBatteryPower: true, expected: true },
    { quietWhenUnplugged: true, onBatteryPower: false, expected: false },
    { quietWhenUnplugged: false, onBatteryPower: true, expected: false },
    { quietWhenUnplugged: false, onBatteryPower: false, expected: false },
  ];

  test.each(cases)(
    'quietWhenUnplugged=$quietWhenUnplugged, onBattery=$onBatteryPower → suppress=$expected',
    ({ quietWhenUnplugged, onBatteryPower, expected }) => {
      expect(shouldSuppressNotification({ quietWhenUnplugged }, { onBatteryPower })).toBe(
        expected
      );
    }
  );

  test('only suppresses when BOTH conditions are true (logical AND)', () => {
    expect(
      shouldSuppressNotification({ quietWhenUnplugged: true }, { onBatteryPower: true })
    ).toBe(true);
    // Flipping either operand must un-suppress.
    expect(
      shouldSuppressNotification({ quietWhenUnplugged: true }, { onBatteryPower: false })
    ).toBe(false);
    expect(
      shouldSuppressNotification({ quietWhenUnplugged: false }, { onBatteryPower: true })
    ).toBe(false);
  });
});
