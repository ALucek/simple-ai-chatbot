import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loginWithGoogle,
  me,
  refreshAccess,
  clearSession,
  ApiError,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  getMessages,
  getUsage,
  parseSSE,
  sendMessage,
  setOnUnauthorized,
} from './api';

// Minimal Response stand-in for a JSON body.
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('loginWithGoogle stores the access token; later calls send the Bearer header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'a1' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, email: 'a@b.co' }));
    vi.stubGlobal('fetch', fetchMock);

    await loginWithGoogle('e2e:a@b.co');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/api/google');
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe(
      'include',
    );

    await me();
    const headers = (fetchMock.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer a1');
  });

  it('refreshes once and retries the request on a 401, sending no body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' })) // me()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'a2' })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, email: 'a@b.co' })); // retry
    vi.stubGlobal('fetch', fetchMock);

    const user = await me();
    expect(user).toEqual({ id: 1, email: 'a@b.co' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://localhost:8080/api/refresh',
    );
    const refreshInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(refreshInit.credentials).toBe('include');
    expect(refreshInit.body).toBeUndefined();
  });

  it('shares a single refresh among concurrent callers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { access_token: 'a2' }));
    vi.stubGlobal('fetch', fetchMock);

    const [t1, t2] = await Promise.all([refreshAccess(), refreshAccess()]);
    expect(t1).toBe('a2');
    expect(t2).toBe('a2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the session and throws when refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' })) // me()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: 'invalid refresh token' }),
      ); // refresh
    vi.stubGlobal('fetch', fetchMock);

    await expect(me()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('conversation endpoints', () => {
  it('listConversations GETs the list', async () => {
    const data = [{ id: 1, title: '', created_at: 't', updated_at: 't' }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, data));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listConversations()).resolves.toEqual(data);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8080/api/conversations?limit=30&offset=0',
    );
  });

  it('createConversation POSTs and returns the new conversation', async () => {
    const convo = { id: 5, title: '', created_at: 't', updated_at: 't' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, convo));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createConversation()).resolves.toEqual(convo);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('renameConversation PATCHes the title', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(204, null));
    vi.stubGlobal('fetch', fetchMock);
    await renameConversation(5, 'New name');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/conversations/5');
    expect(init).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      title: 'New name',
    });
  });

  it('deleteConversation DELETEs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(204, null));
    vi.stubGlobal('fetch', fetchMock);
    await deleteConversation(5);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/conversations/5');
    expect(init).toMatchObject({ method: 'DELETE' });
  });

  it('getMessages GETs the conversation messages', async () => {
    const msgs = [{ id: 1, role: 'user', content: 'hi', created_at: 't' }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, msgs));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMessages(7)).resolves.toEqual(msgs);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8080/api/conversations/7/messages?limit=50',
    );
  });

  it('getMessages adds the before cursor for older pages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal('fetch', fetchMock);
    await getMessages(7, 42);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8080/api/conversations/7/messages?limit=50&before=42',
    );
  });

  it('getUsage GETs the usage summary', async () => {
    const data = { used: 3851, budget: 8192 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, data));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getUsage()).resolves.toEqual(data);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/api/usage');
  });
});

describe('parseSSE', () => {
  it('parses one complete frame', () => {
    const { events, rest } = parseSSE('event: delta\ndata: {"text":"hi"}\n\n');
    expect(events).toEqual([{ event: 'delta', data: '{"text":"hi"}' }]);
    expect(rest).toBe('');
  });

  it('parses multiple frames in one buffer', () => {
    const buf =
      'event: delta\ndata: {"text":"a"}\n\n' +
      'event: done\ndata: {"message_id":5}\n\n';
    const { events, rest } = parseSSE(buf);
    expect(events).toEqual([
      { event: 'delta', data: '{"text":"a"}' },
      { event: 'done', data: '{"message_id":5}' },
    ]);
    expect(rest).toBe('');
  });

  it('keeps a trailing partial frame in rest and completes it next call', () => {
    const first = parseSSE('event: delta\ndata: {"text":"hel');
    expect(first.events).toEqual([]);
    expect(first.rest).toBe('event: delta\ndata: {"text":"hel');
    const second = parseSSE(first.rest + 'lo"}\n\n');
    expect(second.events).toEqual([
      { event: 'delta', data: '{"text":"hello"}' },
    ]);
    expect(second.rest).toBe('');
  });

  it('still parses an unknown event name', () => {
    const { events } = parseSSE('event: surprise\ndata: {}\n\n');
    expect(events).toEqual([{ event: 'surprise', data: '{}' }]);
  });

  it('returns no events for a blank or partial buffer', () => {
    expect(parseSSE('').events).toEqual([]);
    expect(parseSSE('event: delta').events).toEqual([]);
  });
});

function streamResponse(status: number, frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    body,
    json: async () => ({}),
  } as Response;
}

describe('sendMessage', () => {
  it('dispatches delta/title and resolves on done', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        streamResponse(200, [
          'event: delta\ndata: {"text":"Hel"}\n\n',
          'event: delta\ndata: {"text":"lo"}\n\n',
          'event: done\ndata: {"message_id":42}\n\n',
          'event: title\ndata: {"title":"Hi there"}\n\n',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    let doneId = 0;
    let title = '';
    await sendMessage(7, 'hello', {
      onDelta: (t) => deltas.push(t),
      onDone: (id) => {
        doneId = id;
      },
      onTitle: (t) => {
        title = t;
      },
      onError: () => {},
    });

    expect(deltas).toEqual(['Hel', 'lo']);
    expect(doneId).toBe(42);
    expect(title).toBe('Hi there');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/conversations/7/messages');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      content: 'hello',
    });
  });

  it('calls onError on a non-ok initial response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(404, { error: 'conversation not found' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    let err = '';
    await sendMessage(7, 'hello', {
      onDelta: () => {},
      onDone: () => {},
      onTitle: () => {},
      onError: (m) => {
        err = m;
      },
    });
    expect(err).toBe('conversation not found');
  });

  it('refreshes once and retries on a 401 initial response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' })) // first POST
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'a2' })) // refresh
      .mockResolvedValueOnce(
        streamResponse(200, ['event: done\ndata: {"message_id":1}\n\n']),
      ); // retried POST
    vi.stubGlobal('fetch', fetchMock);

    let doneId = 0;
    await sendMessage(7, 'hello', {
      onDelta: () => {},
      onDone: (id) => {
        doneId = id;
      },
      onTitle: () => {},
      onError: () => {},
    });
    expect(doneId).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

it('swallows an AbortError without calling onError', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValue(new DOMException('aborted', 'AbortError'));
  vi.stubGlobal('fetch', fetchMock);

  const onError = vi.fn();
  const ac = new AbortController();
  await expect(
    sendMessage(
      7,
      'hi',
      { onDelta: () => {}, onDone: () => {}, onTitle: () => {}, onError },
      ac.signal,
    ),
  ).resolves.toBeUndefined();
  expect(onError).not.toHaveBeenCalled();
});

it('notifies onUnauthorized when a refresh fails', async () => {
  const cb = vi.fn();
  setOnUnauthorized(cb);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' })) // me()
    .mockResolvedValueOnce(jsonResponse(401, { error: 'invalid refresh' })); // refresh
  vi.stubGlobal('fetch', fetchMock);

  await expect(me()).rejects.toBeInstanceOf(ApiError);
  expect(cb).toHaveBeenCalled();
  setOnUnauthorized(null);
});
