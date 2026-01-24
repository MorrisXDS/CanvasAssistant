/**
 * Folder Type Detection and Styling
 * Determines folder types based on name patterns and provides colors
 */

import React from 'react';

// Folder type definitions
export type FolderType =
  | 'announcements'
  | 'lectures'
  | 'labs'
  | 'assignments'
  | 'tutorials'
  | 'exams'
  | 'resources'
  | 'default';

// Folder type configuration
export interface FolderTypeConfig {
  type: FolderType;
  color: string;
  label: string;
  patterns: RegExp[];
}

// Folder type definitions with patterns
export const FOLDER_TYPES: FolderTypeConfig[] = [
  {
    type: 'announcements',
    color: '#8E24AA', // Purple
    label: 'Announcements',
    patterns: [/^announcements?$/i],
  },
  {
    type: 'lectures',
    color: '#1976D2', // Blue
    label: 'Lectures',
    patterns: [
      /lecture/i,
      /slides?$/i,
      /\bppt\b/i,
      /presentations?$/i,
      /\bclass\s*notes?\b/i,
    ],
  },
  {
    type: 'labs',
    color: '#43A047', // Green
    label: 'Labs',
    patterns: [
      /\blabs?\b/i,
      /laboratory/i,
      /\bpractical\b/i,
    ],
  },
  {
    type: 'assignments',
    color: '#E65100', // Orange
    label: 'Assignments',
    patterns: [
      /assign/i,
      /homework/i,
      /\bhw\d*\b/i,
      /problem\s*sets?/i,
      /\bpset\b/i,
      /submissions?/i,
    ],
  },
  {
    type: 'tutorials',
    color: '#00897B', // Teal
    label: 'Tutorials',
    patterns: [
      /tutorials?/i,
      /\btut\d*\b/i,
      /\brecitation\b/i,
      /discussion/i,
    ],
  },
  {
    type: 'exams',
    color: '#C62828', // Red
    label: 'Exams',
    patterns: [
      /\bexams?\b/i,
      /\bquiz/i,
      /\btest\b/i,
      /midterm/i,
      /\bfinal\b/i,
      /assessment/i,
    ],
  },
  {
    type: 'resources',
    color: '#5D4037', // Brown
    label: 'Resources',
    patterns: [
      /resources?/i,
      /readings?/i,
      /textbook/i,
      /references?/i,
      /materials?/i,
      /syllabus/i,
    ],
  },
];

// Default folder config - blue-gray for unclassified
export const DEFAULT_FOLDER_CONFIG: FolderTypeConfig = {
  type: 'default',
  color: '#546E7A', // Blue-gray (distinguishable but neutral)
  label: 'Files',
  patterns: [],
};

/**
 * Detect folder type from folder name
 */
export function detectFolderType(folderName: string): FolderTypeConfig {
  // Check against each folder type's patterns
  for (const config of FOLDER_TYPES) {
    for (const pattern of config.patterns) {
      if (pattern.test(folderName)) {
        return config;
      }
    }
  }
  return DEFAULT_FOLDER_CONFIG;
}

/**
 * Get folder type from full path (uses the last segment)
 */
export function getFolderTypeFromPath(folderPath: string | null): FolderTypeConfig {
  if (!folderPath) return DEFAULT_FOLDER_CONFIG;

  // Get the last segment of the path
  const segments = folderPath.split('/').filter(Boolean);
  if (segments.length === 0) return DEFAULT_FOLDER_CONFIG;

  // Check each segment from end to start
  for (let i = segments.length - 1; i >= 0; i--) {
    const config = detectFolderType(segments[i]);
    if (config.type !== 'default') {
      return config;
    }
  }

  return DEFAULT_FOLDER_CONFIG;
}

/**
 * Calculate folder depth from path
 */
export function getFolderDepth(folderPath: string | null): number {
  if (!folderPath) return 0;
  return folderPath.split('/').filter(Boolean).length;
}

/**
 * Get CSS class for folder depth indentation
 */
export function getFolderDepthClass(depth: number): string {
  if (depth <= 0) return '';
  if (depth >= 4) return 'folderDepth4';
  return `folderDepth${depth}`;
}

/**
 * Parse folder path into segments for tree rendering
 */
export interface FolderSegment {
  name: string;
  path: string;
  depth: number;
  type: FolderTypeConfig;
}

export function parseFolderPath(folderPath: string | null): FolderSegment[] {
  if (!folderPath) return [];

  const segments = folderPath.split('/').filter(Boolean);
  const result: FolderSegment[] = [];

  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    currentPath = currentPath ? `${currentPath}/${segments[i]}` : segments[i];
    result.push({
      name: segments[i],
      path: currentPath,
      depth: i,
      type: detectFolderType(segments[i]),
    });
  }

  return result;
}

/**
 * Build a tree structure from flat folder paths
 */
export interface FolderTreeNode {
  name: string;
  path: string;
  depth: number;
  type: FolderTypeConfig;
  children: Map<string, FolderTreeNode>;
  files: unknown[];
  isLast: boolean;
}

export function buildFolderTree(
  folderPaths: string[],
  getFilesForPath: (path: string) => unknown[]
): Map<string, FolderTreeNode> {
  const root = new Map<string, FolderTreeNode>();

  for (const path of folderPaths) {
    const segments = parseFolderPath(path);
    let currentLevel = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLeaf = i === segments.length - 1;

      if (!currentLevel.has(segment.name)) {
        currentLevel.set(segment.name, {
          ...segment,
          children: new Map(),
          files: isLeaf ? getFilesForPath(path) : [],
          isLast: false, // Will be updated later
        });
      } else if (isLeaf) {
        // Add files to existing node
        const node = currentLevel.get(segment.name)!;
        node.files = getFilesForPath(path);
      }

      currentLevel = currentLevel.get(segment.name)!.children;
    }
  }

  // Mark last items in each level
  function markLastItems(level: Map<string, FolderTreeNode>) {
    const entries = Array.from(level.entries());
    entries.forEach(([, node], index) => {
      node.isLast = index === entries.length - 1;
      markLastItems(node.children);
    });
  }
  markLastItems(root);

  return root;
}

// Course color palette
export const COURSE_COLORS = [
  '#007FA3', '#E53935', '#43A047', '#FB8C00', '#8E24AA',
  '#1E88E5', '#D81B60', '#00ACC1', '#7CB342', '#6D4C41',
];

/**
 * Get course color by ID
 */
export function getCourseColor(courseId: number, existingColor: string | null): string {
  if (existingColor) return existingColor;
  return COURSE_COLORS[courseId % COURSE_COLORS.length];
}

/**
 * Extract short code from course code
 */
export function getShortCode(code: string): string {
  const match = code.match(/^(.+?)(?=[A-Z]\d(?:\s|$))/i);
  return match ? match[1] : code.split(/\s/)[0];
}

/**
 * Extract course prefix (e.g., "ECE" from "ECE244H1 F LEC0101")
 */
export function getCoursePrefix(code: string): string {
  const match = code.match(/^([A-Z]{2,4})/);
  return match ? match[1] : 'OTHER';
}

/**
 * Extract term from course code
 */
export function getCourseTerm(code: string): string {
  if (code.includes(' F ') || code.endsWith(' F')) return 'Fall';
  if (code.includes(' S ') || code.endsWith(' S')) return 'Winter';
  if (code.includes(' Y ') || code.endsWith(' Y')) return 'Year';
  if (code.startsWith('PERM')) return 'Permanent';
  return 'Other';
}
