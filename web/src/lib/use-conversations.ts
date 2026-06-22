'use client';

import { useEffect, useState } from 'react';
import {
  type Conversation,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
} from './api';

export interface UseConversations {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  create: () => Promise<Conversation>;
  rename: (id: number, title: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export function useConversations(): UseConversations {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    listConversations()
      .then((list) => {
        if (!ignore) setConversations(list);
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

  return { conversations, loading, error, create, rename, remove };
}
