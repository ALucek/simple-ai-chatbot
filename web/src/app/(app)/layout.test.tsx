import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppLayout from './layout';
import { useAuth } from '@/lib/auth-context';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/',
}));
vi.mock('@/lib/auth-context');
vi.mock('@/components/sidebar', () => ({ Sidebar: () => <div>sidebar</div> }));
vi.mock('@/lib/conversations-context', () => ({
  ConversationsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useConversationsContext: () => ({ patchConversation: () => {} }),
}));

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
  localStorage.clear();
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
    expect(screen.getByText('sidebar')).toBeInTheDocument();
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

  it('toggles the sidebar collapsed and persists it', async () => {
    vi.mocked(useAuth).mockReturnValue(authValue('authed'));
    render(
      <AppLayout>
        <div>secret</div>
      </AppLayout>,
    );
    const wrapper = screen.getByText('sidebar').parentElement as HTMLElement;
    expect(wrapper.className).toContain('w-64');
    await userEvent.click(screen.getByLabelText('Toggle sidebar'));
    expect(wrapper.className).toContain('w-0');
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');
  });

  it('starts collapsed when storage says so', () => {
    localStorage.setItem('sidebar-collapsed', 'true');
    vi.mocked(useAuth).mockReturnValue(authValue('authed'));
    render(
      <AppLayout>
        <div>secret</div>
      </AppLayout>,
    );
    const wrapper = screen.getByText('sidebar').parentElement as HTMLElement;
    expect(wrapper.className).toContain('w-0');
  });

  it('opens the mobile drawer and shows a backdrop, then closes on backdrop tap', async () => {
    vi.mocked(useAuth).mockReturnValue(authValue('authed'));
    render(
      <AppLayout>
        <div>secret</div>
      </AppLayout>,
    );
    const wrapper = screen.getByText('sidebar').parentElement as HTMLElement;
    const backdrop = screen.getByTestId('backdrop');

    // Closed by default: drawer off-screen, backdrop faded out.
    expect(wrapper.className).toContain('-translate-x-full');
    expect(backdrop.className).toContain('opacity-0');

    // Mobile toggle opens it.
    await userEvent.click(screen.getByLabelText('Toggle menu'));
    expect(wrapper.className).not.toContain('-translate-x-full');
    expect(backdrop.className).toContain('opacity-100');

    // Backdrop tap closes it.
    await userEvent.click(backdrop);
    expect(wrapper.className).toContain('-translate-x-full');
    expect(backdrop.className).toContain('opacity-0');
  });

  it('keeps desktop and mobile toggles as separate controls', () => {
    vi.mocked(useAuth).mockReturnValue(authValue('authed'));
    render(
      <AppLayout>
        <div>secret</div>
      </AppLayout>,
    );
    expect(screen.getByLabelText('Toggle sidebar')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle menu')).toBeInTheDocument();
  });

  it('sizes the shell to the dynamic app-height var', () => {
    vi.mocked(useAuth).mockReturnValue(authValue('authed'));
    render(
      <AppLayout>
        <div>secret</div>
      </AppLayout>,
    );
    const shell = screen.getByTestId('app-shell');
    expect(shell.className).toContain('h-[var(--app-height,100dvh)]');
  });
});
