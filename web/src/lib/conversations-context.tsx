'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type Conversation,
  CONVERSATIONS_PAGE,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
} from './api';

interface ConversationsValue {
  conversations: Conversation[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  create: () => Promise<Conversation>;
  rename: (id: number, title: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  patchConversation: (id: number, fields: Partial<Conversation>) => void;
}

const ConversationsContext = createContext<ConversationsValue | null>(null);

export function ConversationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(0); // rows pulled from the server so far (the next offset)

  useEffect(() => {
    let ignore = false;
    listConversations()
      .then((list) => {
        if (ignore) return;
        setConversations(list);
        fetched.current = list.length;
        setHasMore(list.length === CONVERSATIONS_PAGE);
      })
      .catch(() => {
        if (!ignore) setError('Couldn’t load conversations');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    listConversations(fetched.current)
      .then((next) => {
        setConversations((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...next.filter((c) => !seen.has(c.id))];
        });
        fetched.current += next.length;
        setHasMore(next.length === CONVERSATIONS_PAGE);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore]);

  async function create(): Promise<Conversation> {
    const convo = await createConversation();
    setConversations((prev) => [convo, ...prev]);
    return convo;
  }

  async function rename(id: number, title: string): Promise<void> {
    await renameConversation(id, title);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }

  async function remove(id: number): Promise<void> {
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }

  // patchConversation merges fields into one conversation in local state.
  function patchConversation(id: number, fields: Partial<Conversation>): void {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...fields } : c)),
    );
  }

  return (
    <ConversationsContext.Provider
      value={{
        conversations,
        loading,
        loadingMore,
        hasMore,
        error,
        loadMore,
        create,
        rename,
        remove,
        patchConversation,
      }}
    >
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversationsContext(): ConversationsValue {
  const ctx = useContext(ConversationsContext);
  if (!ctx)
    throw new Error(
      'useConversationsContext must be used within a ConversationsProvider',
    );
  return ctx;
}
