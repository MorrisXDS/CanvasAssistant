/**
 * InformationalItem - Sub-component for informational update items
 *
 * Renders a single informational update (grade, file, page, announcement, etc.)
 * with an icon, title, subtitle, time, and mark-seen button.
 */

import React from 'react';
import { Bell, Check } from 'lucide-react';
import { formatTimeAgo } from '../../../constants';
import { styles } from './updatesPageStyles';
import { UPDATE_ICONS, UPDATE_LABELS } from './updatesPageConstants';
import { formatChangeSubtitle, getIconStyle } from './updatesHelpers';
import type { SyncUpdate } from '../../../../l5-presentation/types';

export interface InformationalItemProps {
  update: SyncUpdate;
  onMarkSeen: () => void;
  timeTick: number;
}

export function InformationalItem({
  update,
  onMarkSeen,
  timeTick: _timeTick, // Used to trigger re-render for time updates
}: InformationalItemProps) {
  const Icon = UPDATE_ICONS[update.entityType] || Bell;

  // Use formatted subtitle for task/grade updates with field changes
  const subtitle =
    (update.entityType === 'task' || update.entityType === 'grade') && update.changedField
      ? formatChangeSubtitle(update)
      : update.subtitle || UPDATE_LABELS[update.entityType];

  return (
    <div style={styles.infoItem}>
      <div style={{ ...styles.infoIcon, ...getIconStyle(update.entityType) }}>
        <Icon size={14} />
      </div>
      <div style={styles.infoContent}>
        <div style={styles.infoTitle}>{update.title}</div>
        <div style={styles.infoSubtitle}>{subtitle}</div>
      </div>
      <div style={styles.infoMeta}>
        <span style={styles.infoTime}>{formatTimeAgo(update.createdAt)}</span>
        <button style={styles.markSeenButton} onClick={onMarkSeen} title="Mark as seen">
          <Check size={12} />
        </button>
      </div>
    </div>
  );
}
