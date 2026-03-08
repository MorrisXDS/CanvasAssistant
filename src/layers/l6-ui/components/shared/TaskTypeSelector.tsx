/**
 * TaskTypeSelector - Dropdown with task types and "Add more" option
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { TASK_TYPES } from '../../constants';
import { createLogger } from '../../utils/rendererLogger';

const logger = createLogger('TaskTypeSelector');

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

// Convert centralized TASK_TYPES to TaskType format
const DEFAULT_TASK_TYPES: TaskType[] = TASK_TYPES.map((t, idx) => ({
  id: idx + 1,
  name: t.value,
  displayName: t.label,
  isSystem: true,
}));

export function TaskTypeSelector({
  value,
  onChange,
  multiple = true,
  placeholder = 'Select task types...',
  showAddNew = true,
  courseId,
}: TaskTypeSelectorProps) {
  const [taskTypes, setTaskTypes] = useState<TaskType[]>(DEFAULT_TASK_TYPES);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Load custom task types from API
  const loadCustomTypes = useCallback(async () => {
    try {
      const result = await window.api.getTaskTypes(courseId);
      if (result.success && result.data) {
        // Merge custom types with default types, avoiding duplicates
        const customTypes: TaskType[] = result.data.map(
          (ct: { id: number; name: string; displayName: string }) => ({
            id: ct.id + 1000, // Offset to avoid ID conflicts with system types
            name: ct.name,
            displayName: ct.displayName,
            isSystem: false,
          })
        );

        // Filter out any custom types that have the same name as system types
        const uniqueCustomTypes = customTypes.filter(
          (ct) => !DEFAULT_TASK_TYPES.some((dt) => dt.name === ct.name)
        );

        setTaskTypes([...DEFAULT_TASK_TYPES, ...uniqueCustomTypes]);
      }
    } catch (error) {
      logger.error('Failed to load custom task types', error instanceof Error ? error : undefined);
    }
  }, [courseId]);

  useEffect(() => {
    loadCustomTypes();
  }, [loadCustomTypes]);

  const handleToggleType = (typeName: string) => {
    if (multiple) {
      if (value.includes(typeName)) {
        onChange(value.filter((t) => t !== typeName));
      } else {
        onChange([...value, typeName]);
      }
    } else {
      onChange([typeName]);
      setShowDropdown(false);
    }
  };

  const handleAddNewType = async () => {
    if (!newTypeName.trim() || isLoading) return;

    const name = newTypeName.toLowerCase().replace(/\s+/g, '_');

    // Check if type already exists
    if (taskTypes.some((t) => t.name === name)) {
      return; // Type already exists
    }

    setIsLoading(true);

    try {
      const result = await window.api.createTaskType({
        name,
        displayName: newTypeName.trim(),
        courseId,
      });

      if (result.success && result.data) {
        const newType: TaskType = {
          id: result.data.id + 1000,
          name: result.data.name,
          displayName: result.data.displayName,
          isSystem: false,
        };

        setTaskTypes([...taskTypes, newType]);
        onChange([...value, name]);
        setNewTypeName('');
        setShowAddForm(false);
      }
    } catch (error) {
      logger.error('Failed to create task type', error instanceof Error ? error : undefined);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = () => {
    onChange(taskTypes.map((t) => t.name));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div style={styles.container}>
      {/* Selected Types Display */}
      <div style={styles.selector} onClick={() => setShowDropdown(!showDropdown)}>
        {value.length === 0 ? (
          <span style={styles.placeholder}>{placeholder}</span>
        ) : value.length === taskTypes.length ? (
          <span style={styles.allSelected}>All types</span>
        ) : (
          <div style={styles.selectedTags}>
            {value.slice(0, 3).map((typeName) => {
              const type = taskTypes.find((t) => t.name === typeName);
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
            {taskTypes.map((type) => (
              <label key={type.name} style={styles.typeOption}>
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  checked={value.includes(type.name)}
                  onChange={() => handleToggleType(type.name)}
                  style={styles.checkbox}
                />
                <span style={styles.typeName}>{type.displayName}</span>
                {!type.isSystem && <span style={styles.customBadge}>Custom</span>}
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
                  <button style={styles.cancelBtn} onClick={() => setShowAddForm(false)}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button style={styles.addNewBtn} onClick={() => setShowAddForm(true)}>
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
        <div style={styles.overlay} onClick={() => setShowDropdown(false)} />
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
