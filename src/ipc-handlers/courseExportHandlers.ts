/**
 * Course Export IPC Handlers
 * Handlers for course data export/import operations
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import type { IpcContext } from './IpcContext';

/**
 * Register course data export/import IPC handlers
 */
export function registerCourseExportHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const getMainWindow = ctx.getMainWindow;

  ipcMain.handle(
    'data:exportCourseData',
    async (_event, params?: { courseIds?: number[]; includeFiles?: boolean }) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      try {
        // Build course filter
        let courseFilter = '';
        const courseIds = params?.courseIds;
        if (courseIds && courseIds.length > 0) {
          courseFilter = ` WHERE id IN (${courseIds.join(',')})`;
        }

        // Fetch courses with all fields
        const courses = database.executeRead<{
          id: number;
          external_id: string;
          code: string;
          name: string;
          nickname: string | null;
          color: string | null;
          enrollment_term_id: number | null;
          target_grade: number | null;
          target_grade_source: string | null;
          is_hidden: number;
          current_grade: number | null;
          assessed_grade: number | null;
          total_weight: number | null;
          syllabus_body: string | null;
          field_sources: string | null;
          allow_guessed_override: number | null;
          auto_assign_due_date: number | null;
        }>(`SELECT * FROM courses${courseFilter}`);

        if (courses.length === 0) {
          return { success: false, error: 'No courses found to export' };
        }

        const courseIdList = courses.map((c) => c.id).join(',');

        // Fetch related data
        const tasks = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM tasks WHERE course_id IN (${courseIdList})`
        );

        const notifications = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM notifications WHERE course_id IN (${courseIdList})`
        );

        const pages = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM course_pages WHERE course_id IN (${courseIdList})`
        );

        const policies = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM course_policies WHERE course_id IN (${courseIdList})`
        );

        const resources = database.executeRead<Record<string, unknown>>(
          `SELECT id, external_id, course_id, folder_path, type, title, url, size_bytes, mime_type FROM resources WHERE course_id IN (${courseIdList})`
        );

        // Fetch course_syllabuses
        const syllabuses = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM course_syllabuses WHERE course_id IN (${courseIdList})`
        );

        // Fetch grace_tokens and grace_token_usage
        const graceTokens = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM grace_tokens WHERE course_id IN (${courseIdList})`
        );

        const graceTokenIds = graceTokens.map((g) => g.id).filter(Boolean);
        const graceTokenUsage =
          graceTokenIds.length > 0
            ? database.executeRead<Record<string, unknown>>(
                `SELECT * FROM grace_token_usage WHERE grace_token_id IN (${graceTokenIds.join(',')})`
              )
            : [];

        const exportData = {
          exportedAt: new Date().toISOString(),
          version: '1.1',
          courses: courses.map((c) => ({
            id: c.id,
            externalId: c.external_id,
            code: c.code,
            name: c.name,
            nickname: c.nickname,
            color: c.color,
            enrollmentTermId: c.enrollment_term_id,
            targetGrade: c.target_grade,
            targetGradeSource: c.target_grade_source,
            isHidden: c.is_hidden,
            currentGrade: c.current_grade,
            assessedGrade: c.assessed_grade,
            totalWeight: c.total_weight,
            syllabusBody: c.syllabus_body,
            fieldSources: c.field_sources,
            allowGuessedOverride: c.allow_guessed_override,
            autoAssignDueDate: c.auto_assign_due_date,
          })),
          tasks,
          notifications,
          pages,
          policies,
          resources: resources.map((r) => ({
            ...r,
            localPath: undefined, // Don't include local paths in export
          })),
          syllabuses,
          graceTokens,
          graceTokenUsage,
        };

        const dialogResult = await dialog.showSaveDialog(mainWindow, {
          defaultPath: `canvas-export-${new Date().toISOString().split('T')[0]}.json`,
          filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (dialogResult.canceled || !dialogResult.filePath) {
          return { success: false, error: 'Save cancelled' };
        }

        fs.writeFileSync(
          dialogResult.filePath,
          JSON.stringify(exportData, null, 2),
          'utf-8'
        );
        logger.info(`Course data exported to: ${dialogResult.filePath}`);
        metricsCollector.increment('data.export.courses');

        return {
          success: true,
          data: {
            filePath: dialogResult.filePath,
            courseCount: courses.length,
            taskCount: tasks.length,
            notificationCount: notifications.length,
          },
        };
      } catch (error) {
        logger.error('Failed to export course data:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // Import course data from JSON (same format as export)
  ipcMain.handle('data:importCourseData', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    try {
      const dialogResult = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (dialogResult.canceled || !dialogResult.filePaths.length) {
        return { success: false, error: 'Import cancelled' };
      }

      const filePath = dialogResult.filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const importData = JSON.parse(fileContent);

      // Validate format
      if (!importData.version || !importData.courses) {
        return {
          success: false,
          error: 'Invalid export file format. Missing version or courses.',
        };
      }

      let coursesImported = 0;
      let tasksImported = 0;
      let notificationsImported = 0;
      let pagesImported = 0;
      let policiesImported = 0;
      let resourcesImported = 0;

      // Build course ID mapping: old ID -> new ID (using external_id as key)
      const courseIdMap = new Map<number, number>();

      // Import courses first and build mapping
      if (Array.isArray(importData.courses)) {
        for (const course of importData.courses) {
          const externalId = course.externalId || course.external_id;
          const oldId = course.id;

          database.upsert(
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
              auto_assign_due_date:
                course.autoAssignDueDate ?? course.auto_assign_due_date,
            },
            'external_id'
          );

          // Get the actual ID from database
          const dbCourse = database.executeReadOne<{ id: number }>(
            'SELECT id FROM courses WHERE external_id = ?',
            [externalId]
          );
          if (dbCourse && oldId) {
            courseIdMap.set(oldId, dbCourse.id);
          }
          coursesImported++;
        }
      }

      // Helper to map old course ID to new course ID
      const mapCourseId = (oldId: number | null | undefined): number | null => {
        if (oldId == null) return null;
        return courseIdMap.get(oldId) ?? oldId; // Fall back to original if not in map
      };

      // Build ID mappings for tasks, resources, and policies
      const taskIdMap = new Map<number, number>();
      const resourceIdMap = new Map<number, number>();
      const policyIdMap = new Map<number, number>();

      // Import tasks and build mapping
      if (Array.isArray(importData.tasks)) {
        for (const task of importData.tasks) {
          const oldCourseId = task.course_id || task.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          const externalId = task.external_id || task.externalId;
          const oldId = task.id;

          database.upsert(
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

          // Get the actual ID from database for mapping
          if (oldId && externalId) {
            const dbTask = database.executeReadOne<{ id: number }>(
              'SELECT id FROM tasks WHERE external_id = ?',
              [externalId]
            );
            if (dbTask) {
              taskIdMap.set(oldId, dbTask.id);
            }
          }
          tasksImported++;
        }
      }

      // Import notifications (unique on source_type + source_id, no updated_at column)
      if (Array.isArray(importData.notifications)) {
        for (const notif of importData.notifications) {
          const oldCourseId = notif.course_id || notif.courseId;
          const newCourseId = mapCourseId(oldCourseId);

          database.upsert(
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
      }

      // Import pages
      if (Array.isArray(importData.pages)) {
        for (const page of importData.pages) {
          const oldCourseId = page.course_id || page.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          database.upsert(
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
      }

      // Import policies and build ID mapping
      if (Array.isArray(importData.policies)) {
        for (const policy of importData.policies) {
          const oldCourseId = policy.course_id || policy.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          const oldId = policy.id;
          const policyType = policy.policy_type || policy.policyType;
          const policyName = policy.policy_name || policy.policyName || 'imported';

          database.upsert(
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

          // Get the actual ID from database for mapping
          if (oldId) {
            const dbPolicy = database.executeReadOne<{ id: number }>(
              'SELECT id FROM course_policies WHERE course_id = ? AND policy_type = ? AND policy_name = ?',
              [newCourseId, policyType, policyName]
            );
            if (dbPolicy) {
              policyIdMap.set(oldId, dbPolicy.id);
            }
          }
          policiesImported++;
        }
      }

      // Import resources (without local paths) and build ID mapping
      if (Array.isArray(importData.resources)) {
        for (const resource of importData.resources) {
          const oldCourseId = resource.course_id || resource.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          const externalId = resource.external_id || resource.externalId;
          const oldId = resource.id;

          database.upsert(
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

          // Get the actual ID from database for mapping
          if (oldId && externalId) {
            const dbResource = database.executeReadOne<{ id: number }>(
              'SELECT id FROM resources WHERE external_id = ?',
              [externalId]
            );
            if (dbResource) {
              resourceIdMap.set(oldId, dbResource.id);
            }
          }
          resourcesImported++;
        }
      }

      // Import syllabuses (v1.1+)
      let syllabusesImported = 0;
      if (Array.isArray(importData.syllabuses)) {
        for (const syllabus of importData.syllabuses) {
          const oldCourseId = syllabus.course_id || syllabus.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue;

          // Map resource_id to new ID, skip if resource doesn't exist
          const oldResourceId = syllabus.resource_id || syllabus.resourceId;
          const newResourceId = oldResourceId ? resourceIdMap.get(oldResourceId) : null;
          if (!newResourceId) continue; // Skip if resource wasn't imported

          database.upsert(
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
              change_detected_at:
                syllabus.change_detected_at || syllabus.changeDetectedAt,
              marked_at: syllabus.marked_at || syllabus.markedAt,
            },
            'course_id',
            false // course_syllabuses table has no updated_at column
          );
          syllabusesImported++;
        }
      }

      // Import grace tokens and usage (v1.1+)
      let graceTokensImported = 0;
      let graceTokenUsageImported = 0;
      const graceTokenIdMap = new Map<number, number>();

      if (Array.isArray(importData.graceTokens)) {
        for (const token of importData.graceTokens) {
          const oldCourseId = token.course_id || token.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue;

          // Map policy_id to new ID, skip if policy doesn't exist
          const oldPolicyId = token.policy_id || token.policyId;
          const newPolicyId = oldPolicyId ? policyIdMap.get(oldPolicyId) : null;
          if (!newPolicyId) continue; // Skip if policy wasn't imported

          const oldId = token.id;

          database.upsert(
            'grace_tokens',
            {
              course_id: newCourseId,
              policy_id: newPolicyId,
              total_tokens: token.total_tokens || token.totalTokens,
              tokens_remaining: token.tokens_remaining || token.tokensRemaining,
              hours_per_token: token.hours_per_token ?? token.hoursPerToken ?? 24,
              max_tokens_per_task:
                token.max_tokens_per_task ?? token.maxTokensPerTask ?? 2,
            },
            ['course_id', 'policy_id']
          );

          // Get the actual ID from database to map usage records
          const dbToken = database.executeReadOne<{ id: number }>(
            'SELECT id FROM grace_tokens WHERE course_id = ? AND policy_id = ?',
            [newCourseId, newPolicyId]
          );
          if (dbToken && oldId) {
            graceTokenIdMap.set(oldId, dbToken.id);
          }
          graceTokensImported++;
        }
      }

      if (Array.isArray(importData.graceTokenUsage)) {
        for (const usage of importData.graceTokenUsage) {
          const oldTokenId = usage.grace_token_id || usage.graceTokenId;
          const newTokenId = graceTokenIdMap.get(oldTokenId);
          if (!newTokenId) continue;

          // Map task_id to new ID, skip if task doesn't exist
          const oldTaskId = usage.task_id || usage.taskId;
          const newTaskId = oldTaskId ? taskIdMap.get(oldTaskId) : null;
          if (!newTaskId) continue; // Skip if task wasn't imported

          database.upsert(
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
      }

      logger.info(
        `Data imported from: ${filePath} (${coursesImported} courses, ${tasksImported} tasks, ${notificationsImported} notifications, ${pagesImported} pages, ${policiesImported} policies, ${resourcesImported} resources, ${syllabusesImported} syllabuses, ${graceTokensImported} grace tokens)`
      );
      metricsCollector.increment('data.import.courses');

      return {
        success: true,
        data: {
          filePath,
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
      logger.error('Failed to import course data:', error as Error);
      return { success: false, error: String(error) };
    }
  });
}
