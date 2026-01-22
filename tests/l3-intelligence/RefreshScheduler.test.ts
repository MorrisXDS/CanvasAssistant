import { RefreshScheduler } from '../../src/layers/l3-intelligence/RefreshScheduler';
import { PriorityEngine } from '../../src/layers/l3-intelligence/PriorityEngine';
import { PriorityConfig } from '../../src/layers/l3-intelligence/PriorityConfig';
import { Database } from '../../src/layers/l1-persistence/Database';
import { MigrationRunner, coreMigrations } from '../../src/layers/l1-persistence/MigrationRunner';
import path from 'path';
import fs from 'fs';

describe('RefreshScheduler', () => {
  let db: Database;
  let config: PriorityConfig;
  let engine: PriorityEngine;
  let scheduler: RefreshScheduler;
  const testDbPath = path.join(__dirname, '../../test-data/refresh-scheduler-test.db');

  beforeAll(() => {
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  beforeEach(() => {
    jest.useFakeTimers();
    // Clean up previous test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDbPath + '-wal')) {
      fs.unlinkSync(testDbPath + '-wal');
    }
    if (fs.existsSync(testDbPath + '-shm')) {
      fs.unlinkSync(testDbPath + '-shm');
    }

    // Initialize database
    db = new Database({ dbPath: testDbPath });
    db.initialize();

    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    // Create test course
    db.upsert('courses', {
      external_id: '12345',
      code: 'CSC101',
      name: 'Intro to CS',
      current_grade: 85,
      target_grade: 90,
          });

    config = new PriorityConfig();
    engine = new PriorityEngine(db, config);
    scheduler = new RefreshScheduler(config, engine);
  });

  afterEach(() => {
    scheduler.stop();
    db.close();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('start / stop', () => {
    it('should start the scheduler', () => {
      expect(scheduler.isActive()).toBe(false);

      scheduler.start();

      expect(scheduler.isActive()).toBe(true);
    });

    it('should emit started event', () => {
      const handler = jest.fn();
      scheduler.on('started', handler);

      scheduler.start();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not start twice', () => {
      const handler = jest.fn();
      scheduler.on('started', handler);

      scheduler.start();
      scheduler.start();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should stop the scheduler', () => {
      scheduler.start();
      expect(scheduler.isActive()).toBe(true);

      scheduler.stop();

      expect(scheduler.isActive()).toBe(false);
    });

    it('should emit stopped event', () => {
      const handler = jest.fn();
      scheduler.on('stopped', handler);

      scheduler.start();
      scheduler.stop();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should clear all scheduled jobs on stop', () => {
      scheduler.start();

      // Wait a tick for initial refresh to schedule
      scheduler.stop();

      expect(scheduler.getScheduledJobs()).toHaveLength(0);
    });
  });

  describe('scheduleFullRefresh', () => {
    it('should schedule a full refresh job', () => {
      scheduler.scheduleFullRefresh(1000);

      const jobs = scheduler.getScheduledJobs();
      expect(jobs.some((j) => j.id === 'full-refresh')).toBe(true);
    });

    it('should emit job-scheduled event', () => {
      const handler = jest.fn();
      scheduler.on('job-scheduled', handler);

      scheduler.scheduleFullRefresh(1000);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'full-refresh',
          tier: 'full',
        })
      );
    });

    it('should cancel existing full refresh when new one is scheduled', () => {
      scheduler.scheduleFullRefresh(10000);
      scheduler.scheduleFullRefresh(5000);

      const jobs = scheduler.getScheduledJobs();
      const fullRefreshJobs = jobs.filter((j) => j.id === 'full-refresh');
      expect(fullRefreshJobs).toHaveLength(1);
    });
  });

  describe('scheduleTaskRefresh', () => {
    it('should schedule a task-specific refresh', () => {
      scheduler.scheduleTaskRefresh(1, 1000, 'halfHourly');

      const jobs = scheduler.getScheduledJobs();
      expect(jobs.some((j) => j.id === 'task-1')).toBe(true);
    });

    it('should include task ID and tier', () => {
      const handler = jest.fn();
      scheduler.on('job-scheduled', handler);

      scheduler.scheduleTaskRefresh(42, 1000, 'sixHourly');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'task-42',
          taskId: 42,
          tier: 'sixHourly',
        })
      );
    });

    it('should replace existing job for same task', () => {
      scheduler.scheduleTaskRefresh(1, 10000, 'daily');
      scheduler.scheduleTaskRefresh(1, 5000, 'sixHourly');

      const jobs = scheduler.getScheduledJobs();
      const taskJobs = jobs.filter((j) => j.taskId === 1);
      expect(taskJobs).toHaveLength(1);
      expect(taskJobs[0].tier).toBe('sixHourly');
    });
  });

  describe('forceRefresh', () => {
    it('should execute immediate refresh', () => {
      const result = scheduler.forceRefresh();

      expect(result).toBeDefined();
      expect(result.calculatedAt).toBeInstanceOf(Date);
    });

    it('should emit refresh-complete event', () => {
      const handler = jest.fn();
      scheduler.on('refresh-complete', handler);

      scheduler.forceRefresh();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'forced',
          result: expect.any(Object),
        })
      );
    });

    it('should update statistics', () => {
      const statsBefore = scheduler.getStats();
      expect(statsBefore.totalRefreshes).toBe(0);

      scheduler.forceRefresh();

      const statsAfter = scheduler.getStats();
      expect(statsAfter.totalRefreshes).toBe(1);
      expect(statsAfter.lastFullRefresh).toBeInstanceOf(Date);
    });
  });

  describe('getLastResult', () => {
    it('should return null before any refresh', () => {
      expect(scheduler.getLastResult()).toBeNull();
    });

    it('should return result after refresh', () => {
      scheduler.forceRefresh();

      const result = scheduler.getLastResult();
      expect(result).not.toBeNull();
      expect(result?.queues).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should track refresh statistics', () => {
      scheduler.forceRefresh();
      scheduler.forceRefresh();

      const stats = scheduler.getStats();
      expect(stats.totalRefreshes).toBe(2);
    });

    it('should track tier counts', () => {
      scheduler.forceRefresh(); // Creates 'forced' tier count

      const stats = scheduler.getStats();
      expect(stats.tierCounts.get('forced')).toBe(1);
    });
  });

  describe('notifyTaskModified', () => {
    it('should schedule immediate task refresh when running', () => {
      scheduler.start();

      const handler = jest.fn();
      scheduler.on('job-scheduled', handler);

      scheduler.notifyTaskModified(42);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 42,
          tier: 'modified',
        })
      );
    });

    it('should do nothing when not running', () => {
      const handler = jest.fn();
      scheduler.on('job-scheduled', handler);

      scheduler.notifyTaskModified(42);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('notifySyncComplete', () => {
    it('should schedule full refresh when running', () => {
      scheduler.start();
      scheduler.stop(); // Stop initial refresh

      scheduler.start();

      const handler = jest.fn();
      scheduler.on('job-scheduled', handler);

      scheduler.notifySyncComplete();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'full-refresh',
        })
      );
    });

    it('should do nothing when not running', () => {
      const handler = jest.fn();
      scheduler.on('job-scheduled', handler);

      scheduler.notifySyncComplete();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('config change handling', () => {
    it('should reschedule on refresh-tier-changed event', () => {
      scheduler.start();

      // Advance time for initial job to be scheduled
      jest.advanceTimersByTime(50);

      // Should trigger reschedule
      config.updateRefreshTier('halfHourly', { refreshIntervalMs: 15 * 60 * 1000 });

      // Reschedule happens
      jest.advanceTimersByTime(50);

      expect(scheduler.isActive()).toBe(true);
    });

    it('should reschedule on config-reset event', () => {
      scheduler.start();

      jest.advanceTimersByTime(50);

      config.resetToDefaults();

      jest.advanceTimersByTime(50);

      expect(scheduler.isActive()).toBe(true);
    });
  });

  describe('with real tasks', () => {
    it('should track task refresh counts', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const urgentDate = new Date(Date.now() + 4 * 60 * 60 * 1000);

      db.upsert('tasks', {
        external_id: 'urgent-task',
        course_id: courseId,
        title: 'Urgent Task',
        due_at: urgentDate.toISOString(),
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      scheduler.forceRefresh();

      const result = scheduler.getLastResult();
      expect(result?.queues.active.length).toBeGreaterThan(0);
    });
  });

  describe('execution behavior', () => {
    it('should not execute when stopped', () => {
      scheduler.scheduleFullRefresh(10); // Very short delay

      // Stop before it can execute
      scheduler.stop();

      const handler = jest.fn();
      scheduler.on('refresh-complete', handler);

      jest.advanceTimersByTime(50);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should execute scheduled refresh', () => {
      scheduler.start();

      const handler = jest.fn();
      scheduler.on('refresh-complete', handler);

      // Initial refresh should execute immediately (delay 0)
      jest.advanceTimersByTime(100);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('job cancellation', () => {
    it('should emit job-cancelled event when job is cancelled', () => {
      const handler = jest.fn();
      scheduler.on('job-cancelled', handler);

      scheduler.scheduleFullRefresh(10000);
      scheduler.scheduleFullRefresh(5000); // Cancels previous

      expect(handler).toHaveBeenCalledWith({ jobId: 'full-refresh' });
    });
  });

  describe('getScheduledJobs', () => {
    it('should return array of scheduled jobs', () => {
      scheduler.scheduleFullRefresh(10000);
      scheduler.scheduleTaskRefresh(1, 5000, 'halfHourly');

      const jobs = scheduler.getScheduledJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs.some((j) => j.id === 'full-refresh')).toBe(true);
      expect(jobs.some((j) => j.id === 'task-1')).toBe(true);
    });

    it('should include scheduled time', () => {
      const now = Date.now();
      scheduler.scheduleFullRefresh(10000);

      const jobs = scheduler.getScheduledJobs();
      const fullRefresh = jobs.find((j) => j.id === 'full-refresh');

      expect(fullRefresh?.scheduledAt.getTime()).toBeGreaterThanOrEqual(now + 9000);
      expect(fullRefresh?.scheduledAt.getTime()).toBeLessThanOrEqual(now + 11000);
    });
  });
});
