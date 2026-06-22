'use client';

import { useParams } from 'next/navigation';
import { useMessages } from '@/lib/use-messages';
import { MessageList } from '@/components/message-list';
import { Composer } from '@/components/composer';

export default function ConversationPage() {
  const params = useParams();
  const id = Number(params.id);
  const { messages, loading, error, notFound, send, sending } = useMessages(id);

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  if (notFound)
    return <p className="p-6 text-sm text-gray-600">Conversation not found</p>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No messages yet</p>
        ) : (
          <MessageList messages={messages} />
        )}
        {error && <p className="px-6 pb-4 text-sm text-red-600">{error}</p>}
      </div>
      <Composer onSend={send} disabled={sending} />
    </div>
  );
}
