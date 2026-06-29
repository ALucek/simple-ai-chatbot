import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './auth-context';
import * as api from './api';

vi.mock('./api');

function Probe() {
  const { user, status, loginWithGoogle, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? ''}</span>
      <button onClick={() => loginWithGoogle('tok')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AuthProvider', () => {
  it('boots to authed when the refresh cookie is valid', async () => {
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

  it('boots to anon when there is no refresh cookie', async () => {
    vi.mocked(api.refreshAccess).mockResolvedValue(null);
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
    vi.mocked(api.refreshAccess).mockResolvedValue(null);
    vi.mocked(api.loginWithGoogle).mockResolvedValue();
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

  it('redirects to anon when notified of a session expiry', async () => {
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

    // Grab the handler AuthProvider registered and fire it (failed refresh).
    const handler = vi.mocked(api.setOnUnauthorized).mock.calls.at(-1)?.[0] as
      | (() => void)
      | undefined;
    expect(handler).toBeTypeOf('function');
    act(() => handler!());

    expect(screen.getByTestId('status')).toHaveTextContent('anon');
  });
});
