'use client';

import { useEffect, useState } from 'react';
import { type Message, getMessages, sendMessage, ApiError } from './api';
import { useConversationsContext } from './conversations-context';

export type ChatMessage = Message & { streaming?: boolean };

export interface UseMessages {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  notFound: boolean;
  send: (content: string) => Promise<void>;
  sending: boolean;
}

interface State {
  id: number;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  notFound: boolean;
}

const LOADING = {
  messages: [] as ChatMessage[],
  loading: true,
  error: null as string | null,
  notFound: false,
};

export function useMessages(id: number): UseMessages {
  const [state, setState] = useState<State>({ id, ...LOADING });
  const [sending, setSending] = useState(false);
  const { patchConversation } = useConversationsContext();

  useEffect(() => {
    let ignore = false;
    getMessages(id)
      .then((m) => {
        if (!ignore)
          setState({
            id,
            messages: m,
            loading: false,
            error: null,
            notFound: false,
          });
      })
      .catch((e) => {
        if (ignore) return;
        const notFound = e instanceof ApiError && e.status === 404;
        setState({
          id,
          messages: [],
          loading: false,
          error: notFound ? null : 'Couldn’t load messages',
          notFound,
        });
      });
    return () => {
      ignore = true;
    };
  }, [id]);

  async function send(content: string): Promise<void> {
    setSending(true);
    setState((s) => ({
      ...s,
      error: null,
      messages: [
        ...s.messages,
        { id: -1, role: 'user', content, created_at: '' },
        {
          id: -2,
          role: 'assistant',
          content: '',
          created_at: '',
          streaming: true,
        },
      ],
    }));
    await sendMessage(id, content, {
      onDelta: (text) =>
        setState((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === -2 ? { ...m, content: m.content + text } : m,
          ),
        })),
      onDone: (messageId) => {
        setState((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === -2 ? { ...m, id: messageId, streaming: false } : m,
          ),
        }));
        setSending(false);
      },
      onTitle: (title) => patchConversation(id, { title }),
      onError: (message) => {
        setState((s) => ({
          ...s,
          messages: s.messages.filter((m) => m.id !== -2),
          error: message,
        }));
        setSending(false);
      },
    });
  }

  if (state.id !== id) return { ...LOADING, send, sending };
  return {
    messages: state.messages,
    loading: state.loading,
    error: state.error,
    notFound: state.notFound,
    send,
    sending,
  };
}
