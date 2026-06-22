import type { ChatMessage } from '@/lib/use-messages';

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <ul className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      {messages.map((m) => (
        <li
          key={m.id}
          className={m.role === 'user' ? 'self-end text-right' : 'self-start'}
        >
          <span className="block text-xs text-gray-400 uppercase">
            {m.role}
          </span>
          <span className="whitespace-pre-wrap">
            {m.content}
            {m.streaming && '▍'}
          </span>
        </li>
      ))}
    </ul>
  );
}
