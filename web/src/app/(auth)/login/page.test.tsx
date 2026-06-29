import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
} from '@testing-library/react';
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
          // Real GSI renders the button inside a cross-origin iframe.
          el.appendChild(document.createElement('iframe'));
        },
      },
    },
  };
});

describe('LoginPage', () => {
  it('reveals the button once its iframe loads, with a legal footer and no heading', () => {
    render(<LoginPage />);
    expect(screen.getByTestId('google-signin')).toBeInTheDocument();
    const iframe = screen
      .getByTestId('google-signin')
      .querySelector('iframe') as HTMLIFrameElement;
    // skeleton stays until the GSI iframe finishes loading
    expect(screen.getByTestId('google-signin-skeleton')).toBeInTheDocument();
    act(() => {
      fireEvent.load(iframe);
    });
    expect(screen.queryByTestId('google-signin-skeleton')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' }),
    ).toHaveAttribute('href', '/privacy');
  });

  it('shows a skeleton until the Google script loads', () => {
    delete (window as unknown as { google?: unknown }).google;
    render(<LoginPage />);
    expect(screen.getByTestId('google-signin-skeleton')).toBeInTheDocument();
  });

  it('exchanges the Google credential but waits for authed status to redirect', async () => {
    loginWithGoogle.mockResolvedValue(undefined);
    const { rerender } = render(<LoginPage />);
    expect(capturedCallback).toBeTypeOf('function');
    await act(async () => capturedCallback!({ credential: 'tok-123' }));
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
      capturedCallback!({ credential: 'tok-123' });
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
    await act(async () => capturedCallback!({ credential: 'bad' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'invalid google token',
    );
  });
});
