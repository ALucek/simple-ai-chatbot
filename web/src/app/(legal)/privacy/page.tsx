import type { Metadata } from 'next';
import { MarkdownDoc } from '@/components/markdown-doc';
import { privacyMarkdown } from '@/lib/legal/privacy';

export const metadata: Metadata = { title: 'Privacy Policy — Chat Łucek' };

export default function PrivacyPage() {
  return <MarkdownDoc markdown={privacyMarkdown} />;
}
