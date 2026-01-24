/**
 * UnifiedDashboardGrid Component
 * Main container with 2x2 CSS Grid for dashboard sections
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { DashboardSection } from './DashboardSection';
import { useDashboardDragDrop } from './useDashboardDragDrop';
import { PriorityList } from './PriorityList';
import { NotificationsFeed } from './NotificationsFeed';
import { RecommendationsCard } from './RecommendationsCard';
import { InsightsCard } from './InsightsCard';
import type { PriorityItem } from '../../../l5-presentation/types';
import type { Notification } from '../../../l5-presentation/types';

// Section configuration
interface SectionConfig {
  id: string;
  title: string;
}

const SECTIONS: SectionConfig[] = [
  { id: 'priority', title: 'Upcoming Assignments' },
  { id: 'notifications', title: 'Recent Updates' },
  { id: 'recommendations', title: 'Recommendations' },
  { id: 'insights', title: 'Insights' },
];

export interface UnifiedDashboardGridProps {
  priorityItems: PriorityItem[];
  totalPendingTasks: number;
  notifications: Notification[];
  onTaskClick: (taskId: number) => void;
  onDismissNotification: (id: number) => void;
}

export function UnifiedDashboardGrid({
  priorityItems,
  totalPendingTasks,
  notifications,
  onTaskClick,
  onDismissNotification,
}: UnifiedDashboardGridProps) {
  const {
    sectionOrder,
    collapsedSections,
    draggedItem,
    dragOverItem,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    toggleCollapsed,
    resetLayout,
  } = useDashboardDragDrop();

  // Render section content based on ID
  const renderSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case 'priority':
        return (
          <PriorityList
            items={priorityItems}
            totalPendingTasks={totalPendingTasks}
            onTaskClick={onTaskClick}
            maxItems={6}
          />
        );
      case 'notifications':
        return (
          <NotificationsFeed
            notifications={notifications}
            onDismiss={onDismissNotification}
            maxItems={4}
          />
        );
      case 'recommendations':
        return <RecommendationsCard maxItems={4} />;
      case 'insights':
        return <InsightsCard maxItems={4} />;
      default:
        return null;
    }
  };

  // Get section config by ID
  const getSectionConfig = (id: string): SectionConfig | undefined => {
    return SECTIONS.find(s => s.id === id);
  };

  // Check if layout has been customized
  const isCustomized = React.useMemo(() => {
    const defaultOrder = ['priority', 'notifications', 'recommendations', 'insights'];
    const orderChanged = sectionOrder.some((id, i) => id !== defaultOrder[i]);
    const hasCollapsed = collapsedSections.size > 0;
    return orderChanged || hasCollapsed;
  }, [sectionOrder, collapsedSections]);

  return (
    <div style={styles.wrapper}>
      {/* 2x2 Grid */}
      <div style={styles.grid}>
        {/* Reset button - floating in top right */}
        {isCustomized && (
          <button
            style={styles.resetButton}
            onClick={resetLayout}
            title="Reset to default layout"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
        )}
        {sectionOrder.map(sectionId => {
          const config = getSectionConfig(sectionId);
          if (!config) return null;

          return (
            <DashboardSection
              key={sectionId}
              id={sectionId}
              title={config.title}
              isCollapsed={collapsedSections.has(sectionId)}
              isDragging={draggedItem === sectionId}
              isDragOver={dragOverItem === sectionId}
              onToggleCollapse={() => toggleCollapsed(sectionId)}
              onDragStart={(e) => handleDragStart(e, sectionId)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, sectionId)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, sectionId)}
            >
              {renderSectionContent(sectionId)}
            </DashboardSection>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
  },

  resetButton: {
    position: 'absolute',
    top: '-28px',
    right: '0',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: '11px',
    transition: 'all var(--transition-fast)',
    zIndex: 5,
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gridTemplateRows: 'auto auto',
    columnGap: 'var(--space-4)',
    rowGap: 'var(--space-4)',
    width: '100%',
    alignItems: 'stretch',
  },
};

// Add responsive media query via CSS class
const responsiveStyles = `
  @media (max-width: 1024px) {
    .dashboard-unified-grid {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }
  @media (max-width: 768px) {
    .dashboard-unified-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;

// Inject responsive styles
if (typeof document !== 'undefined') {
  const styleId = 'dashboard-grid-responsive';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = responsiveStyles;
    document.head.appendChild(style);
  }
}

export default UnifiedDashboardGrid;
