import ReactMarkdown from 'react-markdown';
import { remarkPlugins, rehypePlugins } from '@/lib/markdown';

// Renders a trusted Markdown doc (legal pages) via the shared pipeline.
export function MarkdownDoc({ markdown }: { markdown: string }) {
  return (
    <div className="markdown text-fg text-sm">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          a: (props) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
