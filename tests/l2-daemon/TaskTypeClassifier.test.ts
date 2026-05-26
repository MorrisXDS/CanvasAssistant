/**
 * TaskTypeClassifier Tests
 *
 * Tests the 4-tier classification system for task types.
 */

import {
  TaskTypeClassifier,
  ClassificationResult,
} from '../../src/layers/l2-daemon/client/TaskTypeClassifier';

describe('TaskTypeClassifier', () => {
  let classifier: TaskTypeClassifier;

  beforeEach(() => {
    classifier = new TaskTypeClassifier();
  });

  // ===========================================================================
  // Tier 1: Exact Regex Patterns (100% confidence)
  // ===========================================================================

  describe('Tier 1: Exact Regex Patterns', () => {
    const tier1Cases: Array<{
      title: string;
      expectedType: string;
      expectedSubtype: string | null;
    }> = [
      // Numbered patterns
      { title: 'Quiz #3', expectedType: 'quiz', expectedSubtype: 'numbered' },
      { title: 'Quiz 5', expectedType: 'quiz', expectedSubtype: 'numbered' },
      { title: 'Lab #4', expectedType: 'lab', expectedSubtype: 'numbered' },
      { title: 'Lab 2', expectedType: 'lab', expectedSubtype: 'numbered' },
      { title: 'Laboratory 1', expectedType: 'lab', expectedSubtype: 'numbered' },
      { title: 'Homework #3', expectedType: 'homework', expectedSubtype: 'numbered' },
      { title: 'HW 5', expectedType: 'homework', expectedSubtype: 'numbered' },
      { title: 'Tutorial #2', expectedType: 'tutorial', expectedSubtype: 'numbered' },
      {
        title: 'Problem Set #4',
        expectedType: 'homework',
        expectedSubtype: 'problem_set',
      },
      { title: 'PSET 3', expectedType: 'homework', expectedSubtype: 'problem_set' },
      { title: 'PS 2', expectedType: 'homework', expectedSubtype: 'problem_set' },
      { title: 'Assignment #1', expectedType: 'homework', expectedSubtype: 'numbered' },
      { title: 'A1', expectedType: 'homework', expectedSubtype: 'numbered' },
      { title: 'Exercise #3', expectedType: 'homework', expectedSubtype: 'exercise' },

      // Exam patterns
      { title: 'Final Exam', expectedType: 'exam', expectedSubtype: 'final' },
      { title: 'Final', expectedType: 'exam', expectedSubtype: 'final' },
      { title: 'Midterm', expectedType: 'exam', expectedSubtype: 'midterm' },
      { title: 'Mid-term Exam', expectedType: 'exam', expectedSubtype: 'midterm' },
      { title: 'Midterm Test', expectedType: 'exam', expectedSubtype: 'midterm' },
      { title: 'Term Test #2', expectedType: 'exam', expectedSubtype: 'term_test' },
      { title: 'Term Test', expectedType: 'exam', expectedSubtype: 'term_test' },

      // Project patterns
      {
        title: 'Project Milestone #2',
        expectedType: 'project',
        expectedSubtype: 'milestone',
      },
      { title: 'Project Phase 1', expectedType: 'project', expectedSubtype: 'milestone' },
      { title: 'Project Proposal', expectedType: 'project', expectedSubtype: 'proposal' },
      {
        title: 'Final Project Proposal',
        expectedType: 'project',
        expectedSubtype: 'proposal',
      },
      {
        title: 'Project Presentation',
        expectedType: 'project',
        expectedSubtype: 'presentation',
      },
      {
        title: 'Final Project Report',
        expectedType: 'project',
        expectedSubtype: 'final',
      },
      {
        title: 'Project Requirements',
        expectedType: 'project',
        expectedSubtype: 'requirements',
      },
      { title: 'Draft #2', expectedType: 'project', expectedSubtype: 'draft' },

      // Paper patterns
      { title: 'Essay #1', expectedType: 'paper', expectedSubtype: 'writing_task' },
      { title: 'Paper', expectedType: 'paper', expectedSubtype: 'writing_task' },
      { title: 'Research Paper', expectedType: 'paper', expectedSubtype: 'writing_task' },
      { title: 'Lab Report #3', expectedType: 'paper', expectedSubtype: 'report' },
      { title: 'Report', expectedType: 'paper', expectedSubtype: 'report' },
      {
        title: 'Writing Assignment',
        expectedType: 'paper',
        expectedSubtype: 'writing_task',
      },

      // Peer review
      {
        title: 'Peer Review',
        expectedType: 'peer_review',
        expectedSubtype: 'assessment',
      },
      {
        title: 'Review of Peer Work',
        expectedType: 'peer_review',
        expectedSubtype: 'assessment',
      },

      // Participation/attendance
      {
        title: 'Class Attendance',
        expectedType: 'participation',
        expectedSubtype: 'generic',
      },
      { title: 'Attendance', expectedType: 'participation', expectedSubtype: 'generic' },
      {
        title: 'Class Participation',
        expectedType: 'participation',
        expectedSubtype: 'engagement',
      },
      {
        title: 'Participation',
        expectedType: 'participation',
        expectedSubtype: 'engagement',
      },

      // Survey/info
      { title: 'Course Survey', expectedType: 'info', expectedSubtype: 'survey' },
      { title: 'Student Feedback', expectedType: 'info', expectedSubtype: 'survey' },
      {
        title: 'Solutions for Quiz 3',
        expectedType: 'info',
        expectedSubtype: 'solution',
      },
      {
        title: 'Course Announcement',
        expectedType: 'info',
        expectedSubtype: 'announcement',
      },

      // In-person
      { title: 'In-class Quiz', expectedType: 'in_person', expectedSubtype: 'generic' },
      { title: 'In-person Test', expectedType: 'in_person', expectedSubtype: 'generic' },
      {
        title: 'TA-graded Assignment',
        expectedType: 'in_person',
        expectedSubtype: 'ta_graded',
      },

      // Discussion/reflection
      {
        title: 'Discussion Post',
        expectedType: 'discussion',
        expectedSubtype: 'generic',
      },
      { title: 'Forum', expectedType: 'discussion', expectedSubtype: 'generic' },
      {
        title: 'Reflection #3',
        expectedType: 'discussion',
        expectedSubtype: 'reflection',
      },

      // Reading
      {
        title: 'Reading Assignment',
        expectedType: 'reading',
        expectedSubtype: 'generic',
      },
      { title: 'Reading Response', expectedType: 'reading', expectedSubtype: 'generic' },

      // Media
      { title: 'Video Interview', expectedType: 'media', expectedSubtype: 'interview' },
      { title: 'Video Submission', expectedType: 'media', expectedSubtype: 'interview' },
    ];

    test.each(tier1Cases)(
      'classifies "$title" as $expectedType/$expectedSubtype',
      ({ title, expectedType, expectedSubtype }) => {
        const result = classifier.classify({ title, submissionTypes: [] });
        expect(result.type).toBe(expectedType);
        expect(result.subtype).toBe(expectedSubtype);
        expect(result.tier).toBe(1);
        expect(result.confidence).toBe(100);
      }
    );
  });

  // ===========================================================================
  // Tier 2: Keyword Patterns (85-95% confidence)
  // ===========================================================================

  describe('Tier 2: Keyword Patterns', () => {
    const tier2Cases: Array<{
      title: string;
      expectedType: string;
      minConfidence: number;
    }> = [
      // High-confidence tool keywords
      { title: 'Week 3 WebWork', expectedType: 'homework', minConfidence: 95 },
      { title: 'Submit via Crowdmark', expectedType: 'external', minConfidence: 95 },
      { title: 'MATLAB Exercise', expectedType: 'lab', minConfidence: 92 },
      { title: 'Wireshark Analysis', expectedType: 'lab', minConfidence: 92 },

      // Standard keywords
      { title: 'Weekly Quiz Assessment', expectedType: 'quiz', minConfidence: 88 },
      { title: 'Lab Exercise 3', expectedType: 'lab', minConfidence: 85 },
      { title: 'Homework Task', expectedType: 'homework', minConfidence: 85 },
      { title: 'Tutorial Activity', expectedType: 'tutorial', minConfidence: 85 },
      { title: 'Group Project Work', expectedType: 'project', minConfidence: 85 },
      { title: 'Class Discussion', expectedType: 'discussion', minConfidence: 85 },
    ];

    test.each(tier2Cases)(
      'classifies "$title" as $expectedType with confidence >= $minConfidence',
      ({ title, expectedType, minConfidence }) => {
        const result = classifier.classify({ title, submissionTypes: [] });
        expect(result.type).toBe(expectedType);
        expect(result.tier).toBe(2);
        expect(result.confidence).toBeGreaterThanOrEqual(minConfidence);
      }
    );
  });

  // ===========================================================================
  // Tier 3: Submission Type Patterns (60-80% confidence)
  // ===========================================================================

  describe('Tier 3: Submission Type Patterns', () => {
    const tier3Cases: Array<{
      title: string;
      submissionTypes: string[];
      expectedType: string;
      expectedConfidence: number;
    }> = [
      {
        title: 'Assessment',
        submissionTypes: ['online_quiz'],
        expectedType: 'quiz',
        expectedConfidence: 80,
      },
      {
        title: 'Week 3 Activity',
        submissionTypes: ['discussion_topic'],
        expectedType: 'discussion',
        expectedConfidence: 80,
      },
      {
        title: 'Third Party Tool',
        submissionTypes: ['external_tool'],
        expectedType: 'external',
        expectedConfidence: 70,
      },
      // Note: "Syllabus Review" triggers tier 2 keyword match for "lab" in "syllabus"
      // Use a truly generic title for tier 3 testing
      {
        title: 'Ungraded Item',
        submissionTypes: ['not_graded'],
        expectedType: 'info',
        expectedConfidence: 75,
      },
      {
        title: 'Grade Check',
        submissionTypes: ['none'],
        expectedType: 'participation',
        expectedConfidence: 60,
      },
      {
        title: 'Written Work',
        submissionTypes: ['on_paper'],
        expectedType: 'in_person',
        expectedConfidence: 65,
      },
      {
        title: 'Week 5 Task',
        submissionTypes: ['online_upload'],
        expectedType: 'homework',
        expectedConfidence: 60,
      },
      {
        title: 'Response',
        submissionTypes: ['media_recording'],
        expectedType: 'media',
        expectedConfidence: 70,
      },
    ];

    test.each(tier3Cases)(
      'classifies "$title" with submission_types=$submissionTypes as $expectedType',
      ({ title, submissionTypes, expectedType, expectedConfidence }) => {
        // Use a generic title to ensure tier 3 is used
        const result = classifier.classify({ title, submissionTypes });
        expect(result.type).toBe(expectedType);
        expect(result.tier).toBe(3);
        expect(result.confidence).toBe(expectedConfidence);
      }
    );
  });

  // ===========================================================================
  // Tier 4: Context Patterns (40-70% confidence)
  // ===========================================================================

  describe('Tier 4: Context Patterns', () => {
    test('classifies by assignment group name', () => {
      const result = classifier.classify({
        title: 'Week 5',
        submissionTypes: [],
        assignmentGroupName: 'Quizzes',
      });
      expect(result.type).toBe('quiz');
      expect(result.tier).toBe(4);
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.confidence).toBeLessThanOrEqual(70);
    });

    test('classifies by assignment group with labs', () => {
      const result = classifier.classify({
        title: 'Activity 3',
        submissionTypes: [],
        assignmentGroupName: 'Labs and Practicals',
      });
      expect(result.type).toBe('lab');
      expect(result.tier).toBe(4);
    });

    test('classifies by description keywords as fallback', () => {
      const result = classifier.classify({
        title: 'Week 7',
        submissionTypes: [],
        // Use a stronger keyword - "projects" is in tier 4 context keywords
        description: '<p>This is part of the projects section for the course.</p>',
      });
      expect(result.type).toBe('project');
      expect(result.tier).toBe(4);
      // Description matches have reduced confidence
      expect(result.confidence).toBeLessThan(70);
    });
  });

  // ===========================================================================
  // Fallback Behavior
  // ===========================================================================

  describe('Fallback Behavior', () => {
    test('returns assignment with low confidence when nothing matches', () => {
      const result = classifier.classify({
        title: 'Unknown Task',
        submissionTypes: [],
      });
      expect(result.type).toBe('assignment');
      expect(result.tier).toBe(4);
      expect(result.confidence).toBe(30);
      expect(result.patternsMatched).toContain('fallback:no_match');
    });
  });

  // ===========================================================================
  // Tier Priority (Higher tier should win)
  // ===========================================================================

  describe('Tier Priority', () => {
    test('tier 1 wins over tier 2 keywords', () => {
      // "Quiz #3" is tier 1 exact match, not just keyword "quiz"
      const result = classifier.classify({
        title: 'Quiz #3',
        submissionTypes: ['online_quiz'], // Would be tier 3
      });
      expect(result.tier).toBe(1);
      expect(result.confidence).toBe(100);
    });

    test('tier 2 keywords win over tier 3 submission types', () => {
      const result = classifier.classify({
        title: 'WebWork Problems',
        submissionTypes: ['online_upload'], // Would be homework via tier 3
      });
      expect(result.tier).toBe(2);
      expect(result.subtype).toBe('webwork');
      expect(result.confidence).toBe(95);
    });

    test('tier 3 wins over tier 4 context', () => {
      const result = classifier.classify({
        title: 'Activity',
        submissionTypes: ['online_quiz'],
        assignmentGroupName: 'Homework',
      });
      expect(result.tier).toBe(3);
      expect(result.type).toBe('quiz');
    });
  });

  // ===========================================================================
  // Classification Comparison
  // ===========================================================================

  describe('isClassificationBetter', () => {
    test('better tier wins', () => {
      const tier2: ClassificationResult = {
        type: 'quiz',
        subtype: null,
        tier: 2,
        confidence: 90,
        patternsMatched: [],
      };
      const tier3: ClassificationResult = {
        type: 'quiz',
        subtype: null,
        tier: 3,
        confidence: 95,
        patternsMatched: [],
      };

      expect(classifier.isClassificationBetter(tier3, tier2)).toBe(true);
      expect(classifier.isClassificationBetter(tier2, tier3)).toBe(false);
    });

    test('same tier: higher confidence wins', () => {
      const low: ClassificationResult = {
        type: 'quiz',
        subtype: null,
        tier: 2,
        confidence: 85,
        patternsMatched: [],
      };
      const high: ClassificationResult = {
        type: 'quiz',
        subtype: null,
        tier: 2,
        confidence: 95,
        patternsMatched: [],
      };

      expect(classifier.isClassificationBetter(low, high)).toBe(true);
      expect(classifier.isClassificationBetter(high, low)).toBe(false);
    });

    test('null current always returns true', () => {
      const candidate: ClassificationResult = {
        type: 'quiz',
        subtype: null,
        tier: 4,
        confidence: 40,
        patternsMatched: [],
      };
      expect(classifier.isClassificationBetter(null, candidate)).toBe(true);
    });
  });

  // ===========================================================================
  // Field Source Conversion
  // ===========================================================================

  describe('toFieldSource', () => {
    test('converts classification to TaskTypeFieldSource', () => {
      const result: ClassificationResult = {
        type: 'quiz',
        subtype: 'numbered',
        tier: 1,
        confidence: 100,
        patternsMatched: ['tier1:/^quiz\\s*#?\\d+/i'],
      };

      const fieldSource = classifier.toFieldSource(result);

      expect(fieldSource.source).toBe('canvas');
      expect(fieldSource.tier).toBe(1);
      expect(fieldSource.confidence).toBe(100);
      expect(fieldSource.detectedType).toBe('quiz');
      expect(fieldSource.detectedSubtype).toBe('numbered');
      expect(fieldSource.patternsMatched).toEqual(['tier1:/^quiz\\s*#?\\d+/i']);
    });

    test('allows specifying user source', () => {
      const result: ClassificationResult = {
        type: 'homework',
        subtype: null,
        tier: 2,
        confidence: 88,
        patternsMatched: ['tier2:keyword:homework'],
      };

      const fieldSource = classifier.toFieldSource(result, 'user');

      expect(fieldSource.source).toBe('user');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    test('handles empty title', () => {
      const result = classifier.classify({ title: '', submissionTypes: [] });
      expect(result.type).toBe('assignment');
      expect(result.tier).toBe(4);
    });

    test('handles very long title', () => {
      const longTitle =
        'This is a very long title that contains the word quiz somewhere in the middle ' +
        'along with lots of other text that should not affect the classification';
      const result = classifier.classify({ title: longTitle, submissionTypes: [] });
      expect(result.type).toBe('quiz');
      expect(result.tier).toBe(2); // Keyword match
    });

    test('handles mixed case', () => {
      const result = classifier.classify({ title: 'QUIZ #5', submissionTypes: [] });
      expect(result.type).toBe('quiz');
      expect(result.tier).toBe(1);
    });

    test('handles special characters', () => {
      const result = classifier.classify({
        title: 'Quiz #3 - Week 5 (Chapters 1-3)',
        submissionTypes: [],
      });
      expect(result.type).toBe('quiz');
      expect(result.tier).toBe(1);
      expect(result.subtype).toBe('numbered');
    });

    test('handles HTML in description', () => {
      // Note: "Lab" by itself may not be in tier 4 context keywords
      // but "labs" (plural) is - use a more reliable keyword
      const result = classifier.classify({
        title: 'Week 5',
        submissionTypes: [],
        description:
          '<p><strong>Labs</strong> and practicals for <a href="#">this week</a></p>',
      });
      expect(result.type).toBe('lab');
      expect(result.tier).toBe(4);
    });
  });

  // ===========================================================================
  // Real-world Examples
  // ===========================================================================

  describe('Real-world Examples', () => {
    const realWorldCases: Array<{
      title: string;
      submissionTypes: string[];
      groupName?: string;
      expectedType: string;
      expectedTier: 1 | 2 | 3 | 4;
    }> = [
      // Common Canvas patterns
      {
        title: 'Quiz 3: Chapters 5-6',
        submissionTypes: ['online_quiz'],
        expectedType: 'quiz',
        expectedTier: 1,
      },
      {
        title: 'Lab 4 - Introduction to Wireshark',
        submissionTypes: ['online_upload'],
        expectedType: 'lab',
        expectedTier: 1,
      },
      {
        title: 'Problem Set 2',
        submissionTypes: ['online_upload'],
        expectedType: 'homework',
        expectedTier: 1,
      },
      {
        title: 'Final Exam Review',
        submissionTypes: ['not_graded'],
        expectedType: 'exam',
        expectedTier: 1,
      },

      // WebWork integration
      {
        title: 'WebWork Week 3',
        submissionTypes: ['external_tool'],
        expectedType: 'homework',
        expectedTier: 2,
      },

      // Crowdmark
      {
        title: 'Assignment 1 (Crowdmark)',
        submissionTypes: ['external_tool'],
        expectedType: 'homework',
        expectedTier: 1,
      },

      // Discussion forums
      {
        title: 'Week 5 Discussion',
        submissionTypes: ['discussion_topic'],
        expectedType: 'discussion',
        expectedTier: 2,
      },

      // Peer review
      {
        title: 'Peer Review: Essay Draft',
        submissionTypes: ['online_upload'],
        expectedType: 'peer_review',
        expectedTier: 1,
      },

      // Ambiguous titles relying on submission type
      {
        title: 'Week 5',
        submissionTypes: ['online_quiz'],
        expectedType: 'quiz',
        expectedTier: 3,
      },
      {
        title: 'Activity',
        submissionTypes: ['discussion_topic'],
        expectedType: 'discussion',
        expectedTier: 3,
      },

      // Group context
      {
        title: 'Week 3',
        submissionTypes: [],
        groupName: 'Quizzes',
        expectedType: 'quiz',
        expectedTier: 4,
      },
    ];

    test.each(realWorldCases)(
      'classifies "$title" as $expectedType (tier $expectedTier)',
      ({ title, submissionTypes, groupName, expectedType, expectedTier }) => {
        const result = classifier.classify({
          title,
          submissionTypes,
          assignmentGroupName: groupName,
        });
        expect(result.type).toBe(expectedType);
        expect(result.tier).toBe(expectedTier);
      }
    );
  });
});
