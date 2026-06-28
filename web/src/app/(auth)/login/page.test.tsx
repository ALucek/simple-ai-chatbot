import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LoginPage from './page';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

const replace = vi.fn();
const loginWithGoogle = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/auth-context');

type GsiCallback = (r: { credential: string }) => void;
let capturedCallback: GsiCallback | null = null;

beforeEach(() => {
  vi.resetAllMocks();
  capturedCallback = null;
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'test-client-id';
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    status: 'anon',
    loginWithGoogle,
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  // Fake Google Identity Services: capture the callback, render a button.
  (window as unknown as { google: unknown }).google = {
    accounts: {
      id: {
        initialize: (cfg: { callback: GsiCallback }) => {
          capturedCallback = cfg.callback;
        },
        renderButton: (el: HTMLElement) => {
          el.appendChild(document.createElement('button'));
        },
      },
    },
  };
});

describe('LoginPage', () => {
  it('renders the Google sign-in mount point and button', () => {
    render(<LoginPage />);
    expect(screen.getByTestId('google-signin')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('exchanges the Google credential and redirects home', async () => {
    loginWithGoogle.mockResolvedValue(undefined);
    render(<LoginPage />);
    expect(capturedCallback).toBeTypeOf('function');
    await capturedCallback!({ credential: 'tok-123' });
    expect(loginWithGoogle).toHaveBeenCalledWith('tok-123');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('shows the server error message when sign-in fails', async () => {
    loginWithGoogle.mockRejectedValue(
      new ApiError(401, 'invalid google token'),
    );
    render(<LoginPage />);
    await capturedCallback!({ credential: 'bad' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'invalid google token',
    );
  });
});
