import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  ConversationsProvider,
  useConversationsContext,
} from './conversations-context';
import * as api from './api';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
  };
});

const c1 = { id: 1, title: 'One', created_at: 't', updated_at: 't' };
const c2 = { id: 2, title: 'Two', created_at: 't', updated_at: 't' };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ConversationsProvider>{children}</ConversationsProvider>
);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ConversationsProvider', () => {
  it('loads conversations on mount', async () => {
    vi.mocked(api.listConversations).mockResolvedValue([c1, c2]);
    const { result } = renderHook(() => useConversationsContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations).toEqual([c1, c2]);
  });

  it('create prepends the new conversation', async () => {
    vi.mocked(api.listConversations).mockResolvedValue([c1]);
    const fresh = { id: 9, title: '', created_at: 't', updated_at: 't' };
    vi.mocked(api.createConversation).mockResolvedValue(fresh);
    const { result } = renderHook(() => useConversationsContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create();
    });
    expect(result.current.conversations).toEqual([fresh, c1]);
  });

  it('rename updates the title in place', async () => {
    vi.mocked(api.listConversations).mockResolvedValue([c1, c2]);
    vi.mocked(api.renameConversation).mockResolvedValue();
    const { result } = renderHook(() => useConversationsContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.rename(1, 'Renamed');
    });
    expect(result.current.conversations[0].title).toBe('Renamed');
  });

  it('remove deletes from the list', async () => {
    vi.mocked(api.listConversations).mockResolvedValue([c1, c2]);
    vi.mocked(api.deleteConversation).mockResolvedValue();
    const { result } = renderHook(() => useConversationsContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.remove(1);
    });
    expect(result.current.conversations).toEqual([c2]);
  });

  it('loadMore fetches the next page at the right offset when the first is full', async () => {
    const page1 = Array.from({ length: api.CONVERSATIONS_PAGE }, (_, i) => ({
      id: i + 1,
      title: `c${i}`,
      created_at: 't',
      updated_at: 't',
    }));
    const page2 = [
      { id: 999, title: 'last', created_at: 't', updated_at: 't' },
    ];
    vi.mocked(api.listConversations)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);
    const { result } = renderHook(() => useConversationsContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(result.current.conversations).toHaveLength(
        api.CONVERSATIONS_PAGE + 1,
      ),
    );
    expect(api.listConversations).toHaveBeenLastCalledWith(
      api.CONVERSATIONS_PAGE,
    );
    expect(result.current.hasMore).toBe(false);
  });

  it('patchConversation merges fields in place', async () => {
    vi.mocked(api.listConversations).mockResolvedValue([c1, c2]);
    const { result } = renderHook(() => useConversationsContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.patchConversation(1, { title: 'Patched' });
    });
    expect(result.current.conversations[0].title).toBe('Patched');
  });
});
