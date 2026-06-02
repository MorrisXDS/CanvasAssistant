/**
 * "Reveal in Files" — when the Files page is navigated to with a
 * `revealFileKey` in router state (e.g. from an announcement file reference,
 * issue #29), expand to + scroll to + briefly highlight that file's row.
 *
 * The decision of WHAT to expand/unfilter is a pure function (`planFileReveal`)
 * so it can be unit-tested without a DOM; the hook applies the plan and does the
 * (jsdom-hostile) scroll/highlight.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './FilesPage.module.css';

export interface RevealNavState {
  revealFileKey?: string;
  revealCourseId?: number | null;
}

/** The Files-page state slice the planner needs (subset of useFilesPageState). */
export interface RevealContext {
  sourceFilter: string;
  expandedCourses: ReadonlySet<number>;
  groupedFiles: ReadonlyMap<number, ReadonlyMap<string, unknown>>;
  isFolderExpanded: (courseId: number, folderPath: string) => boolean;
}

export interface RevealPlan {
  fileKey: string;
  /** Set the source filter to 'all' (the current filter would hide the row). */
  setFilterToAll: boolean;
  /** The file's owning course (null if unknown). */
  courseId: number | null;
  /** True if that course is currently collapsed and must be expanded. */
  expandCourse: boolean;
  /** Folder paths under that course to expand so the row renders. */
  expandFolderPaths: string[];
}

/**
 * Decide what to expand/unfilter so that the file row for `navState.revealFileKey`
 * will be present in the tree. Pure — no DOM, no side effects. Returns null when
 * there's nothing to reveal.
 */
export function planFileReveal(
  navState: RevealNavState | null,
  ctx: RevealContext
): RevealPlan | null {
  const fileKey = navState?.revealFileKey;
  if (!fileKey) return null;

  // Attachments live under the 'all' or 'announcements' source filters; any
  // other active filter would hide the row.
  const setFilterToAll =
    ctx.sourceFilter !== 'all' && ctx.sourceFilter !== 'announcements';

  let expandCourse = false;
  const expandFolderPaths: string[] = [];
  const courseId = navState?.revealCourseId ?? null;
  if (courseId != null) {
    if (!ctx.expandedCourses.has(courseId)) expandCourse = true;
    const folderMap = ctx.groupedFiles.get(courseId);
    if (folderMap) {
      for (const folderPath of folderMap.keys()) {
        if (!ctx.isFolderExpanded(courseId, folderPath)) {
          expandFolderPaths.push(folderPath);
        }
      }
    }
  }

  return { fileKey, setFilterToAll, courseId, expandCourse, expandFolderPaths };
}

/** Scroll to + briefly highlight the row carrying `data-file-key={fileKey}`. */
export function scrollToAndHighlight(fileKey: string): void {
  let tries = 0;
  const tick = () => {
    const el = document.querySelector<HTMLElement>(
      `[data-file-key="${CSS.escape(fileKey)}"]`
    );
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add(styles.revealHighlight);
      window.setTimeout(() => el.classList.remove(styles.revealHighlight), 2200);
    } else if (tries++ < 30) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

export interface RevealActions extends RevealContext {
  setSourceFilter: (f: 'all') => void;
  toggleCourse: (courseId: number) => void;
  toggleFolder: (courseId: number, folderPath: string) => void;
  loading: boolean;
}

/**
 * Files-page hook: on navigation here with router-state `revealFileKey`, apply
 * the reveal plan (unfilter + expand) then scroll/highlight. Runs once per
 * distinct navigation (`location.key`).
 */
export function useFileReveal(actions: RevealActions): void {
  const location = useLocation();
  const revealedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (actions.loading) return;
    const plan = planFileReveal(location.state as RevealNavState | null, actions);
    if (!plan || revealedKeyRef.current === plan.fileKey) return;
    revealedKeyRef.current = plan.fileKey;

    if (plan.setFilterToAll) actions.setSourceFilter('all');
    if (plan.expandCourse && plan.courseId != null) actions.toggleCourse(plan.courseId);
    if (plan.courseId != null) {
      for (const folderPath of plan.expandFolderPaths) {
        actions.toggleFolder(plan.courseId, folderPath);
      }
    }
    scrollToAndHighlight(plan.fileKey);
  }, [location.key, actions.loading]);
}
