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

export const CourseSchema = z.object({
  id: z.number(),
  externalId: z.string(),
  code: z.string(),
  name: z.string(),
  targetGrade: z.number(),
  assessedGrade: z.number().nullable(),
  currentGrade: z.number().nullable(),
  color: z.string().nullable(),
  nickname: z.string().nullable(),
  isHidden: z.boolean(),
  lastSyncedAt: z.string().nullable(),
  enrollmentTermId: z.number().nullable(),
});
export type Course = z.infer<typeof CourseSchema>;

export const CourseDetailSchema = CourseSchema.extend({
  totalWeight: z.number(),
  syllabusBody: z.string().nullable(),
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

export const TaskSchema = z.object({
  id: z.number(),
  externalId: z.string(),
  courseId: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  dueAt: z.string().nullable(),
  weight: z.number(),
  grade: z.number().nullable(),
  pointsPossible: z.number().nullable(),
  priorityScore: z.number(),
  isCompleted: z.boolean(),
  completedAt: z.string().nullable(),
  submissionStatus: z.string().nullable(),
  taskType: z.string().nullable(),
  taskGroupId: z.number().nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

export const DownloadStatusSchema = z.enum(['pending', 'downloading', 'completed', 'failed']);

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
  probes: z.record(z.string(), z.object({
    status: HealthProbeStatusSchema,
    lastChecked: z.string().nullable(),
  })),
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
});
export type ExternalCalendarEvent = z.infer<typeof ExternalCalendarEventSchema>;

export const DisplayCalendarEventSchema = ExternalCalendarEventSchema.extend({
  isRecurrenceInstance: z.boolean(),
  recurrenceDate: z.string().optional(),
  originalEventId: z.number().optional(),
  color: z.string(),
  calendarName: z.string().optional(),
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
  'data:getGradeHistory': {
    params: z.number(),
    result: z.array(GradeHistoryEntrySchema),
  },
  'data:getFiles': {
    params: z.void(),
    result: FilesDataSchema,
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
  'resource:open': {
    params: z.number(),
    result: ApiResultSchema(z.void()),
  },
  'resource:showInFolder': {
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

  // ============ Sync ============
  'sync:full': {
    params: z.object({
      termSelection: z.union([z.literal('all'), z.literal('auto'), z.string()]).optional(),
      syncCanvasFiles: z.boolean().optional(),
      syncAnnouncements: z.boolean().optional(),
      courseIds: z.array(z.number()).optional(),
    }).optional(),
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
    result: ApiResultSchema(z.object({
      success: z.boolean(),
      count: z.number(),
      errors: z.array(z.string()),
    })),
  },
  'sync:folderByPath': {
    params: z.object({
      courseId: z.number(),
      folderPath: z.string(),
    }),
    result: ApiResultSchema(z.object({
      success: z.boolean(),
      count: z.number(),
      errors: z.array(z.string()),
    })),
  },

  // ============ File Operations ============
  'file:save': {
    params: z.object({
      defaultName: z.string(),
      content: z.string(),
      filters: z.array(z.object({
        name: z.string(),
        extensions: z.array(z.string()),
      })).optional(),
    }),
    result: ApiResultSchema(z.object({ filePath: z.string() })),
  },
} as const;

// ============ Type Utilities ============

export type IpcChannel = keyof typeof IpcContract;

export type IpcParams<T extends IpcChannel> = z.infer<typeof IpcContract[T]['params']>;
export type IpcResult<T extends IpcChannel> = z.infer<typeof IpcContract[T]['result']>;

// ============ Push Event Channels ============

export const PushEventContract = {
  'simulation:changed': SimulationChangeEventSchema,
  'db:commit': DbCommitEventSchema,
  'sync:status': SyncStatusSchema,
} as const;

export type PushEventChannel = keyof typeof PushEventContract;
export type PushEventPayload<T extends PushEventChannel> = z.infer<typeof PushEventContract[T]>;

// ============ One-Way Channels (send, not invoke) ============

export const OneWayContract = {
  'window:minimize': z.void(),
  'window:maximize': z.void(),
  'window:close': z.void(),
  'shell:openExternal': z.string(),
} as const;

export type OneWayChannel = keyof typeof OneWayContract;
export type OneWayParams<T extends OneWayChannel> = z.infer<typeof OneWayContract[T]>;
