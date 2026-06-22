import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMessages } from './use-messages';
import * as api from './api';
import { ApiError, type Message } from './api';

const { patchConversation } = vi.hoisted(() => ({
  patchConversation: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, getMessages: vi.fn(), sendMessage: vi.fn() };
});

vi.mock('./conversations-context', () => ({
  useConversationsContext: () => ({ patchConversation }),
}));

const mA: Message[] = [{ id: 1, role: 'user', content: 'A', created_at: 't' }];
const mB: Message[] = [{ id: 2, role: 'user', content: 'B', created_at: 't' }];

beforeEach(() => {
  vi.mocked(api.getMessages).mockReset();
  vi.mocked(api.sendMessage).mockReset();
  patchConversation.mockReset();
});

describe('useMessages', () => {
  it('loads messages for the id', async () => {
    vi.mocked(api.getMessages).mockResolvedValue(mA);
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toEqual(mA);
  });

  it('refetches when the id changes', async () => {
    vi.mocked(api.getMessages)
      .mockResolvedValueOnce(mA)
      .mockResolvedValueOnce(mB);
    const { result, rerender } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.messages).toEqual(mA));
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.messages).toEqual(mB));
  });

  it('ignores a stale (out-of-order) response', async () => {
    let resolveSlow!: (v: Message[]) => void;
    const slow = new Promise<Message[]>((r) => {
      resolveSlow = r;
    });
    vi.mocked(api.getMessages)
      .mockReturnValueOnce(slow) // id=1, resolves late
      .mockResolvedValueOnce(mB); // id=2, resolves first
    const { result, rerender } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 1 },
    });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.messages).toEqual(mB));
    await act(async () => {
      resolveSlow(mA); // stale id=1 response arrives now
    });
    expect(result.current.messages).toEqual(mB);
  });

  it('sets notFound on a 404', async () => {
    vi.mocked(api.getMessages).mockRejectedValue(
      new ApiError(404, 'conversation not found'),
    );
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 99 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notFound).toBe(true);
  });

  it('send appends optimistic user + assistant messages and streams deltas', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([]);
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _content, h) => {
      h.onDelta('Hel');
      h.onDelta('lo');
      h.onDone(42);
    });
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.send('hi');
    });
    expect(result.current.messages).toEqual([
      { id: -1, role: 'user', content: 'hi', created_at: '' },
      {
        id: 42,
        role: 'assistant',
        content: 'Hello',
        created_at: '',
        streaming: false,
      },
    ]);
    expect(result.current.sending).toBe(false);
  });

  it('send forwards a title event to patchConversation', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([]);
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _content, h) => {
      h.onDone(7);
      h.onTitle('My title');
    });
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 3 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.send('hi');
    });
    expect(patchConversation).toHaveBeenCalledWith(3, { title: 'My title' });
  });

  it('send removes the assistant bubble and sets error on failure', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([]);
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _content, h) => {
      h.onError('stream failed');
    });
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.send('hi');
    });
    expect(result.current.messages).toEqual([
      { id: -1, role: 'user', content: 'hi', created_at: '' },
    ]);
    expect(result.current.error).toBe('stream failed');
    expect(result.current.sending).toBe(false);
  });
});
