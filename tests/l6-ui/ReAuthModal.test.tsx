/**
 * ReAuthModal — "Later" button tests (ADR-0013).
 *
 * Covers the new non-blocking exit:
 *  - The Later button renders when `onLater` is provided, and is hidden otherwise.
 *  - Clicking Later calls `onLater` and does NOT call onDisconnect / window.api
 *    (it must not de-authenticate or delete the credential).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReAuthModal } from '../../src/layers/l6-ui/components/shared/ReAuthModal';

// window.api is only touched by Validate/Reconnect/Disconnect — stub it so an
// accidental call would be observable.
const mockApi = {
  validateToken: jest.fn(),
  storeCredential: jest.fn(),
  connectCanvas: jest.fn(),
  deleteCredential: jest.fn().mockResolvedValue({ success: true }),
};

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = mockApi;
  localStorage.setItem('canvasUrl', 'https://canvas.example.com');
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
  localStorage.clear();
});

describe('ReAuthModal — Later (ADR-0013)', () => {
  it('renders the Later button when onLater is provided', () => {
    render(
      <ReAuthModal
        onReauthSuccess={jest.fn()}
        onDisconnect={jest.fn()}
        onLater={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
  });

  it('does NOT render the Later button when onLater is omitted', () => {
    render(<ReAuthModal onReauthSuccess={jest.fn()} onDisconnect={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /later/i })).not.toBeInTheDocument();
  });

  it('clicking Later calls onLater and does NOT disconnect or touch window.api', () => {
    const onLater = jest.fn();
    const onDisconnect = jest.fn();
    render(
      <ReAuthModal
        onReauthSuccess={jest.fn()}
        onDisconnect={onDisconnect}
        onLater={onLater}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /later/i }));

    expect(onLater).toHaveBeenCalledTimes(1);
    expect(onDisconnect).not.toHaveBeenCalled();
    expect(mockApi.deleteCredential).not.toHaveBeenCalled();
    expect(mockApi.connectCanvas).not.toHaveBeenCalled();
  });
});
