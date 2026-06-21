import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AppLayout from './layout';
import { useAuth } from '@/lib/auth-context';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/auth-context');

function authValue(status: 'loading' | 'authed' | 'anon') {
  return {
    user: null,
    status,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AppLayout guard', () => {
  it('redirects to /login when anon', async () => {
    vi.mocked(useAuth).mockReturnValue(authValue('anon'));
    render(
      <AppLayout>
        <div>secret</div>
      </AppLayout>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders children when authed', () => {
    vi.mocked(useAuth).mockReturnValue(authValue('authed'));
    render(
      <AppLayout>
        <div>secret</div>
      </AppLayout>,
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('renders nothing while loading', () => {
    vi.mocked(useAuth).mockReturnValue(authValue('loading'));
    render(
      <AppLayout>
        <div>secret</div>
      </AppLayout>,
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});
