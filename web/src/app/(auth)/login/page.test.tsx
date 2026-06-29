import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

const replace = vi.fn();
const loginWithGoogle = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/auth-context');

type CodeCallback = (r: { code: string }) => void;
let capturedCallback: CodeCallback | null = null;

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
  // Fake Google Identity Services OAuth2 code client.
  (window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initCodeClient: (cfg: { callback: CodeCallback }) => {
          capturedCallback = cfg.callback;
          return {
            requestCode: () =>
              capturedCallback?.({ code: 'e2e:test@gmail.com' }),
          };
        },
      },
    },
  };
});

describe('LoginPage', () => {
  it('renders the button immediately and signs in on click', async () => {
    loginWithGoogle.mockResolvedValue(undefined);
    render(<LoginPage />);
    const button = screen.getByTestId('google-signin');
    expect(button).toHaveTextContent('Sign in with Google');
    expect(screen.queryByRole('heading')).toBeNull();
    await userEvent.click(button);
    await waitFor(() =>
      expect(loginWithGoogle).toHaveBeenCalledWith('e2e:test@gmail.com'),
    );
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' }),
    ).toHaveAttribute('href', '/privacy');
  });

  it('exchanges the auth code but waits for authed status to redirect', async () => {
    loginWithGoogle.mockResolvedValue(undefined);
    const { rerender } = render(<LoginPage />);
    expect(capturedCallback).toBeTypeOf('function');
    await act(async () => capturedCallback!({ code: 'tok-123' }));
    expect(loginWithGoogle).toHaveBeenCalledWith('tok-123');
    // Status is still 'anon' until the provider commits the session; no redirect yet.
    expect(replace).not.toHaveBeenCalled();
    // Provider flips to authed → the effect redirects home.
    vi.mocked(useAuth).mockReturnValue({
      user: {},
      status: 'authed',
      loginWithGoogle,
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    rerender(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('shows a signing-in indicator while the exchange is in flight', async () => {
    let resolve!: () => void;
    loginWithGoogle.mockReturnValue(
      new Promise<void>((r) => {
        resolve = () => r();
      }),
    );
    render(<LoginPage />);
    await act(async () => {
      capturedCallback!({ code: 'tok-123' });
    });
    expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    await act(async () => {
      resolve();
    });
  });

  it('shows the server error message when sign-in fails', async () => {
    loginWithGoogle.mockRejectedValue(
      new ApiError(401, 'invalid google token'),
    );
    render(<LoginPage />);
    await act(async () => capturedCallback!({ code: 'bad' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'invalid google token',
    );
  });
});
