'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function Composer({
  onSend,
  onStop,
  sending,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  sending: boolean;
}) {
  const [text, setText] = useState('');

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-border bg-surface flex h-[var(--bottombar-h)] items-center border-t px-3">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
          rows={1}
          placeholder="Send a message…"
          className="flex-1"
        />
        {sending ? (
          <Button type="button" variant="ghost" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button type="button" onClick={submit}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
