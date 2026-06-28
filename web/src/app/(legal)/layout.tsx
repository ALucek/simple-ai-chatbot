import Link from 'next/link';
import { Wordmark } from '@/components/wordmark';

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-5">
      <Wordmark />
      <Link href="/" className="text-subtle self-center text-xs underline">
        back
      </Link>
      {children}
    </main>
  );
}
