/**
 * IPC Contract - Single Source of Truth
 *
 * Zod schemas for all entities and IPC channels.
 * Used by both main and renderer processes.
 */

import { z } from 'zod';

// ============ Entity Schemas ============

export const SyncStatusSchema = z.enum(['idle', 'syncing', 'error', 'offline']);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const TargetGradeSourceSchema = z.enum(['default', 'manual']);
export type TargetGradeSource = z.infer<typeof TargetGradeSourceSchema>;

export const ArchiveSourceSchema = z.enum(['manual', 'auto']);
export type ArchiveSource = z.infer<typeof ArchiveSourceSchema>;

export const CourseSchema = z.object({
  id: z.number(),
  externalId: z.string(),
  code: z.string(),
  name: z.string(),
  targetGrade: z.number(),
  targetGradeSource: TargetGradeSourceSchema,
  assessedGrade: z.number().nullable(),
  currentGrade: z.number().nullable(),
  color: z.string().nullable(),
  nickname: z.string().nullable(),
  isHidden: z.boolean(),
  lastSyncedAt: z.string().nullable(),
  enrollmentTermId: z.number().nullable(),
  /** Course credits/units for weighted GPA calculation (default: 1.0) */
  credits: z.number(),
  /** ISO timestamp when course was archived, null if active */
  archivedAt: z.string().nullable(),
  /** How the course was archived: 'manual' (user) or 'auto' (term expired). Auto-archived cannot be restored. */
  archiveSource: ArchiveSourceSchema.nullable(),
});
export type Course = z.infer<typeof CourseSchema>;

export const CourseDetailSchema = CourseSchema.extend({
  totalWeight: z.number(),
  syllabusBody: z.string().nullable(),
  /** Grade curve adjustment in percentage points (e.g., +5.0 or -3.0) */
  gradeCurveAdjustment: z.number(),
});
export type CourseDetail = z.infer<typeof CourseDetailSchema>;

