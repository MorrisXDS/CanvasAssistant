/**
 * selectDueReminders — pure due-date selection, injected clock + dedup set.
 */

import {
  selectDueReminders,
  reminderDedupKey,
  type ReminderTaskInput,
} from '../../../src/lifecycle/notifications/selectDueReminders';

const HOUR = 60 * 60 * 1000;
const LEAD = 24 * HOUR;
const NOW = Date.parse('2026-06-07T12:00:00.000Z');

function task(over: Partial<ReminderTaskInput>): ReminderTaskInput {
  return {
    id: 1,
    title: 'Essay',
    course_id: 10,
    due_at: new Date(NOW + 12 * HOUR).toISOString(),
    is_completed: 0,
    ...over,
  };
}

describe('selectDueReminders', () => {
  test('qualifies a task due within the lead window', () => {
    const result = selectDueReminders([task({})], NOW, LEAD, new Set());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ taskId: 1, courseId: 10, title: 'Essay' });
  });

  test('excludes a completed task', () => {
    expect(
      selectDueReminders([task({ is_completed: 1 })], NOW, LEAD, new Set())
    ).toHaveLength(0);
  });

  test('excludes a task with no due_at', () => {
    expect(
      selectDueReminders([task({ due_at: null })], NOW, LEAD, new Set())
    ).toHaveLength(0);
  });

  test('excludes a task already past due (delta <= 0)', () => {
    expect(
      selectDueReminders(
        [task({ due_at: new Date(NOW - HOUR).toISOString() })],
        NOW,
        LEAD,
        new Set()
      )
    ).toHaveLength(0);
  });

  test('excludes a task due exactly now (delta === 0)', () => {
    expect(
      selectDueReminders(
        [task({ due_at: new Date(NOW).toISOString() })],
        NOW,
        LEAD,
        new Set()
      )
    ).toHaveLength(0);
  });

  test('excludes a task due beyond the lead window', () => {
    expect(
      selectDueReminders(
        [task({ due_at: new Date(NOW + 25 * HOUR).toISOString() })],
        NOW,
        LEAD,
        new Set()
      )
    ).toHaveLength(0);
  });

  test('includes a task due exactly at the lead boundary (delta === leadTimeMs)', () => {
    expect(
      selectDueReminders(
        [task({ due_at: new Date(NOW + LEAD).toISOString() })],
        NOW,
        LEAD,
        new Set()
      )
    ).toHaveLength(1);
  });

  test('excludes a task whose dedup key is already notified', () => {
    const t = task({});
    const already = new Set([reminderDedupKey(t.id, t.due_at!)]);
    expect(selectDueReminders([t], NOW, LEAD, already)).toHaveLength(0);
  });

  test('a due-date change re-arms (different dedup key)', () => {
    const original = task({ due_at: new Date(NOW + 5 * HOUR).toISOString() });
    const already = new Set([reminderDedupKey(original.id, original.due_at!)]);
    const moved = task({ due_at: new Date(NOW + 6 * HOUR).toISOString() });
    expect(selectDueReminders([moved], NOW, LEAD, already)).toHaveLength(1);
  });

  test('excludes a task with an unparseable due_at', () => {
    expect(
      selectDueReminders([task({ due_at: 'not-a-date' })], NOW, LEAD, new Set())
    ).toHaveLength(0);
  });

  test('handles a mixed batch', () => {
    const result = selectDueReminders(
      [
        task({ id: 1, due_at: new Date(NOW + 2 * HOUR).toISOString() }), // in
        task({ id: 2, is_completed: 1 }), // out (completed)
        task({ id: 3, due_at: new Date(NOW + 48 * HOUR).toISOString() }), // out (too far)
        task({ id: 4, due_at: new Date(NOW + 10 * HOUR).toISOString() }), // in
      ],
      NOW,
      LEAD,
      new Set()
    );
    expect(result.map((c) => c.taskId).sort()).toEqual([1, 4]);
  });
});
