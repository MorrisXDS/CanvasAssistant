/**
 * ActionRequiredItem - Sub-component for action required (queued task) items
 *
 * Renders a single queued task with accept/reject/view buttons.
 */

import React, { useState } from 'react';
import { CheckSquare, XSquare, ExternalLink } from 'lucide-react';
import { styles } from './updatesPageStyles';
import { isUpdatedSinceCreation, UpdatedBadge } from './updatesHelpers';
import type { SyncUpdate } from '../../../../l5-presentation/types';

export interface ActionRequiredItemProps {
  update: SyncUpdate;
  onAccept: () => void;
  onReject: () => void;
  onNavigate: () => void;
}

export function ActionRequiredItem({
  update,
  onAccept,
  onReject,
  onNavigate,
}: ActionRequiredItemProps) {
  const [isLoading, setIsLoading] = useState(false);
  const wasUpdated = isUpdatedSinceCreation(update);

  const handleAccept = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      await onAccept();
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      await onReject();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.actionItem} onClick={onNavigate}>
      <div style={styles.actionItemContent}>
        <div style={styles.actionItemTitleRow}>
          <span style={styles.actionItemTitle}>{update.title}</span>
          {wasUpdated && <UpdatedBadge />}
        </div>
        <div style={styles.actionItemSubtitle}>
          {update.subtitle || 'New task from Canvas'}
        </div>
      </div>
      <div style={styles.actionItemButtons}>
        <button
          style={{ ...styles.actionButton, ...styles.acceptButton }}
          onClick={handleAccept}
          disabled={isLoading}
          title="Accept"
        >
          <CheckSquare size={14} />
        </button>
        <button
          style={{ ...styles.actionButton, ...styles.rejectButton }}
          onClick={handleReject}
          disabled={isLoading}
          title="Dismiss"
        >
          <XSquare size={14} />
        </button>
        <button
          style={{ ...styles.actionButton, ...styles.viewButton }}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate();
          }}
          title="View in Course"
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}
