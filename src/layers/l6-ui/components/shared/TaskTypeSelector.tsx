/**
 * TaskTypeSelector - Dropdown with task types and "Add more" option
 */

import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface TaskType {
  id: number;
  name: string;
  displayName: string;
  isSystem: boolean;
}

interface TaskTypeSelectorProps {
  value: string[];
  onChange: (types: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  showAddNew?: boolean;
  courseId?: number;
}

const DEFAULT_TASK_TYPES: TaskType[] = [
  { id: 1, name: 'assignment', displayName: 'Assignment', isSystem: true },
  { id: 2, name: 'quiz', displayName: 'Quiz', isSystem: true },
  { id: 3, name: 'exam', displayName: 'Exam', isSystem: true },
  { id: 4, name: 'midterm', displayName: 'Midterm', isSystem: true },
  { id: 5, name: 'final', displayName: 'Final', isSystem: true },
  { id: 6, name: 'project', displayName: 'Project', isSystem: true },
  { id: 7, name: 'lab', displayName: 'Lab', isSystem: true },
  { id: 8, name: 'discussion', displayName: 'Discussion', isSystem: true },
  { id: 9, name: 'attendance', displayName: 'Attendance', isSystem: true },
  { id: 10, name: 'other', displayName: 'Other', isSystem: true },
];

export function TaskTypeSelector({
  value,
  onChange,
  multiple = true,
  placeholder = 'Select task types...',
  showAddNew = true,
}: TaskTypeSelectorProps) {
  const [taskTypes, setTaskTypes] = useState<TaskType[]>(DEFAULT_TASK_TYPES);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  // Load custom task types from API
  useEffect(() => {
    // TODO: Load from database via API
    // For now, use defaults
  }, []);

  const handleToggleType = (typeName: string) => {
    if (multiple) {
      if (value.includes(typeName)) {
        onChange(value.filter(t => t !== typeName));
      } else {
        onChange([...value, typeName]);
      }
    } else {
      onChange([typeName]);
      setShowDropdown(false);
    }
  };

  const handleAddNewType = () => {
    if (!newTypeName.trim()) return;

    const name = newTypeName.toLowerCase().replace(/\s+/g, '_');
    const newType: TaskType = {
      id: Date.now(),
      name,
      displayName: newTypeName.trim(),
      isSystem: false,
    };

    setTaskTypes([...taskTypes, newType]);
    onChange([...value, name]);
    setNewTypeName('');
    setShowAddForm(false);

    // TODO: Save to database via API
  };

  const handleSelectAll = () => {
    onChange(taskTypes.map(t => t.name));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div style={styles.container}>
      {/* Selected Types Display */}
      <div
        style={styles.selector}
        onClick={() => setShowDropdown(!showDropdown)}
      >
        {value.length === 0 ? (
          <span style={styles.placeholder}>{placeholder}</span>
        ) : value.length === taskTypes.length ? (
          <span style={styles.allSelected}>All types</span>
        ) : (
          <div style={styles.selectedTags}>
            {value.slice(0, 3).map(typeName => {
              const type = taskTypes.find(t => t.name === typeName);
              return (
                <span key={typeName} style={styles.tag}>
                  {type?.displayName || typeName}
                  <button
                    style={styles.tagRemove}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleType(typeName);
                    }}
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
            {value.length > 3 && (
              <span style={styles.moreCount}>+{value.length - 3} more</span>
            )}
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div style={styles.dropdown}>
          {/* Quick Actions */}
          {multiple && (
            <div style={styles.quickActions}>
              <button style={styles.quickAction} onClick={handleSelectAll}>
                Select All
              </button>
              <button style={styles.quickAction} onClick={handleClearAll}>
                Clear
              </button>
            </div>
          )}

          {/* Type List */}
          <div style={styles.typeList}>
            {taskTypes.map(type => (
              <label key={type.name} style={styles.typeOption}>
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  checked={value.includes(type.name)}
                  onChange={() => handleToggleType(type.name)}
                  style={styles.checkbox}
                />
                <span style={styles.typeName}>{type.displayName}</span>
                {!type.isSystem && (
                  <span style={styles.customBadge}>Custom</span>
                )}
              </label>
            ))}
          </div>

          {/* Add New */}
          {showAddNew && (
            <div style={styles.addNewSection}>
              {showAddForm ? (
                <div style={styles.addForm}>
                  <input
                    type="text"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="New type name"
                    style={styles.addInput}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddNewType();
                      if (e.key === 'Escape') setShowAddForm(false);
                    }}
                  />
                  <button style={styles.addBtn} onClick={handleAddNewType}>
                    Add
                  </button>
                  <button
                    style={styles.cancelBtn}
                    onClick={() => setShowAddForm(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  style={styles.addNewBtn}
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus size={14} />
                  Add new type
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {showDropdown && (
        <div
          style={styles.overlay}
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
  },

  selector: {
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    cursor: 'pointer',
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
  },

  placeholder: {
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  },

  allSelected: {
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
  },

  selectedTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-1)',
    alignItems: 'center',
  },

  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
  },

  tagRemove: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'white',
    opacity: 0.7,
  },

  moreCount: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 100,
    maxHeight: '300px',
    overflow: 'auto',
  },

  quickActions: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-2)',
    borderBottom: '1px solid var(--border-light)',
  },

  quickAction: {
    padding: '4px 8px',
    fontSize: 'var(--text-xs)',
    backgroundColor: 'var(--bg-app)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },

  typeList: {
    padding: 'var(--space-2)',
  },

  typeOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
  },

  checkbox: {
    margin: 0,
  },

  typeName: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
  },

  customBadge: {
    fontSize: 'var(--text-xs)',
    padding: '1px 6px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
  },

  addNewSection: {
    padding: 'var(--space-2)',
    borderTop: '1px solid var(--border-light)',
  },

  addNewBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    width: '100%',
    padding: 'var(--space-2)',
    backgroundColor: 'transparent',
    border: '1px dashed var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    justifyContent: 'center',
  },

  addForm: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  addInput: {
    flex: 1,
    padding: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
  },

  addBtn: {
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
  },

  cancelBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-2)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
  },

  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99,
  },
};

export default TaskTypeSelector;
