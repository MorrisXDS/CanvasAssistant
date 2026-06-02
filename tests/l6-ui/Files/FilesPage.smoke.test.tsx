/**
 * @jest-environment jsdom
 *
 * FilesPage smoke mount — verifies the page renders its empty state and, in
 * doing so, exercises the `useFileReveal` wiring (issue #29). The reveal LOGIC
 * is tested in useFileReveal.test.tsx; this guards that FilesPage passes the
 * right state slice into the hook without crashing.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FilesPage } from '../../../src/layers/l6-ui/components/Files/FilesPage';
import { useStore } from '../../../src/layers/l5-presentation/store';
import { setupTestEnv, type TestEnv } from '../../test-utils/testEnv';

describe('FilesPage — smoke mount', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = setupTestEnv();
    env.api.getFiles.mockResolvedValue({
      resources: [],
      attachments: [],
      pages: [],
      moduleItems: [],
    });
    env.api.getModuleItems.mockResolvedValue([]);
    env.api.getFilesDirectory.mockResolvedValue('/tmp/Downloads');
    useStore.setState({ courses: [] });
  });

  afterEach(() => {
    useStore.setState({ courses: [] });
    env.cleanup();
  });

  it('renders the empty state (and wires up useFileReveal)', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/will appear here after syncing/i)
    ).toBeInTheDocument();
  });
});
