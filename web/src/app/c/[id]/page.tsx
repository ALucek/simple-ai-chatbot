'use client';

import { useParams } from 'next/navigation';
import { useMessages } from '@/lib/use-messages';
import { MessageList } from '@/components/message-list';

export default function ConversationPage() {
  const params = useParams();
  const id = Number(params.id);
  const { messages, loading, error, notFound } = useMessages(id);

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  if (notFound)
    return <p className="p-6 text-sm text-gray-600">Conversation not found</p>;
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (messages.length === 0)
    return <p className="p-6 text-sm text-gray-500">No messages yet</p>;
  return <MessageList messages={messages} />;
}
