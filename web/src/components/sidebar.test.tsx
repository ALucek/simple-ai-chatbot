import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './sidebar';
import { useConversationsContext } from '@/lib/conversations-context';
import { useAuth } from '@/lib/auth-context';
import { useUsage } from '@/lib/usage-context';
import { ToastProvider } from '@/lib/toast-context';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: '' }),
}));
vi.mock('@/lib/conversations-context');
vi.mock('@/lib/auth-context');
vi.mock('@/lib/usage-context');

const rename = vi.fn();
const remove = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 1, email: 'a@b.co' },
    status: 'authed',
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useUsage).mockReturnValue({
    used: null,
    budget: null,
    refresh: vi.fn(),
  });
});

describe('Sidebar', () => {
  it('renders the conversation list', () => {
    vi.mocked(useConversationsContext).mockReturnValue({
      conversations: [
        { id: 1, title: 'One', created_at: 't', updated_at: 't' },
        { id: 2, title: 'Two', created_at: 't', updated_at: 't' },
      ],
      loading: false,
      error: null,
      create: vi.fn(),
      rename,
      remove,
      patchConversation: vi.fn(),
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
    });
    render(<Sidebar />, { wrapper });
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
  });

  it('New conversation creates and navigates', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 7,
      title: '',
      created_at: 't',
      updated_at: 't',
    });
    vi.mocked(useConversationsContext).mockReturnValue({
      conversations: [],
      loading: false,
      error: null,
      create,
      rename,
      remove,
      patchConversation: vi.fn(),
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
    });
    render(<Sidebar />, { wrapper });
    await userEvent.click(screen.getByText('New conversation'));
    expect(create).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/c/7');
  });

  it('shows the loading state', () => {
    vi.mocked(useConversationsContext).mockReturnValue({
      conversations: [],
      loading: true,
      error: null,
      create: vi.fn(),
      rename,
      remove,
      patchConversation: vi.fn(),
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
    });
    render(<Sidebar />, { wrapper });
    const { container } = render(<Sidebar />, { wrapper });
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
});
