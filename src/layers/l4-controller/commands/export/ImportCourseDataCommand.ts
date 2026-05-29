/**
 * ImportCourseDataCommand - Import a course-data JSON payload.
 *
 * Moves the entire import pipeline out of the IPC handler (ADR-0007):
 * upserts across courses / tasks / notifications / pages / policies /
 * resources / syllabuses / grace tokens + usage, threading old→new id
 * remapping so foreign keys stay consistent. Tolerant of both camelCase
 * and snake_case keys (export format has drifted over versions).
 *
 * Field-selection logic (`||` vs `??` per field) is preserved verbatim from
 * the original handler — do not "simplify" without checking the empty-string
 * / zero edge cases it encodes.
 *
 * The payload is validated here; on a structurally-invalid file the command
 * returns a failure result rather than throwing.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  ImportCourseDataParams,
  ImportCourseDataResult,
} from '../../types';

type Rec = Record<string, unknown>;

function asArray(value: unknown): Rec[] {
  return Array.isArray(value) ? (value as Rec[]) : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export class ImportCourseDataCommand implements Command<
  ImportCourseDataParams,
  ImportCourseDataResult
> {
  readonly name = 'ImportCourseData';

  async execute(
    context: CommandContext,
    params: ImportCourseDataParams
  ): Promise<CommandResult<ImportCourseDataResult>> {
    const db = context.db;
    const importData = params.importData;

    // Validate format
    if (!importData || !importData.version || !importData.courses) {
      return {
        success: false,
        error: 'Invalid export file format. Missing version or courses.',
      };
    }

    try {
      let coursesImported = 0;
      let tasksImported = 0;
      let notificationsImported = 0;
      let pagesImported = 0;
      let policiesImported = 0;
      let resourcesImported = 0;
      let syllabusesImported = 0;
      let graceTokensImported = 0;
      let graceTokenUsageImported = 0;

      // Build course ID mapping: old ID -> new ID (using external_id as key)
      const courseIdMap = new Map<number, number>();

      // Import courses first and build mapping
      for (const course of asArray(importData.courses)) {
        const externalId = course.externalId || course.external_id;
        const oldId = asNumber(course.id);

        db.upsert(
          'courses',
          {
            external_id: externalId,
            code: course.code,
            name: course.name,
            nickname: course.nickname,
            color: course.color,
            enrollment_term_id: course.enrollmentTermId || course.enrollment_term_id,
            target_grade: course.targetGrade ?? course.target_grade ?? 85.0,
            target_grade_source:
              course.targetGradeSource || course.target_grade_source || 'default',
            is_hidden: course.isHidden ?? course.is_hidden ?? 0,
            current_grade: course.currentGrade ?? course.current_grade,
            assessed_grade: course.assessedGrade ?? course.assessed_grade,
            total_weight: course.totalWeight ?? course.total_weight ?? 0,
            syllabus_body: course.syllabusBody || course.syllabus_body,
            field_sources: course.fieldSources || course.field_sources,
            allow_guessed_override:
              course.allowGuessedOverride ?? course.allow_guessed_override ?? 1,
            auto_assign_due_date: course.autoAssignDueDate ?? course.auto_assign_due_date,
          },
          'external_id'
        );

        const dbCourse = db.executeReadOne<{ id: number }>(
          'SELECT id FROM courses WHERE external_id = ?',
          [externalId]
        );
        if (dbCourse && oldId != null) {
          courseIdMap.set(oldId, dbCourse.id);
        }
        coursesImported++;
      }

      // Helper to map old course ID to new course ID
      const mapCourseId = (oldId: number | null | undefined): number | null => {
        if (oldId == null) return null;
        return courseIdMap.get(oldId) ?? oldId; // Fall back to original if not in map
      };

      const taskIdMap = new Map<number, number>();
      const resourceIdMap = new Map<number, number>();
      const policyIdMap = new Map<number, number>();

      // Import tasks and build mapping
      for (const task of asArray(importData.tasks)) {
        const oldCourseId = asNumber(task.course_id ?? task.courseId);
        const newCourseId = mapCourseId(oldCourseId);
        if (!newCourseId) continue;

        const externalId = task.external_id || task.externalId;
        const oldId = asNumber(task.id);

        db.upsert(
          'tasks',
          {
            external_id: externalId,
            course_id: newCourseId,
            title: task.title,
            description: task.description,
            due_at: task.due_at || task.dueAt,
            unlock_at: task.unlock_at || task.unlockAt,
            lock_at: task.lock_at || task.lockAt,
            weight: task.weight || 0,
            grade: task.grade,
            points_possible: task.points_possible || task.pointsPossible,
            priority_score: task.priority_score || task.priorityScore || 0,
            is_completed: task.is_completed ?? task.isCompleted ?? 0,
            is_optional: task.is_optional ?? task.isOptional ?? 0,
            completed_at: task.completed_at || task.completedAt,
            submission_status: task.submission_status || task.submissionStatus,
            task_type: task.task_type || task.taskType,
            task_group_id: task.task_group_id || task.taskGroupId,
            field_sources: task.field_sources || task.fieldSources,
            pain_index: task.pain_index ?? task.painIndex ?? 0,
            penalty_severity: task.penalty_severity ?? task.penaltySeverity ?? 0,
            has_safety_net: task.has_safety_net ?? task.hasSafetyNet ?? 0,
            days_until_cutoff: task.days_until_cutoff ?? task.daysUntilCutoff,
          },
          'external_id'
        );

        if (oldId != null && externalId) {
          const dbTask = db.executeReadOne<{ id: number }>(
            'SELECT id FROM tasks WHERE external_id = ?',
            [externalId]
          );
          if (dbTask) {
            taskIdMap.set(oldId, dbTask.id);
          }
        }
        tasksImported++;
      }

      // Import notifications (unique on source_type + source_id, no updated_at column)
      for (const notif of asArray(importData.notifications)) {
        const oldCourseId = asNumber(notif.course_id ?? notif.courseId);
        const newCourseId = mapCourseId(oldCourseId);

        db.upsert(
          'notifications',
          {
            source_type: notif.source_type || notif.sourceType || 'canvas',
            source_id: notif.source_id || notif.sourceId,
            course_id: newCourseId,
            title: notif.title,
            message: notif.message,
            message_html: notif.message_html || notif.messageHtml,
            published_at: notif.published_at || notif.publishedAt,
            dismissed_at: notif.dismissed_at || notif.dismissedAt,
            url: notif.url,
          },
          ['source_type', 'source_id'],
          false // notifications table has no updated_at column
        );
        notificationsImported++;
      }

      // Import pages
      for (const page of asArray(importData.pages)) {
        const oldCourseId = asNumber(page.course_id ?? page.courseId);
        const newCourseId = mapCourseId(oldCourseId);
        if (!newCourseId) continue;

        db.upsert(
          'course_pages',
          {
            external_id: page.external_id || page.externalId,
            course_id: newCourseId,
            title: page.title,
            body_html: page.body_html || page.bodyHtml || page.body,
            body_text: page.body_text || page.bodyText,
            url_slug: page.url_slug || page.urlSlug || page.url,
            page_type: page.page_type || page.pageType || 'content',
            published: page.published ?? 1,
            is_front_page:
              page.is_front_page ||
              page.isFrontPage ||
              page.front_page ||
              page.frontPage ||
              0,
          },
          'external_id'
        );
        pagesImported++;
      }

      // Import policies and build ID mapping
      for (const policy of asArray(importData.policies)) {
        const oldCourseId = asNumber(policy.course_id ?? policy.courseId);
        const newCourseId = mapCourseId(oldCourseId);
        if (!newCourseId) continue;

        const oldId = asNumber(policy.id);
        const policyType = policy.policy_type || policy.policyType;
        const policyName = policy.policy_name || policy.policyName || 'imported';

        db.upsert(
          'course_policies',
          {
            course_id: newCourseId,
            policy_type: policyType,
            policy_name: policyName,
            policy_config:
              policy.policy_config ||
              policy.policyConfig ||
              JSON.stringify({ value: policy.value }),
            raw_text: policy.raw_text || policy.rawText,
          },
          ['course_id', 'policy_type', 'policy_name']
        );

        if (oldId != null) {
          const dbPolicy = db.executeReadOne<{ id: number }>(
            'SELECT id FROM course_policies WHERE course_id = ? AND policy_type = ? AND policy_name = ?',
            [newCourseId, policyType, policyName]
          );
          if (dbPolicy) {
            policyIdMap.set(oldId, dbPolicy.id);
          }
        }
        policiesImported++;
      }

      // Import resources (without local paths) and build ID mapping
      for (const resource of asArray(importData.resources)) {
        const oldCourseId = asNumber(resource.course_id ?? resource.courseId);
        const newCourseId = mapCourseId(oldCourseId);
        if (!newCourseId) continue;

        const externalId = resource.external_id || resource.externalId;
        const oldId = asNumber(resource.id);

        db.upsert(
          'resources',
          {
            external_id: externalId,
            course_id: newCourseId,
            folder_path: resource.folder_path || resource.folderPath,
            type: resource.type,
            title: resource.title,
            url: resource.url,
            size_bytes: resource.size_bytes || resource.sizeBytes,
            mime_type: resource.mime_type || resource.mimeType,
          },
          'external_id'
        );

        if (oldId != null && externalId) {
          const dbResource = db.executeReadOne<{ id: number }>(
            'SELECT id FROM resources WHERE external_id = ?',
            [externalId]
          );
          if (dbResource) {
            resourceIdMap.set(oldId, dbResource.id);
          }
        }
        resourcesImported++;
      }

      // Import syllabuses (v1.1+)
      for (const syllabus of asArray(importData.syllabuses)) {
        const oldCourseId = asNumber(syllabus.course_id ?? syllabus.courseId);
        const newCourseId = mapCourseId(oldCourseId);
        if (!newCourseId) continue;

        // Map resource_id to new ID, skip if resource doesn't exist
        const oldResourceId = asNumber(syllabus.resource_id ?? syllabus.resourceId);
        const newResourceId = oldResourceId ? resourceIdMap.get(oldResourceId) : null;
        if (!newResourceId) continue; // Skip if resource wasn't imported

        db.upsert(
          'course_syllabuses',
          {
            course_id: newCourseId,
            resource_id: newResourceId,
            source_type: syllabus.source_type || syllabus.sourceType || 'resource',
            resource_updated_at:
              syllabus.resource_updated_at || syllabus.resourceUpdatedAt,
            last_reviewed_at:
              syllabus.last_reviewed_at ||
              syllabus.lastReviewedAt ||
              new Date().toISOString(),
            change_detected_at: syllabus.change_detected_at || syllabus.changeDetectedAt,
            marked_at: syllabus.marked_at || syllabus.markedAt,
          },
          'course_id',
          false // course_syllabuses table has no updated_at column
        );
        syllabusesImported++;
      }

      // Import grace tokens and usage (v1.1+)
      const graceTokenIdMap = new Map<number, number>();

      for (const token of asArray(importData.graceTokens)) {
        const oldCourseId = asNumber(token.course_id ?? token.courseId);
        const newCourseId = mapCourseId(oldCourseId);
        if (!newCourseId) continue;

        // Map policy_id to new ID, skip if policy doesn't exist
        const oldPolicyId = asNumber(token.policy_id ?? token.policyId);
        const newPolicyId = oldPolicyId ? policyIdMap.get(oldPolicyId) : null;
        if (!newPolicyId) continue; // Skip if policy wasn't imported

        const oldId = asNumber(token.id);

        db.upsert(
          'grace_tokens',
          {
            course_id: newCourseId,
            policy_id: newPolicyId,
            total_tokens: token.total_tokens || token.totalTokens,
            tokens_remaining: token.tokens_remaining || token.tokensRemaining,
            hours_per_token: token.hours_per_token ?? token.hoursPerToken ?? 24,
            max_tokens_per_task: token.max_tokens_per_task ?? token.maxTokensPerTask ?? 2,
          },
          ['course_id', 'policy_id']
        );

        const dbToken = db.executeReadOne<{ id: number }>(
          'SELECT id FROM grace_tokens WHERE course_id = ? AND policy_id = ?',
          [newCourseId, newPolicyId]
        );
        if (dbToken && oldId != null) {
          graceTokenIdMap.set(oldId, dbToken.id);
        }
        graceTokensImported++;
      }

      for (const usage of asArray(importData.graceTokenUsage)) {
        const oldTokenId = asNumber(usage.grace_token_id ?? usage.graceTokenId);
        const newTokenId = oldTokenId ? graceTokenIdMap.get(oldTokenId) : null;
        if (!newTokenId) continue;

        // Map task_id to new ID, skip if task doesn't exist
        const oldTaskId = asNumber(usage.task_id ?? usage.taskId);
        const newTaskId = oldTaskId ? taskIdMap.get(oldTaskId) : null;
        if (!newTaskId) continue; // Skip if task wasn't imported

        db.upsert(
          'grace_token_usage',
          {
            grace_token_id: newTokenId,
            task_id: newTaskId,
            tokens_used: usage.tokens_used || usage.tokensUsed,
            hours_extended: usage.hours_extended || usage.hoursExtended,
            used_at: usage.used_at || usage.usedAt,
          },
          ['grace_token_id', 'task_id'],
          false // grace_token_usage table has no updated_at column
        );
        graceTokenUsageImported++;
      }

      return {
        success: true,
        data: {
          coursesImported,
          tasksImported,
          notificationsImported,
          pagesImported,
          policiesImported,
          resourcesImported,
          syllabusesImported,
          graceTokensImported,
          graceTokenUsageImported,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to import course data: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