export const EnrollmentTermSchema = z.object({
  id: z.number(),
  externalId: z.string(),
  name: z.string(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
});
export type EnrollmentTerm = z.infer<typeof EnrollmentTermSchema>;

export const TaskSourceTypeSchema = z.enum(['canvas', 'user']);
export type TaskSourceType = z.infer<typeof TaskSourceTypeSchema>;

export const TaskSchema = z.object({
  id: z.number(),
  externalId: z.string(),
  /** Source of the task: 'canvas' (synced from Canvas) or 'user' (created locally) */
  sourceType: TaskSourceTypeSchema,
  courseId: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  /** Start date/unlock date for the task (ISO timestamp) */
  unlockAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  dueTimeKnown: z.boolean(), // true = time known, false = only date known (assume midnight)
  weight: z.number(),
  grade: z.number().nullable(),
  pointsPossible: z.number().nullable(),
  priorityScore: z.number(),
  isCompleted: z.boolean(),
  isOptional: z.boolean(),
  completedAt: z.string().nullable(),
  submissionStatus: z.string().nullable(),
  taskType: z.string().nullable(),
  taskGroupId: z.number().nullable(),
  /** FK to calendar event for task-calendar linking */
  calendarEventId: z.number().nullable(),
  /** Location for the task (e.g., room, building) */
  location: z.string().nullable(),
  /** User's personal notes for this task */
  notes: z.string().nullable(),
  fieldSources: z.record(z.string(), z.enum(['canvas', 'user', 'guessed'])).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

// Canvas Task Queue - staging area for new Canvas tasks
export const QueuedTaskStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'merged',
]);
export type QueuedTaskStatus = z.infer<typeof QueuedTaskStatusSchema>;

export const QueuedTaskSchema = z.object({
  id: z.number(),
  externalId: z.string(),
  courseId: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  dueAt: z.string().nullable(),
  pointsPossible: z.number().nullable(),
  taskType: z.string().nullable(),
  status: QueuedTaskStatusSchema,
  matchedUserTaskId: z.number().nullable(),
  matchConfidence: z.number().nullable(),
  firstSeenAt: z.string(),
  lastSyncedAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolvedBy: z.string().nullable(),
});
export type QueuedTask = z.infer<typeof QueuedTaskSchema>;

export const DownloadStatusSchema = z.enum([
  'pending',
  'downloading',
  'completed',
  'failed',
]);

export const NotificationAttachmentSchema = z.object({
  id: z.number(),
  notificationId: z.number(),
  externalId: z.string(),
  displayName: z.string(),
  filename: z.string(),
  url: z.string(),
  sizeBytes: z.number().nullable(),
  contentType: z.string().nullable(),
  localPath: z.string().nullable(),
  downloadStatus: DownloadStatusSchema,
  downloadedAt: z.string().nullable(),
});
export type NotificationAttachment = z.infer<typeof NotificationAttachmentSchema>;

export const NotificationSchema = z.object({
  id: z.number(),
  sourceType: z.string(),
  sourceId: z.string(),
  courseId: z.number().nullable(),
  title: z.string(),
  message: z.string(),
  messageHtml: z.string().nullable(),
  publishedAt: z.string(),
  dismissedAt: z.string().nullable(),
  url: z.string().nullable(),
  attachments: z.array(NotificationAttachmentSchema).optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const AnnouncementFileReferenceSchema = z.object({
  id: z.number(),
  notificationId: z.number(),
  attachmentId: z.number().nullable(),
  startPosition: z.number(),
  endPosition: z.number(),
  matchedText: z.string(),
  originalUrl: z.string().nullable(),
  attachment: NotificationAttachmentSchema.optional(),
});
export type AnnouncementFileReference = z.infer<typeof AnnouncementFileReferenceSchema>;

export const SimulatedGradeSchema = z.object({
  taskId: z.number(),
  courseId: z.number(),
  originalGrade: z.number().nullable(),
  simulatedGrade: z.number(),
  timestamp: z.string(),
});
export type SimulatedGrade = z.infer<typeof SimulatedGradeSchema>;

export const SimulationStateSchema = z.object({
  isActive: z.boolean(),
  startedAt: z.string().nullable(),
  grades: z.array(SimulatedGradeSchema),
});
export type SimulationState = z.infer<typeof SimulationStateSchema>;

export const HealthProbeStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy']);

export const HealthStatusSchema = z.object({
  overall: HealthProbeStatusSchema,
  probes: z.record(
    z.string(),
    z.object({
      status: HealthProbeStatusSchema,
      lastChecked: z.string().nullable(),
    })
  ),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const PowerSourceSchema = z.enum(['battery', 'ac', 'unknown']);

export const SystemStateSchema = z.object({
  powerSource: PowerSourceSchema,
  batteryLevel: z.number().nullable(),
  windowFocused: z.boolean(),
  isFullscreen: z.boolean(),
  canSync: z.boolean(),
});
export type SystemState = z.infer<typeof SystemStateSchema>;

export const ImportedCalendarSchema = z.object({
  id: z.number(),
  name: z.string(),
  filename: z.string(),
  fileHash: z.string().nullable(),
  color: z.string(),
  eventCount: z.number(),
  isVisible: z.boolean(),
  importedAt: z.string(),
  updatedAt: z.string(),
});
export type ImportedCalendar = z.infer<typeof ImportedCalendarSchema>;

export const CalendarSourceTypeSchema = z.enum(['canvas', 'user', 'imported']);

export const ExternalCalendarEventSchema = z.object({
  id: z.number(),
  externalId: z.string().nullable(),
  sourceType: CalendarSourceTypeSchema,
  courseId: z.number().nullable(),
  importedCalendarId: z.number().nullable(),
  /** FK to task if this event was auto-generated from a task */
  taskId: z.number().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string().nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  uid: z.string().nullable(),
  recurrenceRule: z.string().nullable(),
  recurrenceExceptionDates: z.string().nullable(),
  parentEventId: z.number().nullable(),
  /** Custom color override for this event */
  eventColor: z.string().nullable(),
  /** Calendar-specific notes (don't affect task) */
  notes: z.string().nullable(),
  /** Reminder offset in minutes */
  reminderMinutes: z.number().nullable(),
});
export type ExternalCalendarEvent = z.infer<typeof ExternalCalendarEventSchema>;

export const DisplayCalendarEventSchema = ExternalCalendarEventSchema.extend({
  isRecurrenceInstance: z.boolean(),
  recurrenceDate: z.string().optional(),
  originalEventId: z.number().optional(),
  /** Display color (from event, calendar, or course) */
  color: z.string(),
  calendarName: z.string().optional(),
  /** Task details when event is task-generated */
  taskTitle: z.string().optional(),
  taskWeight: z.number().optional(),
  taskType: z.string().optional(),
  taskLocation: z.string().optional(),
  courseCode: z.string().optional(),
  courseName: z.string().optional(),
});
export type DisplayCalendarEvent = z.infer<typeof DisplayCalendarEventSchema>;

export const ParsedICSEventSchema = z.object({
  uid: z.string(),
  summary: z.string(),
  description: z.string().nullable(),
  dtstart: z.date().nullable(),
  dtend: z.date().nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  rrule: z.string().nullable(),
  exdates: z.array(z.string()).nullable(),
  sequence: z.number(),
});
export type ParsedICSEvent = z.infer<typeof ParsedICSEventSchema>;

export const ICSImportPreviewSchema = z.object({
  calendarName: z.string(),
  filename: z.string(),
  events: z.array(ParsedICSEventSchema),
  hasRecurringEvents: z.boolean(),
  dateRange: z.object({ start: z.date(), end: z.date() }).nullable(),
  warnings: z.array(z.string()),
});
export type ICSImportPreview = z.infer<typeof ICSImportPreviewSchema>;

// Calendar Event CRUD Schemas
export const CreateCalendarEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startAt: z.string(),
  endAt: z.string().optional(),
  allDay: z.boolean().default(false),
  location: z.string().optional(),
  courseId: z.number().optional(),
});
export type CreateCalendarEventInput = z.infer<typeof CreateCalendarEventSchema>;

export const UpdateCalendarEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  /** Custom color override */
  color: z.string().optional(),
  /** Calendar-specific notes (don't affect task) */
  notes: z.string().optional(),
  /** Reminder offset in minutes */
  reminderMinutes: z.number().optional(),
  /** Task weight (synced to linked task) */
  weight: z.number().optional(),
  /** Task type (synced to linked task) */
  taskType: z.string().optional(),
  /** Course ID */
  courseId: z.number().nullable().optional(),
});
export type UpdateCalendarEventInput = z.infer<typeof UpdateCalendarEventSchema>;

export const ExportBatchOptionsSchema = z.object({
  mode: z.enum(['all', 'selected']),
  calendarIds: z.array(z.number()).optional(),
  courseIds: z.array(z.number()).optional(),
  includeUserEvents: z.boolean().default(true),
  consolidate: z.boolean().default(true),
  dateRange: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional(),
});
export type ExportBatchOptions = z.infer<typeof ExportBatchOptionsSchema>;

export const UrgencyLevelSchema = z.enum(['critical', 'high', 'medium', 'low']);

export const PriorityItemSchema = z.object({
  task: TaskSchema,
  course: CourseSchema,
  urgencyLevel: UrgencyLevelSchema,
  daysUntilDue: z.number().nullable(),
  effectiveGrade: z.number().nullable(),
});
export type PriorityItem = z.infer<typeof PriorityItemSchema>;

export const CourseSummarySchema = z.object({
  course: CourseSchema,
  taskCount: z.number(),
  completedCount: z.number(),
  upcomingCount: z.number(),
  overdueCount: z.number(),
  effectiveAssessedGrade: z.number().nullable(),
  targetDelta: z.number(),
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

export const PolicySchema = z.object({
  id: z.number(),
  courseId: z.number(),
  policyType: z.string(),
  policyName: z.string(),
  policyConfig: z.record(z.string(), z.unknown()),
  rawText: z.string().nullable(),
  isUserVerified: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Policy = z.infer<typeof PolicySchema>;

export const GradeHistoryEntrySchema = z.object({
  id: z.number(),
  courseId: z.number(),
  grade: z.number(),
  recordedAt: z.string(),
});
export type GradeHistoryEntry = z.infer<typeof GradeHistoryEntrySchema>;

export const FileResourceSchema = z.object({
  id: z.number(),
  externalId: z.string(),
  courseId: z.number(),
  parentFolderId: z.number().nullable(),
  folderPath: z.string().nullable(),
  type: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  localPath: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  mimeType: z.string().nullable(),
  syncedAt: z.string().nullable(),
  source: z.literal('resource'),
});
export type FileResource = z.infer<typeof FileResourceSchema>;

export const FileAttachmentSchema = z.object({
  id: z.number(),
  notificationId: z.number(),
  courseId: z.number(),
  externalId: z.string(),
  displayName: z.string(),
  filename: z.string(),
  url: z.string(),
  sizeBytes: z.number().nullable(),
  contentType: z.string().nullable(),
  localPath: z.string().nullable(),
  downloadStatus: z.string(),
  downloadedAt: z.string().nullable(),
  courseCode: z.string(),
  courseName: z.string(),
  notificationTitle: z.string(),
  source: z.literal('attachment'),
});
export type FileAttachment = z.infer<typeof FileAttachmentSchema>;

export const FilesDataSchema = z.object({
  resources: z.array(FileResourceSchema),
  attachments: z.array(FileAttachmentSchema),
});
export type FilesData = z.infer<typeof FilesDataSchema>;

export const UserProfileSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const ClearDataOptionsSchema = z.object({
  deleteToken: z.boolean().optional().default(false),
});
export type ClearDataOptions = z.infer<typeof ClearDataOptionsSchema>;

export const CoursePageSchema = z.object({
  id: z.number(),
  externalId: z.string().nullable(),
  courseId: z.number(),
  pageType: z.string(),
  title: z.string(),
  urlSlug: z.string().nullable(),
  bodyHtml: z.string().nullable(),
  bodyText: z.string().nullable(),
  isFrontPage: z.boolean(),
  published: z.boolean(),
  lastSyncedAt: z.string().nullable(),
});
export type CoursePage = z.infer<typeof CoursePageSchema>;

// ============ Intelligence Layer Schemas ============

export const RecommendationTypeSchema = z.enum([
  'work_now',
  'start_early',
  'take_break',
  'course_focus',
  'redistribute',
]);
export type RecommendationType = z.infer<typeof RecommendationTypeSchema>;

export const RecommendationSchema = z.object({
  id: z.number().optional(),
  type: RecommendationTypeSchema,
  taskId: z.number().nullable(),
  courseId: z.number().nullable(),
  title: z.string(),
  description: z.string(),
  reasoning: z.string(),
  priorityScore: z.number(),
  validFrom: z.string(),
  validUntil: z.string(),
  dismissedAt: z.string().nullable(),
  actedOnAt: z.string().nullable(),
  createdAt: z.string().optional(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const InsightTypeSchema = z.enum([
  'deadline_pattern',
  'course_struggle',
  'productivity_window',
  'workload_warning',
  'streak',
  'improvement',
  'data_completeness',
  'grade_at_risk',
  'grade_trend',
  'crunch_period',
  'unset_weight',
  'guessed_due_date',
]);
export type InsightType = z.infer<typeof InsightTypeSchema>;

export const InsightSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type InsightSeverity = z.infer<typeof InsightSeveritySchema>;

export const InsightSchema = z.object({
  id: z.number().optional(),
  type: InsightTypeSchema,
  title: z.string(),
  description: z.string(),
  severity: InsightSeveritySchema,
  data: z.record(z.string(), z.unknown()),
  acknowledgedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string().optional(),
});
export type Insight = z.infer<typeof InsightSchema>;

export const WorkloadSnapshotSchema = z.object({
  snapshotDate: z.string(),
  totalTasksDue: z.number(),
  totalEstimatedMinutes: z.number(),
  tasksByCourse: z.record(z.string(), z.number()),
  tasksByUrgency: z.record(z.string(), z.number()),
  deadlineClusteringScore: z.number(),
});
export type WorkloadSnapshot = z.infer<typeof WorkloadSnapshotSchema>;

export const WorkloadDistributionSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  dailySnapshots: z.array(WorkloadSnapshotSchema),
  peakDay: z.string().nullable(),
  peakMinutes: z.number(),
  avgDailyMinutes: z.number(),
  clusteringScore: z.number(),
  balanceScore: z.number(),
});
export type WorkloadDistribution = z.infer<typeof WorkloadDistributionSchema>;

export const EffortEstimateSchema = z.object({
  taskId: z.number(),
  courseId: z.number(),
  taskType: z.string(),
  pointsPossible: z.number().nullable(),
  estimatedMinutes: z.number(),
  actualMinutes: z.number().nullable(),
  estimationMethod: z.enum(['default', 'historical', 'calibrated', 'hybrid']),
  confidence: z.number(),
});
export type EffortEstimate = z.infer<typeof EffortEstimateSchema>;

export const DailyPlanEntrySchema = z.object({
  taskId: z.number(),
  taskTitle: z.string(),
  courseCode: z.string(),
  dueAt: z.string().nullable(),
  estimatedMinutes: z.number(),
  priorityScore: z.number(),
  recommendedStartTime: z.string().nullable(),
  reason: z.string(),
});
export type DailyPlanEntry = z.infer<typeof DailyPlanEntrySchema>;

export const RecommendationStatsSchema = z.object({
  totalGenerated: z.number(),
  totalDismissed: z.number(),
  totalActedOn: z.number(),
  activeCount: z.number(),
});
export type RecommendationStats = z.infer<typeof RecommendationStatsSchema>;

export const InsightStatsSchema = z.object({
  totalGenerated: z.number(),
  totalAcknowledged: z.number(),
  activeCount: z.number(),
  bySeverity: z.record(InsightSeveritySchema, z.number()),
  byType: z.record(z.string(), z.number()),
});
export type InsightStats = z.infer<typeof InsightStatsSchema>;

// ============ Event Schemas ============

export const SimulationChangeEventSchema = z.object({
  type: z.enum(['started', 'updated', 'cleared']),
  context: SimulationStateSchema.optional(),
});
export type SimulationChangeEvent = z.infer<typeof SimulationChangeEventSchema>;

export const DbCommitEventSchema = z.object({
  table: z.string(),
});
export type DbCommitEvent = z.infer<typeof DbCommitEventSchema>;

// ============ Sync Updates Schemas ============

export const SyncUpdateEntityTypeSchema = z.enum([
  'task',
  'announcement',
  'grade',
  'file',
  'page',
  'conflict',
]);
export type SyncUpdateEntityType = z.infer<typeof SyncUpdateEntityTypeSchema>;

export const SyncUpdateChangeTypeSchema = z.enum([
  'new',
  'updated',
  'grade_changed',
  'conflict',
]);
export type SyncUpdateChangeType = z.infer<typeof SyncUpdateChangeTypeSchema>;

export const SyncUpdateSchema = z.object({
  id: z.number(),
  syncSessionId: z.string(),
  courseId: z.number(),
  entityType: SyncUpdateEntityTypeSchema,
  entityId: z.number(),
  externalId: z.string().nullable(),
  changeType: SyncUpdateChangeTypeSchema,
  title: z.string(),
  subtitle: z.string().nullable(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  conflictField: z.string().nullable(),
  conflictResolution: z.enum(['local', 'canvas']).nullable(),
  rememberChoice: z.boolean(),
  isActionRequired: z.boolean().optional(), // Queued tasks that need accept/dismiss
  seenAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  // When Canvas value changed on unresolved item (if updatedAt > createdAt, item was modified)
  updatedAt: z.string().nullable().optional(),
  // Joined course info
  courseCode: z.string().optional(),
  courseName: z.string().optional(),
  courseColor: z.string().nullable().optional(),
});
export type SyncUpdate = z.infer<typeof SyncUpdateSchema>;

export const SyncUpdatesCountSchema = z.object({
  total: z.number(),
  conflicts: z.number(),
  informational: z.number(),
  actionRequired: z.number().optional(), // Queued tasks count
  byCourse: z.record(z.string(), z.number()),
  byType: z.record(z.string(), z.number()),
});
export type SyncUpdatesCount = z.infer<typeof SyncUpdatesCountSchema>;

export const SyncUpdatesPushEventSchema = z.object({
  type: z.enum(['new', 'cleared', 'updated']),
  totalUnseen: z.number(),
  conflictCount: z.number(),
});

export const SyncResultSummarySchema = z.object({
  courses: z.object({ synced: z.number(), new: z.number() }).optional(),
  tasks: z.object({ synced: z.number(), new: z.number() }).optional(),
  announcements: z.object({ synced: z.number(), new: z.number() }).optional(),
  files: z.object({ synced: z.number(), new: z.number() }).optional(),
  errors: z.array(z.string()).optional(),
  timestamp: z.string(),
});
export type SyncResultSummary = z.infer<typeof SyncResultSummarySchema>;

// ============ API Result Wrapper ============

export const ApiResultSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
  });

export type ApiResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ============ IPC Contract Definition ============

/**
 * Defines all IPC channels with their parameter and result types.
 * This is the single source of truth for IPC communication.
 */
export const IpcContract = {
  // ============ Data Fetching ============
  'data:getEnrollmentTerms': {
    params: z.void(),
    result: z.array(EnrollmentTermSchema),
  },
  'data:getCourses': {
    params: z.void(),
    result: z.array(CourseSchema),
  },
  'data:getCourse': {
    params: z.number(),
    result: CourseDetailSchema.nullable(),
  },
  'data:getTasks': {
    params: z.number().optional(),
    result: z.array(TaskSchema),
  },
  'data:getNotifications': {
    params: z.void(),
    result: z.array(NotificationSchema),
  },
  'data:getNotification': {
    params: z.number(),
    result: NotificationSchema.nullable(),
  },
  'data:getCourseNotifications': {
    params: z.number(),
    result: z.array(NotificationSchema),
  },
  'data:getAttachments': {
    params: z.number(),
    result: z.array(NotificationAttachmentSchema),
  },
  'data:getFileReferences': {
    params: z.number(),
    result: z.array(AnnouncementFileReferenceSchema),
  },
  'data:getPolicies': {
    params: z.number(),
    result: z.array(PolicySchema),
  },
  'data:getAllPolicies': {
    params: z
      .object({
        courseIds: z.array(z.number()).optional(),
      })
      .optional(),
    result: z.array(PolicySchema),
  },
  'data:getGradeHistory': {
    params: z.number(),
    result: z.array(GradeHistoryEntrySchema),
  },
  'data:getFiles': {
    params: z.void(),
    result: FilesDataSchema,
  },
  'data:getCourseSyllabus': {
    params: z.number(),
    result: z
      .object({
        id: z.number(),
        courseId: z.number(),
        resourceId: z.number(),
        sourceType: z.string(),
        resourceUpdatedAt: z.string().nullable(),
        lastReviewedAt: z.string().nullable(),
        changeDetectedAt: z.string().nullable(),
        markedAt: z.string(),
      })
      .nullable(),
  },
  'data:getCourseFiles': {
    params: z.number(),
    result: z.object({
      resources: z.array(FileResourceSchema),
      attachments: z.array(FileAttachmentSchema),
    }),
  },
  'data:getTaskCanvasUrl': {
    params: z.number(),
    result: z.string().nullable(),
  },
  'data:clearAll': {
    params: ClearDataOptionsSchema.optional(),
    result: ApiResultSchema(z.void()),
  },
  'data:exportDatabase': {
    params: z.void(),
    result: ApiResultSchema(z.object({ filePath: z.string() })),
  },
  'data:importDatabase': {
    params: z.void(),
    result: ApiResultSchema(z.void()),
  },
  'data:exportCourseData': {
    params: z
      .object({
        courseIds: z.array(z.number()).optional(),
        includeFiles: z.boolean().optional(),
      })
      .optional(),
    result: ApiResultSchema(z.object({ filePath: z.string() })),
  },
  'data:importCourseData': {
    params: z.void(),
    result: ApiResultSchema(
      z.object({
        coursesImported: z.number(),
        tasksImported: z.number(),
      })
    ),
  },

  // ============ Attachments ============
  'attachment:download': {
    params: z.number(),
    result: ApiResultSchema(z.object({ localPath: z.string() })),
  },
  'attachment:open': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },
  'attachment:showInFolder': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },

  // ============ Resources ============
  'resource:download': {
    params: z.number(),
    result: ApiResultSchema(z.object({ localPath: z.string() })),
  },
  'resource:downloadByExternalId': {
    params: z.string(),
    result: ApiResultSchema(z.object({ localPath: z.string() })),
  },
  'resource:open': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },
  'resource:openByExternalId': {
    params: z.string(),
    result: ApiResultSchema(z.void()),
  },
  'resource:showInFolder': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },
  'resource:showInFolderByExternalId': {
    params: z.string(),
    result: ApiResultSchema(z.void()),
  },
  'resource:deleteLocal': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },

  // ============ Files Directory ============
  'files:getDirectory': {
    params: z.void(),
    result: z.object({ path: z.string() }),
  },
  'files:openDirectory': {
    params: z.void(),
    result: ApiResultSchema(z.void()),
  },
  'files:selectDirectory': {
    params: z.void(),
    result: ApiResultSchema(z.object({ path: z.string() })),
  },
  'files:setDirectory': {
    params: z.string(),
    result: ApiResultSchema(z.void()),
  },
  'files:clearSync': {
    params: z.void(),
    result: ApiResultSchema(z.void()),
  },

  // ============ Course Pages ============
  'pages:getByCourse': {
    params: z.number(),
    result: z.array(CoursePageSchema),
  },
  'pages:get': {
    params: z.number(),
    result: ApiResultSchema(CoursePageSchema),
  },
  'pages:exportHtml': {
    params: z.object({
      courseId: z.number(),
      pageId: z.number(),
      title: z.string(),
      bodyHtml: z.string(),
    }),
    result: ApiResultSchema(z.object({ filePath: z.string() })),
  },

  // ============ Calendars ============
  'calendar:getImportedCalendars': {
    params: z.void(),
    result: z.array(ImportedCalendarSchema),
  },
  'calendar:parseICSPreview': {
    params: z.object({
      content: z.string(),
      filename: z.string(),
    }),
    result: ICSImportPreviewSchema,
  },
  'calendar:importICS': {
    params: z.object({
      content: z.string(),
      filename: z.string(),
      name: z.string().optional(),
      color: z.string().optional(),
    }),
    result: ApiResultSchema(z.object({ calendarId: z.number(), eventCount: z.number() })),
  },
  'calendar:deleteCalendar': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },
  'calendar:toggleVisibility': {
    params: z.object({
      calendarId: z.number(),
      isVisible: z.boolean(),
    }),
    result: ApiResultSchema(z.void()),
  },
  'calendar:updateCalendar': {
    params: z.object({
      calendarId: z.number(),
      updates: z.object({
        name: z.string().optional(),
        color: z.string().optional(),
      }),
    }),
    result: ApiResultSchema(z.void()),
  },
  'calendar:getEventsForRange': {
    params: z.object({
      startDate: z.string(),
      endDate: z.string(),
      includeHidden: z.boolean().optional(),
    }),
    result: z.array(DisplayCalendarEventSchema),
  },
  'calendar:createEvent': {
    params: CreateCalendarEventSchema,
    result: ApiResultSchema(z.object({ id: z.number() })),
  },
  'calendar:updateEvent': {
    params: z.object({
      id: z.number(),
      data: UpdateCalendarEventSchema,
    }),
    result: ApiResultSchema(z.void()),
  },
  'calendar:deleteEvent': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },
  'calendar:exportBatch': {
    params: ExportBatchOptionsSchema,
    result: ApiResultSchema(z.object({ content: z.string(), eventCount: z.number() })),
  },

  // ============ Commands ============
  'command:dispatch': {
    params: z.object({
      command: z.string(),
      params: z.unknown(),
    }),
    result: ApiResultSchema(z.unknown()),
  },

  // ============ Simulation ============
  'simulation:getState': {
    params: z.void(),
    result: SimulationStateSchema,
  },
  'simulation:clear': {
    params: z.void(),
    result: ApiResultSchema(z.void()),
  },

  // ============ System ============
  'system:state': {
    params: z.void(),
    result: SystemStateSchema,
  },
  'health:status': {
    params: z.void(),
    result: HealthStatusSchema,
  },
  'metrics:summary': {
    params: z.void(),
    result: z.record(z.string(), z.unknown()),
  },

  // ============ Credentials ============
  'credentials:get': {
    params: z.void(),
    result: z.object({ hasCredential: z.boolean() }),
  },
  'credentials:store': {
    params: z.string(),
    result: ApiResultSchema(z.void()),
  },
  'credentials:delete': {
    params: z.void(),
    result: ApiResultSchema(z.void()),
  },

  // ============ Canvas ============
  'canvas:connect': {
    params: z.string(),
    result: ApiResultSchema(z.void()),
  },
  'canvas:validateToken': {
    params: z.object({
      token: z.string(),
      baseUrl: z.string(),
    }),
    result: z.object({
      valid: z.boolean(),
      error: z.string().optional(),
      user: z.object({ name: z.string() }).optional(),
    }),
  },
  'canvas:getUserProfile': {
    params: z.void(),
    result: UserProfileSchema.nullable(),
  },
  'canvas:debugFetch': {
    params: z.string(),
    result: z.unknown(),
  },

  // ============ Priorities ============
  'priorities:calculate': {
    params: z.void(),
    result: z.array(PriorityItemSchema),
  },
  'priorities:refresh': {
    params: z.void(),
    result: ApiResultSchema(z.void()),
  },
  'priorities:getExplanation': {
    params: z.object({ taskId: z.number() }),
    result: z
      .object({
        taskId: z.number(),
        finalScore: z.number(),
        queue: z.string(),
        factors: z.record(z.string(), z.unknown()),
        breakdown: z.array(
          z.object({
            factor: z.string(),
            value: z.number(),
            contribution: z.number(),
            explanation: z.string(),
          })
        ),
        reasoning: z.string(),
      })
      .nullable(),
  },

  // ============ Sync ============
  'sync:full': {
    params: z
      .object({
        termSelection: z
          .union([z.literal('all'), z.literal('auto'), z.string()])
          .optional(),
        syncCanvasFiles: z.boolean().optional(),
        syncAnnouncements: z.boolean().optional(),
        courseIds: z.array(z.number()).optional(),
      })
      .optional(),
    result: ApiResultSchema(z.unknown()),
  },
  'sync:courses': {
    params: z.void(),
    result: ApiResultSchema(z.unknown()),
  },
  'sync:folderFiles': {
    params: z.object({
      canvasFolderId: z.number(),
      localCourseId: z.number(),
      forceRefresh: z.boolean().optional(),
    }),
    result: ApiResultSchema(
      z.object({
        success: z.boolean(),
        count: z.number(),
        errors: z.array(z.string()),
      })
    ),
  },
  'sync:folderByPath': {
    params: z.object({
      courseId: z.number(),
      folderPath: z.string(),
    }),
    result: ApiResultSchema(
      z.object({
        success: z.boolean(),
        count: z.number(),
        errors: z.array(z.string()),
      })
    ),
  },
  'sync:getPendingConflicts': {
    params: z.void(),
    result: z.array(
      z.object({
        id: z.string(),
        entity: z.enum(['course', 'task', 'notification']),
        entityId: z.number(),
        externalId: z.string(),
        entityName: z.string(),
        field: z.string(),
        fieldLabel: z.string(),
        localValue: z.unknown(),
        canvasValue: z.unknown(),
        timestamp: z.string(),
        courseName: z.string().optional(),
        courseId: z.number().optional(),
      })
    ),
  },
  'sync:resolveConflict': {
    params: z.object({
      conflictId: z.string(),
      useCanvasValue: z.boolean(),
      rememberChoice: z.boolean().optional(),
      rememberForAll: z.boolean().optional(),
      expiresAt: z.string().nullable().optional(),
    }),
    result: ApiResultSchema(z.void()),
  },
  'sync:resolveAllConflicts': {
    params: z.boolean(),
    result: ApiResultSchema(z.object({ resolved: z.number() })),
  },
  'sync:getSyncPreferences': {
    params: z.void(),
    result: z.array(
      z.object({
        entity: z.string(),
        field: z.string(),
        useCanvasValue: z.boolean(),
        expiresAt: z.string().nullable(),
        createdAt: z.string(),
      })
    ),
  },
  'sync:deleteSyncPreference': {
    params: z.object({
      entity: z.string(),
      field: z.string(),
    }),
    result: ApiResultSchema(z.void()),
  },
  'sync:getLastSyncTime': {
    params: z.void(),
    result: z.string().nullable(),
  },
  'sync:getAutoSyncPreferences': {
    params: z.void(),
    result: z.object({
      enabled: z.boolean(),
      autoSyncInterval: z.number(),
      autoAssignDueDate: z.boolean().optional(),
    }),
  },
  'sync:setAutoSyncPreferences': {
    params: z.object({
      enabled: z.boolean(),
      autoSyncInterval: z.number(),
      autoAssignDueDate: z.boolean().optional(),
    }),
    result: ApiResultSchema(z.void()),
  },

  // ============ File Operations ============
  'file:save': {
    params: z.object({
      defaultName: z.string(),
      content: z.string(),
      filters: z
        .array(
          z.object({
            name: z.string(),
            extensions: z.array(z.string()),
          })
        )
        .optional(),
    }),
    result: ApiResultSchema(z.object({ filePath: z.string() })),
  },

  // ============ Intelligence - Recommendations ============
  'intelligence:getActiveRecommendations': {
    params: z.void(),
    result: z.array(RecommendationSchema),
  },
  'intelligence:generateRecommendations': {
    params: z.object({ availableMinutes: z.number().optional() }).optional(),
    result: z.array(RecommendationSchema),
  },
  'intelligence:dismissRecommendation': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },
  'intelligence:actOnRecommendation': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },
  'intelligence:getRecommendationStats': {
    params: z.void(),
    result: RecommendationStatsSchema,
  },
  'intelligence:suppressRecommendation': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },

  // ============ Intelligence - Insights ============
  'intelligence:getActiveInsights': {
    params: z.void(),
    result: z.array(InsightSchema),
  },
  'intelligence:generateInsights': {
    params: z.void(),
    result: z.array(InsightSchema),
  },
  'intelligence:acknowledgeInsight': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },
  'intelligence:acknowledgeAllInsights': {
    params: z.void(),
    result: ApiResultSchema(z.object({ count: z.number() })),
  },
  'intelligence:getInsightStats': {
    params: z.void(),
    result: InsightStatsSchema,
  },
  'intelligence:suppressInsight': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },

  // ============ Intelligence - Workload ============
  'intelligence:getWorkloadDistribution': {
    params: z
      .object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
      .optional(),
    result: WorkloadDistributionSchema.nullable(),
  },
  'intelligence:getDailyPlan': {
    params: z.object({ date: z.string().optional() }).optional(),
    result: z.array(DailyPlanEntrySchema),
  },
  'intelligence:getEffortEstimate': {
    params: z.number(),
    result: EffortEstimateSchema.nullable(),
  },
  'intelligence:getClusteringScore': {
    params: z.object({ windowDays: z.number().optional() }).optional(),
    result: z.number(),
  },
  'intelligence:getCourseBalanceScore': {
    params: z.void(),
    result: z.number(),
  },
  'intelligence:getNeglectedCourses': {
    params: z.object({ windowDays: z.number().optional() }).optional(),
    result: z.array(
      z.object({
        courseId: z.number(),
        courseName: z.string(),
        lastCompletedAt: z.string().nullable(),
        daysSinceActivity: z.number(),
      })
    ),
  },
  'intelligence:getDeadlineClusters': {
    params: z.object({ windowHours: z.number().optional() }).optional(),
    result: z.array(
      z.object({
        startTime: z.string(),
        endTime: z.string(),
        taskCount: z.number(),
        taskIds: z.array(z.number()),
      })
    ),
  },
  'intelligence:getWorkloadSnapshots': {
    params: z.object({ days: z.number().optional() }).optional(),
    result: z.array(WorkloadSnapshotSchema),
  },

  // ============ Intelligence - Behavior Analytics ============
  'intelligence:getWeeklyRhythm': {
    params: z.void(),
    result: z.object({
      weeklyPattern: z.array(
        z.object({
          dayOfWeek: z.number(),
          dayName: z.string(),
          completionCount: z.number(),
          avgCompletionHour: z.number().nullable(),
        })
      ),
      peakDay: z.string(),
      peakHour: z.number().nullable(),
    }),
  },
  'intelligence:getCoursePerformance': {
    params: z.void(),
    result: z.array(
      z.object({
        courseId: z.number(),
        courseName: z.string(),
        avgCompletionTime: z.number().nullable(),
        onTimeRate: z.number(),
        tasksCompleted: z.number(),
      })
    ),
  },
  'intelligence:getStrugglePatterns': {
    params: z.void(),
    result: z.array(
      z.object({
        courseId: z.number(),
        courseName: z.string(),
        pattern: z.string(),
        severity: z.enum(['low', 'medium', 'high']),
        recommendation: z.string(),
      })
    ),
  },
  'intelligence:getCompletionTiming': {
    params: z.void(),
    result: z.object({
      earlyCompletions: z.number(),
      onTimeCompletions: z.number(),
      lateCompletions: z.number(),
      avgDaysBeforeDue: z.number(),
    }),
  },
  'intelligence:getBehaviorEventCount': {
    params: z.void(),
    result: z.number(),
  },

  // ============ Intelligence - Adaptive Learning ============
  'intelligence:getAdaptiveWeights': {
    params: z.void(),
    result: z.object({
      urgency: z.number(),
      weight: z.number(),
      courseGap: z.number(),
      taskType: z.number(),
      submissionStatus: z.number(),
    }),
  },
  'intelligence:getWeightAdjustments': {
    params: z.void(),
    result: z.array(
      z.object({
        id: z.number(),
        factor: z.string(),
        adjustment: z.number(),
        reason: z.string(),
        createdAt: z.string(),
      })
    ),
  },
  'intelligence:getAdaptiveSummary': {
    params: z.void(),
    result: z.object({
      totalAdjustments: z.number(),
      lastCalculatedAt: z.string().nullable(),
      currentWeights: z.record(z.string(), z.number()),
      drift: z.number(),
    }),
  },
  'intelligence:getAdaptiveStatistics': {
    params: z.void(),
    result: z.object({
      completionEvents: z.number(),
      adjustmentsMade: z.number(),
      accuracyImprovement: z.number().nullable(),
    }),
  },
  'intelligence:recalculateAdaptiveWeights': {
    params: z.void(),
    result: ApiResultSchema(z.void()),
  },

  // ============ Settings ============
  'settings:getDefaultTargetGrade': {
    params: z.void(),
    result: z.number(),
  },
  'settings:setDefaultTargetGrade': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },
  'settings:getTermSelection': {
    params: z.void(),
    result: z.object({
      value: z.union([z.literal('all'), z.literal('auto'), z.number()]),
      autoDetectedTermId: z.number().nullable(),
    }),
  },
  'settings:setTermSelection': {
    params: z.union([z.literal('all'), z.literal('auto'), z.number()]),
    result: ApiResultSchema(z.void()),
  },

  // ============ Visibility ============
  'visibility:getVisibleCourseIds': {
    params: z.void(),
    result: z.array(z.number()),
  },

  // ============ Course Settings ============
  'course:getSettings': {
    params: z.number(),
    result: z
      .object({
        courseId: z.number(),
        autoAssignDueDate: z.number().nullable(),
        allowGuessedOverride: z.number(),
      })
      .nullable(),
  },
  'course:updateSettings': {
    params: z.object({
      courseId: z.number(),
      settings: z.object({
        autoAssignDueDate: z.number().nullable().optional(),
        allowGuessedOverride: z.number().optional(),
      }),
    }),
    result: ApiResultSchema(z.void()),
  },

  // ============ App Recovery ============
  'app:getCrashInfo': {
    params: z.void(),
    result: z
      .object({
        timestamp: z.string(),
        reason: z.string(),
        stack: z.string().optional(),
      })
      .nullable(),
  },
  'app:getRecoveryStatus': {
    params: z.void(),
    result: z.object({
      safeMode: z.boolean(),
      lastCrash: z
        .object({
          timestamp: z.string(),
          reason: z.string(),
        })
        .nullable(),
      crashCount: z.number(),
      message: z.string().nullable(),
    }),
  },
  'app:exitSafeMode': {
    params: z.void(),
    result: ApiResultSchema(z.void()),
  },
  'app:dismissCrashNotification': {
    params: z.void(),
    result: ApiResultSchema(z.void()),
  },
  'app:handleCorruption': {
    params: z.enum(['export', 'reset', 'continue']),
    result: ApiResultSchema(
      z.object({
        exportPath: z.string().optional(),
      })
    ),
  },
  'app:reportError': {
    params: z.object({
      message: z.string(),
      stack: z.string().optional(),
      componentStack: z.string().optional(),
      timestamp: z.string(),
    }),
    result: ApiResultSchema(z.void()),
  },
  'app:restart': {
    params: z.void(),
    result: z.void(),
  },

  // ============ Window Behavior Settings ============
  'settings:getWindowBehavior': {
    params: z.void(),
    result: z.object({
      closeAction: z.enum(['quit', 'minimize-to-tray']).nullable(),
      showTrayIcon: z.boolean(),
    }),
  },
  'settings:setWindowBehavior': {
    params: z.object({
      closeAction: z.enum(['quit', 'minimize-to-tray']).nullable(),
      showTrayIcon: z.boolean(),
    }),
    result: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  },

  // ============ Custom Task Types ============
  'taskTypes:getAll': {
    params: z.number().optional(),
    result: ApiResultSchema(
      z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          displayName: z.string(),
          courseId: z.number().nullable(),
          createdAt: z.string(),
        })
      )
    ),
  },
  'taskTypes:create': {
    params: z.object({
      name: z.string(),
      displayName: z.string(),
      courseId: z.number().optional(),
    }),
    result: ApiResultSchema(
      z.object({
        id: z.number(),
        name: z.string(),
        displayName: z.string(),
        courseId: z.number().nullable(),
      })
    ),
  },
  'taskTypes:delete': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },

  // ============ Sync Updates ============
  'syncUpdates:getAll': {
    params: z
      .object({
        includeResolved: z.boolean().optional(),
        limit: z.number().optional(),
      })
      .optional(),
    result: z.array(SyncUpdateSchema),
  },
  'syncUpdates:getCount': {
    params: z.void(),
    result: SyncUpdatesCountSchema,
  },
  'syncUpdates:markSeen': {
    params: z.object({
      ids: z.array(z.number()),
    }),
    result: ApiResultSchema(z.object({ marked: z.number() })),
  },
  'syncUpdates:markAllSeen': {
    params: z
      .object({
        courseId: z.number().optional(),
        entityType: SyncUpdateEntityTypeSchema.optional(),
        excludeConflicts: z.boolean().optional(),
      })
      .optional(),
    result: ApiResultSchema(z.object({ marked: z.number() })),
  },
  'syncUpdates:markSeenByEntity': {
    params: z.object({
      entityType: SyncUpdateEntityTypeSchema,
      entityId: z.number(),
    }),
    result: ApiResultSchema(z.object({ marked: z.number() })),
  },
  'syncUpdates:resolveConflict': {
    params: z.object({
      updateId: z.number(),
      resolution: z.enum(['local', 'canvas']),
      rememberChoice: z.boolean().optional(),
    }),
    result: ApiResultSchema(z.void()),
  },
  'syncUpdates:cleanup': {
    params: z.object({
      olderThanDays: z.number().optional(),
    }),
    result: ApiResultSchema(z.object({ deleted: z.number() })),
  },
} as const;

