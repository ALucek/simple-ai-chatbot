import ReactMarkdown from 'react-markdown';
import { remarkPlugins, rehypePlugins } from '@/lib/markdown';

// Renders a trusted Markdown document (e.g. the legal pages) with the shared
// remark/rehype pipeline and prose styling.
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
