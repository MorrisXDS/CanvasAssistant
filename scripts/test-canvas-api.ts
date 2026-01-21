#!/usr/bin/env ts-node
/**
 * Canvas API Integration Test Script
 *
 * Tests real Canvas API connectivity using CANVAS_ACCESS_TOKEN env variable.
 *
 * Usage:
 *   CANVAS_ACCESS_TOKEN=your_token npx ts-node scripts/test-canvas-api.ts
 *
 * Or set CANVAS_BASE_URL for non-UofT instances:
 *   CANVAS_BASE_URL=https://your-school.instructure.com CANVAS_ACCESS_TOKEN=token npx ts-node scripts/test-canvas-api.ts
 */

import { CanvasClient } from '../src/layers/l2-daemon/CanvasClient';

// Configuration
const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL || 'https://q.utoronto.ca';
const CANVAS_ACCESS_TOKEN = process.env.CANVAS_ACCESS_TOKEN;

interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  enrollment_term_id: number;
  enrollments?: Array<{
    type: string;
    computed_current_score?: number;
    computed_current_grade?: string;
  }>;
}

interface CanvasAssignment {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number;
  submission_types: string[];
  has_submitted_submissions: boolean;
}

interface CanvasAnnouncement {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  context_code: string;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Canvas API Integration Test');
  console.log('='.repeat(60));
  console.log();

  // Check for token
  if (!CANVAS_ACCESS_TOKEN) {
    console.error('ERROR: CANVAS_ACCESS_TOKEN environment variable not set');
    console.error('');
    console.error('Usage:');
    console.error('  CANVAS_ACCESS_TOKEN=your_token npx ts-node scripts/test-canvas-api.ts');
    console.error('');
    console.error('To get a token:');
    console.error('  1. Go to Canvas -> Account -> Settings');
    console.error('  2. Click "+ New Access Token"');
    console.error('  3. Copy the token (only shown once)');
    process.exit(1);
  }

  console.log(`Base URL: ${CANVAS_BASE_URL}`);
  console.log(`Token: ${CANVAS_ACCESS_TOKEN.substring(0, 10)}...`);
  console.log();

  // Create client
  const client = new CanvasClient({
    baseUrl: CANVAS_BASE_URL,
    accessToken: CANVAS_ACCESS_TOKEN,
    timeout: 30000,
  });

  // Test 1: Validate Token / Get Current User
  console.log('Test 1: Validating token...');
  const validation = await client.validateToken();
  if (!validation.valid) {
    console.error(`  FAILED: ${validation.error}`);
    process.exit(1);
  }
  console.log(`  SUCCESS: Authenticated as ${validation.user?.name} (${validation.user?.login_id})`);
  console.log();

