import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './auth-context';
import * as api from './api';

vi.mock('./api');

function Probe() {
  const { user, status, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? ''}</span>
      <button onClick={() => login('a@b.co', 'pw')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AuthProvider', () => {
  it('boots to authed when a refresh token exists', async () => {
    vi.mocked(api.hasRefreshToken).mockReturnValue(true);
    vi.mocked(api.refreshAccess).mockResolvedValue('a1');
    vi.mocked(api.me).mockResolvedValue({ id: 1, email: 'a@b.co' });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authed'),
    );
    expect(screen.getByTestId('email')).toHaveTextContent('a@b.co');
  });

  it('boots to anon when there is no refresh token', async () => {
    vi.mocked(api.hasRefreshToken).mockReturnValue(false);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('anon'),
    );
  });

  it('login sets the user', async () => {
    vi.mocked(api.hasRefreshToken).mockReturnValue(false);
    vi.mocked(api.login).mockResolvedValue();
    vi.mocked(api.me).mockResolvedValue({ id: 2, email: 'c@d.co' });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('anon'),
    );
    await userEvent.click(screen.getByText('login'));
    await waitFor(() =>
      expect(screen.getByTestId('email')).toHaveTextContent('c@d.co'),
    );
  });

  it('logout clears the user', async () => {
    vi.mocked(api.hasRefreshToken).mockReturnValue(true);
    vi.mocked(api.refreshAccess).mockResolvedValue('a1');
    vi.mocked(api.me).mockResolvedValue({ id: 1, email: 'a@b.co' });
    vi.mocked(api.logout).mockResolvedValue();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authed'),
    );
    await userEvent.click(screen.getByText('logout'));
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('anon'),
    );
  });
});
