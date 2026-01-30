/**
 * HtmlContent Component
 * Safe HTML renderer with DOMPurify sanitization and consistent styling
 */

import React from 'react';
import DOMPurify from 'dompurify';

export interface HtmlContentProps {
  /** HTML content to render */
  html: string | null | undefined;
  /** Additional CSS class name */
  className?: string;
  /** Optional maximum height with scroll */
  maxHeight?: number;
  /** Callback when a link is clicked */
  onLinkClick?: (href: string, isCanvasFile: boolean) => void;
  /** Text to show when content is empty */
  emptyText?: string;
  /** Inline styles to apply */
  style?: React.CSSProperties;
}

// Patterns to detect Canvas file URLs
const CANVAS_FILE_PATTERNS = [
  /\/files\/\d+/,
  /\/api\/v1\/files\/\d+/,
  /verifier=[a-zA-Z0-9]+/,
  /download_frd=1/,
];

/**
 * Check if a URL is a Canvas file link
 */
function isCanvasFileUrl(href: string): boolean {
  return CANVAS_FILE_PATTERNS.some((pattern) => pattern.test(href));
}

/**
 * Extract file ID from Canvas URL
 */
export function extractCanvasFileId(href: string): string | null {
  const match = href.match(/\/files\/(\d+)/);
  return match ? match[1] : null;
}

const defaultStyles: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-relaxed)',
  color: 'var(--text-primary)',
};

const emptyStyles: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  fontSize: 'var(--text-sm)',
};

export function HtmlContent({
  html,
  className,
  maxHeight,
  onLinkClick,
  emptyText,
  style,
}: HtmlContentProps) {
  // Handle link clicks
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Check if clicked element is an anchor or inside one
    const anchor = target.tagName === 'A' ? target : target.closest('a');

    if (anchor) {
      e.preventDefault();
      const href = (anchor as HTMLAnchorElement).href;
      if (!href) return;

      if (onLinkClick) {
        const isCanvasFile = isCanvasFileUrl(href);
        onLinkClick(href, isCanvasFile);
      } else {
        // Default: open in external browser
        window.api?.openExternal(href);
      }
    }
  };

  // Handle empty content
  if (!html || html.trim() === '' || html === '<p></p>') {
    if (emptyText) {
      return <div style={{ ...emptyStyles, ...style }}>{emptyText}</div>;
    }
    return null;
  }

  // Sanitize HTML
  const sanitizedHtml = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'], // Allow target="_blank" on links
  });

  const containerStyle: React.CSSProperties = {
    ...defaultStyles,
    ...(maxHeight
      ? {
          maxHeight,
          overflowY: 'auto' as const,
        }
      : {}),
    ...style,
  };

  return (
    <div
      className={`html-content ${className || ''}`}
      style={containerStyle}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      onClick={handleClick}
    />
  );
}