// ============ Type Utilities ============

export type IpcChannel = keyof typeof IpcContract;

export type IpcParams<T extends IpcChannel> = z.infer<(typeof IpcContract)[T]['params']>;
export type IpcResult<T extends IpcChannel> = z.infer<(typeof IpcContract)[T]['result']>;

// ============ Push Event Channels ============

export const PushEventContract = {
  'simulation:changed': SimulationChangeEventSchema,
  'db:commit': DbCommitEventSchema,
  'sync:status': SyncStatusSchema,
  'sync:updates': SyncUpdatesPushEventSchema,
} as const;

export type PushEventChannel = keyof typeof PushEventContract;
export type PushEventPayload<T extends PushEventChannel> = z.infer<
  (typeof PushEventContract)[T]
>;

// ============ One-Way Channels (send, not invoke) ============

export const OneWayContract = {
  'window:minimize': z.void(),
  'window:maximize': z.void(),
  'window:close': z.void(),
  'window:hide': z.void(),
  'shell:openExternal': z.string(),
} as const;

// ============ Push Events from Main to Renderer ============

export const WindowBehaviorPromptSchema = z.object({
  showPrompt: z.boolean(),
});
export type WindowBehaviorPrompt = z.infer<typeof WindowBehaviorPromptSchema>;

export type OneWayChannel = keyof typeof OneWayContract;
export type OneWayParams<T extends OneWayChannel> = z.infer<(typeof OneWayContract)[T]>;
