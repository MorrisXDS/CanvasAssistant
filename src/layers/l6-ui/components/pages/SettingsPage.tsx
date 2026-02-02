/**
 * SettingsPage Component
 * Full-page settings view (reuses SettingsModal content)
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsModal } from '../SettingsModal';

export function SettingsPage() {
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      <SettingsModal isOpen={true} onClose={() => navigate(-1)} isFullPage={true} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
};

export default SettingsPage;
