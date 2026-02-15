/**
 * Course Grades Cache
 * Memoized course grades calculation to avoid O(courses × tasks) on every render
 */

const courseGradesCache = new Map<
  string,
  { earned: number; trend: number; assessed: number }
>();
let lastTasksHash = '';

function computeTasksHash(
  tasks: { courseId: number; weight: number; grade: number | null }[]
): string {
  // Simple hash based on task courseId and grades - changes trigger recalculation
  return tasks
    .filter((t) => t.weight > 0)
    .map((t) => `${t.courseId}:${t.grade}:${t.weight}`)
    .join('|');
}

/**
 * Get cached course grades with automatic invalidation
 * Cache is invalidated when tasks data changes
 */
export function getCachedCourseGrades(
  courseId: number,
  tasks: { courseId: number; weight: number; grade: number | null }[]
): { earned: number; trend: number; assessed: number } {
  const tasksHash = computeTasksHash(tasks);

  // Invalidate cache if tasks changed
  if (tasksHash !== lastTasksHash) {
    courseGradesCache.clear();
    lastTasksHash = tasksHash;
  }

  const cacheKey = `${courseId}`;
  const cached = courseGradesCache.get(cacheKey);
  if (cached) return cached;

  // Calculate grades for this course
  let totalWeight = 0;
  let totalContribution = 0;

  for (const task of tasks) {
    if (task.courseId === courseId && task.weight > 0 && task.grade !== null) {
      totalWeight += task.weight;
      totalContribution += (task.grade / 100) * task.weight;
    }
  }

  const result = {
    earned: totalContribution,
    assessed: totalWeight,
    trend: totalWeight > 0 ? (totalContribution / totalWeight) * 100 : 0,
  };

  courseGradesCache.set(cacheKey, result);
  return result;
}

/**
 * Clear the course grades cache (useful for testing)
 */
export function clearCourseGradesCache(): void {
  courseGradesCache.clear();
  lastTasksHash = '';
}