  // Test 2: Get Courses
  console.log('Test 2: Fetching courses...');
  try {
    const courses = await client.getAll<CanvasCourse>('/courses', {
      enrollment_state: 'active',
      include: ['total_scores', 'current_grading_period_scores'],
    });
    console.log(`  SUCCESS: Found ${courses.length} active courses`);

    if (courses.length > 0) {
      console.log('  Courses:');
      for (const course of courses.slice(0, 5)) {
        const grade = course.enrollments?.[0]?.computed_current_score;
        const gradeStr = grade !== undefined ? ` (${grade}%)` : '';
        console.log(`    - [${course.course_code}] ${course.name}${gradeStr}`);
      }
      if (courses.length > 5) {
        console.log(`    ... and ${courses.length - 5} more`);
      }
    }
    console.log();

    // Test 3: Get Assignments for first course
    if (courses.length > 0) {
      const firstCourse = courses[0];
      console.log(`Test 3: Fetching assignments for "${firstCourse.course_code}"...`);

      const assignments = await client.getAll<CanvasAssignment>(
        `/courses/${firstCourse.id}/assignments`,
        { order_by: 'due_at' }
      );
      console.log(`  SUCCESS: Found ${assignments.length} assignments`);

      if (assignments.length > 0) {
        console.log('  Upcoming assignments:');
        const upcoming = assignments
          .filter((a) => a.due_at && new Date(a.due_at) > new Date())
          .slice(0, 3);

        for (const assignment of upcoming) {
          const dueDate = assignment.due_at
            ? new Date(assignment.due_at).toLocaleDateString()
            : 'No due date';
          console.log(`    - ${assignment.name} (Due: ${dueDate}, ${assignment.points_possible} pts)`);
        }
        if (upcoming.length === 0) {
          console.log('    (No upcoming assignments)');
        }
      }
      console.log();

      // Test 4: Get Announcements
      console.log(`Test 4: Fetching announcements for "${firstCourse.course_code}"...`);
      try {
        const announcements = await client.getAll<CanvasAnnouncement>(
          `/courses/${firstCourse.id}/discussion_topics`,
          { only_announcements: true }
        );
        console.log(`  SUCCESS: Found ${announcements.length} announcements`);

        if (announcements.length > 0) {
          console.log('  Recent announcements:');
          for (const ann of announcements.slice(0, 3)) {
            const posted = new Date(ann.posted_at).toLocaleDateString();
            const preview = ann.message
              .replace(/<[^>]*>/g, '')
              .substring(0, 50);
            console.log(`    - [${posted}] ${ann.title}`);
            console.log(`      Preview: ${preview}...`);

            // Check for policy-related keywords
            const policyKeywords = [
              'late', 'deadline', 'extension', 'grace', 'penalty',
              'policy', 'weight', 'drop', 'bonus', 'resubmit'
            ];
            const foundKeywords = policyKeywords.filter(
              (kw) =>
                ann.title.toLowerCase().includes(kw) ||
                ann.message.toLowerCase().includes(kw)
            );
            if (foundKeywords.length > 0) {
              console.log(`      ⚠️  POLICY KEYWORDS DETECTED: ${foundKeywords.join(', ')}`);
            }
          }
        }
      } catch (error) {
        console.log(`  SKIPPED: Could not fetch announcements (${error})`);
      }
      console.log();

      // Test 5: Get Syllabus
      console.log(`Test 5: Fetching syllabus for "${firstCourse.course_code}"...`);
      try {
        const courseWithSyllabus = await client.get<CanvasCourse & { syllabus_body: string }>(
          `/courses/${firstCourse.id}`,
          { include: ['syllabus_body'] }
        );

        if (courseWithSyllabus.data.syllabus_body) {
          const syllabusText = courseWithSyllabus.data.syllabus_body
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          console.log(`  SUCCESS: Syllabus found (${syllabusText.length} chars)`);
          console.log(`  Preview: ${syllabusText.substring(0, 200)}...`);

          // Check for policy keywords in syllabus
          const policyKeywords = [
            'late submission', 'grace period', 'extension', 'penalty',
            'academic integrity', 'weight', 'drop lowest', 'bonus'
          ];
          const foundPolicies = policyKeywords.filter((kw) =>
            syllabusText.toLowerCase().includes(kw)
          );
          if (foundPolicies.length > 0) {
            console.log(`  📋 POLICY SECTIONS DETECTED: ${foundPolicies.join(', ')}`);
          }
        } else {
          console.log('  No syllabus content found');
        }
      } catch (error) {
        console.log(`  SKIPPED: Could not fetch syllabus (${error})`);
      }
      console.log();
    }

    // Test 6: ETag caching
    console.log('Test 6: Testing ETag caching...');
    const firstResponse = await client.get<CanvasCourse[]>('/courses', { per_page: 1 });
    if (firstResponse.etag) {
      console.log(`  First request ETag: ${firstResponse.etag}`);

      const cachedResponse = await client.get<CanvasCourse[]>(
        '/courses',
        { per_page: 1 },
        firstResponse.etag
      );

      if (cachedResponse.notModified) {
        console.log('  SUCCESS: 304 Not Modified received (ETag caching works!)');
      } else {
        console.log('  Data changed since last request (no 304)');
      }
    } else {
      console.log('  No ETag in response (server may not support it)');
    }
    console.log();

  } catch (error) {
    console.error('  FAILED:', error);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('All tests completed successfully!');
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
