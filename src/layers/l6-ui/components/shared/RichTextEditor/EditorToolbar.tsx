/**
 * Editor Toolbar Component
 * Formatting buttons for the rich text editor
 */

import React from 'react';
import { Bold, Italic, List, ListOrdered, Link, Unlink } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { editorStyles } from './editorStyles';

interface EditorToolbarProps {
  editor: Editor | null;
  onAddLink: () => void;
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  isActive?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon, title, isActive, onClick }: ToolbarButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...editorStyles.toolbarButton,
        ...(isActive ? editorStyles.toolbarButtonActive : {}),
        ...(isHovered && !isActive ? editorStyles.toolbarButtonHover : {}),
      }}
    >
      {icon}
    </button>
  );
}

export function EditorToolbar({ editor, onAddLink }: EditorToolbarProps) {
  if (!editor) return null;

  const hasLink = editor.isActive('link');

  return (
    <div style={editorStyles.toolbar}>
      <ToolbarButton
        icon={<Bold size={16} />}
        title="Bold (Ctrl+B)"
        isActive={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={<Italic size={16} />}
        title="Italic (Ctrl+I)"
        isActive={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />

      <div style={editorStyles.toolbarDivider} />

      <ToolbarButton
        icon={<List size={16} />}
        title="Bullet List"
        isActive={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={<ListOrdered size={16} />}
        title="Numbered List"
        isActive={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />

      <div style={editorStyles.toolbarDivider} />

      <ToolbarButton
        icon={<Link size={16} />}
        title="Add Link"
        isActive={hasLink}
        onClick={onAddLink}
      />
      {hasLink && (
        <ToolbarButton
          icon={<Unlink size={16} />}
          title="Remove Link"
          onClick={() => editor.chain().focus().unsetLink().run()}
        />
      )}
    </div>
  );
}
