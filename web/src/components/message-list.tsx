import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import type { ChatMessage } from '@/lib/messages-context';

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <ul
      aria-live="polite"
      className="mx-auto flex max-w-2xl flex-col gap-4 p-6"
    >
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
          {m.role === 'assistant' ? (
            <div className="markdown bg-surface-muted text-fg max-w-[80%] rounded-[--radius] px-4 py-2 text-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                  a: (props) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                }}
              >
                {m.content}
              </ReactMarkdown>
              {m.streaming && '▍'}
            </div>
          ) : (
            <span className="bg-accent text-accent-fg max-w-[80%] rounded-[--radius] px-4 py-2 text-sm whitespace-pre-wrap">
              {m.content}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
