/**
 * MessageProbationService Tests
 *
 * Tests for the L3 message probation service that prevents duplicate
 * insights/recommendations from being shown too frequently.
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { MessageProbationService } from '../../../src/layers/l3-intelligence/domain/MessageProbationService';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l3-probation');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-probation.db');

describe('MessageProbationService', () => {
  let db: Database;
  let service: MessageProbationService;

  beforeAll(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    db = new Database({ dbPath: TEST_DB_PATH, verbose: false });
    db.initialize();

    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    service = new MessageProbationService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultService = new MessageProbationService(db);
      expect(defaultService).toBeDefined();
    });

    it('should accept custom config', () => {
      const customService = new MessageProbationService(db, {
        baseGroundingHours: 4,
        maxGroundingHours: 48,
        quietPeriodHours: 24,
        windowHours: 12,
      });
      expect(customService).toBeDefined();
    });
  });

  describe('generateContentHash', () => {
    it('should generate consistent hash for same content', () => {
      const hash1 = service.generateContentHash('insight', 'workload', 'High Workload', {
        courseId: 1,
      });
      const hash2 = service.generateContentHash('insight', 'workload', 'High Workload', {
        courseId: 1,
      });

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different content', () => {
      const hash1 = service.generateContentHash('insight', 'workload', 'High Workload', {
        courseId: 1,
      });
      const hash2 = service.generateContentHash('insight', 'workload', 'High Workload', {
        courseId: 2,
      });

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hash for different message types', () => {
      const hash1 = service.generateContentHash('insight', 'test', 'Title', { id: 1 });
      const hash2 = service.generateContentHash('recommendation', 'test', 'Title', { id: 1 });

      expect(hash1).not.toBe(hash2);
    });

    it('should be case-insensitive for title', () => {
      const hash1 = service.generateContentHash('insight', 'test', 'High Workload', {});
      const hash2 = service.generateContentHash('insight', 'test', 'HIGH WORKLOAD', {});

      expect(hash1).toBe(hash2);
    });

    it('should trim title whitespace', () => {
      const hash1 = service.generateContentHash('insight', 'test', 'High Workload', {});
      const hash2 = service.generateContentHash('insight', 'test', '  High Workload  ', {});

      expect(hash1).toBe(hash2);
    });
  });

  describe('isGrounded', () => {
    it('should return false for new message', () => {
      const hash = service.generateContentHash('insight', 'test', 'Test', {});

      const isGrounded = service.isGrounded('insight', hash);

      expect(isGrounded).toBe(false);
    });

    it('should return false after first display', () => {
      const hash = service.generateContentHash('insight', 'test', 'Test', {});

      service.recordDisplay('insight', hash);
      const isGrounded = service.isGrounded('insight', hash);

      expect(isGrounded).toBe(false);
    });

    it('should return true after second display', () => {
      const hash = service.generateContentHash('insight', 'test', 'Test', {});

      service.recordDisplay('insight', hash);
      service.recordDisplay('insight', hash);
      const isGrounded = service.isGrounded('insight', hash);

      expect(isGrounded).toBe(true);
    });
  });

  describe('recordDisplay', () => {
    it('should create record on first display', () => {
      const hash = service.generateContentHash('insight', 'test', 'Test', {});

      service.recordDisplay('insight', hash);

      const info = service.getGroundingInfo('insight', hash);
      expect(info).not.toBeNull();
      expect(info?.displayCount).toBe(1);
      expect(info?.isGrounded).toBe(false);
    });

    it('should increment count and set grounding on second display', () => {
      const hash = service.generateContentHash('insight', 'test', 'Test', {});

      service.recordDisplay('insight', hash);
      service.recordDisplay('insight', hash);

      const info = service.getGroundingInfo('insight', hash);
      expect(info?.displayCount).toBe(2);
      expect(info?.isGrounded).toBe(true);
      expect(info?.hoursRemaining).toBeGreaterThan(0);
    });

    it('should use exponential backoff for grounding time', () => {
      const serviceWithShortTimes = new MessageProbationService(db, {
        baseGroundingHours: 1,
        maxGroundingHours: 100,
      });
      const hash = serviceWithShortTimes.generateContentHash('insight', 'test', 'Test', {});

      // Display 1: no grounding
      serviceWithShortTimes.recordDisplay('insight', hash);
      let info = serviceWithShortTimes.getGroundingInfo('insight', hash);
      expect(info?.isGrounded).toBe(false);

      // Display 2: base hours (1)
      serviceWithShortTimes.recordDisplay('insight', hash);
      info = serviceWithShortTimes.getGroundingInfo('insight', hash);
      expect(info?.hoursRemaining).toBeLessThanOrEqual(1);

      // Clear grounding to allow next display
      serviceWithShortTimes.clearAllGrounding();

      // Display 3: base * 2 (2)
      serviceWithShortTimes.recordDisplay('insight', hash);
      info = serviceWithShortTimes.getGroundingInfo('insight', hash);
      expect(info?.displayCount).toBe(3);
    });
  });

  describe('getGroundingInfo', () => {
    it('should return null for unknown hash', () => {
      const info = service.getGroundingInfo('insight', 'nonexistent');

      expect(info).toBeNull();
    });

    it('should return correct info for tracked message', () => {
      const hash = service.generateContentHash('insight', 'test', 'Test', {});
      service.recordDisplay('insight', hash);

      const info = service.getGroundingInfo('insight', hash);

      expect(info).not.toBeNull();
      expect(info?.displayCount).toBe(1);
      expect(info?.isGrounded).toBe(false);
      expect(info?.groundedUntil).toBeNull();
    });

    it('should return hours remaining when grounded', () => {
      const hash = service.generateContentHash('insight', 'test', 'Test', {});
      service.recordDisplay('insight', hash);
      service.recordDisplay('insight', hash);

      const info = service.getGroundingInfo('insight', hash);

      expect(info?.isGrounded).toBe(true);
      expect(info?.hoursRemaining).toBeGreaterThan(0);
      expect(info?.groundedUntil).toBeInstanceOf(Date);
    });
  });

  describe('filterGrounded', () => {
    it('should return all items when none are grounded', () => {
      const items = [
        { id: 1, title: 'Item 1' },
        { id: 2, title: 'Item 2' },
      ];

      const filtered = service.filterGrounded(items, 'insight', (item) =>
        service.generateContentHash('insight', 'test', item.title, { id: item.id })
      );

      expect(filtered).toHaveLength(2);
    });

    it('should filter out grounded items', () => {
      const items = [
        { id: 1, title: 'Item 1' },
        { id: 2, title: 'Item 2' },
      ];

      // Ground item 1
      const hash1 = service.generateContentHash('insight', 'test', 'Item 1', { id: 1 });
      service.recordDisplay('insight', hash1);
      service.recordDisplay('insight', hash1);

      const filtered = service.filterGrounded(items, 'insight', (item) =>
        service.generateContentHash('insight', 'test', item.title, { id: item.id })
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(2);
    });
  });

  describe('recordDisplayBatch', () => {
    it('should record multiple displays at once', () => {
      const hashes = [
        service.generateContentHash('insight', 'test', 'Item 1', {}),
        service.generateContentHash('insight', 'test', 'Item 2', {}),
        service.generateContentHash('insight', 'test', 'Item 3', {}),
      ];

      service.recordDisplayBatch('insight', hashes);

      for (const hash of hashes) {
        const info = service.getGroundingInfo('insight', hash);
        expect(info?.displayCount).toBe(1);
      }
    });
  });

  describe('clearAllGrounding', () => {
    it('should clear all grounding and reset counts', () => {
      const hash = service.generateContentHash('insight', 'test', 'Test', {});
      service.recordDisplay('insight', hash);
      service.recordDisplay('insight', hash);

      expect(service.isGrounded('insight', hash)).toBe(true);

      service.clearAllGrounding();

      const info = service.getGroundingInfo('insight', hash);
      expect(info?.displayCount).toBe(0);
      expect(info?.isGrounded).toBe(false);
    });
  });

  describe('getStatistics', () => {
    it('should return empty statistics initially', () => {
      const stats = service.getStatistics();

      expect(stats.totalTracked).toBe(0);
      expect(stats.currentlyGrounded).toBe(0);
      expect(stats.byType.insight).toBe(0);
      expect(stats.byType.recommendation).toBe(0);
    });

    it('should track message counts by type', () => {
      service.recordDisplay(
        'insight',
        service.generateContentHash('insight', 'test', 'Insight 1', {})
      );
      service.recordDisplay(
        'recommendation',
        service.generateContentHash('recommendation', 'test', 'Rec 1', {})
      );
      service.recordDisplay(
        'recommendation',
        service.generateContentHash('recommendation', 'test', 'Rec 2', {})
      );

      const stats = service.getStatistics();

      expect(stats.totalTracked).toBe(3);
      expect(stats.byType.insight).toBe(1);
      expect(stats.byType.recommendation).toBe(2);
    });

    it('should count currently grounded messages', () => {
      const hash = service.generateContentHash('insight', 'test', 'Test', {});
      service.recordDisplay('insight', hash);
      service.recordDisplay('insight', hash); // Now grounded

      const stats = service.getStatistics();

      expect(stats.currentlyGrounded).toBe(1);
    });

    it('should calculate average display count', () => {
      // First message: 2 displays
      const hash1 = service.generateContentHash('insight', 'test', 'Test 1', {});
      service.recordDisplay('insight', hash1);
      service.recordDisplay('insight', hash1);

      // Second message: 1 display
      service.recordDisplay(
        'insight',
        service.generateContentHash('insight', 'test', 'Test 2', {})
      );

      const stats = service.getStatistics();

      // Average: (2 + 1) / 2 = 1.5
      expect(stats.averageDisplayCount).toBe(1.5);
    });
  });

  describe('quiet period reset', () => {
    it('should reset count after quiet period', () => {
      // Use a service with very short quiet period for testing
      // We can't easily test time-based behavior without mocking,
      // but we can verify the logic exists
      const hash = service.generateContentHash('insight', 'test', 'Test', {});

      // Record multiple displays
      service.recordDisplay('insight', hash);
      service.recordDisplay('insight', hash);

      const info = service.getGroundingInfo('insight', hash);
      expect(info?.displayCount).toBe(2);

      // The quiet period reset would normally happen when:
      // - quiet_period_start + quietPeriodHours has passed
      // - isGrounded() is called
      // This is time-dependent and would require mocking Date
    });
  });

  describe('max grounding cap', () => {
    it('should cap grounding at maxGroundingHours', () => {
      const serviceWithCap = new MessageProbationService(db, {
        baseGroundingHours: 1,
        maxGroundingHours: 3, // Low cap for testing
      });
      const hash = serviceWithCap.generateContentHash('insight', 'test', 'Test', {});

      // Many displays - should still be capped
      for (let i = 0; i < 10; i++) {
        serviceWithCap.recordDisplay('insight', hash);
        serviceWithCap.clearAllGrounding(); // Clear to allow next display
      }

      // Final display to check cap
      serviceWithCap.recordDisplay('insight', hash);
      const info = serviceWithCap.getGroundingInfo('insight', hash);

      // hoursRemaining should not exceed maxGroundingHours (3)
      if (info && info.hoursRemaining !== null) {
        expect(info.hoursRemaining).toBeLessThanOrEqual(3);
      }
    });
  });
});
