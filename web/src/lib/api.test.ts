import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  login,
  me,
  refreshAccess,
  clearSession,
  ApiError,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  getMessages,
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
  it('login stores tokens and later calls send the Bearer header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'a1', refresh_token: 'r1' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, email: 'a@b.co' }));
    vi.stubGlobal('fetch', fetchMock);

    await login('a@b.co', 'password123');
    expect(localStorage.getItem('refresh_token')).toBe('r1');

    await me();
    const headers = (fetchMock.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer a1');
  });

  it('refreshes once and retries the request on a 401', async () => {
    localStorage.setItem('refresh_token', 'r1');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' })) // me()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'a2' })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, email: 'a@b.co' })); // retry
    vi.stubGlobal('fetch', fetchMock);

    const user = await me();
    expect(user).toEqual({ id: 1, email: 'a@b.co' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shares a single refresh among concurrent callers', async () => {
    localStorage.setItem('refresh_token', 'r1');
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
    localStorage.setItem('refresh_token', 'r1');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' })) // me()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: 'invalid refresh token' }),
      ); // refresh
    vi.stubGlobal('fetch', fetchMock);

    await expect(me()).rejects.toBeInstanceOf(ApiError);
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });
});

describe('conversation endpoints', () => {
  it('listConversations GETs the list', async () => {
    const data = [{ id: 1, title: '', created_at: 't', updated_at: 't' }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, data));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listConversations()).resolves.toEqual(data);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8080/api/conversations',
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
      'http://localhost:8080/api/conversations/7/messages',
    );
  });
});
