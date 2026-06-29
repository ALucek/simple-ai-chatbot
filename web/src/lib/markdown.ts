import type { Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

// Highlight then sanitize last (security gate); whitelist hljs*/language-*.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./, /^hljs$/, /^hljs-/]],
    span: [['className', /^hljs$/, /^hljs-/]],
  },
};

export const remarkPlugins: Options['remarkPlugins'] = [remarkGfm];
export const rehypePlugins: Options['rehypePlugins'] = [
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
  [rehypeSanitize, schema],
];
