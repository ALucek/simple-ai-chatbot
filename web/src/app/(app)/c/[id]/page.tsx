'use client';

import { useLayoutEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useStickToBottom } from 'use-stick-to-bottom';
import { useMessages } from '@/lib/messages-context';
import { MessageList } from '@/components/message-list';
import { Composer } from '@/components/composer';
import { Skeleton } from '@/components/ui/skeleton';

export default function ConversationPage() {
  const params = useParams();
  const id = Number(params.id);
  const {
    messages,
    loading,
    loadingOlder,
    error,
    notFound,
    send,
    sending,
    loadOlder,
    stop,
  } = useMessages(id);
  const { scrollRef, contentRef } = useStickToBottom({ initial: 'instant' });

  const prevFirstId = useRef<number | null>(null);
  const prevHeight = useRef(0);

  // When an older page prepends, keep the viewport anchored where it was.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstId = messages[0]?.id ?? null;
    if (
      prevFirstId.current !== null &&
      firstId !== null &&
      firstId < prevFirstId.current
    ) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    }
    prevFirstId.current = firstId;
    prevHeight.current = el.scrollHeight;
  }, [messages, scrollRef]);

  // Fetch older messages when scrolled near the top.
  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop < 200) loadOlder();
  }

  if (notFound)
    return <p className="text-muted p-6 text-sm">Conversation not found</p>;

  return (
    <div className="flex h-full flex-col">
      {loading ? (
        <div className="flex-1 space-y-4 p-6">
          {[60, 40, 75].map((w, i) => (
            <Skeleton key={i} className="h-12" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className="text-fg-strong text-sm">No messages yet</p>
          <p className="text-muted text-sm">
            Send a message below to get started.
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto"
        >
          <div ref={contentRef}>
            {loadingOlder && (
              <p className="text-subtle py-2 text-center text-xs">loading…</p>
            )}
            <MessageList messages={messages} />
          </div>
        </div>
      )}
      {error && <p className="text-danger px-6 pb-4 text-sm">{error}</p>}
      <Composer onSend={send} onStop={stop} sending={sending} />
    </div>
  );
}
