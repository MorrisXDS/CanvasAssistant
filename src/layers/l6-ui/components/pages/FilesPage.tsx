/**
 * Files Page
 * Placeholder for file browser implementation
 */

import React from 'react';
import { FolderOpen } from 'lucide-react';
import { Card } from '../shared';

export function FilesPage() {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Files</h1>
        <p style={styles.subtitle}>Your offline course library</p>
      </header>

      <Card padding="lg">
        <div style={styles.placeholder}>
          <FolderOpen size={64} color="var(--color-navy)" style={{ marginBottom: 'var(--space-4)' }} />
          <h2 style={styles.placeholderTitle}>Coming Soon</h2>
          <p style={styles.placeholderText}>
            The file browser is under development. It will include:
          </p>
          <ul style={styles.featureList}>
            <li>Browse Canvas course files</li>
            <li>Offline file access</li>
            <li>Selective sync</li>
            <li>Lab classification (wet/dry)</li>
            <li>Full-text search</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '1200px',
    margin: '0 auto',
  },

  header: {
    marginBottom: 'var(--space-6)',
  },

  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  placeholder: {
    textAlign: 'center',
    padding: 'var(--space-10)',
  },

  icon: {
    fontSize: '4rem',
    display: 'block',
    marginBottom: 'var(--space-4)',
  },

  placeholderTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  placeholderText: {
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
  },

  featureList: {
    display: 'inline-block',
    textAlign: 'left',
    color: 'var(--text-secondary)',
    lineHeight: '2',
  },
};

export default FilesPage;
