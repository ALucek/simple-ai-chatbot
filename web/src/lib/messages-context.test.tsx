import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  renderHook,
  act,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MessagesProvider, useMessages } from './messages-context';
import * as api from './api';
import { ApiError, type Message, type StreamHandlers } from './api';

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

const { refreshUsage } = vi.hoisted(() => ({ refreshUsage: vi.fn() }));
vi.mock('./usage-context', () => ({
  useUsage: () => ({ used: null, budget: null, refresh: refreshUsage }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <MessagesProvider>{children}</MessagesProvider>;
}

const mA: Message[] = [{ id: 1, role: 'user', content: 'A', created_at: 't' }];

beforeEach(() => {
  vi.mocked(api.getMessages).mockReset();
  vi.mocked(api.sendMessage).mockReset();
  patchConversation.mockReset();
  refreshUsage.mockReset();
});

describe('useMessages (store)', () => {
  it('loads messages for the id', async () => {
    vi.mocked(api.getMessages).mockResolvedValue(mA);
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 1 },
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toEqual(mA);
  });

  it('sets notFound on a 404', async () => {
    vi.mocked(api.getMessages).mockRejectedValue(
      new ApiError(404, 'conversation not found'),
    );
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 99 },
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notFound).toBe(true);
  });

  it('send appends optimistic user + assistant and streams deltas to done', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([]);
    vi.mocked(api.sendMessage).mockImplementation(
      async (_id, _content, h: StreamHandlers) => {
        h.onDelta('Hel');
        h.onDelta('lo');
        h.onDone(42);
      },
    );
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 1 },
      wrapper,
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

  it('refreshes usage when the reply completes', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([]);
    vi.mocked(api.sendMessage).mockImplementation(
      async (_id, _content, h: StreamHandlers) => {
        h.onDone(5);
      },
    );
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 1 },
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.send('hi');
    });
    expect(refreshUsage).toHaveBeenCalled();
  });

  it('send forwards a title event to patchConversation', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([]);
    vi.mocked(api.sendMessage).mockImplementation(
      async (_id, _content, h: StreamHandlers) => {
        h.onDone(7);
        h.onTitle('My title');
      },
    );
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 3 },
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.send('hi');
    });
    expect(patchConversation).toHaveBeenCalledWith(3, { title: 'My title' });
  });

  it('send removes the assistant bubble and sets error on failure', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([]);
    vi.mocked(api.sendMessage).mockImplementation(
      async (_id, _content, h: StreamHandlers) => {
        h.onError('stream failed');
      },
    );
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 1 },
      wrapper,
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

  it('stop() drops the streaming assistant bubble but keeps the user message', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([]);
    // never resolves: leaves the assistant bubble streaming until stop()
    vi.mocked(api.sendMessage).mockImplementation(
      () => new Promise<void>(() => {}),
    );
    const { result } = renderHook(({ id }) => useMessages(id), {
      initialProps: { id: 1 },
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      void result.current.send('hi');
    });
    await waitFor(() => expect(result.current.sending).toBe(true));
    act(() => {
      result.current.stop();
    });
    expect(result.current.messages).toEqual([
      { id: -1, role: 'user', content: 'hi', created_at: '' },
    ]);
    expect(result.current.sending).toBe(false);
  });

  it('keeps streaming into the store after the consuming component unmounts', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([]);
    let captured: StreamHandlers | null = null;
    vi.mocked(api.sendMessage).mockImplementation(
      async (_id, _content, h: StreamHandlers) => {
        captured = h;
        return new Promise<void>(() => {}); // stays open
      },
    );

    function Starter() {
      const { send } = useMessages(1);
      return <button onClick={() => void send('hi')}>start</button>;
    }
    function Probe() {
      const { messages } = useMessages(1);
      return (
        <div data-testid="probe">
          {messages.map((m) => m.content).join('|')}
        </div>
      );
    }
    function Harness() {
      const [mounted, setMounted] = useState(true);
      return (
        <MessagesProvider>
          <Starter />
          {mounted && <Probe />}
          <button onClick={() => setMounted(false)}>unmount</button>
          <button onClick={() => setMounted(true)}>remount</button>
        </MessagesProvider>
      );
    }

    render(<Harness />);
    await userEvent.click(screen.getByText('start'));
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('hi|'),
    );

    act(() => captured!.onDelta('par'));
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('hi|par'),
    );

    await userEvent.click(screen.getByText('unmount')); // "navigate away"
    expect(screen.queryByTestId('probe')).toBeNull();

    // stream keeps updating the store while the consumer is unmounted
    act(() => captured!.onDelta('tial'));
    act(() => captured!.onDone(9));

    await userEvent.click(screen.getByText('remount')); // "navigate back"
    expect(screen.getByTestId('probe')).toHaveTextContent('hi|partial');
  });
});
