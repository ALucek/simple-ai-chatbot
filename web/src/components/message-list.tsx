import ReactMarkdown from 'react-markdown';
import { remarkPlugins, rehypePlugins } from '@/lib/markdown';
import type { ChatMessage } from '@/lib/messages-context';

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <ul
      aria-live="polite"
      className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5 sm:px-5 sm:py-7"
    >
      {messages.map((m) => {
        const isUser = m.role === 'user';
        return (
          <li
            key={m.id}
            className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`flex items-center gap-1.5 ${isUser ? 'flex-row-reverse' : ''}`}
            >
              <span className="text-subtle">&gt;</span>
              <span className="text-subtle text-[11px] tracking-[0.12em] uppercase">
                {isUser ? 'you' : 'assistant'}
              </span>
            </div>
            {isUser ? (
              <span className="border-border bg-surface-muted text-fg max-w-[80%] min-w-0 rounded-[var(--radius)] border px-3 py-2 text-sm break-words whitespace-pre-wrap">
                {m.content}
              </span>
            ) : (
              <div className="markdown text-fg max-w-full min-w-0 text-sm break-words">
                <ReactMarkdown
                  remarkPlugins={remarkPlugins}
                  rehypePlugins={rehypePlugins}
                  components={{
                    a: (props) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    ),
                  }}
                >
                  {m.content}
                </ReactMarkdown>
                {m.streaming && (
                  <span className="caret-blink" aria-hidden="true">
                    ▍
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
