import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversations } from './use-conversations';
import * as api from './api';

vi.mock('./api');

const c1 = { id: 1, title: 'One', created_at: 't', updated_at: 't' };
const c2 = { id: 2, title: 'Two', created_at: 't', updated_at: 't' };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useConversations', () => {
  it('loads conversations on mount', async () => {
    vi.mocked(api.listConversations).mockResolvedValue([c1, c2]);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations).toEqual([c1, c2]);
  });

  it('create prepends the new conversation', async () => {
    vi.mocked(api.listConversations).mockResolvedValue([c1]);
    const fresh = { id: 9, title: '', created_at: 't', updated_at: 't' };
    vi.mocked(api.createConversation).mockResolvedValue(fresh);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create();
    });
    expect(result.current.conversations).toEqual([fresh, c1]);
  });

  it('rename updates the title in place', async () => {
    vi.mocked(api.listConversations).mockResolvedValue([c1, c2]);
    vi.mocked(api.renameConversation).mockResolvedValue();
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.rename(1, 'Renamed');
    });
    expect(result.current.conversations[0].title).toBe('Renamed');
  });

  it('remove deletes from the list', async () => {
    vi.mocked(api.listConversations).mockResolvedValue([c1, c2]);
    vi.mocked(api.deleteConversation).mockResolvedValue();
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.remove(1);
    });
    expect(result.current.conversations).toEqual([c2]);
  });
});
