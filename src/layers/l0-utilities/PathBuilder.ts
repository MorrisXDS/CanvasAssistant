/**
 * PathBuilder - Centralized file path construction for Canvas content
 *
 * Provides consistent path building and sanitization for all file operations.
 * Use this module instead of duplicating path logic across handlers.
 */

import path from 'path';

/**
 * Sanitize a course code for use in filesystem paths.
 * Removes/replaces characters that are invalid in file paths.
 */
export function sanitizeCourseCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '_');
}

/**
 * Sanitize a module name for use in filesystem paths.
 * Removes/replaces characters that are invalid in file paths.
 */
export function sanitizeModuleName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '_');
}

/**
 * Sanitize a title for use as a filename.
 * More restrictive than folder names - removes characters that cause issues in filenames.
 * Truncates to 50 characters to avoid path length issues.
 */
export function sanitizeTitle(title: string, maxLength: number = 50): string {
  return title.replace(/[<>:"/\\|?*]/g, '_').substring(0, maxLength);
}

/**
 * Sanitize a folder path (e.g., from Canvas folder structure).
 * Handles nested paths like "Lectures/Week 1".
 */
export function sanitizeFolderPath(folderPath: string): string {
  return (
    folderPath
      // eslint-disable-next-line cross-platform/no-hardcoded-path-separator -- Canvas folder paths use '/' regardless of OS
      .split('/')
      .map((segment) => segment.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '_'))
      .join(path.sep)
  );
}

/**
 * Path builder configuration
 */
export interface PathBuilderConfig {
  filesDir: string;
}

/**
 * PathBuilder class for constructing consistent file paths.
 *
 * Usage:
 *   const builder = new PathBuilder({ filesDir: '/path/to/downloads' });
 *   const htmlPath = builder.getPageHtmlPath('CSC108', 'Week 1', 'Lab 0');
 *   // Returns: /path/to/downloads/CSC108/Week_1/Lab_0.html
 */
export class PathBuilder {
  private readonly filesDir: string;

  constructor(config: PathBuilderConfig) {
    this.filesDir = config.filesDir;
  }

  /**
   * Get the base directory for a course's files.
   */
  getCoursePath(courseCode: string): string {
    return path.join(this.filesDir, sanitizeCourseCode(courseCode));
  }

  /**
   * Get the directory for a module within a course.
   */
  getModulePath(courseCode: string, moduleName: string): string {
    return path.join(
      this.filesDir,
      sanitizeCourseCode(courseCode),
      sanitizeModuleName(moduleName)
    );
  }

  /**
   * Get the full path for a page HTML file.
   * Structure: FILES_DIR/courseCode/moduleName/pageTitle.html
   */
  getPageHtmlPath(courseCode: string, moduleName: string, pageTitle: string): string {
    const safeTitle = sanitizeTitle(pageTitle);
    return path.join(
      this.filesDir,
      sanitizeCourseCode(courseCode),
      sanitizeModuleName(moduleName),
      `${safeTitle}.html`
    );
  }

  /**
   * Get the directory for a page's dependencies (images, files, etc.).
   * Structure: FILES_DIR/courseCode/moduleName/pageTitle_files/
   */
  getPageDependenciesPath(
    courseCode: string,
    moduleName: string,
    pageTitle: string
  ): string {
    const safeTitle = sanitizeTitle(pageTitle);
    return path.join(
      this.filesDir,
      sanitizeCourseCode(courseCode),
      sanitizeModuleName(moduleName),
      `${safeTitle}_files`
    );
  }

  /**
   * Get the folder path relative to the course folder (for database storage).
   * Returns just the module name portion.
   */
  getRelativeFolderPath(moduleName: string): string {
    return sanitizeModuleName(moduleName);
  }

  /**
   * Get path for a resource file within a course.
   * Structure: FILES_DIR/courseCode/filename
   */
  getResourcePath(courseCode: string, filename: string): string {
    return path.join(this.filesDir, sanitizeCourseCode(courseCode), filename);
  }

  /**
   * Get path for a resource file within a specific folder.
   * Structure: FILES_DIR/courseCode/folderPath/filename
   */
  getResourcePathWithFolder(
    courseCode: string,
    folderPath: string,
    filename: string
  ): string {
    return path.join(
      this.filesDir,
      sanitizeCourseCode(courseCode),
      sanitizeFolderPath(folderPath),
      filename
    );
  }
}

/**
 * Create a PathBuilder instance with the given files directory.
 * Convenience factory function.
 */
export function createPathBuilder(filesDir: string): PathBuilder {
  return new PathBuilder({ filesDir });
}
