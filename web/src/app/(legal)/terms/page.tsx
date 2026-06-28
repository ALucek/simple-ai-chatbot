import type { Metadata } from 'next';
import { MarkdownDoc } from '@/components/markdown-doc';
import { termsMarkdown } from '@/lib/legal/terms';

export const metadata: Metadata = { title: 'Terms of Service — Chat Łucek' };

export default function TermsPage() {
  return <MarkdownDoc markdown={termsMarkdown} />;
}
