'use client';

import { useParams } from 'next/navigation';
import { useMessages } from '@/lib/use-messages';
import { MessageList } from '@/components/message-list';
import { Composer } from '@/components/composer';

export default function ConversationPage() {
  const params = useParams();
  const id = Number(params.id);
  const { messages, loading, error, notFound, send, sending } = useMessages(id);

  if (loading) return <p className="text-muted p-6 text-sm">Loading…</p>;
  if (notFound)
    return <p className="text-muted p-6 text-sm">Conversation not found</p>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-fg text-sm font-medium">No messages yet</p>
            <p className="text-muted text-sm">
              Send a message below to get started.
            </p>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
        {error && <p className="text-danger px-6 pb-4 text-sm">{error}</p>}
      </div>
      <Composer onSend={send} disabled={sending} />
    </div>
  );
}
