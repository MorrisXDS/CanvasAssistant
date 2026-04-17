/**
 * UnifiedDashboardGrid Component
 * Main container with 2x2 CSS Grid for dashboard sections
 */

import React from 'react';
import { DashboardSection } from './DashboardSection';
import { useDashboardDragDrop } from './useDashboardDragDrop';
import { PriorityList } from './PriorityList';
import { NotificationsFeed } from './NotificationsFeed';
import { ScheduleCard } from './ScheduleCard';
import { ImportantWorksCard } from './ImportantWorksCard';
import { CARD_TITLES } from '../../constants';
import type { PriorityItem, Task } from '../../../l5-presentation/types';
import type { Notification } from '../../../l5-presentation/types';

// Section configuration
interface SectionConfig {
  id: string;
  title: string;
}

const SECTIONS: SectionConfig[] = [
  { id: 'priority', title: CARD_TITLES.dashboard.upcomingCoursework },
  { id: 'notifications', title: CARD_TITLES.dashboard.announcements },
  { id: 'schedule', title: CARD_TITLES.dashboard.todaySchedule },
  { id: 'importantWorks', title: CARD_TITLES.dashboard.importantWorks },
];

export interface UnifiedDashboardGridProps {
  priorityItems: PriorityItem[];
  totalPendingTasks: number;
  notifications: Notification[];
  onTaskClick: (taskId: number) => void;
  onTaskDoubleClick?: (taskId: number) => void;
  onTaskContextMenu?: (e: React.MouseEvent, task: Task) => void;
  onToggleComplete?: (taskId: number, isCompleted: boolean) => void;
  onDismissNotification: (id: number) => void;
  /** Which list currently has keyboard focus (Tab cycles between them).
   * 'stats' is handled in Dashboard.tsx (outside the grid). */
  focusedList?: 'stats' | 'priority' | 'notifications' | 'schedule' | 'importantWorks';
}

export function UnifiedDashboardGrid({
  priorityItems,
  totalPendingTasks,
  notifications,
  onTaskClick,
  onTaskDoubleClick,
  onTaskContextMenu,
  onToggleComplete,
  onDismissNotification,
  focusedList = 'priority',
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
            onToggleComplete={onToggleComplete}
            maxItems={6}
            isKeyboardActive={focusedList === 'priority'}
          />
        );
      case 'notifications':
        return (
          <NotificationsFeed
            notifications={notifications}
            onDismiss={onDismissNotification}
            maxItems={4}
            isKeyboardActive={focusedList === 'notifications'}
          />
        );
      case 'schedule':
        return <ScheduleCard isKeyboardActive={focusedList === 'schedule'} />;
      case 'importantWorks':
        return (
          <ImportantWorksCard
            maxItems={4}
            isKeyboardActive={focusedList === 'importantWorks'}
          />
        );
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
    height: '100%',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
    columnGap: 'var(--space-4)',
    rowGap: 'var(--space-4)',
    alignItems: 'stretch',
    width: '100%',
    height: '100%',
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
