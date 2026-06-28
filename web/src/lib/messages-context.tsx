'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type Message,
  MESSAGES_PAGE,
  getMessages,
  sendMessage,
  ApiError,
} from './api';
import { useConversationsContext } from './conversations-context';
import { useUsage } from './usage-context';

export type ChatMessage = Message & { streaming?: boolean };

interface ConvState {
  messages: ChatMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  error: string | null;
  notFound: boolean;
  sending: boolean;
}

const LOADING: ConvState = {
  messages: [],
  loading: true,
  loadingOlder: false,
  hasMore: false,
  error: null,
  notFound: false,
  sending: false,
};

interface MessagesValue {
  byId: Record<number, ConvState>;
  load: (id: number) => void;
  loadOlder: (id: number) => void;
  send: (id: number, content: string) => Promise<void>;
  stop: (id: number) => void;
}

const MessagesContext = createContext<MessagesValue | null>(null);

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const [byId, setById] = useState<Record<number, ConvState>>({});
  const { patchConversation } = useConversationsContext();

  // Refs keep load/send/stop referentially stable (so the consumer effect only
  // re-runs on id change) while still reaching the latest patchConversation.
  const patchConvRef = useRef(patchConversation);
  useEffect(() => {
    patchConvRef.current = patchConversation;
  });

  const { refresh: refreshUsage } = useUsage();
  const refreshUsageRef = useRef(refreshUsage);
  useEffect(() => {
    refreshUsageRef.current = refreshUsage;
  });
  const controllers = useRef<Record<number, AbortController>>({});
  const loaded = useRef<Set<number>>(new Set());
  const tempId = useRef(0);

  const patch = useCallback(
    (id: number, fn: (s: ConvState) => ConvState) =>
      setById((prev) => ({ ...prev, [id]: fn(prev[id] ?? LOADING) })),
    [],
  );

  // Latest state, read by loadOlder without widening its dependencies.
  const stateRef = useRef(byId);
  useEffect(() => {
    stateRef.current = byId;
  });

  const load = useCallback(
    (id: number) => {
      if (loaded.current.has(id)) return;
      loaded.current.add(id);
      setById((prev) => ({ ...prev, [id]: prev[id] ?? LOADING }));
      getMessages(id)
        .then((m) =>
          patch(id, () => ({
            messages: m,
            loading: false,
            loadingOlder: false,
            hasMore: m.length === MESSAGES_PAGE,
            error: null,
            notFound: false,
            sending: false,
          })),
        )
        .catch((e) => {
          loaded.current.delete(id); // allow a retry on a later visit
          const notFound = e instanceof ApiError && e.status === 404;
          patch(id, (s) => ({
            ...s,
            loading: false,
            error: notFound ? null : 'Couldn’t load messages',
            notFound,
          }));
        });
    },
    [patch],
  );

  // loadOlder prepends the page before the oldest loaded message (keyset cursor).
  const loadOlder = useCallback(
    (id: number) => {
      const s = stateRef.current[id];
      if (!s || s.loadingOlder || !s.hasMore || s.messages.length === 0) return;
      const before = s.messages[0].id;
      if (before <= 0) return; // optimistic temp ids are negative
      patch(id, (cur) => ({ ...cur, loadingOlder: true }));
      getMessages(id, before)
        .then((older) =>
          patch(id, (cur) => ({
            ...cur,
            loadingOlder: false,
            hasMore: older.length === MESSAGES_PAGE,
            messages: [...older, ...cur.messages],
          })),
        )
        .catch(() => patch(id, (cur) => ({ ...cur, loadingOlder: false })));
    },
    [patch],
  );

  const send = useCallback(
    async (id: number, content: string) => {
      const userId = --tempId.current;
      const assistantId = --tempId.current;
      patch(id, (s) => ({
        ...s,
        error: null,
        sending: true,
        messages: [
          ...s.messages,
          { id: userId, role: 'user', content, created_at: '' },
          {
            id: assistantId,
            role: 'assistant',
            content: '',
            created_at: '',
            streaming: true,
          },
        ],
      }));
      const controller = new AbortController();
      controllers.current[id] = controller;
      await sendMessage(
        id,
        content,
        {
          onDelta: (text) =>
            patch(id, (s) => ({
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + text } : m,
              ),
            })),
          onDone: (messageId) => {
            patch(id, (s) => ({
              ...s,
              sending: false,
              messages: s.messages.map((m) =>
                m.id === assistantId
                  ? { ...m, id: messageId, streaming: false }
                  : m,
              ),
            }));
            delete controllers.current[id];
            refreshUsageRef.current();
          },
          onTitle: (title) => patchConvRef.current(id, { title }),
          onError: (message) => {
            patch(id, (s) => ({
              ...s,
              sending: false,
              error: message,
              messages: s.messages.filter((m) => m.id !== assistantId),
            }));
            delete controllers.current[id];
          },
        },
        controller.signal,
      );
    },
    [patch],
  );

  const stop = useCallback(
    (id: number) => {
      controllers.current[id]?.abort();
      delete controllers.current[id];
      patch(id, (s) => ({
        ...s,
        sending: false,
        messages: s.messages.filter((m) => !m.streaming),
      }));
    },
    [patch],
  );

  const value = useMemo(
    () => ({ byId, load, loadOlder, send, stop }),
    [byId, load, loadOlder, send, stop],
  );

  return (
    <MessagesContext.Provider value={value}>
      {children}
    </MessagesContext.Provider>
  );
}

export interface UseMessages {
  messages: ChatMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  error: string | null;
  notFound: boolean;
  sending: boolean;
  send: (content: string) => Promise<void>;
  loadOlder: () => void;
  stop: () => void;
}

export function useMessages(id: number): UseMessages {
  const ctx = useContext(MessagesContext);
  if (!ctx)
    throw new Error('useMessages must be used within a MessagesProvider');

  // load is referentially stable, so the effect only re-runs on id change.
  const load = ctx.load;
  useEffect(() => {
    load(id);
  }, [id, load]);

  const state = ctx.byId[id] ?? LOADING;
  return {
    messages: state.messages,
    loading: state.loading,
    loadingOlder: state.loadingOlder,
    hasMore: state.hasMore,
    error: state.error,
    notFound: state.notFound,
    sending: state.sending,
    send: (content: string) => ctx.send(id, content),
    loadOlder: () => ctx.loadOlder(id),
    stop: () => ctx.stop(id),
  };
}
