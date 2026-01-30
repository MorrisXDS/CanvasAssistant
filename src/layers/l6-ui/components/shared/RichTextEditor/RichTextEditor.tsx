/**
 * Rich Text Editor Component
 * TipTap-based WYSIWYG editor for HTML content
 */

import React, { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorToolbar } from './EditorToolbar';
import { editorStyles, prosemirrorStyles } from './editorStyles';

export interface RichTextEditorProps {
  /** HTML content value */
  value: string;
  /** Called when content changes */
  onChange: (html: string) => void;
  /** Placeholder text when editor is empty */
  placeholder?: string;
  /** Minimum height of the editor in pixels */
  minHeight?: number;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter content...',
  minHeight = 100,
  disabled = false,
  className,
}: RichTextEditorProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const [showLinkInput, setShowLinkInput] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const linkInputRef = React.useRef<HTMLInputElement>(null);

  const editor = useEditor({
    // Required for Vite/React to prevent hook ordering issues
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Disable heading as we only want basic formatting
        heading: false,
        // Keep paragraph, bold, italic, lists
        bulletList: {},
        orderedList: {},
        listItem: {},
        bold: {},
        italic: {},
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Return empty string if content is just an empty paragraph
      const cleanHtml = html === '<p></p>' ? '' : html;
      onChange(cleanHtml);
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      const currentHtml = editor.getHTML();
      // Only update if genuinely different (not just empty paragraph)
      const normalizedValue = value || '';
      const normalizedCurrent = currentHtml === '<p></p>' ? '' : currentHtml;
      if (normalizedValue !== normalizedCurrent) {
        editor.commands.setContent(value || '');
      }
    }
  }, [value, editor]);

  // Inject prosemirror styles once
  useEffect(() => {
    const styleId = 'prosemirror-editor-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = prosemirrorStyles;
      document.head.appendChild(style);
    }
  }, []);

  const handleAddLink = useCallback(() => {
    if (!editor) return;

    // Get current link URL if selection is on a link
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkUrl(previousUrl);
    setShowLinkInput(true);

    // Focus the input after state update
    setTimeout(() => {
      linkInputRef.current?.focus();
    }, 0);
  }, [editor]);

  const handleConfirmLink = useCallback(() => {
    if (!editor) return;

    if (linkUrl) {
      // Add https if no protocol specified
      const url = linkUrl.match(/^https?:\/\//) ? linkUrl : `https://${linkUrl}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }

    setShowLinkInput(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  const handleCancelLink = useCallback(() => {
    setShowLinkInput(false);
    setLinkUrl('');
    editor?.chain().focus().run();
  }, [editor]);

  const handleLinkKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmLink();
      } else if (e.key === 'Escape') {
        handleCancelLink();
      }
    },
    [handleConfirmLink, handleCancelLink]
  );

  const containerStyle: React.CSSProperties = {
    ...editorStyles.container,
    ...(isFocused ? editorStyles.containerFocused : {}),
    ...(disabled ? editorStyles.containerDisabled : {}),
  };

  const contentStyle: React.CSSProperties = {
    ...editorStyles.editorContent,
    minHeight,
  };

  return (
    <div style={containerStyle} className={className}>
      <EditorToolbar editor={editor} onAddLink={handleAddLink} />

      <EditorContent editor={editor} style={contentStyle} />

      {showLinkInput && (
        <div style={editorStyles.linkInput}>
          <input
            ref={linkInputRef}
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={handleLinkKeyDown}
            placeholder="Enter URL..."
            style={editorStyles.linkInputField}
          />
          <button
            type="button"
            onClick={handleConfirmLink}
            style={{ ...editorStyles.linkInputButton, ...editorStyles.linkInputConfirm }}
          >
            Add
          </button>
          <button
            type="button"
            onClick={handleCancelLink}
            style={{ ...editorStyles.linkInputButton, ...editorStyles.linkInputCancel }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
