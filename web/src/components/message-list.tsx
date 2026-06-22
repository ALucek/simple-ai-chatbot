import type { ChatMessage } from '@/lib/use-messages';

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <ul className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      {messages.map((m) => (
        <li
          key={m.id}
          className={
            m.role === 'user'
              ? 'flex flex-col items-end'
              : 'flex flex-col items-start'
          }
        >
          <span className="text-subtle mb-1 text-xs uppercase">{m.role}</span>
          <span
            className={`max-w-[80%] rounded-[--radius] px-4 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-accent text-accent-fg'
                : 'bg-surface-muted text-fg'
            }`}
          >
            {m.content}
            {m.streaming && '▍'}
          </span>
        </li>
      ))}
    </ul>
  );
}
