/**
 * importantWorksFilter — pure predicate extracted from ImportantWorksCard.
 * Coverage for the `importantWorksFilter` setting's type/threshold branches.
 */

import { taskPassesImportantWorksFilter } from '../../../../src/layers/l6-ui/components/Dashboard/importantWorksFilterPredicate';
import type { ImportantWorksFilter } from '../../../../src/layers/l5-presentation/settings';

const baseFilter: ImportantWorksFilter = {
  globalThreshold: 10,
  enabledTypes: ['assignment', 'quiz'],
  perTypeEnabled: false,
  perTypeThresholds: {},
};

describe('taskPassesImportantWorksFilter', () => {
  test('completed task → excluded', () => {
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: true, taskType: 'assignment', weight: 50 },
        baseFilter
      )
    ).toBe(false);
  });

  test('task with no type → excluded', () => {
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: false, taskType: null, weight: 50 },
        baseFilter
      )
    ).toBe(false);
  });

  test('type not in enabledTypes → excluded', () => {
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: false, taskType: 'discussion', weight: 50 },
        baseFilter
      )
    ).toBe(false);
  });

  test('empty enabledTypes → all types allowed', () => {
    const filter = { ...baseFilter, enabledTypes: [] };
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: false, taskType: 'discussion', weight: 50 },
        filter
      )
    ).toBe(true);
  });

  test('weight below global threshold → excluded', () => {
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: false, taskType: 'assignment', weight: 5 },
        baseFilter
      )
    ).toBe(false);
  });

  test('weight at/above global threshold → included', () => {
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: false, taskType: 'assignment', weight: 10 },
        baseFilter
      )
    ).toBe(true);
  });

  test('zero / missing weight → excluded', () => {
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: false, taskType: 'assignment', weight: 0 },
        baseFilter
      )
    ).toBe(false);
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: false, taskType: 'assignment', weight: null },
        baseFilter
      )
    ).toBe(false);
  });

  test('perTypeEnabled → uses the per-type threshold when present', () => {
    const filter: ImportantWorksFilter = {
      ...baseFilter,
      perTypeEnabled: true,
      perTypeThresholds: { assignment: 40 },
    };
    // 30 < per-type 40 → excluded (even though >= global 10)
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: false, taskType: 'assignment', weight: 30 },
        filter
      )
    ).toBe(false);
    // 45 >= 40 → included
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: false, taskType: 'assignment', weight: 45 },
        filter
      )
    ).toBe(true);
  });

  test('perTypeEnabled but no per-type entry → falls back to global threshold', () => {
    const filter: ImportantWorksFilter = {
      ...baseFilter,
      perTypeEnabled: true,
      perTypeThresholds: {},
    };
    expect(
      taskPassesImportantWorksFilter(
        { isCompleted: false, taskType: 'quiz', weight: 15 },
        filter
      )
    ).toBe(true);
  });
});
