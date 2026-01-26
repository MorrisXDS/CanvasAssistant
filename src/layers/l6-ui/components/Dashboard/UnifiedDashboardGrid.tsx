/**
 * UnifiedDashboardGrid Component
 * Main container with 2x2 CSS Grid for dashboard sections
 */

import React from 'react';
import { DashboardSection } from './DashboardSection';
import { useDashboardDragDrop } from './useDashboardDragDrop';
import { PriorityList } from './PriorityList';
import { NotificationsFeed } from './NotificationsFeed';
import { RecommendationsCard } from './RecommendationsCard';
import { InsightsCard } from './InsightsCard';
import type { PriorityItem, Task } from '../../../l5-presentation/types';
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
  onTaskDoubleClick?: (taskId: number) => void;
  onTaskContextMenu?: (e: React.MouseEvent, task: Task) => void;
  onDismissNotification: (id: number) => void;
}

export function UnifiedDashboardGrid({
  priorityItems,
  totalPendingTasks,
  notifications,
  onTaskClick,
  onTaskDoubleClick,
  onTaskContextMenu,
  onDismissNotification,
}: UnifiedDashboardGridProps) {
  const {
    sectionOrder,
    draggedItem,
    dragOverItem,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
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
            onTaskDoubleClick={onTaskDoubleClick}
            onTaskContextMenu={onTaskContextMenu}
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
    return SECTIONS.find((s) => s.id === id);
  };

  return (
    <div style={styles.wrapper}>
      {/* 2x2 Grid */}
      <div style={styles.grid}>
        {sectionOrder.map((sectionId) => {
          const config = getSectionConfig(sectionId);
          if (!config) return null;

          return (
            <DashboardSection
              key={sectionId}
              id={sectionId}
              title={config.title}
              isDragging={draggedItem === sectionId}
              isDragOver={dragOverItem === sectionId}
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

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gridTemplateRows: 'repeat(2, 1fr)',
    columnGap: 'var(--space-4)',
    rowGap: 'var(--space-4)',
    width: '100%',
    // Fill available vertical space: viewport - header(~80px) - stats(~100px) - spacing(~120px)
    height: 'calc(100vh - 300px)',
    minHeight: '400px',
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
